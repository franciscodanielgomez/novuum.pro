-- Ejecutar una vez en Supabase SQL Editor si ya tenias la tabla creada.

alter table if exists public.business_settings
  add column if not exists company_name text not null default 'Grido';

alter table if exists public.business_settings
  add column if not exists logo_url text;

update public.business_settings
set company_name = coalesce(nullif(trim(company_name), ''), 'Grido')
where company_name is null or trim(company_name) = '';

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

alter table public.user_profiles enable row level security;
alter table public.user_addresses enable row level security;

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at before update on public.user_profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_user_addresses_updated_at on public.user_addresses;
create trigger trg_user_addresses_updated_at before update on public.user_addresses
for each row execute function public.set_updated_at();

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

drop policy if exists "business update admin only" on public.business_settings;
drop policy if exists "business update authenticated" on public.business_settings;
create policy "business update authenticated" on public.business_settings
for update to authenticated using (true) with check (true);

drop policy if exists "business insert admin only" on public.business_settings;
drop policy if exists "business insert authenticated" on public.business_settings;
create policy "business insert authenticated" on public.business_settings
for insert to authenticated with check (true);

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
