-- Permite guardar en orders el nombre del método de pago desde payment_methods (Efectivo, Mercadopago, etc.)
-- en lugar del enum (CASH, MP, TRANSFER).

alter table public.orders
  alter column payment_method type text
  using (
    case payment_method::text
      when 'CASH' then 'Efectivo'
      when 'MP' then 'Mercadopago'
      when 'TRANSFER' then 'Transferencia'
      else 'Efectivo'
    end
  );

alter table public.orders
  alter column payment_method set default 'Efectivo';

comment on column public.orders.payment_method is 'Nombre del método de pago (debe coincidir con payment_methods.name, p. ej. Efectivo, Mercadopago).';
