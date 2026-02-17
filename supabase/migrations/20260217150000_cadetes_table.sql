-- Miembros del equipo sin cuenta (no requieren email/contraseña).
-- Se muestran en Equipo junto con team_members.

create table if not exists public.staff_guests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role public.team_role not null default 'CAJERO',
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.staff_guests enable row level security;

drop policy if exists "staff_guests select anon" on public.staff_guests;
create policy "staff_guests select anon" on public.staff_guests for select to anon using (true);
drop policy if exists "crud staff_guests authenticated" on public.staff_guests;
create policy "crud staff_guests authenticated" on public.staff_guests
for all to authenticated using (true) with check (true);

alter table public.orders add column if not exists assigned_staff_guest_id uuid references public.staff_guests(id);
