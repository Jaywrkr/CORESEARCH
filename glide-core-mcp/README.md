# glide-core-mcp

Servidor MCP local (stdio) que conecta Claude Desktop con la tabla de proyectos de
Coresolutions en Glide, usando la API oficial de Glide (`@glideapps/tables`).

No hay deploy remoto. Este servidor corre en tu máquina y Claude Desktop lo lanza
como subproceso vía stdio.

## ⚠️ Seguridad del token de Glide

- El token de Glide **nunca** va hardcodeado en `index.js` ni en ningún archivo que
  se suba a git. Siempre sale de variables de entorno (`.env` local, o `env` en la
  config de Claude Desktop).
- `.env` está en `.gitignore` desde el primer commit. Nunca lo fuerces a git.
- **Si en algún momento compartiste el token en texto plano** (en un chat, un
  captura de pantalla, un ticket, etc.), consideralo comprometido: andá a Glide,
  regeneralo, y actualizá tu `.env` con el nuevo valor ANTES de usar este servidor.

## 1. Instalar dependencias

```bash
cd glide-core-mcp
npm install
```

## 2. Completar credenciales de Glide

```bash
cp .env.example .env
```

Editá `.env` y completá:

```
GLIDE_TOKEN=...       # Settings > API en tu app de Glide (plan Business/Enterprise)
GLIDE_APP_ID=...      # ID de la app (URL de la app o modal "Show API")
GLIDE_TABLE_ID=...    # ID de la tabla de proyectos (modal "Show API" > elegir la tabla)
```

### Mapear las columnas reales

Abrí `glideClient.js` y reemplazá cada `REEMPLAZAR_COLUMNA_*` por el nombre remoto
real que te da Glide en el modal **Show API** para cada columna de tu tabla
(codigoProyecto, clienteProyecto, gestion, fechaPlanificada, fechaCreacion,
fechaFinalizacion, satisfaccion, estado). Ese nombre remoto NO es el nombre visible
en el editor de Glide — es el identificador que aparece en el ejemplo de API.

## 3. Probar la conexión a Glide (ANTES de tocar Claude Desktop)

```bash
npm run test:glide
```

Esto se conecta directo a Glide, sin pasar por MCP. Si funciona, vas a ver algo así:

```
OK: se trajeron 42 filas.

Primeras 3 filas (verificá que los campos no salgan undefined):

{
  codigoProyecto: 'PRJ-0231',
  clienteProyecto: 'Banco XYZ',
  gestion: 'VMware',
  estado: 'En curso',
  fechaCreacion: '2026-08-01T12:00:00.000Z',
  ...
}
---
```

Si ves `undefined` en algún campo, revisá el nombre remoto de esa columna en
`glideClient.js`. Si falla la conexión entera, revisá `GLIDE_TOKEN`, `GLIDE_APP_ID`
y `GLIDE_TABLE_ID` en `.env`.

Este paso separa errores de "conexión a Glide" de errores de "conexión MCP": si
`npm run test:glide` funciona pero Claude no trae resultados, el problema está en
la config de Claude Desktop, no en Glide.

## 4. Registrar el servidor en Claude Desktop

Editá el archivo de configuración de Claude Desktop:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

Agregá (o mergeá) esto, usando la **ruta absoluta** de este proyecto en tu máquina
(reemplazá `/RUTA/ABSOLUTA/A/glide-core-mcp` por la ruta real):

```json
{
  "mcpServers": {
    "glide-core-mcp": {
      "command": "node",
      "args": ["/RUTA/ABSOLUTA/A/glide-core-mcp/index.js"],
      "env": {
        "GLIDE_TOKEN": "tu_token_de_glide",
        "GLIDE_APP_ID": "tu_app_id",
        "GLIDE_TABLE_ID": "tu_table_id"
      }
    }
  }
}
```

Notas:

- Podés usar `env` en la config de Claude Desktop (como arriba) o dejar que el
  servidor lea el `.env` local — con ambos alcanza, pero si usás `env` en la config
  de Claude Desktop, esos valores pisan lo que haya en `.env`.
- Si ya tenés otros servidores MCP configurados, agregá `"glide-core-mcp"` como una
  clave más dentro de `mcpServers`, no reemplaces el archivo entero.

## 5. Reiniciar Claude Desktop y probar

1. Cerrá Claude Desktop completamente (no solo la ventana) y volvé a abrirlo.
2. Verificá que "glide-core-mcp" aparezca conectado (ícono de herramientas/MCP en
   la interfaz de Claude Desktop).
3. Preguntale a Claude:

   > dame los últimos 10 proyectos que tienen VMware

   Claude debería invocar la tool `buscar_proyectos` con `servicio: "vmware"` y
   devolver resultados reales de tu tabla de Glide.

## La tool `buscar_proyectos`

- **servicio** (string, opcional): filtro por substring, case-insensitive. Busca
  tanto en `gestion` como en `clienteProyecto` (la tecnología suele aparecer en el
  nombre del proyecto, ej. `"MUTUALISTA PICHINCHA - SERVICIOS VMWARE"`).
- **estado** (string, opcional): filtro exacto, case-insensitive, sobre `estado`.
- **limite** (number, opcional, default 10, máx 50): cantidad de resultados.

Devuelve un JSON con los proyectos ordenados por `fechaCreacion` descendente,
incluyendo: `codigo`, `cliente`, `servicio`, `estado`, `fechaCreacion`,
`fechaPlanificada`, `fechaFinalizacion`, `satisfaccion`. Internamente trae **todas**
las filas de la tabla (la librería pagina sola), así que el orden/filtro se aplica
sobre el universo completo, no solo sobre las últimas N filas.

## Explorar tablas y relaciones de la app de Glide

La API de Glide no trae relaciones "resueltas" automáticamente — cada tabla se lee
por separado. Para descubrir qué otras tablas existen en tu app y cómo están
armadas sus columnas (incluyendo relaciones, lookups y rollups) sin abrir el modal
"Show API" a mano, hay dos tools de solo lectura:

- **`listar_tablas`**: sin parámetros. Devuelve `[{ id, nombre }, ...]` de todas las
  tablas de la app.
- **`inspeccionar_tabla`**: recibe `tableId` (el `id` que devuelve `listar_tablas`).
  Devuelve las columnas de esa tabla con su `id` remoto, `name` visible y `type.kind`
  — así se identifica qué columnas son relaciones, lookups o rollups.

Uso típico: preguntale a Claude "listá las tablas de mi app de Glide" y después
"inspeccioná la tabla X" para ver sus columnas. Con esa info se pueden diseñar
tools nuevas que crucen datos entre tablas (ej. proyecto + cliente relacionado),
mapeando las columnas correspondientes en `glideClient.js`.

## Mapa de relaciones (`relations.json`)

En la práctica, las tablas de esta app de Glide no se cruzan con columnas nativas de
tipo Relation, sino comparando el **valor de texto** de una columna contra otra (ej.
`Nro Proyecto` en "Actividades Planificacion" contra `Codigo Proyecto` en "Proyectos
Planificacion"). Esto quedó documentado a mano, con datos reales verificados con
`obtener_filas`/`inspeccionar_tabla`, en **`relations.json`** (raíz del proyecto) —
ver también `RELATIONS.md` para el resumen legible de cómo se armó y qué cuidados
tener (formato de nombre inconsistente entre tablas, joins aproximados, etc.).

Estructura de `relations.json`:

- **`tablas.<clave>`** (snake_case, ej. `actividades_planificacion`): `tableId`,
  `nombre` (nombre visible en Glide) y `claves` — mapea nombre LÓGICO (ej.
  `nroProyecto`, `cliente`, `personal`) al id/nombre REAL de columna que hay que
  usar para leer esa tabla con `obtener_filas`/`buscar_filas`.
- **`alias_personal`** / **`alias_cliente`**: diccionarios que normalizan nombres
  que aparecen distinto según la tabla (ej. `"Luis Miguel S"` en Actividades vs.
  `"Luis Miguel Serrano"` en Capacitaciones; `"SUKASA"` vs. `"COMOHOGAR (SUKASA)"`
  en Clientes General). Las tools compuestas los usan automáticamente al filtrar
  por persona o cliente, así no pierden resultados por diferencias de formato.
- **`pendientes_por_confirmar`**: tablas/relaciones detectadas pero sin confirmar
  con datos reales todavía (ej. `HorasSoporte Gestion`, `Servicios Gestion`).

- **`obtener_mapa_relaciones`** (tool, sin parámetros): devuelve `relations.json`
  tal cual, lectura local instantánea (no llama a la API de Glide). Pedile a Claude
  que la llame al arrancar cualquier tarea que cruce tablas.

Para documentar una tabla nueva o corregir una existente: `listar_tablas` (id) →
`inspeccionar_tabla` / `obtener_filas` (columnas y valores reales) → agregar o
editar su entrada en `tablas` dentro de `relations.json`. No hace falta tocar
`index.js`, `glideClient.js` ni `crossQueries.js` para esto.

⚠️ **Dos `tableId` a confirmar**: `clientes_general` y `personal_general` tienen un
`" A"` sospechoso al final del id (ej. `"native-table-...hdc A"`) — los ids de Glide
normalmente no llevan espacios. Si las tools que dependen de esas dos tablas fallan,
empezar por sacar ese `" A"` y volver a probar.

## Tools genéricas (sin configuración previa)

Estas funcionan sobre cualquier tabla, con solo pasarle su `tableId` (el que
devuelve `listar_tablas`):

- **`obtener_filas`** — `tableId`, `limite` (default 5, máx 20), `offset` (default
  0). Filas crudas sin transformar, con paginación simple. Sirve para ver valores
  reales en tablas con columnas genéricas (`column1`, `column2`...) antes de
  mapearlas.
- **`buscar_filas`** — `tableId`, `campo`, `valor`, `limite` (default 10, máx 50).
  Filtro por substring case-insensitive sobre cualquier columna de cualquier tabla.
- **`buscar_texto_global`** — `texto`, `tablas` (array de ids, opcional — si se
  omite busca en las tablas de la app), `limite_por_tabla` (default 5). Busca un
  término en varias tablas a la vez, agrupado por tabla. Útil cuando no se sabe
  dónde está algo.

## Tools compuestas (dependen de `relations.json`)

Estas cruzan datos entre varias tablas, resolviendo alias de persona/cliente
automáticamente. Cada una valida primero que las tablas que necesita tengan
`tableId` y las `claves` correspondientes completas en `relations.json` — si falta
algo, devuelven un mensaje explicando exactamente qué completar:

- **`obtener_proyecto_completo`** — `nro_proyecto`. Proyecto base + actividades,
  cronograma, equipos asignados, el registro paralelo en Proyectos Gestion, y
  tickets (join aproximado por cliente, porque Tickets no referencia Nro Proyecto
  directamente) + horas totales.
- **`obtener_cliente_resumen`** — `cliente`. Proyectos del cliente + contactos
  asociados + tickets + fila cruda del maestro en CLIENTES GENERAL.
- **`obtener_personal_resumen`** — `nombre`. Certificaciones (usa nombre
  completo internamente vía alias), actividades recientes y datos base.
- **`horas_por_proyecto`** / **`horas_por_personal`** — suma de horas desde
  Actividades Planificacion, con `desde`/`hasta` opcionales.
- **`tickets_abiertos`** / **`tickets_vencidos`** — sobre Tickets Planificacion.
- **`certificaciones_por_vencer`** — `dias` (default 30), sobre Capacitaciones
  Planificacion.
- **`proyectos_sin_actualizar`** — `dias` (default 15). Solo depende de
  `Proyectos Planificacion` (usa `fechaRevisado`, ya mapeada).

Todas estas ya deberían estar activas con los datos reales cargados en
`relations.json` — si alguna responde "disponible: false", el mensaje indica
exactamente qué falta completar.

## Próximos pasos (no incluidos ahora)

- Confirmar los dos `tableId` sospechosos (`clientes_general`, `personal_general`,
  ver aviso arriba).
- Terminar `pendientes_por_confirmar` en `relations.json` (HorasSoporte Gestion,
  Servicios Gestion, relación de Compras Publicas Planificacion, y confirmar si
  "x - Clientes/Personal Planificacion" son vistas duplicadas de las tablas
  generales).
- Deploy remoto (Railway, Render o Fly.io) para no depender de tu máquina local ni
  poder usarlo desde el celular.
- Tools de escritura (crear/actualizar proyectos).
- Autenticación OAuth.
