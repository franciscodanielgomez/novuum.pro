-- Add max_select to product_product_groups (e.g. max sabores per product). Run after product_product_groups.sql.

alter table public.product_product_groups
  add column if not exists max_select int not null default 1;

comment on column public.product_product_groups.max_select is 'Max number of options the customer can select from this group for this product (e.g. max flavors).';
