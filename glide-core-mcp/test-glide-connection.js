// Test manual de conexión a Glide, SIN pasar por MCP ni por Claude Desktop.
// Uso: npm run test:glide
//
// Sirve para confirmar que .env está bien completado y que la tabla responde
// ANTES de conectar el servidor a Claude Desktop. Si esto falla, el problema
// es de credenciales/columnas de Glide, no de MCP.

import { projectsTable } from "./glideClient.js";

async function main() {
  console.log("Conectando a Glide y trayendo filas de la tabla de proyectos...\n");

  const rows = await projectsTable.get();

  console.log(`OK: se trajeron ${rows.length} filas.\n`);

  if (rows.length === 0) {
    console.log(
      "La tabla respondió pero no trajo filas. Revisá que GLIDE_TABLE_ID apunte a la tabla correcta."
    );
    return;
  }

  console.log("Primeras 3 filas (verificá que los campos no salgan undefined):\n");
  for (const row of rows.slice(0, 3)) {
    console.log({
      codigoProyecto: row.codigoProyecto,
      clienteProyecto: row.clienteProyecto,
      gestion: row.gestion,
      estado: row.estado,
      fechaCreacion: row.fechaCreacion,
      fechaPlanificada: row.fechaPlanificada,
      fechaFinalizacion: row.fechaFinalizacion,
      satisfaccion: row.satisfaccion,
    });
    console.log("---");
  }

  console.log(
    "\nSi ves 'undefined' en algún campo, el nombre remoto de esa columna en glideClient.js está mal."
  );
}

main().catch((err) => {
  console.error("\nFALLÓ la conexión a Glide:\n");
  console.error(err);
  process.exit(1);
});
