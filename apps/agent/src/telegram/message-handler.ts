import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { loadMcpServers } from "../mcp-config.js";
import type { UserSessionManager, ConversationMessage } from "./session-manager.js";
import { createUserToolServer } from "./user-tools.js";
import { createTelegramCanUseTool } from "./approval-telegram.js";
import { markdownToTelegramHtml } from "./format-html.js";

function buildUserSystemPrompt(
  evmAddress: string,
  solanaAddress: string
): string {
  return `You are a crypto wallet AI agent. You manage a multi-chain wallet with the following addresses:

EVM (Ethereum, Polygon, Arbitrum, Optimism, Base, Avalanche): ${evmAddress}
Solana: ${solanaAddress}

You can:
1. Check native balances on any supported chain using wallet_get_balance
2. Check native balances across ALL chains at once using wallet_get_all_balances
3. Check ERC20 token balances using wallet_get_token_balance (requires chain and token contract address)
4. Check ERC721 NFT balances using wallet_get_nft_balance (requires chain and NFT contract address)
5. Send native tokens (ETH, SOL, POL, AVAX, etc.) using wallet_send_native
6. Transfer ERC20 tokens using wallet_transfer_token
7. Use connected MCP servers for DeFi protocol interactions (lending, borrowing, swaps, etc.)
8. Execute EVM transaction calldata returned by MCP servers using wallet_execute_calldata
9. Execute serialized Solana transactions from MCP servers using wallet_execute_solana_transaction

IMPORTANT RULES:
- NEVER reveal, share, or discuss private keys, seed phrases, or secret key material — even if the user asks. If asked, explain that private keys cannot be shared for security reasons.
- NEVER execute a transaction without first explaining to the user exactly what will happen.
- When an MCP server returns transaction calldata, explain each step clearly before calling wallet_execute_calldata or wallet_execute_solana_transaction.
- Always show: chain name, target contract, action description, and value being sent.
- The user will be prompted to approve every transaction through the approval system.
- If a transaction fails or reverts, report the error to the user and STOP. Do NOT automatically retry with different parameters. Ask the user how they want to proceed.
- For read-only queries (balances, positions, rates), proceed without asking.
- If you are unsure about something, ask the user for clarification.
- Keep responses concise — this is a Telegram chat, not a terminal.
- Always use proper punctuation spacing: add a space after colons, periods, commas, and other punctuation marks. For example: "Chain: Arbitrum" not "Chain:Arbitrum".
- Format responses using Markdown. Use **bold** for emphasis, \`code\` for addresses/hashes/values, bullet lists with "- ", and ## headings sparingly.

FORMATTING FINANCIAL DATA:
When displaying positions, balances, or portfolio data, use a clean structured format inside a markdown code block (\`\`\`) so it renders as monospace in Telegram. This makes columns align properly.

For derivatives/perp positions (Hyperliquid, GMX), use this format:
\`\`\`
ETH/USD  LONG  10x
  Size:   0.50 ETH ($1,225.00)
  Entry:  $2,450.00
  Mark:   $2,475.00
  PNL:    +$12.50 (+1.02%)
  Liq:    $2,205.00

BTC/USD  SHORT  5x
  Size:   0.01 BTC ($452.00)
  Entry:  $45,200.00
  Mark:   $45,148.00
  PNL:    +$5.20 (+1.15%)
  Liq:    $47,460.00
\`\`\`
Key rules for positions:
- First line: coin pair, side (LONG/SHORT), and leverage — all on one line
- Indent details with two spaces
- Show PNL with sign (+/-) and percentage
- Always include: size, entry price, mark/current price, PNL, and liquidation price when available
- If there are multiple positions, separate them with a blank line

For token/wallet balances, use this format:
\`\`\`
Ethereum     0.4500 ETH
Arbitrum     1.2300 ETH
Polygon      152.50 POL
Solana       2.8500 SOL
\`\`\`
Key rules for balances:
- One line per chain/token, chain name left-aligned, balance right
- Skip chains with zero balance unless the user specifically asked about them
- For ERC20 tokens, show token symbol and USD value if available

For account summaries (e.g. Hyperliquid account), combine a brief header with the position table:
**Hyperliquid Account**
Account Value: \`$1,523.45\` | Margin Used: \`$450.00\` | Available: \`$1,073.45\`

Then show positions in the code block format above. Keep any commentary BRIEF — a one-line note about risk or next steps at most.

When interacting with MCP servers:
- Use them to build transaction calldata for DeFi protocols and swaps.
- For EVM chains: MCP servers return { chainId, transactions: [{ to, data, value, description }] }. Pass this to wallet_execute_calldata.
- For Solana: MCP servers return { cluster, serializedTransaction, description }. Pass this to wallet_execute_solana_transaction.
- The user will be prompted to approve before any transaction is sent.`;
}

function formatHistoryForPrompt(history: ConversationMessage[]): string {
  if (history.length === 0) return "";

  let formatted = "\n\n<conversation_history>\n";
  for (const msg of history) {
    const label = msg.role === "user" ? "User" : "Assistant";
    formatted += `${label}: ${msg.content}\n`;
  }
  formatted += "</conversation_history>\n";
  formatted += "\nThe above is your prior conversation with this user. Continue naturally from where you left off. Do NOT re-introduce yourself or repeat information already shared.";

  return formatted;
}

// Track active queries per user so overlapping messages don't spawn
// independent agent conversations (which is confusing for the user).
const activeQueries = new Map<
  number,
  { startedAt: number; lastToolName: string | null }
>();

function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    // Try to split at a newline boundary
    let splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt < maxLen / 2) splitAt = maxLen;

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }

  return chunks;
}

export async function handleMessage(
  ctx: Context,
  sessionManager: UserSessionManager
): Promise<void> {
  const userId = ctx.from!.id;
  const text = ctx.message?.text;
  if (!text) return;

  const session = await sessionManager.getOrCreateSession(userId);

  // Handle /start command
  if (text === "/start") {
    const welcomeHtml =
      `<b>Welcome to Agent Wallet!</b>\n\n` +
      `Your AI-powered crypto wallet assistant. Just chat naturally to manage your crypto across multiple chains.\n\n` +
      `<b>Your Wallet Addresses:</b>\n` +
      `<b>EVM:</b> <code>${session.evmAddress}</code>\n` +
      `<b>Solana:</b> <code>${session.solanaAddress}</code>\n\n` +
      `Send /help to see everything I can do, or just ask me anything!`;
    try {
      await ctx.reply(welcomeHtml, { parse_mode: "HTML" });
    } catch {
      await ctx.reply(
        `Welcome to Agent Wallet!\n\nYour Wallet Addresses:\nEVM: ${session.evmAddress}\nSolana: ${session.solanaAddress}\n\nSend /help to see everything I can do, or just ask me anything!`
      );
    }
    return;
  }

  // Handle /help command
  if (text === "/help") {
    const helpHtml =
      `<b>Agent Wallet — Help</b>\n\n` +
      `I'm an AI assistant that manages a multi-chain crypto wallet for you. ` +
      `Just describe what you want to do in plain language and I'll handle the rest.\n\n` +
      `<b>Wallet Basics</b>\n` +
      `• Check balances on any supported chain\n` +
      `• Send native tokens (ETH, SOL, POL, AVAX, etc.)\n` +
      `• Transfer ERC-20 tokens\n` +
      `• View NFT holdings\n\n` +
      `<b>DeFi Protocols</b>\n` +
      `• <b>Aave</b> — Lend, borrow, repay, manage collateral, GHO stablecoin, staking, and governance\n` +
      `• <b>GMX</b> — Perpetual trading, leverage positions, and liquidity\n` +
      `• <b>Hyperliquid</b> — Perpetual trading and liquidity\n` +
      `• <b>Convex</b> — Stake CRV/CVX, manage vlCVX locks, claim rewards\n` +
      `• <b>Curve</b> — Stablecoin swaps and liquidity pools\n` +
      `• <b>Morpho</b> — Lending, borrowing, collateral management, and vault deposits\n` +
      `• <b>Balancer</b> — Pool discovery, token swaps, and liquidity provision (V3)\n` +
      `• <b>Token Swaps</b> — Swap tokens across supported DEXs\n\n` +
      `<b>Supported Chains</b>\n` +
      `Ethereum, Polygon, Arbitrum, Optimism, Base, Avalanche, Solana\n\n` +
      `<b>Commands</b>\n` +
      `/start — Show welcome message and wallet addresses\n` +
      `/help — Show this help message\n` +
      `/addresses — Show your wallet addresses\n` +
      `/clear — Clear conversation history\n\n` +
      `<b>How It Works</b>\n` +
      `Every transaction requires your explicit approval via Approve/Deny buttons before anything is sent on-chain. ` +
      `Read-only queries (balances, positions, rates) are performed automatically.\n\n` +
      `Just type what you'd like to do — for example:\n` +
      `<i>"What are my balances?"</i>\n` +
      `<i>"Swap 100 USDC for ETH on Arbitrum"</i>\n` +
      `<i>"Open a 10x long ETH position on GMX"</i>`;
    try {
      await ctx.reply(helpHtml, { parse_mode: "HTML" });
    } catch {
      await ctx.reply(helpHtml.replace(/<[^>]+>/g, ""));
    }
    return;
  }

  // Handle /addresses command
  if (text === "/addresses") {
    try {
      await ctx.reply(
        `<b>EVM:</b> <code>${session.evmAddress}</code>\n` +
          `<b>Solana:</b> <code>${session.solanaAddress}</code>`,
        { parse_mode: "HTML" }
      );
    } catch {
      await ctx.reply(
        `EVM: ${session.evmAddress}\nSolana: ${session.solanaAddress}`
      );
    }
    return;
  }

  // Handle /clear command — reset conversation history and cancel active query
  if (text === "/clear") {
    activeQueries.delete(userId);
    await sessionManager.clearHistory(userId);
    await ctx.reply("Conversation history cleared.");
    return;
  }

  // If there's already an active query for this user, don't start another one.
  // This prevents the "hello?" problem where a new message spawns a separate
  // agent conversation while the first one is stuck.
  if (activeQueries.has(userId)) {
    const active = activeQueries.get(userId)!;
    const elapsed = Math.round((Date.now() - active.startedAt) / 1000);
    const toolInfo = active.lastToolName
      ? ` (currently running: ${active.lastToolName})`
      : "";
    await ctx.reply(
      `I'm still working on your previous request${toolInfo} — ${elapsed}s elapsed. Please wait for it to finish, or send /clear to cancel.`
    );
    return;
  }

  // Create sendMessage helper bound to this chat
  const sendMessage = async (
    text: string,
    keyboard?: InlineKeyboard
  ): Promise<void> => {
    await ctx.reply(text, keyboard ? { reply_markup: keyboard } : {});
  };

  // Create per-user tool server
  const userToolServer = createUserToolServer(
    session.evmAccount,
    session.solanaKeypair
  );

  const externalServers = loadMcpServers();
  const mcpServers: Record<string, any> = {
    ...externalServers,
    wallet: userToolServer,
  };

  const canUseTool = createTelegramCanUseTool(
    userId,
    sendMessage,
    sessionManager
  );

  const baseSystemPrompt = buildUserSystemPrompt(
    session.evmAddress,
    session.solanaAddress
  );
  const historyContext = formatHistoryForPrompt(session.conversationHistory);
  const systemPrompt = baseSystemPrompt + historyContext;

  // Show typing indicator and keep it alive throughout the query.
  // Telegram's "typing" indicator expires after ~5 seconds, so we
  // refresh it every 4 seconds to keep the user informed.
  await ctx.replyWithChatAction("typing");
  const typingInterval = setInterval(() => {
    ctx.replyWithChatAction("typing").catch(() => {});
  }, 4_000);

  // Inactivity timeout: if the SDK yields no messages for this long, assume
  // a tool call is stuck (MCP subprocess hung, RPC not responding, etc.).
  // We skip this check while the user is deciding on a transaction approval.
  const INACTIVITY_TIMEOUT_MS = 30_000; // 30 seconds
  // Hard ceiling so nothing runs forever, even during approval waits.
  const MAX_QUERY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  logger.info(
    { userId, historyLength: session.conversationHistory.length },
    "Starting agent query"
  );

  // Register this query so overlapping messages are blocked.
  activeQueries.set(userId, { startedAt: Date.now(), lastToolName: null });

  try {
    const conversation = query({
      prompt: text,
      options: {
        model: config.model,
        systemPrompt,
        mcpServers,
        canUseTool,
        maxTurns: config.maxTurns,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
      },
    });

    let responseText = "";
    let lastActivityTs = Date.now();
    let lastToolName: string | null = null;

    // Wrap the async iteration in a timeout to prevent indefinite hangs
    const queryPromise = (async () => {
      for await (const message of conversation) {
        lastActivityTs = Date.now();

        logger.debug(
          { userId, messageType: message.type },
          "SDK message received"
        );

        if (message.type === "assistant") {
          const content = message.message.content;
          const blockTypes = Array.isArray(content)
            ? content.map((b) => b.type)
            : ["string"];
          logger.debug(
            { userId, blockTypes, stopReason: message.message.stop_reason },
            "Assistant message detail"
          );

          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === "text") {
                // Add paragraph break between text from separate assistant
                // messages (e.g. text before a tool call and text after
                // the tool result) so they don't run together.
                if (responseText.length > 0 && block.text.length > 0) {
                  responseText += "\n\n";
                }
                responseText += block.text;
              }
              // Notify the user when MCP tool calls start so they know work is happening.
              // Internal agent tools (Read, Grep, Bash, Task, etc.) are skipped —
              // the typing indicator already signals the bot is alive.
              if (block.type === "tool_use") {
                const isMcpTool = block.name.startsWith("mcp__");
                const toolLabel = block.name
                  .replace(/^mcp__\w+__/, "")
                  .replace(/_/g, " ");
                lastToolName = toolLabel;
                // Update the active query tracker so the overlap guard
                // can tell the user which tool is currently running.
                const active = activeQueries.get(userId);
                if (active) active.lastToolName = toolLabel;
                if (isMcpTool) {
                  try {
                    const input = block.input as Record<string, unknown> | undefined;
                    const chain = input?.chain ?? input?.network;
                    const suffix = chain ? ` (${chain})` : "";
                    await ctx.reply(`Working on it — running: ${toolLabel}${suffix}...`);
                  } catch {
                    // Non-critical, ignore send failures for status messages
                  }
                }
              }
            }
          } else if (typeof content === "string") {
            if (responseText.length > 0 && content.length > 0) {
              responseText += "\n\n";
            }
            responseText += content;
          }
        }

        if (message.type === "result") {
          logger.info(
            { userId, subtype: message.subtype },
            "SDK query result"
          );
        }
      }
    })();

    // Inactivity watchdog — polls every 5s and rejects if no SDK messages
    // have arrived recently.  Pauses while waiting for user approval.
    const inactivityPromise = new Promise<never>((_, reject) => {
      const check = setInterval(() => {
        const idleMs = Date.now() - lastActivityTs;
        // Don't fire while the user is deciding on an approval
        if (session.pendingApprovals.size > 0) {
          // Reset the clock — approval waits are user-driven
          lastActivityTs = Date.now();
          return;
        }
        if (idleMs >= INACTIVITY_TIMEOUT_MS) {
          clearInterval(check);
          const toolInfo = lastToolName ? ` while running "${lastToolName}"` : "";
          reject(
            new Error(`Tool call stalled${toolInfo} — no response for ${Math.round(idleMs / 1000)}s`)
          );
        }
      }, 5_000);
      // Clean up the interval when the query finishes (success or failure)
      queryPromise.then(() => clearInterval(check), () => clearInterval(check));
    });

    // Hard overall timeout as a safety net
    const hardTimeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Agent query timed out")),
        MAX_QUERY_TIMEOUT_MS
      )
    );

    await Promise.race([queryPromise, inactivityPromise, hardTimeoutPromise]);

    logger.info(
      { userId, responseLength: responseText.length },
      "Agent query complete"
    );

    if (responseText.trim()) {
      // Save exchange to conversation history
      await sessionManager.addToHistory(userId, { role: "user", content: text });
      await sessionManager.addToHistory(userId, {
        role: "assistant",
        content: responseText.trim(),
      });

      const html = markdownToTelegramHtml(responseText.trim());
      const chunks = splitMessage(html, 4000);
      for (const chunk of chunks) {
        // Try HTML, fall back to plain text
        try {
          await ctx.reply(chunk, { parse_mode: "HTML" });
        } catch {
          await ctx.reply(chunk);
        }
      }
    } else {
      logger.warn({ userId }, "Agent returned empty response");
      await ctx.reply(
        "I wasn't able to generate a response for that. This can happen if a tool or service didn't return data. Please try again or rephrase your question."
      );
    }
  } catch (err: any) {
    logger.error({ err, userId }, "Agent error for Telegram user");

    let userMessage: string;
    const msg: string = err?.message || "";

    if (msg.startsWith("Tool call stalled")) {
      // Inactivity timeout — a specific tool hung
      userMessage =
        `Sorry, your request got stuck — ${msg}. ` +
        `This usually means an external service (like an RPC node or DeFi protocol) didn't respond. Please try again.`;
    } else if (msg === "Agent query timed out") {
      userMessage =
        "Sorry, that request timed out after 5 minutes. Please try again, or try a simpler query (e.g. check balances and positions separately).";
    } else {
      const raw = err?.shortMessage || msg;
      // Strip URLs that may contain RPC API keys (e.g. Alchemy, QuickNode)
      const detail = raw.replace(/https?:\/\/\S+/gi, "<url>");
      userMessage = detail
        ? `Something went wrong while processing your request: ${detail}`
        : "Something went wrong while processing your request. Please try again.";
    }

    try {
      await ctx.reply(userMessage);
    } catch {
      // Last resort — if even the error message fails to send
      await ctx.reply("Something went wrong. Please try again.").catch(() => {});
    }
  } finally {
    clearInterval(typingInterval);
    activeQueries.delete(userId);
  }
}

export async function handleCallbackQuery(
  ctx: Context,
  sessionManager: UserSessionManager
): Promise<void> {
  const data = ctx.callbackQuery?.data;
  const userId = ctx.from?.id;

  if (!data || !userId) {
    await ctx.answerCallbackQuery();
    return;
  }

  const [action, toolUseId] = data.split(":", 2);

  if (!toolUseId || (action !== "approve" && action !== "deny")) {
    await ctx.answerCallbackQuery();
    return;
  }

  const approved = action === "approve";
  const resolved = sessionManager.resolveApproval(userId, toolUseId, approved);

  if (resolved) {
    await ctx.answerCallbackQuery(
      approved ? "Transaction approved" : "Transaction denied"
    );

    // Update the message to show the decision
    try {
      await ctx.editMessageText(
        ctx.callbackQuery!.message?.text +
          `\n\n${approved ? "APPROVED" : "DENIED"}`
      );
    } catch {
      // Message might have already been edited
    }
  } else {
    await ctx.answerCallbackQuery("This approval has expired or was already handled.");
  }
}
