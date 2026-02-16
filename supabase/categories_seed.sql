-- Optional: seed categories. Run after categories.sql.

insert into public.categories (name, sort_order, active)
values
  ('A GRANEL', 1, true),
  ('HELADERIA', 2, true),
  ('SALSAS', 3, true),
  ('FAMILIAR', 4, true),
  ('TENTACION', 5, true),
  ('TORTAS', 6, true),
  ('POSTRES', 7, true),
  ('BOMBONES', 8, true),
  ('PALITOS', 9, true),
  ('PIZZA', 10, true),
  ('FRIZZIO', 11, true),
  ('PROMOS', 12, true)
;
