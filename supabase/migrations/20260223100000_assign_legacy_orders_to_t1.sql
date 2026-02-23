-- Asignar todos los pedidos que no tienen turno al turno T1 para que se muestren como T1-94, T1-93, etc.
update public.orders
set
  shift_turn_number = 1,
  sequence_in_shift = order_number
where
  shift_id is null
  and shift_turn_number is null;
