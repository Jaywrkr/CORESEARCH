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
// Mapeo de columnas de la tabla "Proyectos Planificación" en Glide.
//
// Los "name" de abajo son los nombres REMOTOS de columna que da el modal
// "Show API" de Glide para esta tabla puntual (app NAoV5Ey6TX6LpH7KAmXs,
// tabla native-table-IKrt1rYFBLyuLWD5Pa1B). El prefijo "remote" incluye
// un caracter de control (Group Separator, U+001D) que Glide usa como
// separador — no es texto literal "remote", hay que dejar el  tal cual.
// Solo se exponen las 8 columnas que necesita la tool buscar_proyectos; la
// tabla real tiene más columnas que no hace falta traer acá.
// ---------------------------------------------------------------------------
export const projectsTable = glide.table({
  token: GLIDE_TOKEN,
  app: GLIDE_APP_ID,
  table: GLIDE_TABLE_ID,
  columns: {
    codigoProyecto: { type: "string", name: "remotecolumn1" },
    clienteProyecto: { type: "string", name: "remoteSERVICIOS TECNOLÓGICOS" },
    gestion: { type: "string", name: "remotecolumn3" },
    fechaPlanificada: { type: "date-time", name: "remotecolumn4" },
    fechaCreacion: { type: "date-time", name: "pleux" },
    fechaFinalizacion: { type: "date-time", name: "remotecolumn5" },
    satisfaccion: { type: "number", name: "remotecolumn6" },
    estado: { type: "string", name: "remoteCódigo:FO-ST-02" },
    fechaRevisado: { type: "date-time", name: "SowWf" },
    liderProyecto: { type: "string", name: "Jv4eD" },
    opi: { type: "string", name: "KnAEf" },
  },
});

// App de Glide, usada para explorar tablas y columnas (listar_tablas /
// inspeccionar_tabla) sin tener que abrir el modal "Show API" a mano.
export const glideApp = glide.app({ id: GLIDE_APP_ID, token: GLIDE_TOKEN });

// Crea un Table "crudo" (sin mapeo de columnas) solo para leer su schema.
export function rawTable(tableId) {
  return glide.table({ token: GLIDE_TOKEN, app: GLIDE_APP_ID, table: tableId, columns: {} });
}
