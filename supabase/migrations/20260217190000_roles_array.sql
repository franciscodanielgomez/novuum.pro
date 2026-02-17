-- Roles múltiples: columna roles (array) en team_members y staff_guests.
-- is_admin() considera admin si 'ADMINISTRADOR' está en roles.

alter table public.team_members
  add column if not exists roles public.team_role[] default array['CAJERO']::public.team_role[];

update public.team_members
  set roles = array[role]::public.team_role[];

alter table public.staff_guests
  add column if not exists roles public.team_role[] default array['CAJERO']::public.team_role[];

update public.staff_guests
  set roles = array[role]::public.team_role[];

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.team_members tm
    where tm.id = auth.uid() and tm.active = true
      and ('ADMINISTRADOR' = any(tm.roles) or (tm.roles is null and tm.role = 'ADMINISTRADOR'))
  );
$$;
