-- Observación por dirección en direcciones adicionales del cliente.
alter table public.customer_addresses
  add column if not exists notes text;

comment on column public.customer_addresses.notes is 'Observación de esta dirección (ej. timbre, piso, depto).';
