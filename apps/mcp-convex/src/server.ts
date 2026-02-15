import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerPoolTools } from "./tools/pools.js";
import { registerDepositTools } from "./tools/deposit.js";
import { registerRewardTools } from "./tools/rewards.js";
import { registerStakingTools } from "./tools/staking.js";
import { registerLockingTools } from "./tools/locking.js";
import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "mcp-convex",
    version: "0.1.0",
  });

  registerPoolTools(server);
  registerDepositTools(server);
  registerRewardTools(server);
  registerStakingTools(server);
  registerLockingTools(server);
  registerResources(server);
  registerPrompts(server);

  return server;
}
