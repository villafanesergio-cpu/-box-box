begin;

create extension if not exists pgcrypto;

create table if not exists public.site_hero_images (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  image_url text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text not null,
  website_url text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.site_hero_images enable row level security;
alter table public.sponsors enable row level security;

drop policy if exists "Public read site hero images" on public.site_hero_images;
create policy "Public read site hero images"
on public.site_hero_images
for select
to anon, authenticated
using (true);

drop policy if exists "Authenticated manage site hero images" on public.site_hero_images;
create policy "Authenticated manage site hero images"
on public.site_hero_images
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Public read sponsors" on public.sponsors;
create policy "Public read sponsors"
on public.sponsors
for select
to anon, authenticated
using (true);

drop policy if exists "Authenticated manage sponsors" on public.sponsors;
create policy "Authenticated manage sponsors"
on public.sponsors
for all
to authenticated
using (true)
with check (true);

grant select on public.site_hero_images, public.sponsors to anon, authenticated;
grant insert, update, delete on public.site_hero_images, public.sponsors to authenticated;

insert into storage.buckets (id, name, public)
values ('site-media', 'site-media', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Public read site media" on storage.objects;
create policy "Public read site media"
on storage.objects
for select
to public
using (bucket_id = 'site-media');

drop policy if exists "Authenticated upload site media" on storage.objects;
create policy "Authenticated upload site media"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'site-media');

drop policy if exists "Authenticated update site media" on storage.objects;
create policy "Authenticated update site media"
on storage.objects
for update
to authenticated
using (bucket_id = 'site-media')
with check (bucket_id = 'site-media');

drop policy if exists "Authenticated delete site media" on storage.objects;
create policy "Authenticated delete site media"
on storage.objects
for delete
to authenticated
using (bucket_id = 'site-media');

commit;

select 'site_hero_images' as resource, count(*) as rows from public.site_hero_images
union all
select 'sponsors' as resource, count(*) as rows from public.sponsors;
