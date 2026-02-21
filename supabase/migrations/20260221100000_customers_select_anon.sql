-- Permitir que anon también pueda leer customers (SELECT).
-- Así la lista de clientes se muestra aunque la petición vaya sin JWT o la sesión no se adjunte.
-- Los INSERT/UPDATE/DELETE siguen requiriendo authenticated por la política existente.
create policy "customers select anon" on public.customers
for select to anon using (true);
