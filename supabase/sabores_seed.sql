-- Seed árbol de Sabores: categorías e ítems. Ejecutar después de product_group_items_parent.sql.
-- Requiere que exista el grupo "Sabores" (groups_seed.sql).
-- Si ya tenés ítems de Sabores cargados, este script los reemplaza.

do $$
declare
  g_id uuid;
begin
  select id into g_id from public.product_groups where name = 'Sabores' limit 1;
  if g_id is null then
    raise exception 'No existe el grupo Sabores. Ejecutá antes groups_seed.sql';
  end if;

  delete from public.product_group_items where group_id = g_id;

  -- Categorías (nivel superior)
  insert into public.product_group_items (group_id, parent_id, name, sort_order, active)
  values
    (g_id, null, 'FRUTAS A LA CREMA', 0, true),
    (g_id, null, 'CHOCOLATES', 1, true),
    (g_id, null, 'DULCE DE LECHE', 2, true),
    (g_id, null, 'FRUTAS AL AGUA', 3, true),
    (g_id, null, 'CREMAS', 4, true),
    (g_id, null, 'CREMAS ESPECIALES', 5, true);

  -- Ítems bajo cada categoría (usamos nombres de categoría para enlazar)
  insert into public.product_group_items (group_id, parent_id, name, sort_order, active)
  select g_id, p.id, v.name, v.ord, true
  from (values
    ('FRUTAS A LA CREMA', 'ANANA A LA CREMA', 0),
    ('FRUTAS A LA CREMA', 'BANANA C/DUL.', 1),
    ('FRUTAS A LA CREMA', 'CEREZA', 2),
    ('FRUTAS A LA CREMA', 'DURAZNO A LA CREMA', 3),
    ('FRUTAS A LA CREMA', 'FRUTILLA A LA CREMA', 4),
    ('FRUTAS A LA CREMA', 'KINOTOS AL WHI.', 5),
    ('CHOCOLATES', 'CHOCO. BLANCO', 0),
    ('CHOCOLATES', 'CHOCO. C/ALME.', 1),
    ('CHOCOLATES', 'CHOCO. DARK', 2),
    ('CHOCOLATES', 'CHOCO. MANI CRUNCH', 3),
    ('CHOCOLATES', 'CHOCO. SUIZO', 4),
    ('CHOCOLATES', 'CHOCOLATE', 5),
    ('DULCE DE LECHE', 'D. DE L. GRANIZ.', 0),
    ('DULCE DE LECHE', 'D. DE L. C/BROWNIE', 1),
    ('DULCE DE LECHE', 'D. DE L. C/NUEZ', 2),
    ('DULCE DE LECHE', 'DULCE DE LECHE', 3),
    ('DULCE DE LECHE', 'SUPER DULCE', 4),
    ('FRUTAS AL AGUA', 'FRUTILLA AL AGUA', 0),
    ('FRUTAS AL AGUA', 'LIMON', 1),
    ('FRUTAS AL AGUA', 'MARACUYA', 2),
    ('FRUTAS AL AGUA', 'NARANJA', 3),
    ('CREMAS', 'CREMA AMERIC.', 0),
    ('CREMAS', 'CREMA RUSA', 1),
    ('CREMAS', 'GRANIZADO', 2),
    ('CREMAS', 'MENTA GRANIZA.', 3),
    ('CREMAS', 'VAINILLA', 4),
    ('CREMAS ESPECIALES', 'FLAN', 0),
    ('CREMAS ESPECIALES', 'CREME BRULLE', 1),
    ('CREMAS ESPECIALES', 'SAMBAYON', 2),
    ('CREMAS ESPECIALES', 'GRIDITO', 3),
    ('CREMAS ESPECIALES', 'TIRAMISU', 4),
    ('CREMAS ESPECIALES', 'CREMA COOKIE', 5),
    ('CREMAS ESPECIALES', 'MARROC', 6),
    ('CREMAS ESPECIALES', 'MASCARPONE', 7),
    ('CREMAS ESPECIALES', 'TRAMONTANA', 8),
    ('CREMAS ESPECIALES', 'CAPPUCCINO GRANZ.', 9)
  ) as v(cat_name, name, ord)
  join public.product_group_items p on p.group_id = g_id and p.parent_id is null and p.name = v.cat_name;
end $$;
