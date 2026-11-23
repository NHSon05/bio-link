-- AD-13: URL công khai là /{username}/{slug}. `sites.slug` lưu cả đường dẫn "username/slug",
-- nên build, CDN, ảnh, thống kê và chuyển hướng vẫn dùng một khóa duy nhất như trước.
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9][a-z0-9-]{1,31}$'),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated, service_role;
grant select on public.profiles to service_role;

-- Trang cũ (chưa có không gian riêng) chuyển vào /admin/...; đường dẫn cũ thành trang chuyển hướng (PUB-4).
alter table public.sites drop constraint sites_slug_check;
alter table public.slug_redirects drop constraint slug_redirects_from_slug_check;
alter table public.slug_redirects
  add constraint slug_redirects_from_slug_check check (from_slug ~ '^([a-z0-9-]+/)?[a-z0-9-]+$');

insert into public.slug_redirects (from_slug, site_id) select slug, id from public.sites where slug !~ '/';
update public.site_versions as v
  set config = jsonb_set(v.config, '{slug}', to_jsonb('admin/' || s.slug))
  from public.sites as s
  where v.site_id = s.id and s.slug !~ '/';
-- site_traffic.slug tham chiếu sites.slug với on update cascade nên đi theo.
update public.sites
  set slug = 'admin/' || slug,
      draft_config = jsonb_set(draft_config, '{slug}', to_jsonb('admin/' || slug)),
      published_config = case when published_config is null then null
                              else jsonb_set(published_config, '{slug}', to_jsonb('admin/' || slug)) end
  where slug !~ '/';

alter table public.sites add constraint sites_slug_check check (slug ~ '^[a-z0-9][a-z0-9-]*/[a-z0-9-]+$');

-- Đặt tên người dùng một lần; đổi tên sẽ làm hỏng mọi link đã chia sẻ nên không cho đổi.
create function public.claim_username(actor_id uuid, new_username text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new_username !~ '^[a-z0-9][a-z0-9-]{1,31}$' or new_username = any (array[
    'admin', 'api', 'preview', 'sitemap', 'assets', 'img', 'static', 'www', 'app', 'dashboard', 'runtime', 'favicon'
  ]) then
    raise sqlstate 'PT422' using message = 'Tên người dùng không hợp lệ hoặc đã được dành riêng';
  end if;
  if exists (select 1 from public.profiles where user_id = actor_id) then
    raise sqlstate 'PT409' using message = 'Tài khoản đã có tên người dùng';
  end if;
  if exists (select 1 from public.profiles where username = new_username) then
    raise sqlstate 'PT409' using message = 'Tên người dùng đã có người dùng';
  end if;
  insert into public.profiles (user_id, username) values (actor_id, new_username);
  return new_username;
end;
$$;

-- Người không phải admin chỉ tạo trang trong không gian của mình (giới hạn 3 trang giữ nguyên).
create or replace function public.create_site(actor_id uuid, site_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_at timestamptz := clock_timestamp();
  config jsonb := jsonb_set(site_config, '{updatedAt}', to_jsonb(clock_timestamp()));
  is_admin boolean := exists (select 1 from public.site_admins where user_id = actor_id);
  new_id uuid;
begin
  if not is_admin then
    if split_part(site_config ->> 'slug', '/', 1) is distinct from
       (select username from public.profiles where user_id = actor_id) then
      raise sqlstate 'PT403' using message = 'Chỉ tạo được trang trong không gian tên người dùng của bạn';
    end if;
    -- Khóa theo người dùng để hai yêu cầu song song không cùng vượt giới hạn.
    perform pg_advisory_xact_lock(hashtextextended(actor_id::text, 0));
    if (select count(*) from public.site_members where user_id = actor_id and role = 'owner') >= 3 then
      raise sqlstate 'PT403' using message = 'Mỗi tài khoản chỉ tạo được tối đa 3 trang';
    end if;
  end if;
  if public.slug_taken(site_config ->> 'slug') then
    raise sqlstate 'PT409' using message = 'Slug đã được dùng';
  end if;
  insert into public.sites (slug, draft_config, updated_at)
    values (site_config ->> 'slug', config, saved_at)
    returning id into new_id;
  if not is_admin then
    insert into public.site_members (user_id, site_id, role) values (actor_id, new_id, 'owner');
  end if;
  return config;
end;
$$;

-- Chủ sở hữu đổi slug trong cùng không gian; chỉ admin chuyển trang sang không gian khác.
create or replace function public.rename_site(actor_id uuid, target_slug text, new_slug text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid := public.admin_site_id(actor_id, target_slug, true);
  slug_json jsonb := to_jsonb(new_slug);
begin
  if split_part(new_slug, '/', 1) <> split_part(target_slug, '/', 1)
     and not exists (select 1 from public.site_admins where user_id = actor_id) then
    raise sqlstate 'PT403' using message = 'Chỉ đổi được slug trong không gian tên người dùng hiện tại';
  end if;
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

revoke all on function public.claim_username(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.claim_username(uuid, text) to service_role;
