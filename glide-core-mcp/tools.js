import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { z } from "zod";
import { projectsTable, glideApp, rawTable } from "./glideClient.js";
import {
  obtenerFilas,
  buscarFilas,
  buscarTextoGlobal,
  obtenerProyectoCompleto,
  obtenerClienteResumen,
  obtenerPersonalResumen,
  horasPorProyecto,
  horasPorPersonal,
  ticketsAbiertos,
  ticketsVencidos,
  certificacionesPorVencer,
  proyectosSinActualizar,
  detectarCodigosDuplicados,
  extraerDocumentosProyecto,
  esFilaBasura,
} from "./crossQueries.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const relationsPath = join(__dirname, "relations.json");

function jsonResult(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

/**
 * Registra las 17 tools de glide-core-mcp en una instancia de McpServer.
 * Compartido entre el entrypoint local (index.js, stdio) y el remoto
 * (server-http.js, Railway) para no duplicar la definición de cada tool.
 */
export function registerTools(server) {
  server.registerTool(
    "buscar_proyectos",
    {
      title: "Buscar proyectos de Coresolutions",
      description:
        "Busca proyectos de Coresolutions en la tabla de Glide, filtrando por servicio/tecnología " +
        "y/o por estado, ordenados por fecha de creación descendente.",
      inputSchema: {
        servicio: z
          .string()
          .optional()
          .describe(
            "Filtro de texto por substring, case-insensitive, sobre el servicio/tecnología. La " +
              "tabla no tiene una columna dedicada a esto: se busca en el nombre/cliente del " +
              "proyecto, que es donde en la práctica aparece la tecnología (ej. 'MUTUALISTA " +
              "PICHINCHA - SERVICIOS VMWARE'). Ej: 'vmware' matchea 'VMware' y 'VMware vSAN'."
          ),
        estado: z
          .string()
          .optional()
          .describe("Filtro exacto sobre el campo 'estado', case-insensitive."),
        limite: z
          .number()
          .int()
          .positive()
          .max(50)
          .optional()
          .describe("Cantidad máxima de resultados a devolver. Default 10, máx 50."),
      },
    },
    async ({ servicio, estado, limite }) => {
      const limit = Math.min(limite ?? 10, 50);

      const rows = await projectsTable.get();

      let filtered = rows.filter((row) => !esFilaBasura(row));

      if (servicio) {
        const needle = servicio.toLowerCase();
        filtered = filtered.filter((row) => (row.clienteProyecto ?? "").toLowerCase().includes(needle));
      }

      if (estado) {
        const target = estado.toLowerCase();
        filtered = filtered.filter((row) => (row.estado ?? "").toLowerCase() === target);
      }

      filtered.sort((a, b) => {
        const dateA = a.fechaCreacion ? new Date(a.fechaCreacion).getTime() : 0;
        const dateB = b.fechaCreacion ? new Date(b.fechaCreacion).getTime() : 0;
        return dateB - dateA;
      });

      const results = filtered.slice(0, limit).map((row) => ({
        codigo: row.codigoProyecto ?? null,
        cliente: row.clienteProyecto ?? null,
        gestionDeProyecto: row.gestion ?? null,
        estado: row.estado ?? null,
        fechaCreacion: row.fechaCreacion ?? null,
        fechaPlanificada: row.fechaPlanificada ?? null,
        fechaFinalizacion: row.fechaFinalizacion ?? null,
        satisfaccion: row.satisfaccion ?? null,
      }));

      return jsonResult({
        total_encontrados: filtered.length,
        devueltos: results.length,
        proyectos: results,
      });
    }
  );

  server.registerTool(
    "listar_tablas",
    {
      title: "Listar tablas de la app de Glide",
      description:
        "Lista todas las tablas de la app de Glide configurada (id y nombre), para descubrir qué " +
        "tablas existen antes de inspeccionarlas o de armar consultas que crucen varias tablas.",
      inputSchema: {},
    },
    async () => {
      const tables = await glideApp.getTables();

      if (!tables) {
        return {
          content: [
            {
              type: "text",
              text: "No se pudo obtener la lista de tablas (revisá GLIDE_APP_ID y GLIDE_TOKEN).",
            },
          ],
          isError: true,
        };
      }

      const resumen = tables.map((t) => ({ id: t.id, nombre: t.name }));
      return jsonResult(resumen);
    }
  );

  server.registerTool(
    "inspeccionar_tabla",
    {
      title: "Inspeccionar columnas de una tabla de Glide",
      description:
        "Dado el id de una tabla de Glide (obtenido con listar_tablas), devuelve sus columnas: id " +
        "remoto, nombre visible y tipo. Sirve para identificar qué columnas son relaciones, lookups " +
        "o rollups antes de mapearlas en el código.",
      inputSchema: {
        tableId: z
          .string()
          .describe("Id de la tabla de Glide a inspeccionar (el 'id' que devuelve listar_tablas)."),
      },
    },
    async ({ tableId }) => jsonResult(await rawTable(tableId).getSchema())
  );

  server.registerTool(
    "obtener_mapa_relaciones",
    {
      title: "Obtener mapa de relaciones entre tablas de Glide",
      description:
        "Devuelve el mapa de relaciones entre tablas documentado a mano en relations.json: qué " +
        "columna de cada tabla conecta (por valor, no por relation-id de Glide) con qué columna de " +
        "qué otra tabla. Llamar esta tool al inicio de cualquier tarea que cruce datos entre tablas, " +
        "para no depender de inspeccionar_tabla cada vez ni de adivinar. Es lectura local instantánea, " +
        "no pega a la API de Glide.",
      inputSchema: {},
    },
    async () => {
      const raw = readFileSync(relationsPath, "utf-8");
      return { content: [{ type: "text", text: raw }] };
    }
  );

  server.registerTool(
    "obtener_filas",
    {
      title: "Obtener filas crudas de una tabla de Glide",
      description:
        "Trae filas SIN transformar de cualquier tabla por su tableId, con paginación simple " +
        "(offset/límite). Sirve para inspeccionar valores reales, sobre todo en tablas con columnas " +
        "genéricas (column1, column2...) donde los nombres reales de campo no están claros en el " +
        "schema y hay que verlos en los datos.",
      inputSchema: {
        tableId: z.string().describe("Id de la tabla (el 'id' que devuelve listar_tablas)."),
        limite: z.number().int().positive().max(20).optional().describe("Default 5, máx 20."),
        offset: z.number().int().nonnegative().optional().describe("Default 0."),
      },
    },
    async ({ tableId, limite, offset }) =>
      jsonResult(await obtenerFilas(tableId, limite ?? 5, offset ?? 0))
  );

  server.registerTool(
    "buscar_filas",
    {
      title: "Buscar filas en cualquier tabla de Glide por columna",
      description:
        "Filtro genérico sobre cualquier tabla de Glide (no solo Proyectos): busca por substring, " +
        "case-insensitive, en una columna dada. Reemplaza tener que escribir una tool dedicada por " +
        "cada tabla nueva.",
      inputSchema: {
        tableId: z.string().describe("Id de la tabla a consultar."),
        campo: z.string().describe("Nombre o id de la columna sobre la que filtrar."),
        valor: z.string().describe("Substring a buscar, case-insensitive."),
        limite: z.number().int().positive().max(50).optional().describe("Default 10, máx 50."),
      },
    },
    async ({ tableId, campo, valor, limite }) =>
      jsonResult(await buscarFilas(tableId, campo, valor, limite ?? 10))
  );

  server.registerTool(
    "buscar_texto_global",
    {
      title: "Buscar texto en varias tablas de Glide a la vez",
      description:
        "Busca un término en todas las columnas de una o más tablas y devuelve coincidencias " +
        "agrupadas por tabla. Si no se especifican tablas, busca en TODAS las tablas de la app " +
        "(puede tardar). Útil cuando no se sabe en qué tabla está algo.",
      inputSchema: {
        texto: z.string().describe("Término a buscar, case-insensitive, por substring."),
        tablas: z
          .array(z.string())
          .optional()
          .describe("Ids de tabla donde buscar. Si se omite, busca en todas las tablas de la app."),
        limite_por_tabla: z.number().int().positive().max(20).optional().describe("Default 5."),
      },
    },
    async ({ texto, tablas, limite_por_tabla }) =>
      jsonResult(await buscarTextoGlobal(texto, tablas, limite_por_tabla ?? 5))
  );

  server.registerTool(
    "obtener_proyecto_completo",
    {
      title: "Obtener toda la info de un proyecto cruzando tablas",
      description:
        "Trae en un solo llamado todo lo relacionado a un proyecto: datos base (Proyectos " +
        "Planificacion), actividades, cronograma, equipos asignados, datos de contrato (Proyectos " +
        "Gestion: nro. contrato, fechas, plazo, monto, forma de pago, administrador), órdenes de " +
        "compra (join por OPI), y tickets (join aproximado por cliente) + horas totales.",
      inputSchema: {
        nro_proyecto: z.string().describe("Código del proyecto a buscar (ej. codigoProyecto)."),
      },
    },
    async ({ nro_proyecto }) => jsonResult(await obtenerProyectoCompleto(nro_proyecto))
  );

  server.registerTool(
    "obtener_cliente_resumen",
    {
      title: "Obtener resumen de un cliente",
      description:
        "Trae los proyectos de un cliente, sus contactos asociados, sus tickets, sus contadores " +
        "precalculados (oportunidades ganadas/perdidas/detectadas, proyectos en curso/terminados, " +
        "desde CLIENTES GENERAL) y el detalle de sus licitaciones públicas individuales, cruzando " +
        "tablas por nombre de cliente (resolviendo alias conocidos).",
      inputSchema: {
        cliente: z.string().describe("Nombre o substring del cliente a buscar."),
      },
    },
    async ({ cliente }) => jsonResult(await obtenerClienteResumen(cliente))
  );

  server.registerTool(
    "obtener_personal_resumen",
    {
      title: "Obtener resumen de una persona del equipo",
      description:
        "Trae certificaciones/expiraciones, horas registradas recientes y datos base (rol, fecha " +
        "de contrato) de una persona, cruzando tablas por nombre (resolviendo alias corto/completo).",
      inputSchema: {
        nombre: z.string().describe("Nombre o substring de la persona a buscar."),
      },
    },
    async ({ nombre }) => jsonResult(await obtenerPersonalResumen(nombre))
  );

  server.registerTool(
    "horas_por_proyecto",
    {
      title: "Sumar horas registradas por proyecto",
      description:
        "Suma las horas de Actividades Planificacion filtradas por proyecto y rango de fechas opcional.",
      inputSchema: {
        nro_proyecto: z.string().describe("Código del proyecto."),
        desde: z.string().optional().describe("Fecha ISO desde (inclusive), opcional."),
        hasta: z.string().optional().describe("Fecha ISO hasta (inclusive), opcional."),
      },
    },
    async ({ nro_proyecto, desde, hasta }) => jsonResult(await horasPorProyecto(nro_proyecto, desde, hasta))
  );

  server.registerTool(
    "horas_por_personal",
    {
      title: "Sumar horas registradas por persona",
      description:
        "Suma las horas de Actividades Planificacion filtradas por persona y rango de fechas opcional.",
      inputSchema: {
        nombre: z.string().describe("Nombre de la persona."),
        desde: z.string().optional().describe("Fecha ISO desde (inclusive), opcional."),
        hasta: z.string().optional().describe("Fecha ISO hasta (inclusive), opcional."),
      },
    },
    async ({ nombre, desde, hasta }) => jsonResult(await horasPorPersonal(nombre, desde, hasta))
  );

  server.registerTool(
    "tickets_abiertos",
    {
      title: "Listar tickets abiertos",
      description:
        "Filtra Tickets Planificacion por estatus distinto de cerrado/finalizado/cumplido, opcionalmente por cliente. Devuelve 'total' (cuántos hay en total) y 'filas' (recortadas a 'limite', default 50) para no saturar la respuesta.",
      inputSchema: {
        cliente: z.string().optional().describe("Filtrar además por cliente, opcional."),
        limite: z.number().int().positive().max(200).optional().describe("Default 50, máx 200."),
      },
    },
    async ({ cliente, limite }) => jsonResult(await ticketsAbiertos(cliente, limite ?? 50))
  );

  server.registerTool(
    "tickets_vencidos",
    {
      title: "Listar tickets vencidos",
      description:
        "Tickets abiertos (no cerrados/cumplidos) cuya fecha de creación supera N días sin resolución. Devuelve 'total' y 'filas' (recortadas a 'limite', default 50).",
      inputSchema: {
        dias: z.number().int().positive().optional().describe("Default 7."),
        limite: z.number().int().positive().max(200).optional().describe("Default 50, máx 200."),
      },
    },
    async ({ dias, limite }) => jsonResult(await ticketsVencidos(dias ?? 7, limite ?? 50))
  );

  server.registerTool(
    "certificaciones_por_vencer",
    {
      title: "Listar certificaciones por vencer",
      description:
        "Filtra Capacitaciones Planificacion cuya fecha de expiración cae dentro de los próximos N días.",
      inputSchema: {
        dias: z.number().int().positive().optional().describe("Default 30."),
      },
    },
    async ({ dias }) => jsonResult(await certificacionesPorVencer(dias ?? 30))
  );

  server.registerTool(
    "proyectos_sin_actualizar",
    {
      title: "Listar proyectos sin revisar recientemente",
      description:
        "Proyectos de Proyectos Planificacion cuya fecha de revisión está más atrás que N días, o " +
        "vacía — para detectar seguimiento descuidado. Filtra automáticamente filas basura (headers " +
        "de página capturados como datos). Por default trae TODOS los estados, incluyendo 'Terminado' " +
        "(que normalmente no necesita seguimiento) — pasar estado='En Curso' (u otro) para enfocarse " +
        "en proyectos activos abandonados.",
      inputSchema: {
        dias: z.number().int().positive().optional().describe("Default 15."),
        estado: z
          .string()
          .optional()
          .describe("Filtro exacto sobre 'estado', case-insensitive (ej. 'En Curso'). Opcional."),
      },
    },
    async ({ dias, estado }) => jsonResult(await proyectosSinActualizar(dias ?? 15, estado))
  );

  server.registerTool(
    "detectar_codigos_duplicados",
    {
      title: "Detectar códigos de proyecto duplicados",
      description:
        "Agrupa Proyectos Planificacion por codigoProyecto (case-insensitive) y devuelve los códigos " +
        "que aparecen más de una vez, con el cliente y estado de cada ocurrencia. Sirve para detectar " +
        "reuso accidental de un mismo código en proyectos distintos. No modifica nada en Glide, solo " +
        "reporta.",
      inputSchema: {},
    },
    async () => jsonResult(await detectarCodigosDuplicados())
  );

  server.registerTool(
    "extraer_documentos_proyecto",
    {
      title: "Extraer texto de los PDFs adjuntos a un proyecto",
      description:
        "Dado un código de proyecto, baja los PDFs adjuntos (actas de entrega, certificados de " +
        "participación, etc. — hasta 10 archivos por proyecto) y extrae su texto plano, para poder " +
        "buscar dentro de ellos cosas como monto, tecnología, o cualquier dato que no esté en una " +
        "columna de Glide. Cada documento viene con su texto truncado a 8000 caracteres. Puede " +
        "tardar varios segundos si hay muchos archivos adjuntos.",
      inputSchema: {
        nro_proyecto: z.string().describe("Código del proyecto (codigoProyecto)."),
      },
    },
    async ({ nro_proyecto }) => jsonResult(await extraerDocumentosProyecto(nro_proyecto))
  );
}
