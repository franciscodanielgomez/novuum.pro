-- Link products to categories via category_id. Run after categories.sql.
-- If products already have a text "category" column, backfill category_id by name.

-- 1) Add category_id column (nullable at first)
alter table public.products
  add column if not exists category_id uuid references public.categories(id) on delete restrict;

-- 2) Backfill category_id from category name (if text column exists)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'category'
  ) then
    update public.products p
    set category_id = c.id
    from public.categories c
    where trim(upper(p.category)) = trim(upper(c.name))
      and p.category_id is null;
  end if;
end $$;

-- 3) Set category_id NOT NULL only when no rows have null
do $$
begin
  if not exists (select 1 from public.products where category_id is null) then
    alter table public.products alter column category_id set not null;
  end if;
end $$;

-- 4) Drop text column category
alter table public.products drop column if exists category;
