FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.4.0 --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY package.json ./
COPY tsconfig.base.json ./

# Copy package.json for dependency resolution
COPY apps/mcp-aave/package.json ./apps/mcp-aave/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY apps/mcp-aave/ ./apps/mcp-aave/

# Build
RUN pnpm --filter @agent-wallet/mcp-aave build

# Production stage
FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@10.4.0 --activate

WORKDIR /app

COPY --from=build /app/pnpm-workspace.yaml ./
COPY --from=build /app/pnpm-lock.yaml ./
COPY --from=build /app/package.json ./
COPY --from=build /app/apps/mcp-aave/package.json ./apps/mcp-aave/
COPY --from=build /app/apps/mcp-aave/build/ ./apps/mcp-aave/build/

RUN pnpm install --frozen-lockfile --prod

WORKDIR /app/apps/mcp-aave

EXPOSE 3000

# Default to HTTP mode for Docker deployments.
# Override with: docker run ... node build/index.js  (for stdio)
ENTRYPOINT ["node", "build/http.js"]
