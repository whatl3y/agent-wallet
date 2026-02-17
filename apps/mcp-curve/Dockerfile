FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.4.0 --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY package.json ./
COPY tsconfig.base.json ./

# Copy package.json for dependency resolution
COPY apps/mcp-curve/package.json ./apps/mcp-curve/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY apps/mcp-curve/ ./apps/mcp-curve/

# Build
RUN pnpm --filter @web3-agent/mcp-curve build

# Production stage
FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@10.4.0 --activate

WORKDIR /app

COPY --from=build /app/pnpm-workspace.yaml ./
COPY --from=build /app/pnpm-lock.yaml ./
COPY --from=build /app/package.json ./
COPY --from=build /app/apps/mcp-curve/package.json ./apps/mcp-curve/
COPY --from=build /app/apps/mcp-curve/build/ ./apps/mcp-curve/build/

RUN pnpm install --frozen-lockfile --prod

WORKDIR /app/apps/mcp-curve

EXPOSE 3004

# Default to HTTP mode for Docker deployments.
# Override with: docker run ... node build/index.js  (for stdio)
ENTRYPOINT ["node", "build/http.js"]
