import "dotenv/config";
import * as glide from "@glideapps/tables";

const { GLIDE_TOKEN, GLIDE_APP_ID, GLIDE_TABLE_ID } = process.env;

if (!GLIDE_TOKEN || !GLIDE_APP_ID || !GLIDE_TABLE_ID) {
  throw new Error(
    "Faltan variables de entorno de Glide. Revisá tu archivo .env (ver .env.example) y completá " +
      "GLIDE_TOKEN, GLIDE_APP_ID y GLIDE_TABLE_ID."
  );
}

// ---------------------------------------------------------------------------
// Mapeo de columnas de la tabla de proyectos.
//
// Los "name" de abajo son los nombres REMOTOS de columna que Glide te da en el
// modal "Show API" de tu tabla (algo como "B4xYz" o "Name"), NO los nombres
// visibles en el editor de Glide. Reemplazá cada REMPLAZAR_COLUMNA_* por el
// valor real que te muestra ese modal para cada columna.
// ---------------------------------------------------------------------------
export const projectsTable = glide.table({
  token: GLIDE_TOKEN,
  app: GLIDE_APP_ID,
  table: GLIDE_TABLE_ID,
  columns: {
    codigoProyecto: { type: "string", name: "REEMPLAZAR_COLUMNA_codigoProyecto" },
    clienteProyecto: { type: "string", name: "REEMPLAZAR_COLUMNA_clienteProyecto" },
    gestion: { type: "string", name: "REEMPLAZAR_COLUMNA_gestion" },
    fechaPlanificada: { type: "date-time", name: "REEMPLAZAR_COLUMNA_fechaPlanificada" },
    fechaCreacion: { type: "date-time", name: "REEMPLAZAR_COLUMNA_fechaCreacion" },
    fechaFinalizacion: { type: "date-time", name: "REEMPLAZAR_COLUMNA_fechaFinalizacion" },
    satisfaccion: { type: "number", name: "REEMPLAZAR_COLUMNA_satisfaccion" },
    estado: { type: "string", name: "REEMPLAZAR_COLUMNA_estado" },
  },
});
