-- Asegurar que tanto anon como authenticated puedan hacer SELECT en customers.
-- Así la búsqueda de clientes funciona en la página Clientes y en el POS.
drop policy if exists "customers select anon" on public.customers;
create policy "customers select anon" on public.customers
for select to anon using (true);

drop policy if exists "customers select authenticated" on public.customers;
create policy "customers select authenticated" on public.customers
for select to authenticated using (true);
