-- Optional: seed product groups (e.g. Sabores). Run after groups.sql.

insert into public.product_groups (name, sort_order, active)
values
  ('Sabores', 1, true)
;
