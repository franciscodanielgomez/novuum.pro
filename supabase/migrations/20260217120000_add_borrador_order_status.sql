-- Add BORRADOR to order_status enum so draft orders can be stored in the DB.
-- Safe to run multiple times (no-op if value already exists).

do $$
begin
  alter type public.order_status add value 'BORRADOR';
exception
  when duplicate_object then null;
end $$;
