# @agent-wallet/agent

The main AI agent application. Uses the [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript) to create an interactive CLI wallet agent that can manage crypto assets across EVM and Solana chains.

## Overview

The agent operates as a Claude-powered CLI that:
- Connects to external MCP servers (AAVE, Uniswap, etc.) to build transaction calldata
- Exposes its own wallet tools (balance checks, transfers, calldata execution) via an in-process MCP server
- Requires explicit user approval for every on-chain transaction
- Signs and sends transactions using keys from environment variables

## Architecture

```
src/
├── index.ts              # CLI entry point — readline loop feeding async generator to query()
├── config.ts             # Environment variable configuration
├── logger.ts             # Bunyan structured logging
├── agent.ts              # Claude Agent SDK query() setup — system prompt, MCP servers, canUseTool
├── approval.ts           # canUseTool callback — auto-approves reads, prompts for transactions
├── mcp-config.ts         # Loads external MCP server configs from mcp-servers.json
└── tools/
    ├── index.ts           # createSdkMcpServer wrapping all wallet tools
    ├── wallet-info.ts     # wallet_get_addresses, wallet_get_balance
    ├── send-native.ts     # wallet_send_native (ETH, SOL, etc.)
    ├── execute-calldata.ts # wallet_execute_calldata (bridges MCP output → on-chain)
    └── token-transfer.ts  # wallet_transfer_token (ERC20)
```

## Custom Wallet Tools

These are exposed to Claude as MCP tools (prefixed `mcp__wallet__`):

| Tool | Description | Approval |
|------|-------------|----------|
| `wallet_get_addresses` | Returns EVM and Solana wallet addresses | Auto-approved |
| `wallet_get_balance` | Gets native token balance on a chain | Auto-approved |
| `wallet_send_native` | Sends ETH, SOL, POL, AVAX, etc. | Requires approval |
| `wallet_execute_calldata` | Executes MCP server transaction payloads | Requires approval |
| `wallet_transfer_token` | Transfers ERC20 tokens | Requires approval |

## Transaction Approval Flow

The `canUseTool` callback in [approval.ts](src/approval.ts) intercepts every tool call:

1. **Read-only tools** (`wallet_get_addresses`, `wallet_get_balance`) — auto-approved
2. **External MCP server tools** (e.g., `mcp__aave__aave_supply`) — auto-approved (they only build calldata)
3. **Transaction tools** (`wallet_send_native`, `wallet_execute_calldata`, `wallet_transfer_token`) — displays details and prompts `y/n`

Example approval prompt:

```
═══════════════════════════════════════════
  TRANSACTION APPROVAL REQUIRED
═══════════════════════════════════════════
  Chain: Ethereum (chainId: 1)

  Step 1: Approve USDC spending
    To:    0xA0b8...
    Value: 0

  Step 2: Supply 100 USDC to AAVE V3
    To:    0x8787...
    Value: 0
═══════════════════════════════════════════

  Approve this transaction? (y/n):
```

## MCP Server Integration

External MCP servers are configured in `mcp-servers.json` (loaded by [mcp-config.ts](src/mcp-config.ts)). The agent supports:

- **stdio transport**: Spawns the MCP server as a child process (local development)
- **http transport**: Connects to a running HTTP endpoint (Docker/production)

MCP servers return transaction payloads in the format:

```json
{
  "chainId": 1,
  "transactions": [
    { "to": "0x...", "data": "0x...", "value": "0", "description": "Approve USDC" },
    { "to": "0x...", "data": "0x...", "value": "0", "description": "Supply to AAVE" }
  ]
}
```

The agent passes these payloads to `wallet_execute_calldata`, which signs and sends each step sequentially.

## Build & Run

```bash
# From monorepo root
pnpm --filter @agent-wallet/agent build
pnpm start

# Or directly
node build/index.js
```

## Configuration

See the root [.env.example](../../.env.example) for all environment variables. Key variables for the agent:

- `ANTHROPIC_API_KEY` — required
- `CLAUDE_MODEL` — which Claude model to use
- `EVM_PRIVATE_KEY` / `SOLANA_PRIVATE_KEY` — wallet keys
- `MCP_SERVERS_CONFIG_PATH` — path to MCP server config file
- `MAX_TURNS` — max agentic turns per conversation
