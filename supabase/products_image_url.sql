-- Optional: add image URL to products (for thumbnails in the table).
-- Run in Supabase SQL Editor if you want product photos.
--
-- Storage: se usa el bucket "novum-grido". Ejecutá storage_product_images_policies.sql para permisos.

alter table public.products
  add column if not exists image_url text;

comment on column public.products.image_url is 'URL of the product image (e.g. from Supabase Storage or external).';
