-- Teléfono de contacto para miembros del equipo (con cuenta).
alter table public.team_members
  add column if not exists phone text;
