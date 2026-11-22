-- F3: quản trị trang và thành viên. F4: bucket ảnh.
create table public.slug_redirects (
  from_slug text primary key check (from_slug ~ '^[a-z0-9-]+$'),
  site_id uuid not null references public.sites(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index slug_redirects_site_id_idx on public.slug_redirects (site_id);

alter table public.slug_redirects enable row level security;
revoke all on public.slug_redirects from public, anon, authenticated, service_role;
-- Landing build đọc để tạo trang chuyển hướng (PUB-4).
grant select on public.slug_redirects to service_role;

-- Các hàm dưới chạy bằng quyền chủ sở hữu vì cần đọc auth.users; chỉ service_role được gọi,
-- và Next.js truyền actor_id đã xác thực, giống save_site.
create function public.require_site_admin(actor_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.site_admins where user_id = actor_id) then
    raise sqlstate 'PT403' using message = 'Chỉ quản trị viên được thực hiện thao tác này';
  end if;
end;
$$;

create function public.admin_site_id(actor_id uuid, target_slug text, lock boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_id uuid;
begin
  perform public.require_site_admin(actor_id);
  if lock then
    select id into found_id from public.sites where slug = target_slug for update;
  else
    select id into found_id from public.sites where slug = target_slug;
  end if;
  if found_id is null then
    raise sqlstate 'PT404' using message = 'Không tìm thấy slug';
  end if;
  return found_id;
end;
$$;

create function public.slug_taken(new_slug text, except_site uuid default null)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (select 1 from public.sites where slug = new_slug)
    or exists (select 1 from public.slug_redirects where from_slug = new_slug and site_id is distinct from except_site);
$$;

create function public.create_site(actor_id uuid, site_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_at timestamptz := clock_timestamp();
  config jsonb := jsonb_set(site_config, '{updatedAt}', to_jsonb(clock_timestamp()));
begin
  perform public.require_site_admin(actor_id);
  if public.slug_taken(site_config ->> 'slug') then
    raise sqlstate 'PT409' using message = 'Slug đã được dùng';
  end if;
  insert into public.sites (slug, draft_config, updated_at) values (site_config ->> 'slug', config, saved_at);
  return config;
end;
$$;

create function public.rename_site(actor_id uuid, target_slug text, new_slug text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid := public.admin_site_id(actor_id, target_slug, true);
  slug_json jsonb := to_jsonb(new_slug);
begin
  if public.slug_taken(new_slug, target_id) then
    raise sqlstate 'PT409' using message = 'Slug đã được dùng';
  end if;
  -- Đổi về slug cũ của chính trang này thì bỏ chuyển hướng cũ.
  delete from public.slug_redirects where from_slug = new_slug;
  update public.sites
    set slug = new_slug,
        draft_config = jsonb_set(draft_config, '{slug}', slug_json),
        published_config = case when published_config is null then null
                                else jsonb_set(published_config, '{slug}', slug_json) end,
        updated_at = clock_timestamp()
    where id = target_id;
  -- Khôi phục phiên bản cũ phải ra đúng slug mới (sites kiểm tra slug trong config).
  update public.site_versions set config = jsonb_set(config, '{slug}', slug_json) where site_id = target_id;
  insert into public.slug_redirects (from_slug, site_id) values (target_slug, target_id);
end;
$$;

-- Lấy id trước: gọi hàm volatile trong WHERE sẽ chạy lại cho từng dòng và không thấy dòng vừa xóa.
create function public.delete_site(actor_id uuid, target_slug text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid := public.admin_site_id(actor_id, target_slug, true);
begin
  delete from public.sites where id = target_id;
end;
$$;

create function public.list_site_members(actor_id uuid, target_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid := public.admin_site_id(actor_id, target_slug);
begin
  return coalesce(
    (select jsonb_agg(jsonb_build_object('userId', m.user_id, 'email', u.email, 'role', m.role) order by u.email)
       from public.site_members m
       join auth.users u on u.id = m.user_id
       where m.site_id = target_id),
    '[]'::jsonb
  );
end;
$$;

create function public.set_site_member(actor_id uuid, target_slug text, member_email text, member_role text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid := public.admin_site_id(actor_id, target_slug);
  member auth.users%rowtype;
begin
  select * into member from auth.users where lower(email) = lower(member_email) limit 1;
  if not found then
    raise sqlstate 'PT404' using message = 'Không có tài khoản với email này';
  end if;
  insert into public.site_members (user_id, site_id, role) values (member.id, target_id, member_role)
    on conflict (user_id, site_id) do update set role = excluded.role;
  return jsonb_build_object('userId', member.id, 'email', member.email, 'role', member_role);
end;
$$;

-- member_id là text để mã không hợp lệ cũng trả 204 như khi không phải thành viên.
create function public.remove_site_member(actor_id uuid, target_slug text, member_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid := public.admin_site_id(actor_id, target_slug);
begin
  delete from public.site_members where site_id = target_id and user_id::text = member_id;
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'require_site_admin(uuid)', 'admin_site_id(uuid, text, boolean)', 'slug_taken(text, uuid)',
    'create_site(uuid, jsonb)', 'rename_site(uuid, text, text)', 'delete_site(uuid, text)',
    'list_site_members(uuid, text)', 'set_site_member(uuid, text, text, text)', 'remove_site_member(uuid, text, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated, service_role', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end;
$$;

-- F4: ảnh công khai; dashboard ghi bằng secret key sau khi chuyển sang WebP.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880, array['image/webp']);
