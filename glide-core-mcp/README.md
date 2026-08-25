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
`buscar_proyectos`) y un ejemplo real (`actividadesPlanificacion` → `Nro Proyecto`),
más la lista de las 27 tablas restantes de la app pendientes de documentar.

## Próximos pasos (no incluidos ahora)

- Terminar de documentar en `relations.json` las tablas que faltan (ver
  `pendienteDeInspeccionar` dentro del archivo).
- Deploy remoto (Railway, Render o Fly.io) para no depender de tu máquina local ni
  poder usarlo desde el celular.
- Tools que efectivamente crucen datos entre tablas usando `relations.json` (ej.
  traer un proyecto junto con sus actividades).
- Tools de escritura (crear/actualizar proyectos).
- Autenticación OAuth.
