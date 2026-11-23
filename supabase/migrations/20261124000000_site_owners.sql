-- Người dùng tự tạo trang (tối đa 3 trang/tài khoản) và là chủ sở hữu (`owner`):
-- sửa, xuất bản, đổi slug, xóa và quản lý thành viên của trang mình (AD-12).
alter table public.site_members drop constraint site_members_role_check;
alter table public.site_members add constraint site_members_role_check check (role in ('owner', 'editor', 'viewer'));

-- Chủ sở hữu ghi nháp và xuất bản như biên tập viên. Chỉ đổi điều kiện quyền so với bản gốc.
create or replace function public.save_site(
  target_slug text,
  actor_id uuid,
  site_config jsonb default null,
  publish boolean default false,
  publish_note text default null,
  restore_version bigint default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  current_site public.sites%rowtype;
  member_role text;
  config_to_save jsonb;
  saved_at timestamptz;
begin
  select * into current_site from public.sites where slug = target_slug for update;
  if not found then
    raise sqlstate 'PT404' using message = 'Không tìm thấy slug';
  end if;

  if not exists (select 1 from public.site_admins where user_id = actor_id) then
    select role into member_role from public.site_members
      where user_id = actor_id and site_id = current_site.id;
    if not found then
      raise sqlstate 'PT404' using message = 'Không tìm thấy slug';
    end if;
    if member_role not in ('owner', 'editor') then
      raise sqlstate 'PT403' using message = 'Không có quyền chỉnh sửa slug';
    end if;
  end if;

  if restore_version is not null then
    select config into config_to_save from public.site_versions
      where id = restore_version and site_id = current_site.id;
    if not found then
      raise sqlstate 'PT404' using message = 'Không tìm thấy phiên bản';
    end if;
  else
    config_to_save := coalesce(site_config, current_site.draft_config);
  end if;

  saved_at := clock_timestamp();
  config_to_save := jsonb_set(config_to_save, '{updatedAt}', to_jsonb(saved_at));

  update public.sites
    set draft_config = config_to_save,
        published_config = case when publish then config_to_save else published_config end,
        updated_at = saved_at
    where id = current_site.id;

  if publish then
    insert into public.site_versions (site_id, config, published_by, published_at, note, restored_from)
      values (current_site.id, config_to_save, actor_id, saved_at, publish_note, restore_version);
  end if;

  return config_to_save;
end;
$$;

-- Admin hoặc chủ sở hữu trang. Người khác luôn nhận 403, kể cả với slug không tồn tại, để không lộ slug.
create or replace function public.admin_site_id(actor_id uuid, target_slug text, lock boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_id uuid;
begin
  if lock then
    select id into found_id from public.sites where slug = target_slug for update;
  else
    select id into found_id from public.sites where slug = target_slug;
  end if;
  if exists (select 1 from public.site_admins where user_id = actor_id) then
    if found_id is null then
      raise sqlstate 'PT404' using message = 'Không tìm thấy slug';
    end if;
    return found_id;
  end if;
  if found_id is null or not exists (
    select 1 from public.site_members where site_id = found_id and user_id = actor_id and role = 'owner'
  ) then
    raise sqlstate 'PT403' using message = 'Chỉ quản trị viên hoặc chủ sở hữu được thực hiện thao tác này';
  end if;
  return found_id;
end;
$$;

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

-- Chủ sở hữu chỉ quản lý editor/viewer; chỉ admin đổi hoặc gỡ một owner.
create or replace function public.set_site_member(actor_id uuid, target_slug text, member_email text, member_role text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid := public.admin_site_id(actor_id, target_slug);
  member auth.users%rowtype;
begin
  if member_role not in ('editor', 'viewer') then
    raise sqlstate 'PT422' using message = 'Quyền không hợp lệ';
  end if;
  select * into member from auth.users where lower(email) = lower(member_email) limit 1;
  if not found then
    raise sqlstate 'PT404' using message = 'Không có tài khoản với email này';
  end if;
  if not exists (select 1 from public.site_admins where user_id = actor_id) and exists (
    select 1 from public.site_members where site_id = target_id and user_id = member.id and role = 'owner'
  ) then
    raise sqlstate 'PT409' using message = 'Không thể đổi quyền của chủ sở hữu';
  end if;
  insert into public.site_members (user_id, site_id, role) values (member.id, target_id, member_role)
    on conflict (user_id, site_id) do update set role = excluded.role;
  return jsonb_build_object('userId', member.id, 'email', member.email, 'role', member_role);
end;
$$;

create or replace function public.remove_site_member(actor_id uuid, target_slug text, member_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid := public.admin_site_id(actor_id, target_slug);
begin
  if not exists (select 1 from public.site_admins where user_id = actor_id) and exists (
    select 1 from public.site_members where site_id = target_id and user_id::text = member_id and role = 'owner'
  ) then
    raise sqlstate 'PT409' using message = 'Không thể gỡ chủ sở hữu';
  end if;
  delete from public.site_members where site_id = target_id and user_id::text = member_id;
end;
$$;
