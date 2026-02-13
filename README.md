# Agent Wallet

A crypto wallet AI agent powered by the [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript). Holds private keys for EVM and Solana chains, interacts with external MCP servers to build trusted transaction calldata, and executes approved transactions on-chain.

Every transaction requires explicit user approval before signing.

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
    ├── agent/            # @agent-wallet/agent — Claude-powered CLI agent
    │   ├── tools/        # Custom wallet tools (balance, send, execute calldata)
    │   ├── agent.ts      # Claude Agent SDK query() setup
    │   ├── approval.ts   # Human-in-the-loop transaction approval
    │   └── mcp-config.ts # External MCP server configuration loader
    │
    ├── mcp-aave/         # @agent-wallet/mcp-aave — AAVE V3 MCP server
    │   ├── tools/        # 35+ tools: lending, borrowing, flash loans, governance, staking
    │   ├── config/       # Chain configs and AAVE deployment addresses
    │   └── http.ts       # HTTP transport for remote deployments
    │
    └── mcp-swap/         # @agent-wallet/mcp-swap — Token swap MCP server
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
pnpm --filter @agent-wallet/core build
pnpm --filter @agent-wallet/agent build
pnpm --filter @agent-wallet/mcp-aave build
pnpm --filter @agent-wallet/mcp-swap build
```

## Run & Usage

The agent is an **interactive CLI chat** that runs via Docker Compose. You type messages in your terminal and Claude responds, using wallet tools and MCP servers as needed.

### 1. Configure MCP servers

The agent connects to MCP servers for DeFi protocol interactions. Bundled servers include `mcp-aave` (lending/borrowing) and `mcp-swap` (token swaps). Create your config:

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
```

### 3. Start the services

Since the agent is an interactive CLI, use `docker compose run` to connect your terminal's stdin:

```bash
# Start MCP servers in the background first
docker compose up -d mcp-aave mcp-swap

# Run the agent interactively
docker compose run agent
```

`docker compose run` attaches your terminal directly to the container so you can type messages and interact with the chat loop. Press `Ctrl+C` or type `exit` to quit.

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

### Example prompts

- "What are my wallet addresses?"
- "Show all my balances"
- "What's my USDC balance on Ethereum?" (needs USDC contract address — Claude will look it up or ask)
- "Supply 100 USDC to AAVE on Ethereum" (requires mcp-aave configured)
- "Swap 100 USDC to ETH on Ethereum" (requires mcp-swap configured)
- "Get a quote for swapping 1 SOL to USDC" (requires mcp-swap configured)
- "Send 0.01 ETH to 0x..."

### Building images directly

```bash
docker build -f apps/agent/Dockerfile -t agent-wallet .
docker build -f apps/mcp-aave/Dockerfile -t mcp-aave .
docker build -f apps/mcp-swap/Dockerfile -t mcp-swap .
```

## Supported Chains

### EVM
- Ethereum, Polygon, Arbitrum, Optimism, Base, Avalanche

### Solana
- Mainnet, Devnet

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
| `PORT` | MCP server HTTP port (default: `3000` for mcp-aave, `3001` for mcp-swap) |
| `API_KEY` | MCP server Bearer token auth (optional, leave empty for open access) |
