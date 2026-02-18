-- Teléfono del negocio (visible en datos del negocio)
alter table public.business_settings
  add column if not exists phone text;

comment on column public.business_settings.phone is 'Teléfono del negocio/sucursal.';

-- Direcciones del negocio: principal y otras de interés (como en perfil)
create table if not exists public.business_addresses (
  id uuid primary key default gen_random_uuid(),
  business_settings_id uuid not null references public.business_settings(id) on delete cascade,
  label text not null,
  address_line text not null,
  city text,
  state text,
  postal_code text,
  country text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.business_addresses is 'Direcciones del negocio: principal y otras de interés (card Direcciones en Negocio).';

create index if not exists idx_business_addresses_settings on public.business_addresses (business_settings_id);

-- Solo una dirección principal por negocio
create unique index if not exists idx_business_addresses_one_primary
  on public.business_addresses (business_settings_id)
  where is_primary = true;

alter table public.business_addresses enable row level security;

drop policy if exists "business_addresses select authenticated" on public.business_addresses;
create policy "business_addresses select authenticated" on public.business_addresses
  for select to authenticated using (true);

drop policy if exists "business_addresses insert authenticated" on public.business_addresses;
create policy "business_addresses insert authenticated" on public.business_addresses
  for insert to authenticated with check (true);

drop policy if exists "business_addresses update authenticated" on public.business_addresses;
create policy "business_addresses update authenticated" on public.business_addresses
  for update to authenticated using (true) with check (true);

drop policy if exists "business_addresses delete authenticated" on public.business_addresses;
create policy "business_addresses delete authenticated" on public.business_addresses
  for delete to authenticated using (true);

drop trigger if exists trg_business_addresses_updated_at on public.business_addresses;
create trigger trg_business_addresses_updated_at
  before update on public.business_addresses
  for each row execute function public.set_updated_at();
