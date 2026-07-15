-- Crear bucket público para imágenes de circuitos
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'circuit-media',
  'circuit-media',
  true,
  8388608,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/svg+xml'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins upload circuit media" on storage.objects;
create policy "Admins upload circuit media"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'circuit-media'
  and (select private.is_admin())
);

drop policy if exists "Admins update circuit media" on storage.objects;
create policy "Admins update circuit media"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'circuit-media'
  and (select private.is_admin())
)
with check (
  bucket_id = 'circuit-media'
  and (select private.is_admin())
);
