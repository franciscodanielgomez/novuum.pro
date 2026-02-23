-- Relacionar pedidos con turnos: número de turno (T1, T2...) y secuencia dentro del turno (T1-1, T1-2...).
-- shift_id: id del turno (localStorage); shift_turn_number: 1, 2, 3...; sequence_in_shift: 1, 2... dentro del turno.

alter table public.orders
  add column if not exists shift_id text,
  add column if not exists sequence_in_shift integer,
  add column if not exists shift_turn_number integer;

comment on column public.orders.shift_id is 'Id del turno al que pertenece el pedido (ej. shf_xxx).';
comment on column public.orders.sequence_in_shift is 'Número secuencial del pedido dentro del turno (1, 2, 3...).';
comment on column public.orders.shift_turn_number is 'Número de turno (1, 2, 3...) para mostrar como T1, T2; denormalizado para impresión y listados.';

create index if not exists idx_orders_shift_id on public.orders (shift_id) where shift_id is not null;
