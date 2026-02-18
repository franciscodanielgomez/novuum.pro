# Grido Ituzaingo Delivery - MVP v0

Frontend MVP (desktop-first, responsive) para reemplazar el sistema legacy de delivery.

## Inicio rápido

1. **Web**  
   `npm install` → `npm run dev` → abrir `http://localhost:5173`.

2. **Desktop**  
   Instalar [Rust](https://rustup.rs/) (y en Windows, Visual C++ Build Tools). Luego: `npm install` → `npm run tauri:dev` (o `npm run desktop:dev`).

3. **Build MSI (Windows)**  
   `npm run tauri:build` (o `npm run desktop:build`). Salida en `src-tauri/target/release/bundle/msi/`.

4. **Release automático**  
   Al pushear un tag `vX.Y.Z`, el CI construye el MSI en Windows y publica el [GitHub Release](.github/workflows/release.yml) con el instalador y el manifest del updater. Ver [Auto-update](#auto-update-solo-desktop) para claves y configuración.

## Stack

- SvelteKit + TypeScript
- TailwindCSS
- Bits UI + Melt UI (estructura headless)
- TanStack Table (grilla de pedidos)
- Zod para validaciones
- Stores de Svelte por dominio
- Persistencia local con `localStorage` mediante repos y capa API async

## Web (sin Tauri)

La app corre en el navegador; **no hace falta tener Rust instalado**.

```bash
npm install
npm run dev
```


1. Abrir `http://localhost:5173`.

### Probar impresión (web)

Configuraciones → Impresión → **Imprimir prueba A4**. Se abre una pestaña con el ticket y el diálogo de impresión del navegador.

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

## Versión web (online / deploy)

El build normal sigue pensado para Vercel/Supabase u otro host:

```bash
npm run build
```

No se usa adapter estático; el proyecto se despliega como hasta ahora.

---

## Desktop (Tauri)

La misma UI se empaqueta como app de escritorio (Windows .msi, etc.) con Tauri.

### Prerequisitos

- [Rust](https://rustup.rs/) (rustup) instalado
- En **Windows**: [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (o VS con “Desktop development with C++”) para compilar Rust
- Node/npm ya usados para la web

### Desarrollo desktop

```bash
npm install
npm run tauri:dev
```

o, con los alias:

```bash
npm run desktop:dev
```

Se abre la ventana de la app cargando `http://localhost:5173`. Los cambios en el frontend se recargan en la ventana.

### Probar impresión (desktop)

Configuraciones → Impresión → **Detectar impresoras**, elegir una, **Guardar selección**, luego **Imprimir prueba A4**. El ticket se envía a la impresora elegida (o la predeterminada) sin abrir el diálogo del navegador. La impresora se guarda en `localStorage` (`novum_printer_name`). El ticket de prueba tiene 32 caracteres de ancho (preparado para 58mm).

### Build instalador (.msi en Windows)

```bash
npm run tauri:build
```

o:

```bash
npm run desktop:build
```

**Salida esperada:** el instalador queda en `src-tauri/target/release/bundle/msi/` (archivo `.msi` en Windows).

**Troubleshooting íconos:** si el build falla por íconos faltantes:

```bash
npm run tauri icon path/to/logo.png
```

o, si tenés un asset en el repo:

```bash
npm run desktop:icons
```

(usa `./assets/logo.png` por defecto; creá el archivo o pasá otra ruta).

**Windows:** para que el MSI funcione e instale bien, hace falta que el equipo tenga los [Visual C++ Redistributables](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist) si no está instalado Visual Studio (el instalador de Tauri suele manejarlo, pero si falla la instalación, comprobá eso).

---

## Diferencia Web vs Desktop

| | Web | Desktop |
|---|-----|--------|
| **Ejecución** | Navegador, sin Rust | App nativa (Tauri), requiere Rust para desarrollo/build |
| **Impresión** | Diálogo del navegador (imprimir a PDF o impresora) | Impresión nativa a impresora seleccionada (ticket 32 chars) |
| **Actualizaciones** | Botón **Descargar versión Desktop** (navbar y menú de usuario) que lleva a GitHub Releases | Auto-update: al iniciar y cada 6 h se busca actualización; en el menú de perfil (avatar) y en Configuraciones podés ver versión, **Buscar actualizaciones** y **Descargar e instalar** |

En Web no se incluye código del updater de Tauri; todo el flujo de actualización es condicional al entorno.

---

## Auto-update (solo Desktop)

Al iniciar la app desktop se busca una actualización en segundo plano; además hay un chequeo automático cada 6 horas. Si hay una nueva versión, se muestra en:

- **Menú de perfil** (clic en tu nombre/avatar): versión actual, estado (Actualizado / Nueva versión disponible / Buscando…), **Buscar actualizaciones** y **Descargar e instalar**.
- **Header**: badge con la versión (y punto ámbar si hay update disponible).
- **Configuraciones → Actualizaciones**: misma información y botones.

La app no se actualiza sola; el usuario debe pulsar **Descargar e instalar**. Tras instalar, la app se cierra y podés abrirla de nuevo.

### Release automático (GitHub Actions)

Al pushear un **tag** `vX.Y.Z`, el workflow [`.github/workflows/release.yml`](.github/workflows/release.yml):

1. Ejecuta `npm run check` y construye Tauri en Windows.
2. Genera el instalador `.msi` y el `.msi.sig` (firma para el updater).
3. Genera `latest.json` (manifest del updater).
4. Crea o actualiza el GitHub Release del tag y sube como assets: `.msi`, `.msi.sig`, `latest.json`.

**Para publicar una versión:**

1. Actualizá la versión en `src-tauri/tauri.conf.json` (campo `version`, ej. `"0.1.1"`). Opcionalmente sincronizá `package.json`.
2. Creá el tag y subilo:
   ```bash
   git tag v0.1.1
   git push origin v0.1.1
   ```
3. El CI corre en Windows, construye el MSI, firma con la clave configurada y publica el release.

**Secretos en GitHub (Settings → Secrets and variables → Actions):**

- **`TAURI_PRIVATE_KEY`**: contenido de la clave privada de firma (o ruta; la que usás en `TAURI_SIGNING_PRIVATE_KEY` en local).
- **`TAURI_KEY_PASSWORD`** (opcional): contraseña de la clave si la definiste al generarla.

`GITHUB_TOKEN` lo provee GitHub; el workflow necesita permisos `contents: write` para crear el release y subir assets.

### Descarga del instalador

- **Página del último release:**  
  `https://github.com/<OWNER>/<REPO>/releases/latest`  
  Ahí se listan el `.msi` y el resto de los assets; el usuario elige qué descargar.

- **Descarga directa del MSI** (el nombre depende de versión e idioma, ej. `Novum POS_0.1.0_x64_es-AR.msi`):  
  `https://github.com/<OWNER>/<REPO>/releases/latest/download/<NOMBRE_MSI>`  
  Si querés un enlace fijo en la web, podés usar esta URL en `VITE_DESKTOP_DOWNLOAD_URL` sabiendo que el nombre del MSI puede cambiar entre versiones; si no querés hardcodear el nombre, usá `/releases/latest` y mostrá instrucciones (“Ir a la última release y descargar el archivo .msi”).

### Updater: pubkey, keys y manifest

- **Claves:** una vez por proyecto generás un par con `npm run tauri signer generate -w ~/.tauri/novum.key`. La **clave pública** va en `src-tauri/tauri.conf.json` → `plugins.updater.pubkey` (reemplazando el `TODO_REEMPLAZAR_CON_PUBKEY_TRAS_tauri_signer_generate`). La **clave privada** se usa en CI como secreto `TAURI_PRIVATE_KEY` (y opcionalmente `TAURI_KEY_PASSWORD`).
- **Endpoint:** en `tauri.conf.json`, `plugins.updater.endpoints` debe apuntar al manifest, ej.:  
  `https://github.com/<OWNER>/<REPO>/releases/latest/download/latest.json`
- **Manifest `latest.json`:** lo genera el workflow de release a partir del `.msi` y del `.msi.sig`. Incluye la versión, la URL del MSI y la firma; la app desktop lo usa para comprobar y descargar actualizaciones.

### Probar el updater

Con una versión anterior instalada, abrí la app; en unos segundos debería aparecer "Nueva versión X.X.X disponible" en el menú de perfil o en Configuraciones. Pulsá **Descargar e instalar**; la app se cierra y el instalador aplica la actualización.

### Web – enlace a Desktop

El botón "Descargar versión Desktop" / "Descargar Desktop" apunta por defecto a la **página** del último release:  
`https://github.com/TU_USUARIO/TU_REPO/releases/latest`  
(así el usuario ve los assets e instrucciones sin depender del nombre exacto del MSI).

Para cambiarlo, definí en `.env`:  
`VITE_DESKTOP_DOWNLOAD_URL=https://github.com/tu-org/tu-repo/releases/latest`  
(o la URL directa del `.msi` si preferís enlace de descarga directa).
