-- Link products to global option groups (e.g. product "1 KG" uses group "Sabores"). Run after groups.sql.

create table if not exists public.product_product_groups (
  product_id uuid not null references public.products(id) on delete cascade,
  group_id uuid not null references public.product_groups(id) on delete cascade,
  primary key (product_id, group_id)
);

create index if not exists idx_product_product_groups_group_id
  on public.product_product_groups(group_id);

alter table public.product_product_groups enable row level security;

drop policy if exists "crud product_product_groups authenticated" on public.product_product_groups;
create policy "crud product_product_groups authenticated" on public.product_product_groups
for all to authenticated using (true) with check (true);
