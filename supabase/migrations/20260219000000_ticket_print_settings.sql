-- Configuración de impresión del ticket (tamaño de letra y márgenes), editable desde Configuraciones.
-- Ejecutar en Supabase SQL Editor si la migración no se aplica automáticamente.

alter table public.business_settings
  add column if not exists ticket_font_size_pt integer;

alter table public.business_settings
  add column if not exists ticket_margin_left integer;

alter table public.business_settings
  add column if not exists ticket_margin_right integer;

comment on column public.business_settings.ticket_font_size_pt is 'Tamaño de fuente del ticket en puntos (ej. 30). Por defecto 30.';
comment on column public.business_settings.ticket_margin_left is 'Margen izquierdo del ticket en unidades del dispositivo (ej. 20). Por defecto 20.';
comment on column public.business_settings.ticket_margin_right is 'Margen derecho del ticket en unidades del dispositivo (ej. 20). Por defecto 20.';

-- Valores por defecto en filas existentes para que Configuraciones muestre 30, 20, 20
update public.business_settings
set
  ticket_font_size_pt = coalesce(ticket_font_size_pt, 30),
  ticket_margin_left = coalesce(ticket_margin_left, 20),
  ticket_margin_right = coalesce(ticket_margin_right, 20)
where ticket_font_size_pt is null or ticket_margin_left is null or ticket_margin_right is null;
