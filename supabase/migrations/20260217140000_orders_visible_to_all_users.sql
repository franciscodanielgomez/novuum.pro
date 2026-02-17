-- Todos los usuarios pueden ver pedidos (anon + authenticated). Crear/editar solo authenticated.

drop policy if exists "orders select all" on public.orders;
create policy "orders select all" on public.orders
for select to anon using (true);

drop policy if exists "order_items select all" on public.order_items;
create policy "order_items select all" on public.order_items
for select to anon using (true);
