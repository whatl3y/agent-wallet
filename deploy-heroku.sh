#!/bin/bash
set -e

# Web3 Agent - Heroku Container Deployment Script
#
# This script deploys services to Heroku using Docker containers:
#   - telegram-bot:     Telegram bot (bot dyno)    → grep3-wallet-bot
#   - mcp-aave:         MCP server (web dyno)      → grep3-mcp-aave
#   - mcp-swap:         MCP server (web dyno)      → grep3-mcp-swap
#   - mcp-hyperliquid:  MCP server (web dyno)      → grep3-mcp-hyperliquid
#   - mcp-gmx:          MCP server (web dyno)      → grep3-mcp-gmx
#   - mcp-curve:        MCP server (web dyno)      → grep3-mcp-curve
#   - mcp-convex:       MCP server (web dyno)      → grep3-mcp-convex
#   - mcp-morpho:       MCP server (web dyno)      → grep3-mcp-morpho
#   - mcp-balancer:     MCP server (web dyno)      → grep3-mcp-balancer
#
# Each service deploys to its own Heroku app.
#
# Prerequisites:
#   - Docker installed and running
#   - Heroku CLI installed and logged in (heroku login + heroku container:login)
#
# Usage:
#   ./deploy-heroku.sh [OPTIONS]
#
# Options:
#   --skip-build      Skip building images (use existing local images)
#   --only=<service>  Deploy only a specific service (telegram-bot, mcp-aave, mcp-swap, etc.)

# Service definitions (bash 3 compatible, no associative arrays)
# Format: service_name:heroku_app:dyno_type:dockerfile
ALL_SERVICES="telegram-bot:grep3-wallet-bot:bot:apps/agent/Dockerfile mcp-aave:grep3-mcp-aave:web:apps/mcp-aave/Dockerfile mcp-swap:grep3-mcp-swap:web:apps/mcp-swap/Dockerfile mcp-hyperliquid:grep3-mcp-hyperliquid:web:apps/mcp-hyperliquid/Dockerfile mcp-gmx:grep3-mcp-gmx:web:apps/mcp-gmx/Dockerfile mcp-curve:grep3-mcp-curve:web:apps/mcp-curve/Dockerfile mcp-convex:grep3-mcp-convex:web:apps/mcp-convex/Dockerfile mcp-morpho:grep3-mcp-morpho:web:apps/mcp-morpho/Dockerfile mcp-balancer:grep3-mcp-balancer:web:apps/mcp-balancer/Dockerfile"

# Parse options
SKIP_BUILD=false
ONLY_SERVICE=""

for arg in "$@"; do
    case $arg in
        --skip-build)
            SKIP_BUILD=true
            ;;
        --only=*)
            ONLY_SERVICE="${arg#*=}"
            ;;
    esac
done

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Helper to parse service definitions
get_field() {
    local entry="$1"
    local field="$2"
    echo "$entry" | cut -d: -f"$field"
}

# Determine which services to deploy
get_services() {
    if [ -n "$ONLY_SERVICE" ]; then
        for entry in $ALL_SERVICES; do
            local name=$(get_field "$entry" 1)
            if [ "$name" = "$ONLY_SERVICE" ]; then
                echo "$entry"
                return
            fi
        done
        echo "Error: Unknown service '$ONLY_SERVICE'" >&2
        echo "Available services: telegram-bot, mcp-aave, mcp-swap, mcp-hyperliquid, mcp-gmx, mcp-curve, mcp-convex, mcp-morpho, mcp-balancer" >&2
        exit 1
    else
        echo "$ALL_SERVICES"
    fi
}

echo "========================================"
echo "Web3 Agent"
echo "Heroku Container Deployment"
echo "========================================"
echo ""
if [ -n "$ONLY_SERVICE" ]; then
    echo "Service: $ONLY_SERVICE only"
else
    echo "Services: telegram-bot, mcp-aave, mcp-swap, mcp-hyperliquid, mcp-gmx, mcp-curve, mcp-convex, mcp-morpho, mcp-balancer"
fi
echo ""

# Check prerequisites
check_prerequisites() {
    echo "Checking prerequisites..."

    if ! command -v docker &> /dev/null; then
        echo "Error: Docker is not installed. Please install Docker first."
        exit 1
    fi

    if ! docker info &> /dev/null; then
        echo "Error: Docker is not running. Please start Docker first."
        exit 1
    fi

    if ! command -v heroku &> /dev/null; then
        echo "Error: Heroku CLI is not installed."
        echo "Install it with: brew install heroku/brew/heroku"
        exit 1
    fi

    if ! heroku auth:whoami &> /dev/null; then
        echo "Error: Not logged in to Heroku. Please run: heroku login"
        exit 1
    fi

    # Login to Heroku Container Registry
    echo "Logging in to Heroku Container Registry..."
    heroku container:login

    echo "All prerequisites met."
    echo ""
}

# Create or verify a Heroku app
setup_heroku_app() {
    local app_name="$1"
    echo "Setting up Heroku app: $app_name"

    if heroku apps:info -a "$app_name" &> /dev/null; then
        echo "App '$app_name' already exists."
    else
        echo "Creating new Heroku app: $app_name"
        heroku create "$app_name" || {
            echo ""
            echo "Could not create app with name '$app_name'."
            echo "The name might be taken. Please provide a unique name:"
            read -p "App name: " NEW_APP_NAME
            app_name="$NEW_APP_NAME"
            heroku create "$app_name"
        }
    fi

    echo "Setting stack to container..."
    heroku stack:set container -a "$app_name"
    echo ""
}

# Build, push, and release a single service
deploy_service() {
    local entry="$1"
    local name=$(get_field "$entry" 1)
    local app=$(get_field "$entry" 2)
    local dyno_type=$(get_field "$entry" 3)
    local dockerfile=$(get_field "$entry" 4)

    echo "----------------------------------------"
    echo "Deploying: $name → $app ($dyno_type dyno)"
    echo "----------------------------------------"

    # Setup Heroku app
    setup_heroku_app "$app"

    # Build
    if [ "$SKIP_BUILD" = true ]; then
        echo "Skipping build (--skip-build specified)"
    else
        echo "Building Docker image for $name..."
        cd "$PROJECT_DIR"

        if [ "$name" = "telegram-bot" ]; then
            # telegram-bot uses the agent Dockerfile but overrides the entrypoint
            # Build base image, then create derived image with telegram CMD
            local base_image="$app:local-build"
            docker buildx build --platform linux/amd64 \
                -t "$base_image" \
                -f "$dockerfile" \
                .

            docker build --platform linux/amd64 \
                -t "registry.heroku.com/$app/$dyno_type" \
                -f- . <<EOF
FROM $base_image
CMD ["node", "build/telegram/index.js"]
EOF
        else
            # MCP servers use their own Dockerfile directly
            docker buildx build --platform linux/amd64 \
                -t "registry.heroku.com/$app/$dyno_type" \
                -f "$dockerfile" \
                .
        fi

        echo "Image built successfully."
    fi

    # Push
    echo "Pushing image to Heroku Container Registry..."
    docker push "registry.heroku.com/$app/$dyno_type"

    # Release
    echo "Releasing container: $dyno_type"
    heroku container:release --app "$app" "$dyno_type"

    echo ""
    echo "$name deployed successfully to $app"
    echo ""
}

# Configure MCP server URLs on the bot app
configure_mcp_servers() {
    local bot_app="grep3-wallet-bot"
    local prod_config="$PROJECT_DIR/mcp-servers.prod.json"
    echo "----------------------------------------"
    echo "Configuring MCP server URLs on $bot_app"
    echo "----------------------------------------"

    if [ -f "$prod_config" ]; then
        # Use production config file directly
        local mcp_json
        mcp_json=$(cat "$prod_config" | tr -d '\n' | tr -s ' ')
        echo "Using mcp-servers.prod.json for MCP_SERVERS_JSON..."
    else
        echo "No mcp-servers.prod.json found, generating from Heroku app names..."
        # Build MCP_SERVERS_JSON from known Heroku app names
        # If MCP_API_KEY is set on the bot app, headers will be included
        local api_key
        api_key=$(heroku config:get MCP_API_KEY --app "$bot_app" 2>/dev/null || true)

        local servers=""
        for entry in $ALL_SERVICES; do
            local name=$(get_field "$entry" 1)
            local mcp_app=$(get_field "$entry" 2)

            # Skip the telegram-bot itself
            if [ "$name" = "telegram-bot" ]; then
                continue
            fi

            # Strip "mcp-" prefix for the server key name
            local key="${name#mcp-}"
            local url="https://$mcp_app.herokuapp.com/mcp"

            if [ -n "$api_key" ]; then
                local entry_json="\"$key\":{\"type\":\"http\",\"url\":\"$url\",\"headers\":{\"Authorization\":\"Bearer $api_key\"}}"
            else
                local entry_json="\"$key\":{\"type\":\"http\",\"url\":\"$url\"}"
            fi

            if [ -n "$servers" ]; then
                servers="$servers,$entry_json"
            else
                servers="$entry_json"
            fi
        done

        local mcp_json="{\"mcpServers\":{$servers}}"
    fi

    echo "Setting MCP_SERVERS_JSON on $bot_app..."
    heroku config:set --app "$bot_app" MCP_SERVERS_JSON="$mcp_json"
    echo "MCP servers configured."
    echo ""
}

# Deploy
deploy() {
    local services=$(get_services)

    for entry in $services; do
        deploy_service "$entry"
    done

    # Configure MCP server URLs on the bot app after all services are deployed
    configure_mcp_servers

    echo "========================================"
    echo "Deployment complete!"
    echo "========================================"
    echo ""
    echo "Deployed apps:"
    for entry in $services; do
        local name=$(get_field "$entry" 1)
        local app=$(get_field "$entry" 2)
        local dyno_type=$(get_field "$entry" 3)
        echo "  $name → https://$app.herokuapp.com ($dyno_type)"
    done
    echo ""
    echo "View logs with:"
    echo "  heroku logs --tail -a <app-name>"
    echo ""
}

# Main
main() {
    check_prerequisites
    deploy
}

main
