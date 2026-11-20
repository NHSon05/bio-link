create table public.sites (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$' and slug not in ('preview')),
  draft_config jsonb not null,
  published_config jsonb,
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(draft_config) = 'object' and draft_config ->> 'slug' is not distinct from slug),
  check (published_config is null or (
    jsonb_typeof(published_config) = 'object' and published_config ->> 'slug' is not distinct from slug
  ))
);

create table public.site_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table public.site_members (
  user_id uuid not null references auth.users(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  role text not null check (role in ('editor', 'viewer')),
  primary key (user_id, site_id)
);

create index site_members_site_id_idx on public.site_members (site_id);

create table public.site_versions (
  id bigint generated always as identity primary key,
  site_id uuid not null references public.sites(id) on delete cascade,
  config jsonb not null,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default now(),
  note text check (char_length(note) <= 500),
  restored_from bigint references public.site_versions(id)
);

create index site_versions_site_id_id_idx on public.site_versions (site_id, id desc);

alter table public.sites enable row level security;
alter table public.site_admins enable row level security;
alter table public.site_members enable row level security;
alter table public.site_versions enable row level security;

revoke all on public.sites, public.site_admins, public.site_members, public.site_versions
  from public, anon, authenticated, service_role;
grant select on public.sites, public.site_admins, public.site_members, public.site_versions to authenticated;
grant select on public.sites, public.site_admins, public.site_members, public.site_versions to service_role;
grant update (draft_config, published_config, updated_at) on public.sites to service_role;
grant insert on public.site_versions to service_role;

create policy "Users can read their admin status" on public.site_admins
  for select to authenticated using (user_id = (select auth.uid()));

create policy "Users can read their memberships" on public.site_members
  for select to authenticated using (user_id = (select auth.uid()));

create policy "Admins and members can read sites" on public.sites
  for select to authenticated using (
    exists (select 1 from public.site_admins where user_id = (select auth.uid()))
    or id in (select site_id from public.site_members where user_id = (select auth.uid()))
  );

create policy "Admins and members can read version history" on public.site_versions
  for select to authenticated using (site_id in (select id from public.sites));

-- Next.js verifies the actor with Supabase Auth and validates the site schema before calling this.
-- The row lock orders draft edits and publications, and updates the snapshot and history together.
create function public.save_site(
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
    if member_role <> 'editor' then
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

revoke all on function public.save_site(text, uuid, jsonb, boolean, text, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.save_site(text, uuid, jsonb, boolean, text, bigint) to service_role;
