#!/usr/bin/env node
import "dotenv/config";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerTools } from "./tools.js";

const PORT = process.env.PORT ?? 3000;
const MCP_SERVER_TOKEN = process.env.MCP_SERVER_TOKEN;

if (!MCP_SERVER_TOKEN) {
  throw new Error(
    "Falta MCP_SERVER_TOKEN. Este servidor queda expuesto públicamente en Railway, así que " +
      "necesita un token propio (distinto de GLIDE_TOKEN) para autenticar quién puede llamarlo. " +
      "Generá uno (ej. con `openssl rand -hex 32`) y configuralo como variable de entorno."
  );
}

const app = express();
app.use(express.json());

app.get("/", (_req, res) => {
  res.status(200).json({ status: "ok", server: "glide-core-mcp" });
});

app.post("/mcp", async (req, res) => {
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (token !== MCP_SERVER_TOKEN) {
    res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: "No autorizado. Falta o es inválido el Bearer token." },
      id: null,
    });
    return;
  }

  // Modo stateless: una instancia de server + transport nueva por request,
  // sin sessionIdGenerator. Evita mantener estado en memoria entre llamadas
  // (más simple de operar en Railway, a costa de no soportar streaming largo
  // entre requests separados).
  const server = new McpServer({ name: "glide-core-mcp", version: "1.0.0" });
  registerTools(server);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on("close", () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("glide-core-mcp: error manejando request MCP:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Error interno del servidor." },
        id: null,
      });
    }
  }
});

// GET/DELETE en /mcp no aplican en modo stateless (no hay sesión que
// reanudar ni cerrar), pero se responden explícitamente en vez de dejar
// que caigan en un 404 genérico.
app.get("/mcp", (_req, res) => {
  res.status(405).json({ error: "Este servidor corre en modo stateless: no soporta streams GET persistentes." });
});
app.delete("/mcp", (_req, res) => {
  res.status(405).json({ error: "Este servidor corre en modo stateless: no hay sesión que cerrar." });
});

app.listen(PORT, () => {
  console.log(`glide-core-mcp: servidor HTTP escuchando en el puerto ${PORT} (endpoint MCP: POST /mcp)`);
});
