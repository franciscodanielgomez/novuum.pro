-- Turnos compartidos entre todos los usuarios: un solo turno abierto visible para toda la app.
create table if not exists public.shifts (
  id text primary key,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  turn text not null,
  turn_number int not null,
  cashier_staff_id text not null,
  status text not null default 'OPEN' check (status in ('OPEN', 'CLOSED')),
  totals_by_payment jsonb not null default '{}',
  total numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.shifts is 'Turnos de caja; el turno abierto es visible para todos los usuarios.';
comment on column public.shifts.turn_number is 'Número de turno (1, 2, 3...) para mostrar T1, T2.';
comment on column public.shifts.totals_by_payment is 'Totales por método de pago al cerrar (ej. {"CASH": 1000, "MP": 500}).';

create index if not exists idx_shifts_status_opened_at on public.shifts (status, opened_at desc);

alter table public.shifts enable row level security;

drop policy if exists "shifts select authenticated" on public.shifts;
create policy "shifts select authenticated" on public.shifts
  for select to authenticated using (true);

drop policy if exists "shifts insert authenticated" on public.shifts;
create policy "shifts insert authenticated" on public.shifts
  for insert to authenticated with check (true);

drop policy if exists "shifts update authenticated" on public.shifts;
create policy "shifts update authenticated" on public.shifts
  for update to authenticated using (true) with check (true);

drop policy if exists "shifts delete authenticated" on public.shifts;
create policy "shifts delete authenticated" on public.shifts
  for delete to authenticated using (true);

create or replace function public.set_shifts_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_shifts_updated_at on public.shifts;
create trigger trg_shifts_updated_at
  before update on public.shifts
  for each row execute function public.set_shifts_updated_at();
