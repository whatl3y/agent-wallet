import "dotenv/config";

export const config = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  model: process.env.CLAUDE_MODEL || "claude-sonnet-4-5-20250929",

  evmPrivateKey: process.env.EVM_PRIVATE_KEY || "",
  solanaPrivateKey: process.env.SOLANA_PRIVATE_KEY || "",

  mcpServersConfigPath:
    process.env.MCP_SERVERS_CONFIG_PATH || "./mcp-servers.json",

  maxTurns: parseInt(process.env.MAX_TURNS || "50", 10),
  logLevel: (process.env.LOG_LEVEL || "info") as
    | "trace"
    | "debug"
    | "info"
    | "warn"
    | "error"
    | "fatal",
};
