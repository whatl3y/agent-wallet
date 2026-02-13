import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerEvmSwapTools } from "./tools/evm-swap.js";
import { registerSolanaSwapTools } from "./tools/solana-swap.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "mcp-swap",
    version: "0.1.0",
  });

  registerEvmSwapTools(server);
  registerSolanaSwapTools(server);

  return server;
}
