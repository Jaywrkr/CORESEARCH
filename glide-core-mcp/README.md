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
`Nro Proyecto` en "Actividades Planificacion" contra `codigoProyecto` en "Proyectos
Planificacion"). Documentar esto de nuevo cada vez que se necesita cruzar datos es
lento, así que queda fijado a mano en **`relations.json`**, en la raíz del proyecto.

- **`obtener_mapa_relaciones`** (tool, sin parámetros): devuelve el contenido de
  `relations.json` tal cual. Es lectura local instantánea — no llama a la API de
  Glide. Pedile a Claude que la llame al arrancar cualquier tarea que cruce tablas,
  así no tiene que adivinar ni volver a inspeccionar cada vez.

Cómo se completa `relations.json` a medida que se van documentando más tablas:

1. Llamar `listar_tablas` para conseguir el `tableId` real de la tabla a documentar.
2. Llamar `inspeccionar_tabla` con ese id para ver sus columnas y tipos.
3. Agregar (o completar) la entrada de esa tabla en `relations.json`: su `tableId`,
   sus columnas relevantes, y en `relaciones` qué columna conecta con qué tabla y
   columna destino (usando las claves ya definidas en `tablas`, ej.
   `"proyectosPlanificacion"`).
4. Sacarla de la lista `pendienteDeInspeccionar` una vez documentada.

No hace falta tocar `index.js` ni `glideClient.js` para esto — es solo editar el
JSON. El archivo ya trae precargada la tabla `proyectosPlanificacion` (la que usa
`buscar_proyectos`) y varias tablas más con su estructura esperada pero `tableId`
en `null`, pendientes de completar (ver siguiente sección).

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
  omite busca en las 29 tablas de la app), `limite_por_tabla` (default 5). Busca un
  término en varias tablas a la vez, agrupado por tabla. Útil cuando no se sabe
  dónde está algo.

## Tools compuestas (dependen de `relations.json`)

Estas cruzan datos entre varias tablas. Cada una valida primero que las tablas que
necesita tengan `tableId` y las `columnasRemoto` correspondientes completas en
`relations.json` — si falta algo, devuelven un mensaje explicando exactamente qué
completar (nunca inventan un mapeo a ciegas):

- **`obtener_proyecto_completo`** — `nro_proyecto`. Trae el proyecto (ya
  funcional) + actividades, cronograma, tickets y equipos asignados (pendientes de
  mapear en `relations.json`) + horas totales.
- **`obtener_cliente_resumen`** — `cliente`. Proyectos del cliente (ya funcional) +
  contactos asociados y contadores de oportunidades (pendientes de mapear).
- **`obtener_personal_resumen`** — `nombre`. Certificaciones, actividades
  recientes y datos base de una persona (todo pendiente de mapear).
- **`horas_por_proyecto`** / **`horas_por_personal`** — suma de horas desde
  Actividades Planificacion, con `desde`/`hasta` opcionales (pendiente de mapear).
- **`tickets_abiertos`** / **`tickets_vencidos`** — sobre Tickets Planificacion
  (pendiente de mapear).
- **`certificaciones_por_vencer`** — `dias` (default 30), sobre Capacitaciones
  Planificacion (pendiente de mapear).
- **`proyectos_sin_actualizar`** — `dias` (default 15). **Ya 100% funcional**, solo
  depende de `Proyectos Planificacion` (usa `fechaRevisado`, ya mapeada).

Para activar las que dicen "pendiente de mapear": llamar `obtener_filas` sobre la
tabla en cuestión para ver los nombres reales de columna, y completar
`tablas.<clave>.tableId` y `tablas.<clave>.columnasRemoto` en `relations.json` —
apenas se completa, la tool empieza a funcionar sin tocar código.

## Próximos pasos (no incluidos ahora)

- Terminar de mapear en `relations.json` las tablas que necesitan las tools
  compuestas (actividades, cronograma, tickets, equipos, clientes, personal,
  capacitaciones — ver `pendiente` en cada entrada de `tablas`).
- Deploy remoto (Railway, Render o Fly.io) para no depender de tu máquina local ni
  poder usarlo desde el celular.
- Tools de escritura (crear/actualizar proyectos).
- Autenticación OAuth.
