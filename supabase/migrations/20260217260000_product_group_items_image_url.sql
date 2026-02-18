-- Optional image URL for each group item (e.g. flavor thumbnail).
-- Same approach as products: store URL (Supabase Storage or external).

alter table public.product_group_items
  add column if not exists image_url text;

comment on column public.product_group_items.image_url is 'URL of the item image (e.g. from Supabase Storage or external).';
