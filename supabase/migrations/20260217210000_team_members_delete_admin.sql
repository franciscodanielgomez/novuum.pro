-- Solo administradores pueden eliminar miembros del equipo (quitar de la lista).
create policy "team members delete admin only" on public.team_members
  for delete to authenticated using (public.is_admin());
