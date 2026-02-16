-- Categories table for products. Run in Supabase SQL Editor.

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_categories_updated_at on public.categories;
create trigger trg_categories_updated_at before update on public.categories
for each row execute function public.set_updated_at();

alter table public.categories enable row level security;

drop policy if exists "crud categories authenticated" on public.categories;
create policy "crud categories authenticated" on public.categories
for all to authenticated using (true) with check (true);
