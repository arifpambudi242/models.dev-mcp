// Tools: Pricing & Cost Analysis

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getFlatModels } from "../data/fetcher.js";

export function registerPricingTools(server: McpServer): void {
  // 8. compare_pricing
  server.tool(
    "compare_pricing",
    "Compare pricing for the same model across different providers. Shows input/output cost per 1M tokens.",
    {
      model_name: z
        .string()
        .describe("Model name to search for (e.g., 'GPT-6 Sol', 'Claude Opus 5.5')"),
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
              text: `No providers found for model "${model_name}". Try search_models first.`,
            },
          ],
        };
      }

      const pricing = matches
        .map((f) => ({
          provider: f.providerName,
          provider_id: f.providerId,
          model_id: f.model.id,
          model_name: f.model.name,
          input_per_1m: f.model.cost?.input ?? null,
          output_per_1m: f.model.cost?.output ?? null,
          cache_read_per_1m: f.model.cost?.cache_read ?? null,
          context: f.model.limit.context,
          output_limit: f.model.limit.output,
        }))
        .sort((a, b) => (a.input_per_1m ?? Infinity) - (b.input_per_1m ?? Infinity));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                model: model_name,
                providers_found: pricing.length,
                pricing,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // 9. find_cheapest_model
  server.tool(
    "find_cheapest_model",
    "Find the cheapest model meeting specific requirements (reasoning, tool_call, min context, etc.).",
    {
      reasoning: z.boolean().optional().describe("Requires reasoning capability"),
      tool_call: z.boolean().optional().describe("Requires tool calling"),
      structured_output: z.boolean().optional().describe("Requires structured output"),
      min_context: z.number().optional().describe("Minimum context window size"),
      modality_input: z
        .array(z.string())
        .optional()
        .describe("Required input modalities (e.g., ['text', 'image'])"),
      limit: z.number().optional().default(10).describe("Max results"),
    },
    async ({ reasoning, tool_call, structured_output, min_context, modality_input, limit }) => {
      const flat = await getFlatModels();

      let filtered = flat.filter((f) => f.model.cost && f.model.cost.input > 0);

      if (reasoning !== undefined) filtered = filtered.filter((f) => f.model.reasoning === reasoning);
      if (tool_call !== undefined) filtered = filtered.filter((f) => f.model.tool_call === tool_call);
      if (structured_output !== undefined) filtered = filtered.filter((f) => f.model.structured_output === structured_output);
      if (min_context) filtered = filtered.filter((f) => (f.model.limit.context ?? 0) >= min_context);
      if (modality_input) {
        filtered = filtered.filter((f) =>
          modality_input.every((mod) => f.model.modalities.input.includes(mod)),
        );
      }

      // Deduplicate by model name + provider, keep cheapest
      const seen = new Map<string, (typeof flat)[number]>();
      for (const f of filtered) {
        const key = `${f.model.name}__${f.providerId}`;
        const existing = seen.get(key);
        if (!existing || (f.model.cost?.input ?? Infinity) < (existing.model.cost?.input ?? Infinity)) {
          seen.set(key, f);
        }
      }

      const results = [...seen.values()]
        .sort((a, b) => (a.model.cost?.input ?? Infinity) - (b.model.cost?.input ?? Infinity))
        .slice(0, limit)
        .map((f) => ({
          model_name: f.model.name,
          model_id: f.model.id,
          provider: f.providerName,
          input_per_1m: f.model.cost?.input,
          output_per_1m: f.model.cost?.output,
          context: f.model.limit.context,
          reasoning: f.model.reasoning,
          tool_call: f.model.tool_call,
        }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ total: results.length, cheapest: results }, null, 2),
          },
        ],
      };
    },
  );

  // 10. calculate_cost
  server.tool(
    "calculate_cost",
    "Calculate the estimated cost for a specific model and provider given token counts.",
    {
      model_name: z.string().describe("Model name or ID"),
      provider: z.string().optional().describe("Provider ID (optional, uses cheapest if omitted)"),
      input_tokens: z.number().describe("Number of input tokens"),
      output_tokens: z.number().describe("Number of output tokens"),
      cached_tokens: z.number().optional().default(0).describe("Number of cached tokens"),
    },
    async ({ model_name, provider, input_tokens, output_tokens, cached_tokens }) => {
      const flat = await getFlatModels();
      const q = model_name.toLowerCase();

      let matches = flat.filter(
        (f) =>
          f.model.name.toLowerCase().includes(q) ||
          f.model.id.toLowerCase().includes(q),
      );

      if (provider) {
        matches = matches.filter((f) => f.providerId === provider || f.providerName.toLowerCase() === provider.toLowerCase());
      }

      if (matches.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No model found matching "${model_name}"${provider ? ` at provider "${provider}"` : ""}`,
            },
          ],
        };
      }

      // Pick the first match with cost data, preferring the specified provider
      const match = matches.find((f) => f.model.cost) ?? matches[0];
      const cost = match.model.cost;

      if (!cost) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No pricing data available for "${match.model.name}" at ${match.providerName}.`,
            },
          ],
        };
      }

      const inputCost = (input_tokens / 1_000_000) * cost.input;
      const outputCost = (output_tokens / 1_000_000) * cost.output;
      const cacheCost = cost.cache_read ? (cached_tokens / 1_000_000) * cost.cache_read : 0;
      const totalCost = inputCost + outputCost + cacheCost;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                model: match.model.name,
                model_id: match.model.id,
                provider: match.providerName,
                rates: {
                  input_per_1m: cost.input,
                  output_per_1m: cost.output,
                  cache_read_per_1m: cost.cache_read ?? null,
                },
                usage: { input_tokens, output_tokens, cached_tokens },
                breakdown: {
                  input_cost: `$${inputCost.toFixed(4)}`,
                  output_cost: `$${outputCost.toFixed(4)}`,
                  cache_cost: `$${cacheCost.toFixed(4)}`,
                  total_cost: `$${totalCost.toFixed(4)}`,
                },
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // 11. get_free_models
  server.tool(
    "get_free_models",
    "List models that are free to use (cost = $0).",
    {
      limit: z.number().optional().default(30).describe("Max results"),
    },
    async ({ limit }) => {
      const flat = await getFlatModels();

      // Deduplicate by model name + provider
      const seen = new Set<string>();
      const free = flat
        .filter((f) => {
          if (!f.model.cost) return false;
          if (f.model.cost.input > 0 || f.model.cost.output > 0) return false;
          const key = `${f.model.name}__${f.providerId}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, limit)
        .map((f) => ({
          model_name: f.model.name,
          model_id: f.model.id,
          provider: f.providerName,
          context: f.model.limit.context,
          reasoning: f.model.reasoning,
          tool_call: f.model.tool_call,
        }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ total: free.length, free_models: free }, null, 2),
          },
        ],
      };
    },
  );

  // 12. price_comparison_table
  server.tool(
    "price_comparison_table",
    "Generate a formatted price comparison table for multiple models across providers.",
    {
      model_names: z
        .array(z.string())
        .describe("List of model names to compare"),
    },
    async ({ model_names }) => {
      const flat = await getFlatModels();

      const table = model_names.map((name) => {
        const q = name.toLowerCase();
        const matches = flat.filter(
          (f) =>
            f.model.name.toLowerCase().includes(q) ||
            f.model.id.toLowerCase().includes(q),
        );

        // Group by provider, pick cheapest per provider
        const byProvider = new Map<string, (typeof flat)[number]>();
        for (const m of matches) {
          const existing = byProvider.get(m.providerId);
          if (!existing || (m.model.cost?.input ?? Infinity) < (existing.model.cost?.input ?? Infinity)) {
            byProvider.set(m.providerId, m);
          }
        }

        const cheapest = [...byProvider.values()]
          .filter((f) => f.model.cost)
          .sort((a, b) => (a.model.cost?.input ?? Infinity) - (b.model.cost?.input ?? Infinity));

        return {
          model: name,
          matched_name: cheapest[0]?.model.name ?? name,
          providers: cheapest.slice(0, 5).map((f) => ({
            provider: f.providerName,
            input: f.model.cost?.input ?? null,
            output: f.model.cost?.output ?? null,
          })),
          cheapest_input: cheapest[0]?.model.cost?.input ?? null,
          cheapest_provider: cheapest[0]?.providerName ?? null,
          total_providers: matches.length,
        };
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ comparison: table }, null, 2),
          },
        ],
      };
    },
  );
}
