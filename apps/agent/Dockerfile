FROM node:22-slim AS build
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.4.0 --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY package.json ./
COPY tsconfig.base.json ./

# Copy package.json files for dependency resolution
COPY packages/core/package.json ./packages/core/
COPY apps/agent/package.json ./apps/agent/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/core/ ./packages/core/
COPY apps/agent/ ./apps/agent/

# Build core then agent
RUN pnpm --filter @web3-agent/core build
RUN pnpm --filter @web3-agent/agent build

# Production stage
FROM node:22-slim
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.4.0 --activate

WORKDIR /app

COPY --from=build /app/pnpm-workspace.yaml ./
COPY --from=build /app/pnpm-lock.yaml ./
COPY --from=build /app/package.json ./
COPY --from=build /app/packages/core/package.json ./packages/core/
COPY --from=build /app/packages/core/build/ ./packages/core/build/
COPY --from=build /app/apps/agent/package.json ./apps/agent/
COPY --from=build /app/apps/agent/build/ ./apps/agent/build/

RUN pnpm install --frozen-lockfile --prod

# Run as non-root user (required: SDK rejects bypassPermissions as root)
RUN useradd -m agent && mkdir -p /app/data && chown -R agent:agent /app
USER agent

WORKDIR /app/apps/agent

CMD ["node", "build/index.js"]
