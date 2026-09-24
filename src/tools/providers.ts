// Tools: Provider Intelligence

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProviders, getProvider, getFlatModels } from "../data/fetcher.js";

export function registerProviderTools(server: McpServer): void {
  // 13. list_providers
  server.tool(
    "list_providers",
    "List all AI model providers with their SDK details, environment variables, and model count.",
    {
      sort_by: z
        .enum(["name", "model_count"])
        .optional()
        .default("model_count")
        .describe("Sort field"),
    },
    async ({ sort_by }) => {
      const providers = await getProviders();

      const list = providers.map((p) => ({
        id: p.id,
        name: p.name,
        model_count: Object.keys(p.models).length,
        npm: p.npm ?? null,
        env: p.env ?? [],
        api: p.api ?? null,
        doc: p.doc ?? null,
      }));

      list.sort((a, b) => {
        if (sort_by === "model_count") return b.model_count - a.model_count;
        return a.name.localeCompare(b.name);
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { total: list.length, providers: list },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // 14. get_provider
  server.tool(
    "get_provider",
    "Get detailed information about a specific provider including SDK, env vars, API URL, and all hosted models.",
    {
      provider_id: z
        .string()
        .describe("Provider ID (e.g., 'openai', 'anthropic', 'openrouter')"),
    },
    async ({ provider_id }) => {
      const provider = await getProvider(provider_id);

      if (!provider) {
        // Try fuzzy match
        const all = await getProviders();
        const q = provider_id.toLowerCase();
        const match = all.find(
          (p) =>
            p.id.toLowerCase() === q ||
            p.name.toLowerCase().includes(q),
        );
        if (!match) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Provider "${provider_id}" not found. Use list_providers to see available providers.`,
              },
            ],
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  id: match.id,
                  name: match.name,
                  npm: match.npm,
                  env: match.env,
                  api: match.api,
                  doc: match.doc,
                  model_count: Object.keys(match.models).length,
                  models: Object.values(match.models).map((m) => ({
                    id: m.id,
                    name: m.name,
                    context: m.limit.context,
                    input_cost: m.cost?.input ?? null,
                    output_cost: m.cost?.output ?? null,
                  })),
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                id: provider.id,
                name: provider.name,
                npm: provider.npm,
                env: provider.env,
                api: provider.api,
                doc: provider.doc,
                model_count: Object.keys(provider.models).length,
                models: Object.values(provider.models).map((m) => ({
                  id: m.id,
                  name: m.name,
                  context: m.limit.context,
                  input_cost: m.cost?.input ?? null,
                  output_cost: m.cost?.output ?? null,
                })),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // 15. get_provider_models
  server.tool(
    "get_provider_models",
    "Get all models hosted by a specific provider with full details.",
    {
      provider_id: z.string().describe("Provider ID"),
      sort_by: z
        .enum(["name", "price", "context"])
        .optional()
        .default("name")
        .describe("Sort field"),
    },
    async ({ provider_id, sort_by }) => {
      const provider = await getProvider(provider_id);

      if (!provider) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Provider "${provider_id}" not found.`,
            },
          ],
        };
      }

      let models = Object.values(provider.models).map((m) => ({
        id: m.id,
        name: m.name,
        family: m.family,
        context: m.limit.context,
        output_limit: m.limit.output,
        input_cost: m.cost?.input ?? null,
        output_cost: m.cost?.output ?? null,
        reasoning: m.reasoning,
        tool_call: m.tool_call,
        structured_output: m.structured_output,
        modalities_input: m.modalities.input,
      }));

      models.sort((a, b) => {
        switch (sort_by) {
          case "price":
            return (a.input_cost ?? Infinity) - (b.input_cost ?? Infinity);
          case "context":
            return (b.context ?? 0) - (a.context ?? 0);
          default:
            return a.name.localeCompare(b.name);
        }
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                provider: provider.name,
                provider_id: provider.id,
                total: models.length,
                models,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // 16. find_providers_for_model
  server.tool(
    "find_providers_for_model",
    "Find all providers that host a specific model, with pricing comparison.",
    {
      model_name: z.string().describe("Model name or ID to search for"),
    },
    async ({ model_name }) => {
      const flat = await getFlatModels();
      const q = model_name.toLowerCase();

      const matches = flat.filter(
        (f) =>
          f.model.name.toLowerCase().includes(q) ||
          f.model.id.toLowerCase().includes(q),
      );

      if (matches.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No providers found for "${model_name}".`,
            },
          ],
        };
      }

      const providers = matches
        .map((f) => ({
          provider: f.providerName,
          provider_id: f.providerId,
          model_id: f.model.id,
          input_cost: f.model.cost?.input ?? null,
          output_cost: f.model.cost?.output ?? null,
          cache_read: f.model.cost?.cache_read ?? null,
          context: f.model.limit.context,
          output_limit: f.model.limit.output,
        }))
        .sort((a, b) => (a.input_cost ?? Infinity) - (b.input_cost ?? Infinity));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                model: matches[0].model.name,
                total_providers: providers.length,
                providers,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // 17. get_provider_sdk_info
  server.tool(
    "get_provider_sdk_info",
    "Get SDK integration info for a provider: npm package, environment variables, base API URL, and documentation link.",
    {
      provider_id: z.string().describe("Provider ID"),
    },
    async ({ provider_id }) => {
      const providers = await getProviders();
      const q = provider_id.toLowerCase();
      const provider = providers.find(
        (p) => p.id.toLowerCase() === q || p.name.toLowerCase().includes(q),
      );

      if (!provider) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Provider "${provider_id}" not found.`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                provider: provider.name,
                provider_id: provider.id,
                npm_package: provider.npm ?? null,
                env_variables: provider.env ?? [],
                api_base_url: provider.api ?? null,
                documentation: provider.doc ?? null,
                is_openai_compatible: provider.npm === "@ai-sdk/openai-compatible",
                install_command: provider.npm ? `npm install ${provider.npm}` : null,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
