import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerQueryTools } from "./tools/queries.js";
import { registerLendingTools } from "./tools/lending.js";
import { registerCollateralTools } from "./tools/collateral.js";
import { registerFlashLoanTools } from "./tools/flash-loans.js";
import { registerLiquidationTools } from "./tools/liquidation.js";
import { registerNativeTools } from "./tools/native.js";
import { registerDelegationTools } from "./tools/delegation.js";
import { registerGovernanceTools } from "./tools/governance.js";
import { registerStakingTools } from "./tools/staking.js";
import { registerGhoTools } from "./tools/gho.js";
import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "mcp-aave",
    version: "0.1.0",
  });

  registerQueryTools(server);
  registerLendingTools(server);
  registerCollateralTools(server);
  registerFlashLoanTools(server);
  registerLiquidationTools(server);
  registerNativeTools(server);
  registerDelegationTools(server);
  registerGovernanceTools(server);
  registerStakingTools(server);
  registerGhoTools(server);
  registerResources(server);
  registerPrompts(server);

  return server;
}
