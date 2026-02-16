-- Many-to-many: a product can have multiple categories.
-- Run after categories.sql and products_category_fk.sql (so products has category_id to migrate).
-- After this, products no longer has category_id; use product_categories to link.

-- 1) Junction table
create table if not exists public.product_categories (
  product_id uuid not null references public.products(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  primary key (product_id, category_id)
);

-- 2) Migrate existing category_id from products (if column exists)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'category_id'
  ) then
    insert into public.product_categories (product_id, category_id)
    select id, category_id from public.products where category_id is not null
    on conflict (product_id, category_id) do nothing;
  end if;
end $$;

-- 3) Drop category_id from products
alter table public.products drop column if exists category_id;

-- 4) RLS
alter table public.product_categories enable row level security;

drop policy if exists "crud product_categories authenticated" on public.product_categories;
create policy "crud product_categories authenticated" on public.product_categories
for all to authenticated using (true) with check (true);
