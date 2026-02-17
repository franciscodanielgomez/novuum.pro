# Configuración de Supabase (SQL Editor)

Para que la app pueda **crear clientes**, **categorías**, **productos** y usar Supabase, tenés que ejecutar los scripts SQL en el **Editor SQL** de tu proyecto Supabase, en este orden:

## 1. Schema base (obligatorio)

**Archivo:** `schema_v0.sql`

Crea las tablas y políticas necesarias:

- `customers` – clientes (si no lo corrés, **no se crean clientes** al agregar desde el modal)
- `orders` y `order_items` – pedidos (la app por ahora guarda pedidos en el navegador; estas tablas quedan listas para cuando se conecten)
- `products`, `business_settings`, `team_members`, `user_profiles`, `user_addresses`
- Tipos: `order_status`, `payment_method`, `team_role`
- Políticas RLS para usuarios autenticados
- Trigger `set_updated_at` y trigger para nuevos usuarios

**Cómo:** En el dashboard de Supabase → **SQL Editor** → New query → pegá el contenido de `schema_v0.sql` → Run.

## 2. Scripts opcionales (según lo que uses)

- **Categorías (nueva tabla):** `categories.sql` – tabla `categories` con `id`, `name`, `sort_order`, `active`.
- **Productos con categorías (N a N):** `product_categories_many_to_many.sql`, `products_category_fk.sql` – si usás categorías para productos.
- **Grupos y sabores:** `groups.sql`, `groups_seed.sql`, `product_group_items.sql`, `product_group_items_parent.sql`, `product_product_groups.sql`, `product_product_groups_max.sql`, `sabores_seed.sql` – para productos con grupos (ej. sabores).
- **Imagen de productos:** `products_image_url.sql`, `storage_product_images_policies.sql`.
- **Negocio:** `business_settings_upgrade.sql` si hace falta.

## Resumen

1. Ejecutá **`schema_v0.sql`** primero (sin eso, por ejemplo **no se crean clientes** en Supabase).
2. Si algo “no se crea”, revisá en Supabase → Table Editor que la tabla exista y que RLS permita `INSERT` para usuarios autenticados.
3. Los **pedidos** hoy se guardan en el navegador (localStorage); no se escriben en Supabase hasta que se conecte el repositorio de pedidos a la API de Supabase.
