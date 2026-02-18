-- Precio de envío en business_settings (editable desde Configuraciones)
alter table public.business_settings
  add column if not exists shipping_price numeric(12,2) not null default 0;

comment on column public.business_settings.shipping_price is 'Precio del envío (configurable en Configuraciones).';

-- Métodos de pago configurables (Efectivo, Mercadopago, etc.)
create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.payment_methods is 'Métodos de pago disponibles (Efectivo, Mercadopago, etc.) editables en Configuraciones.';

create index if not exists idx_payment_methods_sort on public.payment_methods (sort_order);

alter table public.payment_methods enable row level security;

drop policy if exists "payment_methods select authenticated" on public.payment_methods;
create policy "payment_methods select authenticated" on public.payment_methods
  for select to authenticated using (true);

drop policy if exists "payment_methods insert authenticated" on public.payment_methods;
create policy "payment_methods insert authenticated" on public.payment_methods
  for insert to authenticated with check (true);

drop policy if exists "payment_methods update authenticated" on public.payment_methods;
create policy "payment_methods update authenticated" on public.payment_methods
  for update to authenticated using (true) with check (true);

drop policy if exists "payment_methods delete authenticated" on public.payment_methods;
create policy "payment_methods delete authenticated" on public.payment_methods
  for delete to authenticated using (true);

-- Trigger updated_at para payment_methods
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_payment_methods_updated_at on public.payment_methods;
create trigger trg_payment_methods_updated_at
  before update on public.payment_methods
  for each row execute function public.set_updated_at();

-- Valores iniciales: Efectivo y Mercadopago
insert into public.payment_methods (name, sort_order, active)
select 'Efectivo', 0, true
where not exists (select 1 from public.payment_methods where name = 'Efectivo');

insert into public.payment_methods (name, sort_order, active)
select 'Mercadopago', 1, true
where not exists (select 1 from public.payment_methods where name = 'Mercadopago');
