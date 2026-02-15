FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.4.0 --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY package.json ./
COPY tsconfig.base.json ./

# Copy package.json for dependency resolution
COPY apps/mcp-hyperliquid/package.json ./apps/mcp-hyperliquid/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY apps/mcp-hyperliquid/ ./apps/mcp-hyperliquid/

# Build
RUN pnpm --filter @agent-wallet/mcp-hyperliquid build

# Production stage
FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@10.4.0 --activate

WORKDIR /app

COPY --from=build /app/pnpm-workspace.yaml ./
COPY --from=build /app/pnpm-lock.yaml ./
COPY --from=build /app/package.json ./
COPY --from=build /app/apps/mcp-hyperliquid/package.json ./apps/mcp-hyperliquid/
COPY --from=build /app/apps/mcp-hyperliquid/build/ ./apps/mcp-hyperliquid/build/

RUN pnpm install --frozen-lockfile --prod

WORKDIR /app/apps/mcp-hyperliquid

EXPOSE 3002

# Default to HTTP mode for Docker deployments.
# Override with: docker run ... node build/index.js  (for stdio)
ENTRYPOINT ["node", "build/http.js"]
