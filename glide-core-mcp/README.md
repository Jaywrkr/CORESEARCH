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

- **servicio** (string, opcional): filtro por substring, case-insensitive, sobre el
  campo `gestion`. Ej: `"vmware"` matchea `"VMware"` y `"VMware vSAN"`.
- **estado** (string, opcional): filtro exacto, case-insensitive, sobre `estado`.
- **limite** (number, opcional, default 10, máx 50): cantidad de resultados.

Devuelve un JSON con los proyectos ordenados por `fechaCreacion` descendente,
incluyendo: `codigo`, `cliente`, `servicio`, `estado`, `fechaCreacion`,
`fechaPlanificada`, `fechaFinalizacion`, `satisfaccion`.

## Próximos pasos (no incluidos ahora)

- Deploy remoto (Railway, Render o Fly.io) para no depender de tu máquina local.
- Tools adicionales (crear/actualizar proyectos, otras tablas, etc.).
- Autenticación OAuth.
