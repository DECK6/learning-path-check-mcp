import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SERVICE_ID, SERVICE_VERSION } from "../config/version.js";
import { registerPublicTools } from "../public-tools/registry.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: SERVICE_ID, version: SERVICE_VERSION });
  registerPublicTools(server);
  return server;
}
