#!/usr/bin/env node

// Entry point for the Models.dev MCP server
// Supports both stdio (default) and SSE transport

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createServer } from "./server.js";
import http from "node:http";

const { transport, port, host } = parseArgs();

function parseArgs() {
  const args = process.argv.slice(2);
  let transport = "stdio";
  let port = parseInt(process.env.PORT ?? process.env.MCP_PORT ?? "3000", 10);
  let host = process.env.HOST ?? "0.0.0.0";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "sse" || arg === "stdio") {
      transport = arg;
    } else if (arg.startsWith("--port=")) {
      port = parseInt(arg.split("=")[1], 10);
    } else if (arg === "--port" || arg === "-p") {
      if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
        port = parseInt(args[++i], 10);
      }
    } else if (arg.startsWith("--host=")) {
      host = arg.split("=")[1];
    } else if (arg === "--host" || arg === "-h") {
      if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
        host = args[++i];
      }
    } else if (/^\d+$/.test(arg)) {
      port = parseInt(arg, 10);
    }
  }

  if (isNaN(port) || port <= 0 || port > 65535) {
    port = 3000;
  }

  return { transport, port, host };
}

async function main(): Promise<void> {
  const server = createServer();

  if (transport === "sse") {
    // Track active SSE transports
    let sseTransport: SSEServerTransport | null = null;

    const httpServer = http.createServer(async (req, res) => {
      // CORS headers
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      const hostHeader = req.headers.host ?? `localhost:${port}`;
      const url = new URL(req.url ?? "/", `http://${hostHeader}`);

      if (url.pathname === "/sse" && req.method === "GET") {
        sseTransport = new SSEServerTransport("/messages", res);
        await server.connect(sseTransport);
        return;
      }

      if (url.pathname === "/messages" && req.method === "POST") {
        if (!sseTransport) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "No SSE connection established" }));
          return;
        }
        await sseTransport.handlePostMessage(req, res);
        return;
      }

      // Health check
      if (url.pathname === "/" || url.pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            name: "models-dev-mcp",
            version: "1.0.0",
            status: "ok",
            transport: "sse",
            port,
            tools: 34,
          }),
        );
        return;
      }

      res.writeHead(404);
      res.end("Not found");
    });

    httpServer.listen(port, host, () => {
      console.error(`Models.dev MCP server (SSE) listening on ${host}:${port}`);
      console.error(`  SSE endpoint: http://localhost:${port}/sse`);
      console.error(`  Messages:     http://localhost:${port}/messages`);
      console.error(`  Health:       http://localhost:${port}/health`);
    });
  } else {
    // Default: stdio transport
    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport);
    console.error("Models.dev MCP server started (stdio transport)");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
