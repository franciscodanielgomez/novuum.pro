-- Direcciones adicionales por cliente (la principal sigue en customers.address y customers.between_streets).
create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  address_line text not null,
  between_streets text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.customer_addresses is 'Direcciones adicionales del cliente; la principal está en customers.address y between_streets.';

create index if not exists idx_customer_addresses_customer_id on public.customer_addresses (customer_id);

alter table public.customer_addresses enable row level security;

drop policy if exists "customer_addresses select authenticated" on public.customer_addresses;
create policy "customer_addresses select authenticated" on public.customer_addresses
  for select to authenticated using (true);

drop policy if exists "customer_addresses select anon" on public.customer_addresses;
create policy "customer_addresses select anon" on public.customer_addresses
  for select to anon using (true);

drop policy if exists "customer_addresses insert authenticated" on public.customer_addresses;
create policy "customer_addresses insert authenticated" on public.customer_addresses
  for insert to authenticated with check (true);

drop policy if exists "customer_addresses update authenticated" on public.customer_addresses;
create policy "customer_addresses update authenticated" on public.customer_addresses
  for update to authenticated using (true) with check (true);

drop policy if exists "customer_addresses delete authenticated" on public.customer_addresses;
create policy "customer_addresses delete authenticated" on public.customer_addresses
  for delete to authenticated using (true);

create or replace function public.set_customer_addresses_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_customer_addresses_updated_at on public.customer_addresses;
create trigger trg_customer_addresses_updated_at
  before update on public.customer_addresses
  for each row execute function public.set_customer_addresses_updated_at();
