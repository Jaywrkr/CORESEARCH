#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { projectsTable } from "./glideClient.js";

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
          "Filtro de texto sobre el campo 'gestion' (servicio/tecnología), case-insensitive, por " +
            "substring. Ej: 'vmware' matchea 'VMware' y 'VMware vSAN'."
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
      filtered = filtered.filter((row) =>
        (row.gestion ?? "").toLowerCase().includes(needle)
      );
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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("glide-core-mcp: servidor MCP corriendo por stdio.");
}

main().catch((err) => {
  console.error("glide-core-mcp: error fatal al iniciar el servidor:", err);
  process.exit(1);
});
