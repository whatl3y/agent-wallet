import { Bot } from "grammy";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { UserSessionManager } from "./session-manager.js";
import { handleMessage, handleCallbackQuery } from "./message-handler.js";

export function createBot(): Bot {
  const bot = new Bot(config.telegramBotToken);

  const sessionManager = new UserSessionManager(
    config.walletEncryptionKey
  );

  // Only respond to DMs — ignore groups, supergroups, and channels
  bot.on("message", async (ctx) => {
    const chatType = ctx.chat.type;
    const userId = ctx.from?.id;
    const text = ctx.message?.text;
    logger.debug({ userId, chatType, text }, "Incoming message");

    if (chatType !== "private") {
      logger.debug({ userId, chatType }, "Ignoring non-private message");
      return;
    }

    if (config.telegramAllowedUserIds && userId && !config.telegramAllowedUserIds.has(userId)) {
      logger.info({ userId }, "Ignoring message from non-allowed user");
      return;
    }

    logger.info({ userId, text }, "Processing message");
    // Do not await — handleMessage blocks until the agent query completes
    // (which may include waiting for transaction approval callbacks).
    // Awaiting here would deadlock grammy's sequential update loop,
    // preventing callback_query updates from being processed.
    handleMessage(ctx, sessionManager).catch((err) => {
      logger.error({ err, userId }, "Unhandled error in handleMessage");
    });
    logger.info({ userId }, "Message handler dispatched");
  });

  // Handle inline keyboard callbacks for transaction approvals
  bot.on("callback_query:data", async (ctx) => {
    const userId = ctx.from?.id;
    const data = ctx.callbackQuery?.data;
    logger.info({ userId, data }, "Incoming callback query");

    if (config.telegramAllowedUserIds && userId && !config.telegramAllowedUserIds.has(userId)) {
      logger.info({ userId }, "Ignoring callback from non-allowed user");
      await ctx.answerCallbackQuery();
      return;
    }

    await handleCallbackQuery(ctx, sessionManager);
    logger.info({ userId, data }, "Callback query complete");
  });

  bot.catch((err) => {
    logger.error({ err: err.error, ctx: err.ctx?.update }, "Bot error");
  });

  // Register slash commands so they appear in Telegram's autocomplete menu
  bot.api.setMyCommands([
    { command: "start", description: "Welcome message and wallet addresses" },
    { command: "help", description: "What this bot can do and how it works" },
    { command: "addresses", description: "Show your wallet addresses" },
    { command: "clear", description: "Clear conversation history" },
  ]).catch((err) => {
    logger.error({ err }, "Failed to register bot commands");
  });

  return bot;
}
