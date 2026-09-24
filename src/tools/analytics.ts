// Tools: Analytics & Insights

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getUniqueModels, getProviders, getFlatModels } from "../data/fetcher.js";

export function registerAnalyticsTools(server: McpServer): void {
  // 28. get_market_overview
  server.tool(
    "get_market_overview",
    "Get a high-level market overview: total models, providers, labs, average pricing, modality distribution, etc.",
    {},
    async () => {
      const models = await getUniqueModels();
      const providers = await getProviders();
      const flat = await getFlatModels();

      // Count unique labs (from model IDs: lab/model-name)
      const labs = new Set(models.map((m) => m.id.split("/")[0]).filter(Boolean));

      // Capability stats
      const withReasoning = models.filter((m) => m.reasoning).length;
      const withToolCall = models.filter((m) => m.tool_call).length;
      const withStructured = models.filter((m) => m.structured_output).length;
      const openWeight = models.filter((m) => m.open_weights).length;

      // Pricing stats
      const priced = flat.filter((f) => f.model.cost && f.model.cost.input > 0);
      const inputPrices = priced.map((f) => f.model.cost!.input);
      const avgInput = inputPrices.length > 0
        ? inputPrices.reduce((a, b) => a + b, 0) / inputPrices.length
        : 0;
      const medianInput = inputPrices.length > 0
        ? inputPrices.sort((a, b) => a - b)[Math.floor(inputPrices.length / 2)]
        : 0;

      // Modality stats
      const modalityCounts: Record<string, number> = {};
      for (const m of models) {
        for (const mod of m.modalities.input) {
          modalityCounts[mod] = (modalityCounts[mod] ?? 0) + 1;
        }
      }

      // Context window stats
      const contexts = models
        .map((m) => m.limit.context)
        .filter((c): c is number => c != null && c > 0);
      const avgContext = contexts.length > 0
        ? Math.round(contexts.reduce((a, b) => a + b, 0) / contexts.length)
        : 0;
      const maxContext = Math.max(...(contexts.length > 0 ? contexts : [0]));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                overview: {
                  total_unique_models: models.length,
                  total_providers: providers.length,
                  total_labs: labs.size,
                  total_provider_model_entries: flat.length,
                },
                capabilities: {
                  with_reasoning: withReasoning,
                  with_tool_call: withToolCall,
                  with_structured_output: withStructured,
                  open_weight: openWeight,
                  closed_weight: models.length - openWeight,
                },
                pricing: {
                  avg_input_per_1m: `$${avgInput.toFixed(2)}`,
                  median_input_per_1m: `$${medianInput.toFixed(2)}`,
                  total_with_pricing: priced.length,
                },
                context_windows: {
                  avg_context: avgContext.toLocaleString(),
                  max_context: maxContext.toLocaleString(),
                },
                modality_support: modalityCounts,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // 29. get_lab_summary
  server.tool(
    "get_lab_summary",
    "Get a summary for a specific AI lab: model count, families, avg context, capabilities overview.",
    {
      lab: z.string().describe("Lab name or ID (e.g., 'openai', 'anthropic', 'google')"),
    },
    async ({ lab }) => {
      const models = await getUniqueModels();
      const q = lab.toLowerCase();

      const labModels = models.filter((m) => {
        const labId = m.id.split("/")[0];
        return labId.toLowerCase() === q || labId.toLowerCase().includes(q);
      });

      if (labModels.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No models found for lab "${lab}".`,
            },
          ],
        };
      }

      const families = [...new Set(labModels.map((m) => m.family).filter(Boolean))];
      const contexts = labModels
        .map((m) => m.limit.context)
        .filter((c): c is number => c != null);
      const avgContext = contexts.length > 0
        ? Math.round(contexts.reduce((a, b) => a + b, 0) / contexts.length)
        : 0;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                lab: labModels[0].id.split("/")[0],
                total_models: labModels.length,
                families,
                avg_context: avgContext,
                with_reasoning: labModels.filter((m) => m.reasoning).length,
                with_tool_call: labModels.filter((m) => m.tool_call).length,
                open_weight: labModels.filter((m) => m.open_weights).length,
                latest_release: labModels
                  .map((m) => m.release_date)
                  .filter(Boolean)
                  .sort()
                  .pop() ?? null,
                models: labModels.map((m) => ({
                  id: m.id,
                  name: m.name,
                  family: m.family,
                  context: m.limit.context,
                  reasoning: m.reasoning,
                  release_date: m.release_date,
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

  // 30. get_context_leaders
  server.tool(
    "get_context_leaders",
    "Rank models by context window size (largest first).",
    {
      limit: z.number().optional().default(15),
    },
    async ({ limit }) => {
      const models = await getUniqueModels();

      const sorted = [...models]
        .filter((m) => m.limit.context != null && m.limit.context > 0)
        .sort((a, b) => (b.limit.context ?? 0) - (a.limit.context ?? 0))
        .slice(0, limit);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                total: sorted.length,
                context_leaders: sorted.map((m, i) => ({
                  rank: i + 1,
                  id: m.id,
                  name: m.name,
                  context: m.limit.context,
                  output_limit: m.limit.output,
                  family: m.family,
                  open_weights: m.open_weights,
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

  // 31. get_price_distribution
  server.tool(
    "get_price_distribution",
    "Get the distribution of input/output prices across all models (min, max, avg, median, percentiles).",
    {},
    async () => {
      const flat = await getFlatModels();

      const inputPrices = flat
        .filter((f) => f.model.cost && f.model.cost.input > 0)
        .map((f) => f.model.cost!.input)
        .sort((a, b) => a - b);

      const outputPrices = flat
        .filter((f) => f.model.cost && f.model.cost.output > 0)
        .map((f) => f.model.cost!.output)
        .sort((a, b) => a - b);

      const percentile = (arr: number[], p: number) =>
        arr.length > 0 ? arr[Math.floor(arr.length * p)] : 0;

      const stats = (arr: number[], label: string) => ({
        label,
        count: arr.length,
        min: arr[0] ?? 0,
        max: arr[arr.length - 1] ?? 0,
        avg: arr.length > 0 ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : 0,
        median: percentile(arr, 0.5),
        p25: percentile(arr, 0.25),
        p75: percentile(arr, 0.75),
        p90: percentile(arr, 0.9),
      });

      // Price brackets
      const brackets = [
        { label: "Free ($0)", count: flat.filter((f) => f.model.cost && f.model.cost.input === 0).length },
        { label: "Ultra cheap ($0.01-$0.50)", count: inputPrices.filter((p) => p > 0 && p <= 0.5).length },
        { label: "Cheap ($0.50-$2)", count: inputPrices.filter((p) => p > 0.5 && p <= 2).length },
        { label: "Moderate ($2-$5)", count: inputPrices.filter((p) => p > 2 && p <= 5).length },
        { label: "Premium ($5-$15)", count: inputPrices.filter((p) => p > 5 && p <= 15).length },
        { label: "Expensive ($15+)", count: inputPrices.filter((p) => p > 15).length },
      ];

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                input_prices: stats(inputPrices, "Input price per 1M tokens"),
                output_prices: stats(outputPrices, "Output price per 1M tokens"),
                price_brackets: brackets,
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
