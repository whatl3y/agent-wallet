import { readFileSync, existsSync } from "node:fs";
import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import { config } from "./config.js";
import { logger } from "./logger.js";

interface McpServersFile {
  mcpServers: Record<string, McpServerConfig>;
}

export function loadMcpServers(): Record<string, McpServerConfig> {
  const configPath = config.mcpServersConfigPath;

  if (!existsSync(configPath)) {
    logger.info(
      { configPath },
      "No MCP servers config file found, starting without external MCP servers"
    );
    return {};
  }

  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed: McpServersFile = JSON.parse(raw);

    if (!parsed.mcpServers || typeof parsed.mcpServers !== "object") {
      logger.warn("MCP servers config missing 'mcpServers' key, skipping");
      return {};
    }

    const serverCount = Object.keys(parsed.mcpServers).length;
    logger.info(
      { configPath, serverCount },
      `Loaded ${serverCount} MCP server(s) from config`
    );

    return parsed.mcpServers;
  } catch (err) {
    logger.error({ err, configPath }, "Failed to load MCP servers config");
    return {};
  }
}
