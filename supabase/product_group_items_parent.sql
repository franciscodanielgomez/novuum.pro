-- Add tree support: items can have a parent (category). Run after product_group_items.sql.
-- parent_id = null → top-level category (e.g. FRUTAS A LA CREMA, CHOCOLATES).
-- parent_id = <category id> → item under that category (e.g. ANANA A LA CREMA under FRUTAS A LA CREMA).

alter table public.product_group_items
  add column if not exists parent_id uuid references public.product_group_items(id) on delete cascade;

create index if not exists idx_product_group_items_parent_id
  on public.product_group_items(parent_id);

comment on column public.product_group_items.parent_id is 'Null = category; set = item under that category.';
