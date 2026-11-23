-- F5: hàng đợi build landing. Next.js xếp build; GitHub Actions nhận, chạy và báo kết quả (BUILD-1…4).
create table public.builds (
  id bigint generated always as identity primary key,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'superseded')),
  reason text not null check (reason in ('publish', 'restore', 'rename', 'delete', 'products', 'scores', 'cron', 'manual')),
  -- Rỗng = build toàn bộ.
  slugs text[] not null default '{}',
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  error text check (char_length(error) <= 2000),
  merged_into bigint references public.builds(id)
);

create index builds_status_id_idx on public.builds (status, id);
create index builds_slugs_idx on public.builds using gin (slugs);

alter table public.builds enable row level security;
revoke all on public.builds from public, anon, authenticated, service_role;
-- Chỉ đọc/ghi qua các hàm dưới; Next.js kiểm tra quyền trước khi gọi.

-- Gộp vào build còn `queued` trong 60 giây gần nhất; `hook = false` thì không cần gọi hook lần nữa.
create function public.queue_build(actor_id uuid, build_reason text, build_slugs text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pending public.builds%rowtype;
  new_id bigint;
begin
  -- Tuần tự hóa bước tìm và tạo để hai request đồng thời không cùng tạo build mới.
  perform pg_advisory_xact_lock('public.builds'::regclass::oid::bigint);
  select * into pending from public.builds
    where status = 'queued' and requested_at > now() - interval '60 seconds'
    order by id desc limit 1 for update;
  if found then
    update public.builds
      set slugs = case when slugs = '{}' or build_slugs = '{}' then '{}'
                       else array(select distinct unnest(slugs || build_slugs) order by 1) end
      where id = pending.id;
    return jsonb_build_object('id', pending.id, 'status', 'queued', 'hook', false);
  end if;
  insert into public.builds (reason, slugs, requested_by)
    values (build_reason, coalesce(build_slugs, '{}'), actor_id)
    returning id into new_id;
  return jsonb_build_object('id', new_id, 'status', 'queued', 'hook', true);
end;
$$;

-- Job bắt đầu: nuốt mọi build `queued` cũ hơn (kể cả build mà hook đã lỗi) và trả danh sách slug cần làm.
create function public.start_build(build_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.builds%rowtype;
  merged text[];
begin
  select * into target from public.builds where id = build_id for update;
  if not found then
    raise sqlstate 'PT404' using message = 'Không tìm thấy build';
  end if;
  if target.status <> 'queued' then
    raise sqlstate 'PT409' using message = 'Build không còn ở trạng thái queued';
  end if;

  with older as (
    update public.builds set status = 'superseded', merged_into = build_id, finished_at = now()
      where status = 'queued' and id < build_id
      returning slugs
  )
  select case when target.slugs = '{}' or exists (select 1 from older where slugs = '{}') then '{}'
              else array(select distinct s from (select unnest(target.slugs) s
                                                 union select unnest(slugs) from older) x order by 1) end
    into merged;

  update public.builds set status = 'running', started_at = now(), slugs = merged where id = build_id;
  return jsonb_build_object('id', build_id, 'status', 'running', 'slugs', to_jsonb(merged));
end;
$$;

create function public.finish_build(build_id bigint, build_status text, build_error text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status text;
begin
  select status into current_status from public.builds where id = build_id for update;
  if not found then
    raise sqlstate 'PT404' using message = 'Không tìm thấy build';
  end if;
  if current_status <> 'running' or build_status not in ('succeeded', 'failed') then
    raise sqlstate 'PT409' using message = 'Không thể chuyển trạng thái build';
  end if;
  update public.builds
    set status = build_status, finished_at = now(), error = left(build_error, 2000)
    where id = build_id;
  return jsonb_build_object('id', build_id, 'status', build_status);
end;
$$;

-- Cron: build toàn bộ, đánh dấu lỗi các build `running` quá 1 giờ (job đã chết), rồi bắt đầu luôn.
create function public.start_cron_build()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id bigint;
begin
  update public.builds set status = 'failed', finished_at = now(), error = 'Quá thời gian chạy'
    where status = 'running' and started_at < now() - interval '1 hour';
  insert into public.builds (reason) values ('cron') returning id into new_id;
  return public.start_build(new_id);
end;
$$;

-- BUILD-3. Next.js đã kiểm tra người gọi được xem slug này.
-- liveUpdatedAt: updatedAt của bản xuất bản mới nhất trước khi build thành công gần nhất bắt đầu.
create function public.latest_site_build(target_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with latest as (
    select * from public.builds
      where status <> 'superseded' and (slugs = '{}' or target_slug = any (slugs))
      order by id desc limit 1
  ), live as (
    select v.config ->> 'updatedAt' as updated_at
      from public.sites s
      join public.site_versions v on v.site_id = s.id
      where s.slug = target_slug
        and v.published_at <= (select max(started_at) from public.builds
                                 where status = 'succeeded' and (slugs = '{}' or target_slug = any (slugs)))
      order by v.id desc limit 1
  )
  select jsonb_build_object(
    'id', id, 'status', status, 'reason', reason, 'requestedAt', requested_at,
    'finishedAt', finished_at, 'error', error, 'liveUpdatedAt', (select updated_at from live)
  ) from latest;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'queue_build(uuid, text, text[])', 'start_build(bigint)', 'finish_build(bigint, text, text)',
    'start_cron_build()', 'latest_site_build(text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated, service_role', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end;
$$;
