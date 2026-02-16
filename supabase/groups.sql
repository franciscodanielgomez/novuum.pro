-- Product groups table (e.g. Sabores, Tamaños). Run in Supabase SQL Editor.
-- Table name is "product_groups" to avoid reserved word "group".

create table if not exists public.product_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_product_groups_updated_at on public.product_groups;
create trigger trg_product_groups_updated_at before update on public.product_groups
for each row execute function public.set_updated_at();

alter table public.product_groups enable row level security;

drop policy if exists "crud product_groups authenticated" on public.product_groups;
create policy "crud product_groups authenticated" on public.product_groups
for all to authenticated using (true) with check (true);
