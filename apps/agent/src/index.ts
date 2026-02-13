import * as readline from "node:readline";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { runAgent, processMessage } from "./agent.js";
import { getEVMAccount, getSolanaKeypair } from "@agent-wallet/core";

async function main() {
  // Validate required config
  if (!config.anthropicApiKey) {
    console.error("Error: ANTHROPIC_API_KEY environment variable is required");
    process.exit(1);
  }

  // Print wallet info
  process.stderr.write("\n  Agent Wallet\n");
  process.stderr.write("  ────────────────────────────────────\n");

  try {
    const evmAddress = getEVMAccount().address;
    process.stderr.write(`  EVM:    ${evmAddress}\n`);
  } catch {
    process.stderr.write("  EVM:    not configured\n");
  }

  try {
    const solanaAddress = getSolanaKeypair().publicKey.toBase58();
    process.stderr.write(`  Solana: ${solanaAddress}\n`);
  } catch {
    process.stderr.write("  Solana: not configured\n");
  }

  process.stderr.write("  ────────────────────────────────────\n\n");

  // Create streaming user input
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  async function* userInputGenerator() {
    for await (const line of rl) {
      if (line.trim() === "") continue;
      if (line.trim().toLowerCase() === "exit") {
        rl.close();
        return;
      }

      yield {
        type: "user" as const,
        message: {
          role: "user" as const,
          content: line,
        },
      };
    }
  }

  process.stderr.write("  Type your message (or 'exit' to quit):\n\n");

  try {
    const conversation = await runAgent(userInputGenerator());

    for await (const message of conversation) {
      processMessage(message);

      // After a result message (turn completed), prompt for next input
      if (message.type === "result") {
        process.stdout.write("\n\n");
        process.stderr.write("  > ");
      }
    }
  } catch (err) {
    logger.error({ err }, "Agent error");
    console.error("Agent error:", err);
  } finally {
    rl.close();
  }
}

// Graceful shutdown
process.on("SIGINT", () => {
  process.stderr.write("\n  Shutting down...\n");
  process.exit(0);
});

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
