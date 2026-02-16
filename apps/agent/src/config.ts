import "dotenv/config";

export const config = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  model: process.env.CLAUDE_MODEL || "claude-sonnet-4-5-20250929",

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

  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
  walletEncryptionKey: process.env.WALLET_ENCRYPTION_KEY || "",
  databaseUrl: process.env.DATABASE_URL || "",
  telegramAllowedUserIds: process.env.TELEGRAM_ALLOWED_USER_IDS
    ? new Set(
        process.env.TELEGRAM_ALLOWED_USER_IDS.split(",")
          .map((id) => id.trim())
          .filter(Boolean)
          .map((id) => parseInt(id, 10))
      )
    : null,
};
