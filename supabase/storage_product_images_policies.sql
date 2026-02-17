-- Políticas para subir y leer imágenes de productos en el bucket existente "novum-grido".
-- Ejecutá este archivo en Supabase SQL Editor (una sola vez).

-- Permitir que usuarios autenticados suban archivos al bucket novum-grido
drop policy if exists "Allow authenticated uploads to novum-grido" on storage.objects;
create policy "Allow authenticated uploads to novum-grido"
on storage.objects for insert
to authenticated
with check (bucket_id = 'novum-grido');

-- Permitir que cualquiera pueda leer (para mostrar las fotos en la tabla)
drop policy if exists "Allow public read novum-grido" on storage.objects;
create policy "Allow public read novum-grido"
on storage.objects for select
to public
using (bucket_id = 'novum-grido');

-- Permitir actualizar/eliminar (reemplazar o borrar imagen)
drop policy if exists "Allow authenticated update novum-grido" on storage.objects;
create policy "Allow authenticated update novum-grido"
on storage.objects for update
to authenticated
using (bucket_id = 'novum-grido');

drop policy if exists "Allow authenticated delete novum-grido" on storage.objects;
create policy "Allow authenticated delete novum-grido"
on storage.objects for delete
to authenticated
using (bucket_id = 'novum-grido');
