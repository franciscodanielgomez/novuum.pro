-- Permitir que un usuario edite su propia fila en team_members (para poder cambiarse a Administrador).

drop policy if exists "team members can update own" on public.team_members;
create policy "team members can update own" on public.team_members
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
