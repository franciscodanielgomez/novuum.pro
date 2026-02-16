-- Items per group (e.g. sabores within group "Sabores"). Run after groups.sql.

create table if not exists public.product_group_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.product_groups(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_product_group_items_updated_at on public.product_group_items;
create trigger trg_product_group_items_updated_at before update on public.product_group_items
for each row execute function public.set_updated_at();

alter table public.product_group_items enable row level security;

drop policy if exists "crud product_group_items authenticated" on public.product_group_items;
create policy "crud product_group_items authenticated" on public.product_group_items
for all to authenticated using (true) with check (true);
