FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.4.0 --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY package.json ./
COPY tsconfig.base.json ./

# Copy package.json for dependency resolution
COPY apps/mcp-convex/package.json ./apps/mcp-convex/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY apps/mcp-convex/ ./apps/mcp-convex/

# Build
RUN pnpm --filter @agent-wallet/mcp-convex build

# Production stage
FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@10.4.0 --activate

WORKDIR /app

COPY --from=build /app/pnpm-workspace.yaml ./
COPY --from=build /app/pnpm-lock.yaml ./
COPY --from=build /app/package.json ./
COPY --from=build /app/apps/mcp-convex/package.json ./apps/mcp-convex/
COPY --from=build /app/apps/mcp-convex/build/ ./apps/mcp-convex/build/

RUN pnpm install --frozen-lockfile --prod

WORKDIR /app/apps/mcp-convex

EXPOSE 3005

# Default to HTTP mode for Docker deployments.
# Override with: docker run ... node build/index.js  (for stdio)
ENTRYPOINT ["node", "build/http.js"]
