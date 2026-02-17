#!/usr/bin/env node

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { Request, Response, NextFunction } from "express";
import { createServer } from "./server.js";

const PORT = parseInt(process.env.PORT ?? "3006", 10);
const API_KEY = process.env.API_KEY;

// ── Bearer token auth middleware ─────────────────────────────────────
function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!API_KEY) return next(); // no key configured = open access

  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ") || header.slice(7) !== API_KEY) {
    res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Unauthorized" },
      id: null,
    });
    return;
  }
  next();
}

// ── Express app ──────────────────────────────────────────────────────
const app = createMcpExpressApp({ host: "0.0.0.0" });
app.use(authMiddleware);

// Health check (unauthenticated)
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// ── MCP endpoint (stateless: new server per request) ─────────────────
app.post("/mcp", async (req: Request, res: Response) => {
  const server = createServer();
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);

    res.on("close", () => {
      transport.close();
      server.close();
    });
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

// GET and DELETE not supported in stateless mode
app.get("/mcp", (_req: Request, res: Response) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed." },
    id: null,
  });
});

app.delete("/mcp", (_req: Request, res: Response) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed." },
    id: null,
  });
});

// ── Start ────────────────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  console.error(`mcp-morpho HTTP server listening on port ${PORT}`);
  if (API_KEY) {
    console.error("Bearer token auth enabled");
  } else {
    console.error("WARNING: No API_KEY set — server is open to all requests");
  }
});

process.on("SIGINT", () => {
  console.error("Shutting down...");
  process.exit(0);
});
