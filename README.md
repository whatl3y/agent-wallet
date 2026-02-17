# Web3 Agent

A crypto wallet AI agent powered by the [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript). Holds private keys for EVM and Solana chains, interacts with external MCP servers to build trusted transaction calldata, and executes approved transactions on-chain.

Every transaction requires explicit user approval before signing.

Supports two interfaces:
- **CLI** — Interactive stdin/stdout chat loop with a single wallet from environment variables
- **Telegram Bot** — Multi-user bot that auto-generates per-user wallets (encrypted at rest in PostgreSQL), with inline keyboard buttons for transaction approvals. Only responds to DMs.

## Architecture

```
web3-agent/
├── packages/
│   └── core/             # @web3-agent/core — shared crypto utilities
│       ├── evm/          # viem-based wallet, provider, transaction signing
│       ├── solana/       # @solana/web3.js keypair and transactions
│       └── utils/        # Balance queries, formatting helpers
│
└── apps/
    ├── agent/            # @web3-agent/agent — Claude-powered CLI + Telegram agent
    │   ├── tools/        # Custom wallet tools (balance, send, execute calldata)
    │   ├── telegram/     # Telegram bot: per-user wallets, inline approval, PostgreSQL store
    │   ├── agent.ts      # Claude Agent SDK query() setup (CLI)
    │   ├── approval.ts   # Human-in-the-loop transaction approval (CLI)
    │   └── mcp-config.ts # External MCP server configuration loader
    │
    ├── mcp-aave/         # @web3-agent/mcp-aave — AAVE V3 MCP server
    │   ├── tools/        # 35+ tools: lending, borrowing, flash loans, governance, staking
    │   ├── config/       # Chain configs and AAVE deployment addresses
    │   └── http.ts       # HTTP transport for remote deployments
    │
    ├── mcp-balancer/     # @web3-agent/mcp-balancer — Balancer V3 MCP server
    │   ├── tools/        # 11 tools: pools, swaps, add/remove liquidity
    │   ├── api/          # Balancer GraphQL API client (api-v3.balancer.fi)
    │   ├── config/       # Chain configs (Ethereum, Arbitrum, Base, Optimism, Avalanche)
    │   └── http.ts       # HTTP transport for remote deployments
    │
    ├── mcp-convex/       # @web3-agent/mcp-convex — Convex Finance MCP server
    │   ├── tools/        # 21 tools: pools, deposits, rewards, CVX staking, cvxCRV, vlCVX locking
    │   ├── config/       # Contract addresses (Ethereum mainnet)
    │   └── http.ts       # HTTP transport for remote deployments
    │
    ├── mcp-curve/        # @web3-agent/mcp-curve — Curve Finance MCP server
    │   ├── tools/        # 14 tools: pools, liquidity, gauges/rewards, swaps
    │   ├── config/       # Chain configs (Ethereum, Polygon, Arbitrum, Optimism, Base, Avalanche)
    │   └── http.ts       # HTTP transport for remote deployments
    │
    ├── mcp-gmx/          # @web3-agent/mcp-gmx — GMX V2 perps MCP server
    │   ├── tools/        # 15 tools: markets, positions, orders, collateral, TP/SL, PNL
    │   ├── config/       # Chain configs and GMX deployment addresses (Arbitrum, Avalanche)
    │   ├── api/          # GMX REST API client (prices, tokens)
    │   └── http.ts       # HTTP transport for remote deployments
    │
    ├── mcp-hyperliquid/  # @web3-agent/mcp-hyperliquid — Hyperliquid perps MCP server
    │   ├── tools/        # 16 tools: markets, positions, orders, leverage, TP/SL, PNL
    │   ├── clients.ts    # Hyperliquid SDK client initialization
    │   └── http.ts       # HTTP transport for remote deployments
    │
    ├── mcp-morpho/       # @web3-agent/mcp-morpho — Morpho lending MCP server
    │   ├── tools/        # 13 tools: markets, vaults, supply, borrow, collateral, vault deposits
    │   ├── api/          # Morpho GraphQL API client
    │   └── http.ts       # HTTP transport for remote deployments
    │
    └── mcp-swap/         # @web3-agent/mcp-swap — Token swap MCP server
        ├── tools/        # EVM swaps (0x) and Solana swaps (Jupiter)
        ├── api/          # 0x and Jupiter API clients
        ├── config/       # Chain configs and 0x AllowanceHolder addresses
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
pnpm --filter @web3-agent/core build
pnpm --filter @web3-agent/agent build
pnpm --filter @web3-agent/mcp-aave build
pnpm --filter @web3-agent/mcp-balancer build
pnpm --filter @web3-agent/mcp-convex build
pnpm --filter @web3-agent/mcp-curve build
pnpm --filter @web3-agent/mcp-gmx build
pnpm --filter @web3-agent/mcp-hyperliquid build
pnpm --filter @web3-agent/mcp-morpho build
pnpm --filter @web3-agent/mcp-swap build
```

## Run & Usage

The agent is an **interactive CLI chat** that runs via Docker Compose. You type messages in your terminal and Claude responds, using wallet tools and MCP servers as needed.

### 1. Configure MCP servers

The agent connects to MCP servers for DeFi protocol interactions. Bundled servers include `mcp-aave` (lending/borrowing), `mcp-balancer` (Balancer V3 pools/swaps/liquidity), `mcp-convex` (Convex yield boosting), `mcp-curve` (Curve pools/swaps), `mcp-gmx` (GMX V2 perpetuals), `mcp-hyperliquid` (perpetual trading), `mcp-morpho` (Morpho lending), and `mcp-swap` (token swaps). Create your config:

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
    "balancer": {
      "type": "http",
      "url": "http://mcp-balancer:3007/mcp"
    },
    "convex": {
      "type": "http",
      "url": "http://mcp-convex:3005/mcp"
    },
    "curve": {
      "type": "http",
      "url": "http://mcp-curve:3004/mcp"
    },
    "gmx": {
      "type": "http",
      "url": "http://mcp-gmx:3003/mcp"
    },
    "hyperliquid": {
      "type": "http",
      "url": "http://mcp-hyperliquid:3002/mcp"
    },
    "morpho": {
      "type": "http",
      "url": "http://mcp-morpho:3006/mcp"
    },
    "swap": {
      "type": "http",
      "url": "http://mcp-swap:3001/mcp"
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
    "balancer": {
      "command": "node",
      "args": ["apps/mcp-balancer/build/index.js"],
      "env": {
        "ETHEREUM_RPC_URL": "https://eth.llamarpc.com",
        "ARBITRUM_RPC_URL": "https://arb1.arbitrum.io/rpc",
        "BASE_RPC_URL": "https://mainnet.base.org",
        "OPTIMISM_RPC_URL": "https://mainnet.optimism.io",
        "AVALANCHE_RPC_URL": "https://api.avax.network/ext/bc/C/rpc"
      }
    },
    "convex": {
      "command": "node",
      "args": ["apps/mcp-convex/build/index.js"],
      "env": {
        "ETHEREUM_RPC_URL": "https://eth.llamarpc.com"
      }
    },
    "curve": {
      "command": "node",
      "args": ["apps/mcp-curve/build/index.js"],
      "env": {
        "ETHEREUM_RPC_URL": "https://eth.llamarpc.com",
        "POLYGON_RPC_URL": "https://polygon.llamarpc.com",
        "ARBITRUM_RPC_URL": "https://arb1.arbitrum.io/rpc",
        "OPTIMISM_RPC_URL": "https://mainnet.optimism.io",
        "BASE_RPC_URL": "https://mainnet.base.org",
        "AVALANCHE_RPC_URL": "https://api.avax.network/ext/bc/C/rpc"
      }
    },
    "gmx": {
      "command": "node",
      "args": ["apps/mcp-gmx/build/index.js"],
      "env": {
        "ARBITRUM_RPC_URL": "https://arb1.arbitrum.io/rpc",
        "AVALANCHE_RPC_URL": "https://api.avax.network/ext/bc/C/rpc"
      }
    },
    "hyperliquid": {
      "command": "node",
      "args": ["apps/mcp-hyperliquid/build/index.js"],
      "env": {
        "EVM_PRIVATE_KEY": "0x..."
      }
    },
    "morpho": {
      "command": "node",
      "args": ["apps/mcp-morpho/build/index.js"],
      "env": {
        "ETHEREUM_RPC_URL": "https://eth.llamarpc.com",
        "BASE_RPC_URL": "https://mainnet.base.org",
        "ARBITRUM_RPC_URL": "https://arb1.arbitrum.io/rpc"
      }
    },
    "swap": {
      "command": "node",
      "args": ["apps/mcp-swap/build/index.js"],
      "env": {
        "ZEROX_API_KEY": "your-0x-api-key",
        "ETHEREUM_RPC_URL": "https://eth.llamarpc.com"
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
docker compose build mcp-balancer
docker compose build mcp-convex
docker compose build mcp-curve
docker compose build mcp-gmx
docker compose build mcp-hyperliquid
docker compose build mcp-morpho
docker compose build mcp-swap
```

### 3. Start the services

```bash
# Start MCP servers in the background
docker compose up -d mcp-aave mcp-balancer mcp-convex mcp-curve mcp-gmx mcp-hyperliquid mcp-morpho mcp-swap

# Option A: Run the Telegram bot (recommended — no interactive terminal needed)
docker compose up telegram-bot

# Option B: Run the CLI agent interactively (requires stdin attached)
docker compose run agent
```

The Telegram bot runs as a standard background service. The CLI agent needs `docker compose run` (not `up`) to attach your terminal's stdin for the interactive chat loop.

### 4. Chat with the agent

On startup the agent prints your wallet addresses, then enters a chat loop:

```
  Web3 Agent
  ────────────────────────────────────
  EVM:    0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18
  Solana: 7xKX...b3Qp
  ────────────────────────────────────

  MCP: wallet [connected]
  MCP: aave [connected]
  MCP: balancer [connected]
  MCP: convex [connected]
  MCP: curve [connected]
  MCP: gmx [connected]
  MCP: hyperliquid [connected]
  MCP: morpho [connected]
  MCP: swap [connected]

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
pnpm --filter @web3-agent/agent start:telegram

# Docker Compose (starts MCP servers too)
docker compose up -d mcp-aave mcp-balancer mcp-convex mcp-curve mcp-gmx mcp-hyperliquid mcp-morpho mcp-swap
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
- "Show all Balancer V3 pools on Ethereum" (requires mcp-balancer configured)
- "Get a swap quote for 1000 USDC to WETH on Balancer" (requires mcp-balancer configured)
- "Add liquidity to a Balancer weighted pool on Arbitrum" (requires mcp-balancer configured)
- "What are my Balancer LP positions on Base?" (requires mcp-balancer configured)
- "Show all Convex pools and their APYs" (requires mcp-convex configured)
- "Deposit my Curve LP tokens into Convex for boosted rewards" (requires mcp-convex configured)
- "Claim my CRV and CVX rewards from Convex" (requires mcp-convex configured)
- "Stake my CVX tokens" (requires mcp-convex configured)
- "Lock CVX as vlCVX for governance voting" (requires mcp-convex configured)
- "Show all Curve pools on Ethereum" (requires mcp-curve configured)
- "Add liquidity to the Curve 3pool with 1000 USDC" (requires mcp-curve configured)
- "What are my Curve LP positions and claimable rewards?" (requires mcp-curve configured)
- "Stake my Curve LP tokens in the gauge to earn CRV" (requires mcp-curve configured)
- "Show all available GMX markets on Arbitrum" (requires mcp-gmx configured)
- "What are my open GMX positions on Arbitrum?" (requires mcp-gmx configured)
- "Open a 10x long ETH position with 100 USDC on GMX Arbitrum" (requires mcp-gmx configured)
- "Close my ETH long position on GMX" (requires mcp-gmx configured)
- "Set a take-profit at $4,000 on my GMX ETH long" (requires mcp-gmx configured)
- "Deposit 50 more USDC collateral to my GMX ETH position" (requires mcp-gmx configured)
- "Show all available Hyperliquid markets" (requires mcp-hyperliquid configured)
- "What are my open positions on Hyperliquid?" (requires mcp-hyperliquid configured)
- "Open a 5x long BTC position with 0.01 BTC" (requires mcp-hyperliquid configured)
- "Set a take-profit at $110,000 and stop-loss at $90,000 on my BTC position" (requires mcp-hyperliquid configured)
- "Show Morpho markets for USDC" (requires mcp-morpho configured)
- "What are the best Morpho vault yields?" (requires mcp-morpho configured)
- "Supply 1000 USDC to the best Morpho market on Ethereum" (requires mcp-morpho configured)
- "Deposit 500 USDC into a Morpho vault on Base" (requires mcp-morpho configured)
- "Swap 100 USDC to ETH on Ethereum" (requires mcp-swap configured)
- "Get a quote for swapping 1 SOL to USDC" (requires mcp-swap configured)
- "Send 0.01 ETH to 0x..."

### Building images directly

```bash
docker build -f apps/agent/Dockerfile -t web3-agent .    # CLI + Telegram (same image, different entrypoint)
docker build -f apps/mcp-aave/Dockerfile -t mcp-aave .
docker build -f apps/mcp-balancer/Dockerfile -t mcp-balancer .
docker build -f apps/mcp-convex/Dockerfile -t mcp-convex .
docker build -f apps/mcp-curve/Dockerfile -t mcp-curve .
docker build -f apps/mcp-gmx/Dockerfile -t mcp-gmx .
docker build -f apps/mcp-hyperliquid/Dockerfile -t mcp-hyperliquid .
docker build -f apps/mcp-morpho/Dockerfile -t mcp-morpho .
docker build -f apps/mcp-swap/Dockerfile -t mcp-swap .
```

## MCP Server: Balancer (`mcp-balancer`)

Provides 11 tools for interacting with [Balancer V3](https://balancer.fi) — a leading AMM protocol supporting weighted pools, stable pools, boosted pools (ERC-4626), Gyroscope pools, and more. Queries pool data via the Balancer GraphQL API and uses the `@balancer/sdk` for swap routing and liquidity operations on Ethereum, Arbitrum, Base, Optimism, and Avalanche.

The `mcp-balancer` server builds transaction calldata (never holds keys). No API key required — uses the public Balancer API.

### Read-only tools (API + on-chain)
| Tool | Description |
|------|-------------|
| `balancer_get_pools` | List V3 pools with TVL, volume, APR, tokens, weights, swap fee |
| `balancer_get_pool_info` | Detailed pool info: tokens with balances/prices/weights, APR breakdown |
| `balancer_get_user_positions` | User's BPT balances across pools with estimated USD values |
| `balancer_swap_quote` | Get optimal swap quote via Smart Order Router (SOR) |
| `balancer_add_liquidity_quote` | Quote for adding liquidity (unbalanced or single-token) |
| `balancer_remove_liquidity_quote` | Quote for removing liquidity (proportional or single-token) |

### Transaction tools (build calldata)
| Tool | Description |
|------|-------------|
| `balancer_swap_build` | Build swap transaction with SOR routing and slippage protection |
| `balancer_add_liquidity_build` | Build add-liquidity transaction with token approvals |
| `balancer_remove_liquidity_build` | Build remove-liquidity transaction |

## MCP Server: Convex (`mcp-convex`)

Provides 21 tools for interacting with [Convex Finance](https://www.convexfinance.com) — the yield boosting layer on top of Curve. Deposit Curve LP tokens to earn boosted CRV + CVX rewards, stake CVX, convert and stake cvxCRV, and lock CVX as vlCVX for governance. Ethereum mainnet only.

The `mcp-convex` server builds transaction calldata (never holds keys).

### Read-only tools
| Tool | Description |
|------|-------------|
| `convex_get_pools` | All Convex pools with LP token, reward contract, and status |
| `convex_get_pool_info` | Detailed pool info: total staked, reward rate, extra reward tokens |
| `convex_get_user_positions` | User's staked balances, pending CRV, and extra rewards across pools |
| `convex_get_claimable_rewards` | Pending CRV and extra reward tokens for a user in a pool |
| `convex_get_cvx_staking_info` | User's CVX staking position and pending cvxCRV rewards |
| `convex_get_cvxcrv_staking_info` | User's cvxCRV staking position, reward weight, and balances |
| `convex_get_vlcvx_info` | User's vlCVX position: locked balance, voting power, lock schedule, rewards |

### Deposit tools (build calldata)
| Tool | Description |
|------|-------------|
| `convex_deposit` | Deposit Curve LP tokens into Convex for boosted CRV + CVX rewards |
| `convex_withdraw` | Withdraw Curve LP tokens from Convex |
| `convex_unstake_and_withdraw` | Unstake + withdraw LP tokens in one transaction (optionally claim rewards) |

### Reward tools (build calldata)
| Tool | Description |
|------|-------------|
| `convex_claim_rewards` | Claim pending CRV + CVX + extra rewards from a pool |
| `convex_earmark_rewards` | Harvest CRV from Curve gauge for a pool (anyone can call, earns incentive fee) |

### CVX staking tools (build calldata)
| Tool | Description |
|------|-------------|
| `convex_stake_cvx` | Stake CVX tokens to earn cvxCRV rewards (platform fees) |
| `convex_unstake_cvx` | Unstake CVX, optionally claiming pending rewards |

### cvxCRV tools (build calldata)
| Tool | Description |
|------|-------------|
| `convex_convert_crv_to_cvxcrv` | Convert CRV to cvxCRV (irreversible — CRV locked as veCRV) |
| `convex_stake_cvxcrv` | Stake cvxCRV to earn CRV, CVX, and crvUSD rewards |
| `convex_unstake_cvxcrv` | Unstake cvxCRV from the staking wrapper |
| `convex_claim_cvxcrv_rewards` | Claim pending CRV, CVX, and crvUSD from cvxCRV staking |

### vlCVX locking tools (build calldata)
| Tool | Description |
|------|-------------|
| `convex_lock_cvx` | Lock CVX as vlCVX (16+ weeks) for governance voting + platform fee rewards |
| `convex_process_expired_locks` | Relock or withdraw expired vlCVX locks |
| `convex_claim_vlcvx_rewards` | Claim pending platform fee rewards from vlCVX |

## MCP Server: Curve (`mcp-curve`)

Provides 14 tools for interacting with [Curve Finance](https://curve.fi) — the largest stablecoin and like-asset DEX. Query pools, provide liquidity, stake in gauges for CRV rewards, and swap tokens on Ethereum, Polygon, Arbitrum, Optimism, Base, and Avalanche.

The `mcp-curve` server builds transaction calldata (never holds keys).

### Read-only tools
| Tool | Description |
|------|-------------|
| `curve_get_pools` | All pools on a chain with TVL, tokens, CRV APY, gauge address |
| `curve_get_pool_info` | Detailed pool info: TVL, APY, tokens with balances, virtual price, fee, amplification |
| `curve_get_pool_apy` | APY breakdown: base (trading fees), CRV rewards (min/max boost), bonus rewards |
| `curve_get_user_positions` | User's LP balances (wallet + staked in gauges), claimable rewards, USD values |

### Liquidity tools (build calldata)
| Tool | Description |
|------|-------------|
| `curve_add_liquidity` | Deposit tokens into a pool to receive LP tokens (single-sided or balanced) |
| `curve_remove_liquidity` | Withdraw all tokens proportionally by burning LP tokens |
| `curve_remove_liquidity_one_coin` | Withdraw a single token by burning LP tokens |
| `curve_calc_token_amount` | Estimate LP tokens minted/burned for a deposit or withdrawal |

### Gauge tools (build calldata)
| Tool | Description |
|------|-------------|
| `curve_stake_lp` | Stake LP tokens in a gauge to earn CRV + bonus rewards |
| `curve_unstake_lp` | Unstake LP tokens from a gauge |
| `curve_claim_rewards` | Claim pending CRV and bonus reward tokens from a gauge |
| `curve_get_claimable_rewards` | Check pending CRV and reward token amounts for a user |

### Swap tools (build calldata)
| Tool | Description |
|------|-------------|
| `curve_swap_quote` | Get a swap quote from a specific Curve pool |
| `curve_swap_build` | Build a swap transaction on a specific Curve pool |

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

## MCP Server: Morpho (`mcp-morpho`)

Provides 13 tools for interacting with [Morpho](https://morpho.org) — the universal lending network. Queries market data via the Morpho GraphQL API and builds transaction calldata for supply, borrow, collateral, and vault operations on Ethereum, Base, and Arbitrum.

The `mcp-morpho` server builds transaction calldata (never holds keys). No API key required — uses the public Morpho GraphQL API.

### Read-only tools (GraphQL API)
| Tool | Description |
|------|-------------|
| `morpho_get_markets` | List markets with supply/borrow APYs, TVL, utilization |
| `morpho_get_market_details` | Detailed market info by unique key |
| `morpho_get_vaults` | List vaults with APYs, TVL, underlying asset |
| `morpho_get_vault_details` | Detailed vault info by address |
| `morpho_get_user_market_position` | User position in a specific market |
| `morpho_get_user_vault_position` | User position in a specific vault |
| `morpho_get_user_positions` | All user positions across markets and vaults |

### Transaction tools (build calldata)
| Tool | Description |
|------|-------------|
| `morpho_supply` | Supply (lend) tokens to a market to earn interest |
| `morpho_withdraw` | Withdraw supplied assets from a market |
| `morpho_supply_collateral` | Supply collateral to a market (required before borrowing) |
| `morpho_withdraw_collateral` | Withdraw collateral from a market |
| `morpho_borrow` | Borrow tokens against supplied collateral |
| `morpho_repay` | Repay borrowed tokens |
| `morpho_vault_deposit` | Deposit into a Morpho vault (ERC4626) |
| `morpho_vault_withdraw` | Withdraw from a Morpho vault (ERC4626) |

## Supported Chains

### EVM
- Ethereum, Polygon, Arbitrum, Optimism, Base, Avalanche

### Solana
- Mainnet, Devnet

### Balancer V3
- Ethereum, Arbitrum, Base, Optimism, Avalanche

### Convex
- Ethereum

### Curve
- Ethereum, Polygon, Arbitrum, Optimism, Base, Avalanche

### GMX V2
- Arbitrum, Avalanche

### Hyperliquid
- Mainnet (default), Testnet (set `HYPERLIQUID_TESTNET=true`)

### Morpho
- Ethereum, Base, Arbitrum

## Development

```bash
# Watch mode (all packages)
pnpm dev

# Watch a specific package
pnpm --filter @web3-agent/core dev
pnpm --filter @web3-agent/agent dev
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
| `PORT` | MCP server HTTP port (default: `3000` for mcp-aave, `3007` for mcp-balancer, `3005` for mcp-convex, `3004` for mcp-curve, `3003` for mcp-gmx, `3002` for mcp-hyperliquid, `3006` for mcp-morpho, `3001` for mcp-swap) |
| `API_KEY` | MCP server Bearer token auth (optional, leave empty for open access) |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from @BotFather (required for Telegram bot) |
| `WALLET_ENCRYPTION_KEY` | Passphrase for encrypting per-user wallet keys in the database (required for Telegram bot) |
| `DATABASE_URL` | PostgreSQL connection string (e.g. `postgres://user:pass@host:5432/db`) |
