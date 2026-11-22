create table public.site_traffic (
  slug text not null references public.sites(slug) on update cascade on delete cascade,
  day date not null,
  views bigint not null default 0,
  clicks bigint not null default 0,
  primary key (slug, day)
);

alter table public.site_traffic enable row level security;
revoke all on public.site_traffic from public, anon, authenticated, service_role;
grant select on public.site_traffic to authenticated;
grant select, insert, update on public.site_traffic to service_role;
create policy "Thành viên xem thống kê của trang được giao" on public.site_traffic
  for select to authenticated using (slug in (select sites.slug from public.sites));

create function public.record_site_traffic(target_slug text, event_kind text)
returns void language sql security invoker set search_path = '' as $$
  insert into public.site_traffic (slug, day, views, clicks)
    select s.slug, (now() at time zone 'Asia/Ho_Chi_Minh')::date,
           (event_kind = 'view')::int, (event_kind = 'click')::int
    from public.sites s
    where s.slug = target_slug and s.published_config is not null and event_kind in ('view', 'click')
  on conflict (slug, day) do update set
    views = site_traffic.views + excluded.views,
    clicks = site_traffic.clicks + excluded.clicks;
$$;
revoke all on function public.record_site_traffic(text, text) from public, anon, authenticated;
grant execute on function public.record_site_traffic(text, text) to service_role;
