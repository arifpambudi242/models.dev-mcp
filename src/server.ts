// MCP Server configuration and tool registration

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDiscoveryTools } from "./tools/discovery.js";
import { registerPricingTools } from "./tools/pricing.js";
import { registerProviderTools } from "./tools/providers.js";
import { registerCapabilityTools } from "./tools/capabilities.js";
import { registerIntegrationTools } from "./tools/integration.js";
import { registerAnalyticsTools } from "./tools/analytics.js";
import { registerUtilityTools } from "./tools/utility.js";
import { registerCurrencyTools } from "./tools/currency.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "models-dev-mcp",
    version: "1.0.0",
  });

  // Register all tool categories
  registerDiscoveryTools(server);      // 7 tools: search, list, get, families, latest, trending
  registerPricingTools(server);        // 5 tools: compare pricing, cheapest, calculator, free, table
  registerProviderTools(server);       // 5 tools: list, get, models, find providers, SDK info
  registerCapabilityTools(server);     // 6 tools: filter, compare, best-for, multimodal, reasoning, open-weight
  registerIntegrationTools(server);    // 4 tools: SDK code gen, env setup, model ID mapping, validate
  registerAnalyticsTools(server);      // 4 tools: market overview, lab summary, context leaders, price dist
  registerUtilityTools(server);        // 3 tools: schema, changelog, benchmarks
  registerCurrencyTools(server);       // 2 tools: convert_currency, list_supported_currencies

  return server;
}
