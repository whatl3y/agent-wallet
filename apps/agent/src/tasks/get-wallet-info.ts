import "dotenv/config";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { getUser } from "../models/users.js";

(async function getWalletInfo() {
  const telegramUserId = parseInt(process.argv[2], 10);
  if (!telegramUserId) {
    logger.error("Usage: show-private-key <telegram_user_id>");
    process.exit(1);
  }

  if (!config.walletEncryptionKey) {
    logger.error("WALLET_ENCRYPTION_KEY is required");
    process.exit(1);
  }

  if (!config.databaseUrl) {
    logger.error("DATABASE_URL is required");
    process.exit(1);
  }

  const user = await getUser(telegramUserId, config.walletEncryptionKey);
  if (!user) {
    logger.error(`No user found for telegram_user_id: ${telegramUserId}`);
    process.exit(1);
  }

  console.log(`Telegram User ID:    ${user.telegramUserId}`);
  console.log(`EVM Address:         ${user.evmAddress}`);
  console.log(`EVM Private Key:     ${user.evmPrivateKey}`);
  console.log(`Solana Address:      ${user.solanaAddress}`);
  console.log(`Solana Private Key:  ${user.solanaPrivateKey}`);

  process.exit(0);
})();
