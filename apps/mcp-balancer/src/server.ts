import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerPoolTools } from "./tools/pools.js";
import { registerSwapTools } from "./tools/swap.js";
import { registerLiquidityTools } from "./tools/liquidity.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "mcp-balancer",
    version: "0.1.0",
  });

  registerPoolTools(server);
  registerSwapTools(server);
  registerLiquidityTools(server);

  return server;
}
