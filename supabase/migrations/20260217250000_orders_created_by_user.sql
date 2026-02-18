-- Quien tomó el pedido: usuario del sistema (team_members) que lo creó.
-- Opcional para no romper pedidos existentes.

alter table public.orders
  add column if not exists created_by_user_id uuid references public.team_members(id);

comment on column public.orders.created_by_user_id is 'Usuario (team_members) que tomó el pedido.';

-- Nombre del cajero al momento del pedido (snapshot para listados e impresión sin hacer join).
alter table public.orders
  add column if not exists cashier_name_snapshot text;

comment on column public.orders.cashier_name_snapshot is 'Nombre del cajero al momento de tomar el pedido (solo lectura).';
