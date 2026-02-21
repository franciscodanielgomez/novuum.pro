# POS always-on: sesión y datos (SvelteKit + Supabase)

## Objetivo

La app actúa como POS “always-on”:

- **No cerrar sesión** por timeouts, AbortError, red lenta, sleep, 401 transitorio.
- **Datos siempre visibles**: si una pantalla tiene datos cargados, se muestran al instante desde cache local (stale-while-revalidate).
- Tras **30 min / 6 h** inactivo: render con cache → revalidar sesión en background → reintentar cargas.
- **Solo mostrar login** cuando el refresh token es definitivamente inválido (`invalid_grant` / refresh revoked), con mensaje: “La sesión expiró, volvé a iniciar sesión”.

---

## Arquitectura

### 1. Política de auth vs datos

- **403 (RLS/forbidden)**: nunca logout; solo log; el caller muestra error.
- **401**: refresh (máx 1, lock global) → retry 1 vez. Si sigue 401:
  - Si el refresh falló por `invalid_grant` → `authStatus = 'hard-expired'` → banner “Iniciar sesión”.
  - Si el refresh falló por red → `authStatus = 'offline'`; no logout.
- **Error de red / timeout**: no logout; `authStatus = 'offline'`.

### 2. Wrapper de fetch (POS)

- **Archivo**: `src/lib/network/supabaseFetch.ts`
- **Comportamiento**:
  - Timeout 20 s con AbortController.
  - 401 en REST: llama a refresh (single-flight), retry 1 vez; según resultado marca `hard-expired` u `offline`.
  - 403: solo log; no refresh ni logout.
  - Nunca redirige a `/login`; solo actualiza estado vía callbacks (`onHardExpired`, `onOffline`).
- El cliente Supabase usa este fetch como `global.fetch`.

### 3. SessionStore

- **Estado**: `user`, `session`, `ready`, `authStatus` (`'ok' | 'refreshing' | 'offline' | 'hard-expired'`), `lastRefreshAt`, `lastAuthError`.
- **ensureValidSession({ maxWaitMs })**: single-flight; si ya hay refresh en curso, espera; retorna `{ hasSession }` sin hacer logout.
- **refreshSessionSafe()**: ejecuta refresh y actualiza `authStatus` (ok / offline / hard-expired).
- **setAuthHardExpired()** / **setAuthOffline()**: llamados por el fetch wrapper.

### 4. Datos: cache y revalidación

- **Pantallas con cache**: categorías, grupos, clientes, pedidos (y business con fallback existente).
- **Flujo**:
  1. Al montar: leer cache local (localStorage) y mostrar datos de inmediato.
  2. Poner estado en `refreshing` y disparar revalidación en background.
  3. Si la revalidación falla (red/timeout): mantener datos en pantalla, `status = 'error'`, mostrar banner “Sin conexión / Reintentando…”.
  4. Reintento automático cada 10–15 s mientras `status === 'error'`.
- **No** se vacían los datos por un error de carga; solo se marca error y se muestra aviso.

### 5. Banner global

- **Componente**: `PosStatusBanner.svelte`
- **Refreshing**: “Reconectando…”
- **Offline**: “Sin conexión. Mostrando datos guardados. Reintentando… [Reintentar]”
- **Hard-expired**: “La sesión expiró. Volvé a iniciar sesión. [Iniciar sesión]”
- En `hard-expired` se pueden bloquear acciones de escritura pero se sigue permitiendo ver cache.

### 6. Logs y métricas

- **Prefijos**: `[pos-auth]`, `[pos-data]`
- **Métricas** (en memoria): intentos de refresh, éxito/fallo, requests abortadas, etc. (`src/lib/pos/diagnostics.ts`)
- Con `PUBLIC_SESSION_DEBUG=true`: más detalle de auth/datos.

---

## Cómo probar “dejarlo 6 horas y volver”

1. Iniciar sesión y navegar por categorías, pedidos, clientes (para llenar cache).
2. Cerrar la pestaña o minimizar y dejar la máquina/ventana inactiva **varias horas** (o simular: DevTools → Network → Offline un rato, o acortar JWT en backend para simular expiración).
3. Volver a abrir la app (misma pestaña o nueva con la URL de la app).
4. **Esperado**:
   - Se muestra la UI con los **últimos datos en cache** (categorías, pedidos, etc.) de inmediato.
   - Arriba puede verse el banner “Reconectando…” o “Sin conexión. Mostrando datos guardados. Reintentando…”.
   - En background se intenta refresh de sesión y revalidación de datos.
   - Si el refresh token sigue válido: al recuperar red, el banner desaparece y los datos se actualizan.
   - Si el refresh token es inválido (`invalid_grant`): aparece “La sesión expiró. [Iniciar sesión]”; al hacer clic se redirige a login con el mensaje indicado.

### Casos concretos

- **Sleep/wake**: dejar el equipo en suspensión y volver; debe mostrarse cache y luego revalidar sin cerrar sesión por timeout.
- **Offline/online**: DevTools → Network → Offline; usar la app (ver cache, banner); volver a Online; debe reintentar y actualizar.
- **Token expirado (401)**: el fetch hace refresh + retry; si el refresh falla por `invalid_grant`, solo entonces se muestra “Sesión expirada”.
- **RLS 403**: no debe hacer logout; solo log y que la pantalla muestre el error de la operación.

---

## Desactivar logs detallados

En `.env`:

```env
PUBLIC_SESSION_DEBUG=false
```

Los avisos importantes (`[pos-auth]`, `[pos-data]`) siguen saliendo por los `Warn` correspondientes.
