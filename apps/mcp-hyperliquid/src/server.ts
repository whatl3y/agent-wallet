import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerMarketInfoTools } from "./tools/market-info.js";
import { registerPositionTools } from "./tools/positions.js";
import { registerAccountTools } from "./tools/account.js";
import { registerTradingTools } from "./tools/trading.js";
import { registerLeverageTools } from "./tools/leverage.js";
import { registerTpSlTools } from "./tools/tp-sl.js";
import { registerPnlTools } from "./tools/pnl.js";
import { registerBridgeTools } from "./tools/bridge.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "mcp-hyperliquid",
    version: "0.1.0",
  });

  registerMarketInfoTools(server);
  registerPositionTools(server);
  registerAccountTools(server);
  registerTradingTools(server);
  registerLeverageTools(server);
  registerTpSlTools(server);
  registerPnlTools(server);
  registerBridgeTools(server);

  return server;
}
