-- Email opcional de contacto para miembros sin cuenta.
alter table public.staff_guests
  add column if not exists email text;
