# Data Layer POS

## Objetivo

Tener un unico patron para acceso a datos en toda la app POS:

- un solo fetch global de Supabase (`createPosFetch`)
- un solo manejo de timeout por metodo
- errores normalizados (`AppError`)
- sin pantallas colgadas en `Cargando...` o `Guardando...`

## Arquitectura

1. UI (`routes/*`, `stores/*`) llama a `api.*`.
2. `api.*` delega en repos (`src/lib/repo/*Repo.ts`).
3. Repos usan `db.ts` (`dbSelect/dbInsert/dbUpdate/dbDelete/dbRpc`).
4. `db.ts` aplica timeout y normaliza errores.
5. Supabase client usa `createPosFetch` como `global.fetch`.

## Politica de timeout

- Lecturas (`GET`, `HEAD`): base 30s.
- Escrituras (`POST`, `PATCH`, `DELETE`): base 60s.
- En desarrollo: margen mayor (definido en `timeout-policy.ts`).
- Si una llamada trae `AbortSignal` externo, `createPosFetch` no agrega otro timeout encima.

## Errores y sesion

- `401`: intenta refresh una vez (single-flight compartido).
- `invalid_grant`: pasa a `hard-expired` y flujo de login.
- `403`: error de permisos, sin logout automatico.
- offline/timeout: error recuperable, sin logout.

## Reglas para nuevas queries

1. No llamar `supabase.from(...)` directo desde pagina/store (salvo storage/auth puntuales).
2. Crear o extender repo en `src/lib/repo`.
3. Usar helpers de `db.ts`.
4. Exponer metodo en `src/lib/api/index.ts`.
5. En UI, usar `asyncGuard` o `try/catch/finally` para limpiar loading/saving.
6. Si hay drawer/modal con carga async, abortar al cerrar (`AbortController`).

## Checklist anti-colgado (manual)

1. Login correcto.
2. Ir a `Productos`, editar/guardar 5 veces seguidas.
3. Ir a `Grupos`, abrir drawer, editar item y guardar.
4. Ir a `Crear pedido`, abrir configurador de opciones y cerrarlo durante carga.
5. Dejar la app inactiva 20s, volver y repetir CRUD.
6. Minimizar/sleep prolongado, volver y verificar que no requiera recargar pagina.
7. Cortar red temporalmente y validar error recuperable + reintento.

## Diagnostico DEV

Cada request loggea en consola:

- `requestId`
- `method`
- `resource`
- `timeoutMs`
- `ms`
- `status`
- `aborted`
- `abortedBy`

Formato: `[db] start|end|error`.

