FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.4.0 --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY package.json ./
COPY tsconfig.base.json ./

# Copy package.json for dependency resolution
COPY apps/mcp-swap/package.json ./apps/mcp-swap/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY apps/mcp-swap/ ./apps/mcp-swap/

# Build
RUN pnpm --filter @agent-wallet/mcp-swap build

# Production stage
FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@10.4.0 --activate

WORKDIR /app

COPY --from=build /app/pnpm-workspace.yaml ./
COPY --from=build /app/pnpm-lock.yaml ./
COPY --from=build /app/package.json ./
COPY --from=build /app/apps/mcp-swap/package.json ./apps/mcp-swap/
COPY --from=build /app/apps/mcp-swap/build/ ./apps/mcp-swap/build/

RUN pnpm install --frozen-lockfile --prod

WORKDIR /app/apps/mcp-swap

EXPOSE 3001

# Default to HTTP mode for Docker deployments.
# Override with: docker run ... node build/index.js  (for stdio)
ENTRYPOINT ["node", "build/http.js"]
