#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { projectsTable, glideApp, rawTable } from "./glideClient.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const relationsPath = join(__dirname, "relations.json");

const server = new McpServer({
  name: "glide-core-mcp",
  version: "1.0.0",
});

server.registerTool(
  "buscar_proyectos",
  {
    title: "Buscar proyectos de Coresolutions",
    description:
      "Busca proyectos de Coresolutions en la tabla de Glide, filtrando por servicio/tecnología " +
      "(campo 'gestion') y/o por estado, ordenados por fecha de creación descendente.",
    inputSchema: {
      servicio: z
        .string()
        .optional()
        .describe(
          "Filtro de texto por substring, case-insensitive, sobre el servicio/tecnología. Busca " +
            "tanto en el campo 'gestion' como en el nombre/cliente del proyecto (donde suele " +
            "aparecer la tecnología, ej. 'MUTUALISTA PICHINCHA - SERVICIOS VMWARE'). Ej: 'vmware' " +
            "matchea 'VMware' y 'VMware vSAN'."
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

    let filtered = rows;

    if (servicio) {
      const needle = servicio.toLowerCase();
      filtered = filtered.filter((row) => {
        const gestion = (row.gestion ?? "").toLowerCase();
        const cliente = (row.clienteProyecto ?? "").toLowerCase();
        return gestion.includes(needle) || cliente.includes(needle);
      });
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
      servicio: row.gestion ?? null,
      estado: row.estado ?? null,
      fechaCreacion: row.fechaCreacion ?? null,
      fechaPlanificada: row.fechaPlanificada ?? null,
      fechaFinalizacion: row.fechaFinalizacion ?? null,
      satisfaccion: row.satisfaccion ?? null,
    }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              total_encontrados: filtered.length,
              devueltos: results.length,
              proyectos: results,
            },
            null,
            2
          ),
        },
      ],
    };
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

    return {
      content: [{ type: "text", text: JSON.stringify(resumen, null, 2) }],
    };
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
  async ({ tableId }) => {
    const schema = await rawTable(tableId).getSchema();

    return {
      content: [{ type: "text", text: JSON.stringify(schema, null, 2) }],
    };
  }
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
    return {
      content: [{ type: "text", text: raw }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("glide-core-mcp: servidor MCP corriendo por stdio.");
}

main().catch((err) => {
  console.error("glide-core-mcp: error fatal al iniciar el servidor:", err);
  process.exit(1);
});
