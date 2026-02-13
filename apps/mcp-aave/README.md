# mcp-aave

MCP server for AAVE V3. Provides AI agents with read-only query tools and transaction-builder tools for the full AAVE protocol surface — lending, borrowing, flash loans, liquidations, governance, staking, GHO, and more. The server never holds keys or signs transactions; write tools return raw calldata (`to`, `data`, `value`) for the agent's wallet to sign.

Supports Ethereum, Polygon, Arbitrum, Optimism, Base, and Avalanche.

## Install

```sh
git clone https://github.com/moontography/mcp-aave.git
cd mcp-aave
cp .env.example .env
```

Edit `.env` with your RPC URLs (free endpoints from Alchemy, Infura, QuickNode, or the public defaults work for light usage).

## Build & Run (Docker)

### Remote HTTP server (default)

The Docker image runs an HTTP server on port 3000 by default. Any MCP client on the internet can connect to it via the Streamable HTTP transport.

```sh
docker build -t mcp-aave .
docker run --rm -p 3000:3000 --env-file .env mcp-aave
```

Set `API_KEY` in your `.env` to require bearer token authentication:

```
API_KEY=your-secret-key-here
```

Health check: `GET /health` (no auth required).

#### MCP client configuration (remote)

```json
{
  "mcpServers": {
    "aave": {
      "type": "streamable-http",
      "url": "https://your-server.example.com/mcp",
      "headers": {
        "Authorization": "Bearer your-secret-key-here"
      }
    }
  }
}
```

### Local stdio mode

For local-only usage (Claude Desktop, Claude Code, etc.) you can run in stdio mode instead:

```sh
docker run --rm -i --env-file .env mcp-aave node build/index.js
```

```json
{
  "mcpServers": {
    "aave": {
      "command": "docker",
      "args": ["run", "--rm", "-i", "--env-file", "/absolute/path/to/.env", "mcp-aave", "node", "build/index.js"]
    }
  }
}
```

### Deploying remotely

The HTTP server works on any platform that runs Docker containers:

| Platform | Deploy command |
|----------|---------------|
| **Fly.io** | `fly launch --image mcp-aave` then `fly secrets set API_KEY=... ETHEREUM_RPC_URL=...` |
| **Railway** | Connect repo, set env vars in dashboard |
| **Cloud Run** | `gcloud run deploy mcp-aave --image mcp-aave --port 3000 --set-env-vars API_KEY=...` |
| **Any VPS** | `docker run -d -p 3000:3000 --env-file .env --restart unless-stopped mcp-aave` |

Put a reverse proxy (Caddy, nginx, Cloudflare Tunnel) in front for TLS. Clients should always connect over HTTPS in production.

## Tools

### Read (15 tools)

| Tool | Description |
|------|-------------|
| `aave_get_user_account_data` | Health factor, collateral, debt, LTV |
| `aave_get_user_reserve_data` | Per-asset position details |
| `aave_get_reserve_data` | Reserve supply, debt, rates |
| `aave_get_reserve_config` | Risk parameters, caps, flags |
| `aave_get_all_reserves` | All supported tokens (symbol + address) |
| `aave_get_asset_price` | Oracle price (USD) |
| `aave_get_asset_prices` | Batch oracle prices |
| `aave_get_user_emode` | Current eMode category |
| `aave_get_emode_category` | eMode config details |
| `aave_get_flash_loan_premium` | Flash loan fee |
| `aave_get_flash_loan_enabled` | Flash loan eligibility per asset |
| `aave_get_reserve_token_addresses` | aToken + debt token addresses |
| `aave_get_borrow_allowance` | Credit delegation allowance |
| `aave_get_staking_info` | stkAAVE balance, rewards, cooldown |
| `aave_get_voting_power` | Governance power |

### Write — transaction builders (20+ tools)

Every write tool returns `{ chainId, transactions: [{ to, data, value }] }`. The agent's wallet signs and submits.

| Tool | Category |
|------|----------|
| `aave_supply` | Lending |
| `aave_withdraw` | Lending |
| `aave_borrow` | Lending |
| `aave_repay` | Lending |
| `aave_repay_with_atokens` | Lending |
| `aave_supply_native` | Native token (ETH/MATIC/AVAX) |
| `aave_withdraw_native` | Native token |
| `aave_borrow_native` | Native token |
| `aave_repay_native` | Native token |
| `aave_set_collateral` | Collateral |
| `aave_set_emode` | Efficiency mode |
| `aave_flash_loan` | Flash loan (multi-asset) |
| `aave_flash_loan_simple` | Flash loan (single-asset) |
| `aave_liquidation_call` | Liquidation |
| `aave_approve_delegation` | Credit delegation |
| `aave_delegate` | Governance |
| `aave_delegate_by_type` | Governance |
| `aave_stake` | Staking |
| `aave_cooldown` | Staking |
| `aave_unstake` | Staking |
| `aave_claim_staking_rewards` | Staking |
| `aave_borrow_gho` | GHO stablecoin |
| `aave_repay_gho` | GHO stablecoin |

### Governance read tools

`aave_get_proposal`, `aave_get_proposals_count`, `aave_get_delegation_info`

## License

[MIT](LICENSE)
