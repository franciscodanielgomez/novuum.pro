-- El Gestor de tienda puede agregar, editar y eliminar equipo (como el Administrador),
-- pero la UI impide que asigne el rol Administrador.

create or replace function public.is_admin_or_gestor()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.team_members tm
    where tm.id = auth.uid() and tm.active = true
      and (
        ('ADMINISTRADOR' = any(tm.roles) or (tm.roles is null and tm.role = 'ADMINISTRADOR'))
        or ('GESTOR' = any(tm.roles) or (tm.roles is null and tm.role = 'GESTOR'))
      )
  );
$$;

-- staff_guests: admin o gestor pueden insertar, actualizar y eliminar
drop policy if exists "staff_guests insert admin only" on public.staff_guests;
create policy "staff_guests insert admin or gestor" on public.staff_guests
  for insert to authenticated with check (public.is_admin_or_gestor());

drop policy if exists "staff_guests update admin only" on public.staff_guests;
create policy "staff_guests update admin or gestor" on public.staff_guests
  for update to authenticated using (public.is_admin_or_gestor()) with check (public.is_admin_or_gestor());

drop policy if exists "staff_guests delete admin only" on public.staff_guests;
create policy "staff_guests delete admin or gestor" on public.staff_guests
  for delete to authenticated using (public.is_admin_or_gestor());

-- team_members: admin o gestor pueden actualizar cualquier fila y eliminar
drop policy if exists "only admin updates team" on public.team_members;
create policy "admin or gestor updates team" on public.team_members
  for update to authenticated using (public.is_admin_or_gestor()) with check (public.is_admin_or_gestor());

drop policy if exists "team members delete admin only" on public.team_members;
create policy "team members delete admin or gestor" on public.team_members
  for delete to authenticated using (public.is_admin_or_gestor());
