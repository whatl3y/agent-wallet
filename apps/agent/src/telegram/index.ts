import "dotenv/config";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { createBot } from "./bot.js";

async function main() {
  if (!config.telegramBotToken) {
    console.error(
      "Error: TELEGRAM_BOT_TOKEN environment variable is required"
    );
    process.exit(1);
  }

  if (!config.anthropicApiKey) {
    console.error(
      "Error: ANTHROPIC_API_KEY environment variable is required"
    );
    process.exit(1);
  }

  if (!config.walletEncryptionKey) {
    console.error(
      "Error: WALLET_ENCRYPTION_KEY environment variable is required"
    );
    process.exit(1);
  }

  const bot = createBot();

  logger.info("Starting Telegram bot...");
  bot.start({ drop_pending_updates: true });
  logger.info("Telegram bot is running");
}

process.on("SIGINT", () => {
  logger.info("Shutting down Telegram bot...");
  process.exit(0);
});

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
