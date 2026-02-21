-- Grido Ituzaingo Delivery - schema v0 (Supabase/Postgres)
-- Ejecutar en SQL Editor de Supabase.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'team_role') then
    create type public.team_role as enum ('CAJERO', 'CADETE', 'ADMINISTRADOR', 'GESTOR');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type public.order_status as enum ('BORRADOR', 'NO_ASIGNADO', 'ASIGNADO', 'COMPLETADO', 'CANCELADO');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'payment_method') then
    create type public.payment_method as enum ('CASH', 'MP', 'TRANSFER');
  end if;
end $$;

create table if not exists public.business_settings (
  id uuid primary key default gen_random_uuid(),
  company_name text not null default 'Grido',
  branch_name text not null default 'Ituzaingó',
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.business_settings
  add column if not exists company_name text not null default 'Grido';

alter table if exists public.business_settings
  add column if not exists logo_url text;

create table if not exists public.team_members (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role public.team_role not null default 'CAJERO',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  phone text,
  address text,
  reference_phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  address_line text not null,
  city text,
  state text,
  postal_code text,
  country text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  address text not null,
  between_streets text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_guests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role public.team_role not null default 'CAJERO',
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  name text not null,
  description text not null default '',
  price numeric(12,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id),
  customer_phone_snapshot text not null,
  address_snapshot text not null,
  between_streets_snapshot text,
  status public.order_status not null default 'NO_ASIGNADO',
  assigned_staff_id uuid references public.team_members(id),
  assigned_staff_guest_id uuid references public.staff_guests(id),
  payment_method public.payment_method not null default 'CASH',
  cash_received numeric(12,2),
  change_due numeric(12,2),
  notes text,
  total numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id),
  name_snapshot text not null,
  qty int not null default 1,
  unit_price numeric(12,2) not null default 0,
  subtotal numeric(12,2) not null default 0,
  notes text
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_business_settings_updated_at on public.business_settings;
create trigger trg_business_settings_updated_at before update on public.business_settings
for each row execute function public.set_updated_at();

drop trigger if exists trg_team_members_updated_at on public.team_members;
create trigger trg_team_members_updated_at before update on public.team_members
for each row execute function public.set_updated_at();

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at before update on public.user_profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_user_addresses_updated_at on public.user_addresses;
create trigger trg_user_addresses_updated_at before update on public.user_addresses
for each row execute function public.set_updated_at();

drop trigger if exists trg_customers_updated_at on public.customers;
create trigger trg_customers_updated_at before update on public.customers
for each row execute function public.set_updated_at();

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at before update on public.orders
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.team_members (id, email, full_name, role, active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    'CAJERO',
    true
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.business_settings enable row level security;
alter table public.team_members enable row level security;
alter table public.user_profiles enable row level security;
alter table public.user_addresses enable row level security;
alter table public.customers enable row level security;
alter table public.staff_guests enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.team_members tm
    where tm.id = auth.uid() and tm.role = 'ADMINISTRADOR' and tm.active = true
  );
$$;

drop policy if exists "team members can read authenticated" on public.team_members;
create policy "team members can read authenticated" on public.team_members
for select to authenticated using (true);

drop policy if exists "only admin updates team" on public.team_members;
create policy "only admin updates team" on public.team_members
for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "team members can update own" on public.team_members;
create policy "team members can update own" on public.team_members
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "user profiles select own" on public.user_profiles;
create policy "user profiles select own" on public.user_profiles
for select to authenticated using (id = auth.uid());

drop policy if exists "user profiles insert own" on public.user_profiles;
create policy "user profiles insert own" on public.user_profiles
for insert to authenticated with check (id = auth.uid());

drop policy if exists "user profiles update own" on public.user_profiles;
create policy "user profiles update own" on public.user_profiles
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "user addresses select own" on public.user_addresses;
create policy "user addresses select own" on public.user_addresses
for select to authenticated using (user_id = auth.uid());

drop policy if exists "user addresses insert own" on public.user_addresses;
create policy "user addresses insert own" on public.user_addresses
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "user addresses update own" on public.user_addresses;
create policy "user addresses update own" on public.user_addresses
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "user addresses delete own" on public.user_addresses;
create policy "user addresses delete own" on public.user_addresses
for delete to authenticated using (user_id = auth.uid());

drop policy if exists "business read authenticated" on public.business_settings;
create policy "business read authenticated" on public.business_settings
for select to authenticated using (true);

drop policy if exists "business update admin only" on public.business_settings;
drop policy if exists "business update authenticated" on public.business_settings;
create policy "business update authenticated" on public.business_settings
for update to authenticated using (true) with check (true);

drop policy if exists "business insert admin only" on public.business_settings;
drop policy if exists "business insert authenticated" on public.business_settings;
create policy "business insert authenticated" on public.business_settings
for insert to authenticated with check (true);

drop policy if exists "crud customers authenticated" on public.customers;
create policy "crud customers authenticated" on public.customers
for all to authenticated using (true) with check (true);
-- Lectura para anon: evita lista vacía si la petición va sin JWT (ej. sesión no adjunta).
drop policy if exists "customers select anon" on public.customers;
create policy "customers select anon" on public.customers for select to anon using (true);

drop policy if exists "staff_guests select anon" on public.staff_guests;
create policy "staff_guests select anon" on public.staff_guests for select to anon using (true);
drop policy if exists "crud staff_guests authenticated" on public.staff_guests;
create policy "staff_guests select authenticated" on public.staff_guests for select to authenticated using (true);
create policy "staff_guests insert admin only" on public.staff_guests for insert to authenticated with check (public.is_admin());
create policy "staff_guests update admin only" on public.staff_guests for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "staff_guests delete admin only" on public.staff_guests for delete to authenticated using (public.is_admin());

drop policy if exists "crud products authenticated" on public.products;
create policy "crud products authenticated" on public.products
for all to authenticated using (true) with check (true);

-- Todos los usuarios pueden ver pedidos: anon y authenticated. Crear/editar solo authenticated.
drop policy if exists "orders select all" on public.orders;
create policy "orders select all" on public.orders for select to anon using (true);
drop policy if exists "crud orders authenticated" on public.orders;
create policy "crud orders authenticated" on public.orders
for all to authenticated using (true) with check (true);

drop policy if exists "order_items select all" on public.order_items;
create policy "order_items select all" on public.order_items for select to anon using (true);
drop policy if exists "crud order_items authenticated" on public.order_items;
create policy "crud order_items authenticated" on public.order_items
for all to authenticated using (true) with check (true);

insert into public.business_settings (company_name, branch_name)
select 'Grido', 'Ituzaingó'
where not exists (select 1 from public.business_settings);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'novum-grido',
  'novum-grido',
  true,
  52428800,
  array['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "novum-grido public read" on storage.objects;
create policy "novum-grido public read" on storage.objects
for select to public
using (bucket_id = 'novum-grido');

drop policy if exists "novum-grido authenticated upload" on storage.objects;
create policy "novum-grido authenticated upload" on storage.objects
for insert to authenticated
with check (bucket_id = 'novum-grido');

drop policy if exists "novum-grido authenticated update" on storage.objects;
create policy "novum-grido authenticated update" on storage.objects
for update to authenticated
using (bucket_id = 'novum-grido')
with check (bucket_id = 'novum-grido');

drop policy if exists "novum-grido authenticated delete" on storage.objects;
create policy "novum-grido authenticated delete" on storage.objects
for delete to authenticated
using (bucket_id = 'novum-grido');
