-- Añadir número de pedido secuencial (1, 2, 3...) para uso en listados e impresión.
-- Los pedidos existentes se rellenan por orden de creación; los nuevos usan una secuencia.

alter table public.orders
  add column if not exists order_number integer;

-- Asignar números a pedidos existentes por fecha de creación
with numbered as (
  select id, row_number() over (order by created_at, id) as rn
  from public.orders
)
update public.orders o
set order_number = n.rn
from numbered n
where n.id = o.id;

alter table public.orders
  alter column order_number set not null;

-- Secuencia para nuevos pedidos (el siguiente valor será max + 1)
create sequence if not exists public.orders_order_number_seq;

select setval(
  'public.orders_order_number_seq',
  (select coalesce(max(order_number), 0) + 1 from public.orders)
);

alter table public.orders
  alter column order_number set default nextval('public.orders_order_number_seq');

-- Índice y unicidad
create unique index if not exists idx_orders_order_number on public.orders (order_number);
