-- Solo administradores pueden agregar, editar o eliminar miembros sin cuenta (staff_guests).

drop policy if exists "crud staff_guests authenticated" on public.staff_guests;
create policy "staff_guests select authenticated" on public.staff_guests for select to authenticated using (true);
create policy "staff_guests insert admin only" on public.staff_guests for insert to authenticated with check (public.is_admin());
create policy "staff_guests update admin only" on public.staff_guests for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "staff_guests delete admin only" on public.staff_guests for delete to authenticated using (public.is_admin());
