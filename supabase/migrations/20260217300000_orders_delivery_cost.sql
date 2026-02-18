-- Costo de envío del pedido (se guarda al confirmar; el valor por defecto viene de business_settings.shipping_price en la UI)
alter table public.orders
  add column if not exists delivery_cost numeric(12,2) not null default 0;

comment on column public.orders.delivery_cost is 'Costo de envío del pedido al momento de crearlo/confirmarlo.';
