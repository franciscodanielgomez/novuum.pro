# Grido Ituzaingo Delivery - MVP v0

Frontend MVP (desktop-first, responsive) para reemplazar el sistema legacy de delivery.

## Stack

- SvelteKit + TypeScript
- TailwindCSS
- Bits UI + Melt UI (estructura headless)
- TanStack Table (grilla de pedidos)
- Zod para validaciones
- Stores de Svelte por dominio
- Persistencia local con `localStorage` mediante repos y capa API async

## Correr local

```bash
npm install
npm run dev
```

Abrir `http://localhost:5173`.

## Estructura principal

- `src/lib/types.ts`: modelos de dominio
- `src/lib/repo/*.ts`: repositorios CRUD en `localStorage` con keys versionadas `grido_v0_*`
- `src/lib/api/index.ts`: provider async desacoplado (listo para cambiar a REST)
- `src/lib/stores/*.ts`: estado global por dominio
- `src/routes/login`: login con sesión persistida
- `src/routes/app/*`: módulos Pedidos / Nuevo Pedido / Clientes / Equipo / Productos / Caja / Negocio / Reportes
- `supabase/schema_v0.sql`: tablas y políticas RLS para Supabase (clientes, pedidos, productos, negocio y equipo)

## Configuración de base de datos (Supabase)

1. Abrí el SQL Editor de tu proyecto Supabase.
2. Ejecutá el archivo `supabase/schema_v0.sql`.
3. El script crea:
   - tablas de dominio (`customers`, `products`, `orders`, `order_items`, `business_settings`, `team_members`)
   - enum de roles (`CAJERO`, `CADETE`, `ADMINISTRADOR`, `GESTOR`)
   - trigger para que cada usuario registrado se agregue automáticamente al equipo
   - políticas RLS para lectura/escritura autenticada y edición restringida a administrador.

## Seeds incluidos

Se generan automáticamente si no hay datos:

- 9 categorías base (`Congelados Grido`, `Sabores`, `Bombones`, etc.)
- Sabores con imagen placeholder y SKUs para `1KG`, `1/2KG`, `1/4KG`
- 3 empleados iniciales (caja/cadete/admin)
- 10 clientes de ejemplo con teléfono y dirección
