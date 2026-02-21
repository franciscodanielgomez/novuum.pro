# Test manual de 10 minutos — anti-colgado POS

Objetivo: confirmar en tu máquina que **no vuelve** el “Cargando…” / “Guardando…” infinito y que el CRUD sigue usable después de inactividad o problemas de red.

**Duración total:** ~10 minutos.

---

## Antes de empezar

- [ ] App corriendo (Tauri o `npm run dev`).
- [ ] Sesión iniciada (usuario y contraseña válidos).
- [ ] Navegador/DevTools abiertos para ver toasts y, si quieres, logs `[db]` en consola.

---

## 1. Productos — CRUD repetido (≈2 min)

| Paso | Acción | Verificar |
|------|--------|-----------|
| 1.1 | Ir a **Productos**. | La lista carga en pocos segundos (o ves error claro, no “Cargando…” eterno). |
| 1.2 | Abrir detalle de un producto (editar). | Drawer abre; opciones/grupos cargan o muestran error. |
| 1.3 | Cambiar algo (nombre, precio, etc.) y **Guardar**. | “Guardando…” desaparece y ves confirmación o toast de error. |
| 1.4 | Repetir **Guardar** 4 veces más (mismo u otro producto). | Cada vez vuelve a estado normal; nunca queda “Guardando…” pegado. |
| 1.5 | Cerrar el drawer. | No queda spinner ni loading infinito. |

**Éxito:** Puedes editar y guardar 5 veces seguidas sin que la pantalla se quede trabada.

---

## 2. Grupos — Drawer y guardar (≈1 min)

| Paso | Acción | Verificar |
|------|--------|-----------|
| 2.1 | Ir a **Grupos**. | Lista de grupos carga (o error claro). |
| 2.2 | Abrir un grupo (drawer con ítems). | Ítems cargan en el drawer. |
| 2.3 | Editar un ítem y **Guardar**. | “Guardando…” termina; ves éxito o mensaje de error. |
| 2.4 | Cerrar el drawer. | No queda “Cargando…” en la pantalla. |

**Éxito:** Drawer abre, guardas y al cerrar la UI vuelve a estado normal.

---

## 3. Crear pedido — Drawer durante carga (≈1 min)

| Paso | Acción | Verificar |
|------|--------|-----------|
| 3.1 | Ir a **Crear pedido**. | Pantalla carga (productos / categorías visibles o error). |
| 3.2 | Abrir el configurador de opciones de un producto (drawer/modal). | Empieza a cargar datos. |
| 3.3 | **Cerrar el drawer/modal mientras sigue cargando.** | La carga se cancela; no queda “Cargando…” colgado. |
| 3.4 | Volver a abrir y esperar a que termine de cargar. | Datos se muestran o error; luego puedes seguir usando la pantalla. |

**Éxito:** Cerrar el drawer durante la carga no deja la UI trabada.

---

## 4. Inactividad 20–30 segundos (≈1 min)

| Paso | Acción | Verificar |
|------|--------|-----------|
| 4.1 | Sin minimizar: deja la app **sin tocar** 20–30 s (misma pestaña/ventana). | — |
| 4.2 | Haz clic en otra sección (ej. **Categorías** o **Productos**). | La nueva sección carga en tiempo razonable (o muestra error, no “Cargando…” infinito). |
| 4.3 | Intenta **editar y guardar** algo (ej. una categoría o un producto). | Guardado completa; no se queda en “Guardando…” para siempre. |

**Éxito:** Después de 20–30 s sin usar la app, puedes navegar y hacer CRUD sin tener que recargar la página.

---

## 5. Minimizar / ventana en segundo plano (≈2 min)

| Paso | Acción | Verificar |
|------|--------|-----------|
| 5.1 | Minimiza la ventana (o cambia a otra app) y espera **1–2 minutos**. | — |
| 5.2 | Vuelve a la app. | La pantalla actual se ve normal (puede haber un breve “refreshing”; no debe quedar “Cargando…” fijo). |
| 5.3 | Navega a **Productos** o **Grupos**. | Lista carga (o error); no loading infinito. |
| 5.4 | Edita y guarda un elemento. | “Guardando…” termina; no queda trabado. |

**Éxito:** Después de minimizar 1–2 min, puedes usar la app sin tener que hacer F5.

---

## 6. Red cortada — Error y reintento (≈2 min)

| Paso | Acción | Verificar |
|------|--------|-----------|
| 6.1 | Con la app abierta, **corta la red** (Wi‑Fi off o modo avión). | — |
| 6.2 | Intenta cargar una sección o guardar algo. | Ves un mensaje de error (toast o similar), **no** “Cargando…” o “Guardando…” infinito. |
| 6.3 | **Vuelve a conectar** la red. | — |
| 6.4 | Reintenta (ej. guardar de nuevo o recargar la sección). | La operación puede completar o mostrar otro error; la UI no queda bloqueada. |
| 6.5 | Verifica que **no te sacó de sesión** solo por el corte de red. | Sigues logueado; si hay logout, solo debería ser en caso de `invalid_grant` (token inválido). |

**Éxito:** Sin red ves error claro y la UI se recupera; con red de nuevo puedes reintentar sin recargar la página.

---

## 7. Resumen rápido (≈1 min)

Recorre mentalmente:

- [ ] Productos: 5 guardados seguidos sin trabar.
- [ ] Grupos: drawer abre, guardas, cierras sin “Cargando…” infinito.
- [ ] Crear pedido: cerrar drawer durante carga no deja nada colgado.
- [ ] 20–30 s inactivo: al volver, navegación y CRUD funcionan.
- [ ] 1–2 min minimizado: al volver, la app responde sin F5.
- [ ] Red cortada: error visible y recuperación al reconectar.

Si todos los puntos pasan, el test de 10 minutos está **OK** en tu entorno.

---

## Si algo falla

- Anota: **sección**, **paso** y qué viste (ej. “Productos paso 1.3: quedó en Guardando…”).
- Revisa la consola por `[db]` y por “AbortError” o “Request timed out”.
- Con eso se puede afinar timeouts, abort al cerrar drawer o mensajes de error.
