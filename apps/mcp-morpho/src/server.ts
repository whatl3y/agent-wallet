import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerQueryTools } from "./tools/queries.js";
import { registerSupplyTools } from "./tools/supply.js";
import { registerBorrowTools } from "./tools/borrow.js";
import { registerVaultTools } from "./tools/vaults.js";
import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "mcp-morpho",
    version: "0.1.0",
  });

  registerQueryTools(server);
  registerSupplyTools(server);
  registerBorrowTools(server);
  registerVaultTools(server);
  registerResources(server);
  registerPrompts(server);

  return server;
}
