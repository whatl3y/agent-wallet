import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerQueryTools } from "./tools/queries.js";
import { registerLiquidityTools } from "./tools/liquidity.js";
import { registerGaugeTools } from "./tools/gauge.js";
import { registerSwapTools } from "./tools/swap.js";
import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "mcp-curve",
    version: "0.1.0",
  });

  registerQueryTools(server);
  registerLiquidityTools(server);
  registerGaugeTools(server);
  registerSwapTools(server);
  registerResources(server);
  registerPrompts(server);

  return server;
}
