import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerMarketTools } from "./tools/markets.js";
import { registerPositionTools } from "./tools/positions.js";
import { registerOrderTools } from "./tools/orders.js";
import { registerCollateralTools } from "./tools/collateral.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "mcp-gmx",
    version: "0.1.0",
  });

  registerMarketTools(server);
  registerPositionTools(server);
  registerOrderTools(server);
  registerCollateralTools(server);

  return server;
}
