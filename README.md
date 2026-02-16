# Agent Wallet

A crypto wallet AI agent powered by the [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript). Holds private keys for EVM and Solana chains, interacts with external MCP servers to build trusted transaction calldata, and executes approved transactions on-chain.

Every transaction requires explicit user approval before signing.

Supports two interfaces:
- **CLI** — Interactive stdin/stdout chat loop with a single wallet from environment variables
- **Telegram Bot** — Multi-user bot that auto-generates per-user wallets (encrypted at rest in PostgreSQL), with inline keyboard buttons for transaction approvals. Only responds to DMs.

## Architecture

```
agent-wallet/
├── packages/
│   └── core/             # @agent-wallet/core — shared crypto utilities
│       ├── evm/          # viem-based wallet, provider, transaction signing
│       ├── solana/       # @solana/web3.js keypair and transactions
│       └── utils/        # Balance queries, formatting helpers
│
└── apps/
    ├── agent/            # @agent-wallet/agent — Claude-powered CLI + Telegram agent
    │   ├── tools/        # Custom wallet tools (balance, send, execute calldata)
    │   ├── telegram/     # Telegram bot: per-user wallets, inline approval, PostgreSQL store
    │   ├── agent.ts      # Claude Agent SDK query() setup (CLI)
    │   ├── approval.ts   # Human-in-the-loop transaction approval (CLI)
    │   └── mcp-config.ts # External MCP server configuration loader
    │
    ├── mcp-aave/         # @agent-wallet/mcp-aave — AAVE V3 MCP server
    │   ├── tools/        # 35+ tools: lending, borrowing, flash loans, governance, staking
    │   ├── config/       # Chain configs and AAVE deployment addresses
    │   └── http.ts       # HTTP transport for remote deployments
    │
    ├── mcp-swap/         # @agent-wallet/mcp-swap — Token swap MCP server
    │   ├── tools/        # EVM swaps (0x) and Solana swaps (Jupiter)
    │   ├── api/          # 0x and Jupiter API clients
    │   ├── config/       # Chain configs and 0x AllowanceHolder addresses
    │   └── http.ts       # HTTP transport for remote deployments
    │
    ├── mcp-hyperliquid/  # @agent-wallet/mcp-hyperliquid — Hyperliquid perps MCP server
    │   ├── tools/        # 16 tools: markets, positions, orders, leverage, TP/SL, PNL
    │   ├── clients.ts    # Hyperliquid SDK client initialization
    │   └── http.ts       # HTTP transport for remote deployments
    │
    └── mcp-gmx/          # @agent-wallet/mcp-gmx — GMX V2 perps MCP server
        ├── tools/        # 15 tools: markets, positions, orders, collateral, TP/SL, PNL
        ├── config/       # Chain configs and GMX deployment addresses (Arbitrum, Avalanche)
        ├── api/          # GMX REST API client (prices, tokens)
        └── http.ts       # HTTP transport for remote deployments
```

### How it works

1. User sends a message (e.g., "Supply 100 USDC to AAVE on Ethereum")
2. Claude reasons about the request and calls external MCP server tools to build transaction calldata
3. MCP servers return raw calldata (`{ chainId, transactions: [{ to, data, value }] }`) — they never hold keys
4. Claude explains the transaction steps to the user, then calls `wallet_execute_calldata` (EVM) or `wallet_execute_solana_transaction` (Solana)
5. The `canUseTool` callback intercepts and displays transaction details, prompting the user for approval
6. On approval, transactions are signed with the agent's private key and sent on-chain sequentially

## Prerequisites

- Node.js >= 20
- [pnpm](https://pnpm.io/) >= 10
- An Anthropic API key

## Setup

```bash
# Install dependencies
pnpm install

# Copy and configure environment variables
cp .env.example .env
# Edit .env with your API key, private keys, and RPC URLs
```

## Build

```bash
# Build all packages
pnpm build

# Build a specific package
pnpm --filter @agent-wallet/core build
pnpm --filter @agent-wallet/agent build
pnpm --filter @agent-wallet/mcp-aave build
pnpm --filter @agent-wallet/mcp-swap build
pnpm --filter @agent-wallet/mcp-hyperliquid build
pnpm --filter @agent-wallet/mcp-gmx build
```

## Run & Usage

The agent is an **interactive CLI chat** that runs via Docker Compose. You type messages in your terminal and Claude responds, using wallet tools and MCP servers as needed.

### 1. Configure MCP servers

The agent connects to MCP servers for DeFi protocol interactions. Bundled servers include `mcp-aave` (lending/borrowing), `mcp-swap` (token swaps), `mcp-hyperliquid` (perpetual trading), and `mcp-gmx` (GMX V2 perpetuals). Create your config:

```bash
cp mcp-servers.example.json mcp-servers.json
```

When running with Docker Compose, use **HTTP transport** to connect to sibling containers:

```json
{
  "mcpServers": {
    "aave": {
      "type": "http",
      "url": "http://mcp-aave:3000/mcp"
    },
    "swap": {
      "type": "http",
      "url": "http://mcp-swap:3001/mcp"
    },
    "hyperliquid": {
      "type": "http",
      "url": "http://mcp-hyperliquid:3002/mcp"
    },
    "gmx": {
      "type": "http",
      "url": "http://mcp-gmx:3003/mcp"
    }
  }
}
```

For local development without Docker, use **stdio transport** instead:

```json
{
  "mcpServers": {
    "aave": {
      "command": "node",
      "args": ["apps/mcp-aave/build/index.js"],
      "env": {
        "ETHEREUM_RPC_URL": "https://eth.llamarpc.com"
      }
    },
    "swap": {
      "command": "node",
      "args": ["apps/mcp-swap/build/index.js"],
      "env": {
        "ZEROX_API_KEY": "your-0x-api-key",
        "ETHEREUM_RPC_URL": "https://eth.llamarpc.com"
      }
    },
    "hyperliquid": {
      "command": "node",
      "args": ["apps/mcp-hyperliquid/build/index.js"],
      "env": {
        "EVM_PRIVATE_KEY": "0x..."
      }
    },
    "gmx": {
      "command": "node",
      "args": ["apps/mcp-gmx/build/index.js"],
      "env": {
        "ARBITRUM_RPC_URL": "https://arb1.arbitrum.io/rpc",
        "AVALANCHE_RPC_URL": "https://api.avax.network/ext/bc/C/rpc"
      }
    }
  }
}
```

### 2. Build the images

```bash
# Build all services
docker compose build

# Build a specific service
docker compose build agent
docker compose build mcp-aave
docker compose build mcp-swap
docker compose build mcp-hyperliquid
docker compose build mcp-gmx
```

### 3. Start the services

```bash
# Start MCP servers in the background
docker compose up -d mcp-aave mcp-swap mcp-hyperliquid mcp-gmx

# Option A: Run the Telegram bot (recommended — no interactive terminal needed)
docker compose up telegram-bot

# Option B: Run the CLI agent interactively (requires stdin attached)
docker compose run agent
```

The Telegram bot runs as a standard background service. The CLI agent needs `docker compose run` (not `up`) to attach your terminal's stdin for the interactive chat loop.

### 4. Chat with the agent

On startup the agent prints your wallet addresses, then enters a chat loop:

```
  Agent Wallet
  ────────────────────────────────────
  EVM:    0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18
  Solana: 7xKX...b3Qp
  ────────────────────────────────────

  MCP: wallet [connected]
  MCP: aave [connected]
  MCP: swap [connected]
  MCP: hyperliquid [connected]
  MCP: gmx [connected]

  Type your message (or 'exit' to quit):

  > What are my balances across all chains?
```

Claude responds in real-time, calling tools as needed. For any transaction, you'll see an approval prompt before anything is signed:

```
═══════════════════════════════════════════
  TRANSACTION APPROVAL REQUIRED
═══════════════════════════════════════════
  Chain:     Ethereum
  To:        0xA0b8...
  Amount:    0.1 ETH
═══════════════════════════════════════════

  Approve this transaction? (y/n):
```

Type `exit` or press `Ctrl+C` to quit.

### Telegram Bot

The Telegram bot provides the same wallet agent experience in a multi-user Telegram DM interface. Each user gets their own auto-generated EVM + Solana wallet, and transaction approvals use inline keyboard buttons.

#### 1. Create a bot

Message [@BotFather](https://t.me/BotFather) on Telegram and create a new bot. Copy the token.

#### 2. Configure environment

Add these to your `.env`:

```bash
TELEGRAM_BOT_TOKEN=your-bot-token-from-botfather
WALLET_ENCRYPTION_KEY=a-strong-random-passphrase
DATABASE_URL=postgres://agentwallet:agentwallet@localhost:5432/agentwallet
```

`WALLET_ENCRYPTION_KEY` is used to encrypt per-user private keys at rest in PostgreSQL (AES-256-GCM). Choose a strong passphrase — losing it means the stored keys are unrecoverable.

#### 3. Run the bot

```bash
# Local
pnpm --filter @agent-wallet/agent start:telegram

# Docker Compose (starts MCP servers too)
docker compose up -d mcp-aave mcp-swap mcp-hyperliquid mcp-gmx
docker compose up telegram-bot
```

#### 4. Chat with the bot

DM your bot on Telegram. On first message, a new wallet is generated and stored:

- `/start` — Shows your wallet addresses
- `/addresses` — Shows your wallet addresses
- Any message — Processed by the Claude agent with your wallet context

When a transaction is triggered, the bot sends an inline keyboard with **Approve** / **Deny** buttons. Approvals timeout after 5 minutes.

The bot ignores all messages in groups, supergroups, and channels — it only responds to private DMs.

### Example prompts

- "What are my wallet addresses?"
- "Show all my balances"
- "What's my USDC balance on Ethereum?" (needs USDC contract address — Claude will look it up or ask)
- "Supply 100 USDC to AAVE on Ethereum" (requires mcp-aave configured)
- "Swap 100 USDC to ETH on Ethereum" (requires mcp-swap configured)
- "Get a quote for swapping 1 SOL to USDC" (requires mcp-swap configured)
- "Show all available Hyperliquid markets" (requires mcp-hyperliquid configured)
- "What are my open positions on Hyperliquid?" (requires mcp-hyperliquid configured)
- "Open a 5x long BTC position with 0.01 BTC" (requires mcp-hyperliquid configured)
- "Set a take-profit at $110,000 and stop-loss at $90,000 on my BTC position" (requires mcp-hyperliquid configured)
- "Show all available GMX markets on Arbitrum" (requires mcp-gmx configured)
- "What are my open GMX positions on Arbitrum?" (requires mcp-gmx configured)
- "Open a 10x long ETH position with 100 USDC on GMX Arbitrum" (requires mcp-gmx configured)
- "Close my ETH long position on GMX" (requires mcp-gmx configured)
- "Set a take-profit at $4,000 on my GMX ETH long" (requires mcp-gmx configured)
- "Deposit 50 more USDC collateral to my GMX ETH position" (requires mcp-gmx configured)
- "Send 0.01 ETH to 0x..."

### Building images directly

```bash
docker build -f apps/agent/Dockerfile -t agent-wallet .    # CLI + Telegram (same image, different entrypoint)
docker build -f apps/mcp-aave/Dockerfile -t mcp-aave .
docker build -f apps/mcp-swap/Dockerfile -t mcp-swap .
docker build -f apps/mcp-hyperliquid/Dockerfile -t mcp-hyperliquid .
docker build -f apps/mcp-gmx/Dockerfile -t mcp-gmx .
```

## MCP Server: Hyperliquid (`mcp-hyperliquid`)

Provides 16 tools for interacting with the [Hyperliquid](https://hyperliquid.xyz) decentralized perpetual exchange.

**Note:** Unlike the AAVE/swap servers (which build calldata for the agent to sign), Hyperliquid uses signed API requests. The `mcp-hyperliquid` server holds the `EVM_PRIVATE_KEY` and executes operations directly via the Hyperliquid API. Write tools execute immediately when called.

### Read-only tools
| Tool | Description |
|------|-------------|
| `hl_get_markets` | All perp markets with prices, volume, OI, funding rates |
| `hl_get_market_price` | Price detail for a specific coin |
| `hl_get_orderbook` | L2 order book snapshot |
| `hl_get_positions` | Open positions with leverage, PNL, entry/mark/liquidation prices |
| `hl_get_open_orders` | Currently open orders |
| `hl_get_account_summary` | Account value, margin, withdrawable balance |
| `hl_get_balances` | Spot token balances |
| `hl_get_pnl_summary` | Per-position unrealized PNL breakdown |
| `hl_get_fills` | Recent trade fills with fees and closed PNL |

### Write tools (execute immediately)
| Tool | Description |
|------|-------------|
| `hl_place_order` | Place market or limit orders (long/short) |
| `hl_close_position` | Close or reduce a position |
| `hl_cancel_order` | Cancel a specific order |
| `hl_cancel_all_orders` | Cancel all open orders (optionally by coin) |
| `hl_update_leverage` | Set leverage (cross or isolated) |
| `hl_update_margin` | Add/remove isolated margin |
| `hl_set_tp_sl` | Set take-profit and/or stop-loss trigger orders |
| `hl_cancel_tp_sl` | Cancel TP/SL orders |

## MCP Server: GMX (`mcp-gmx`)

Provides 15 tools for interacting with [GMX V2](https://gmx.io) decentralized perpetual exchange on Arbitrum and Avalanche.

The `mcp-gmx` server builds transaction calldata (never holds keys). It returns `ExchangeRouter.multicall()` calldata that the agent wallet signs and sends with user approval. GMX uses a two-step execution model — the user transaction creates a pending order, then keepers execute it at oracle prices within seconds.

### Read-only tools
| Tool | Description |
|------|-------------|
| `gmx_get_markets` | All available perp markets with index/long/short tokens |
| `gmx_get_market_info` | Detailed market data: price, OI, available liquidity |
| `gmx_get_prices` | Current oracle prices for all tokens (min/max) |
| `gmx_get_positions` | Open positions with leverage, PNL, entry/mark/liquidation prices |
| `gmx_get_position_pnl` | Detailed PNL breakdown: base PNL, borrowing fees, funding fees, price impact, close fee |
| `gmx_get_orders` | Pending orders (TP/SL, limit orders) |

### Transaction tools (build calldata)
| Tool | Description |
|------|-------------|
| `gmx_open_position` | Open/add to a position with collateral, leverage, optional TP/SL |
| `gmx_close_position` | Close or partially close a position |
| `gmx_set_take_profit` | Set take-profit trigger order on an existing position |
| `gmx_set_stop_loss` | Set stop-loss trigger order on an existing position |
| `gmx_update_order` | Update a pending order's trigger price or size |
| `gmx_cancel_order` | Cancel a pending order (execution fee refunded) |
| `gmx_deposit_collateral` | Add collateral to a position without changing size |
| `gmx_withdraw_collateral` | Remove collateral from a position without changing size |

## Supported Chains

### EVM
- Ethereum, Polygon, Arbitrum, Optimism, Base, Avalanche

### Solana
- Mainnet, Devnet

### Hyperliquid
- Mainnet (default), Testnet (set `HYPERLIQUID_TESTNET=true`)

### GMX V2
- Arbitrum, Avalanche

## Development

```bash
# Watch mode (all packages)
pnpm dev

# Watch a specific package
pnpm --filter @agent-wallet/core dev
pnpm --filter @agent-wallet/agent dev
```

## Testing

To test the agent:

1. **Basic**: Start the agent and ask "What are my wallet addresses?"
2. **Balance**: Ask "What is my ETH balance on Ethereum?"
3. **MCP integration**: Connect an MCP server and ask about protocol data (e.g., AAVE supply rates)
4. **Transaction (testnet)**: Configure Sepolia/devnet RPCs and test a small native token send — verify the approval prompt appears

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key (required) |
| `CLAUDE_MODEL` | Claude model to use (default: `claude-sonnet-4-5-20250929`) |
| `EVM_PRIVATE_KEY` | EVM wallet private key (`0x`-prefixed hex) |
| `SOLANA_PRIVATE_KEY` | Solana wallet private key (base58-encoded) |
| `ETHEREUM_RPC_URL` | Ethereum RPC URL |
| `POLYGON_RPC_URL` | Polygon RPC URL |
| `ARBITRUM_RPC_URL` | Arbitrum RPC URL |
| `OPTIMISM_RPC_URL` | Optimism RPC URL |
| `BASE_RPC_URL` | Base RPC URL |
| `AVALANCHE_RPC_URL` | Avalanche RPC URL |
| `SOLANA_MAINNET_RPC_URL` | Solana mainnet RPC URL |
| `SOLANA_DEVNET_RPC_URL` | Solana devnet RPC URL |
| `MCP_SERVERS_CONFIG_PATH` | Path to MCP servers config file (default: `./mcp-servers.json`) |
| `MAX_TURNS` | Max conversation turns per query (default: `50`) |
| `LOG_LEVEL` | Logging level (default: `info`) |
| `ZEROX_API_KEY` | 0x API key for EVM swaps (required for mcp-swap) |
| `JUPITER_API_KEY` | Jupiter API key for Solana swaps (optional, works without but rate-limited) |
| `HYPERLIQUID_TESTNET` | Set to `true` to use Hyperliquid testnet (default: mainnet) |
| `PORT` | MCP server HTTP port (default: `3000` for mcp-aave, `3001` for mcp-swap, `3002` for mcp-hyperliquid, `3003` for mcp-gmx) |
| `API_KEY` | MCP server Bearer token auth (optional, leave empty for open access) |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from @BotFather (required for Telegram bot) |
| `WALLET_ENCRYPTION_KEY` | Passphrase for encrypting per-user wallet keys in the database (required for Telegram bot) |
| `DATABASE_URL` | PostgreSQL connection string (e.g. `postgres://user:pass@host:5432/db`) |
