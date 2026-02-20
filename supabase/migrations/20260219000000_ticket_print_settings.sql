-- Configuración de impresión del ticket (tamaño de letra y márgenes), editable desde Configuraciones.
-- Ejecutar en Supabase SQL Editor si la migración no se aplica automáticamente.

alter table public.business_settings
  add column if not exists ticket_font_size_pt integer;

alter table public.business_settings
  add column if not exists ticket_margin_left integer;

alter table public.business_settings
  add column if not exists ticket_margin_right integer;

comment on column public.business_settings.ticket_font_size_pt is 'Tamaño de fuente del ticket en puntos (ej. 30). Por defecto 30.';
comment on column public.business_settings.ticket_margin_left is 'Margen izquierdo del ticket (unidades del dispositivo). Por defecto 5 (como el software VB).';
comment on column public.business_settings.ticket_margin_right is 'Margen derecho del ticket (unidades del dispositivo). Por defecto 40 (como el software VB).';

-- Valores por defecto en filas existentes: 30, 5, 40 (como el otro software que imprime bien)
update public.business_settings
set
  ticket_font_size_pt = coalesce(ticket_font_size_pt, 30),
  ticket_margin_left = coalesce(ticket_margin_left, 5),
  ticket_margin_right = coalesce(ticket_margin_right, 40)
where ticket_font_size_pt is null or ticket_margin_left is null or ticket_margin_right is null;
