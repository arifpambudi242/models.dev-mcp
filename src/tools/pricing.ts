// Tools: Pricing & Cost Analysis

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getFlatModels } from "../data/fetcher.js";
import { convertCurrency, formatCurrencyValue } from "../data/currency.js";

export function registerPricingTools(server: McpServer): void {
  // 8. compare_pricing
  server.tool(
    "compare_pricing",
    "Compare pricing for the same model across different providers. Shows input/output cost per 1M tokens with optional currency conversion.",
    {
      model_name: z
        .string()
        .describe("Model name to search for (e.g., 'GPT-6 Sol', 'Claude Opus 5.5')"),
      currency: z
        .string()
        .optional()
        .describe("Optional target currency code for price conversion (e.g. IDR, EUR, JPY, GBP)"),
    },
    async ({ model_name, currency }) => {
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

      let exchangeRate: number | null = null;
      let targetCode: string | null = null;

      if (currency && currency.toUpperCase() !== "USD") {
        try {
          const conv = await convertCurrency(1, currency);
          exchangeRate = conv.rate;
          targetCode = conv.currency;
        } catch (e) {
          // ignore or fallback to USD
        }
      }

      const pricing = matches
        .map((f) => {
          const inputUsd = f.model.cost?.input ?? null;
          const outputUsd = f.model.cost?.output ?? null;

          let converted: Record<string, string> | null = null;
          if (exchangeRate && targetCode && inputUsd !== null && outputUsd !== null) {
            converted = {
              currency: targetCode,
              input_per_1m: formatCurrencyValue(inputUsd * exchangeRate, targetCode),
              output_per_1m: formatCurrencyValue(outputUsd * exchangeRate, targetCode),
            };
          }

          return {
            provider: f.providerName,
            provider_id: f.providerId,
            model_id: f.model.id,
            model_name: f.model.name,
            input_per_1m_usd: inputUsd,
            output_per_1m_usd: outputUsd,
            cache_read_per_1m_usd: f.model.cost?.cache_read ?? null,
            ...(converted ? { converted } : {}),
            context: f.model.limit.context,
            output_limit: f.model.limit.output,
          };
        })
        .sort((a, b) => (a.input_per_1m_usd ?? Infinity) - (b.input_per_1m_usd ?? Infinity));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                model: model_name,
                providers_found: pricing.length,
                currency: targetCode ?? "USD",
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
    "Find the cheapest model meeting specific requirements (reasoning, tool_call, min context, etc.) with optional currency conversion.",
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
      currency: z
        .string()
        .optional()
        .describe("Optional target currency code for conversion (e.g. IDR, EUR, JPY)"),
    },
    async ({ reasoning, tool_call, structured_output, min_context, modality_input, limit, currency }) => {
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

      let exchangeRate: number | null = null;
      let targetCode: string | null = null;

      if (currency && currency.toUpperCase() !== "USD") {
        try {
          const conv = await convertCurrency(1, currency);
          exchangeRate = conv.rate;
          targetCode = conv.currency;
        } catch (e) {
          // ignore
        }
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
        .map((f) => {
          const inputUsd = f.model.cost?.input ?? 0;
          const outputUsd = f.model.cost?.output ?? 0;

          return {
            model_name: f.model.name,
            model_id: f.model.id,
            provider: f.providerName,
            input_per_1m_usd: inputUsd,
            output_per_1m_usd: outputUsd,
            ...(exchangeRate && targetCode
              ? {
                  converted: {
                    currency: targetCode,
                    input_per_1m: formatCurrencyValue(inputUsd * exchangeRate, targetCode),
                    output_per_1m: formatCurrencyValue(outputUsd * exchangeRate, targetCode),
                  },
                }
              : {}),
            context: f.model.limit.context,
            reasoning: f.model.reasoning,
            tool_call: f.model.tool_call,
          };
        });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ total: results.length, currency: targetCode ?? "USD", cheapest: results }, null, 2),
          },
        ],
      };
    },
  );

  // 10. calculate_cost
  server.tool(
    "calculate_cost",
    "Calculate the estimated cost for a specific model and provider given token counts, with optional currency conversion.",
    {
      model_name: z.string().describe("Model name or ID"),
      provider: z.string().optional().describe("Provider ID (optional, uses cheapest if omitted)"),
      input_tokens: z.number().describe("Number of input tokens"),
      output_tokens: z.number().describe("Number of output tokens"),
      cached_tokens: z.number().optional().default(0).describe("Number of cached tokens"),
      currency: z
        .string()
        .optional()
        .describe("Target currency code for cost conversion (e.g. IDR, EUR, JPY, GBP)"),
    },
    async ({ model_name, provider, input_tokens, output_tokens, cached_tokens, currency }) => {
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

      const inputCostUsd = (input_tokens / 1_000_000) * cost.input;
      const outputCostUsd = (output_tokens / 1_000_000) * cost.output;
      const cacheCostUsd = cost.cache_read ? (cached_tokens / 1_000_000) * cost.cache_read : 0;
      const totalCostUsd = inputCostUsd + outputCostUsd + cacheCostUsd;

      let convertedBreakdown: Record<string, string> | null = null;
      let currencyCode = "USD";

      if (currency && currency.toUpperCase() !== "USD") {
        try {
          const conv = await convertCurrency(totalCostUsd, currency);
          currencyCode = conv.currency;
          const rate = conv.rate;

          convertedBreakdown = {
            currency: currencyCode,
            input_cost: formatCurrencyValue(inputCostUsd * rate, currencyCode),
            output_cost: formatCurrencyValue(outputCostUsd * rate, currencyCode),
            cache_cost: formatCurrencyValue(cacheCostUsd * rate, currencyCode),
            total_cost: conv.formatted,
          };
        } catch (e) {
          // ignore
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                model: match.model.name,
                model_id: match.model.id,
                provider: match.providerName,
                rates_usd: {
                  input_per_1m: cost.input,
                  output_per_1m: cost.output,
                  cache_read_per_1m: cost.cache_read ?? null,
                },
                usage: { input_tokens, output_tokens, cached_tokens },
                breakdown_usd: {
                  input_cost: `$${inputCostUsd.toFixed(4)}`,
                  output_cost: `$${outputCostUsd.toFixed(4)}`,
                  cache_cost: `$${cacheCostUsd.toFixed(4)}`,
                  total_cost: `$${totalCostUsd.toFixed(4)}`,
                },
                ...(convertedBreakdown ? { breakdown_converted: convertedBreakdown } : {}),
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
    "Generate a formatted price comparison table for multiple models across providers with optional currency conversion.",
    {
      model_names: z
        .array(z.string())
        .describe("List of model names to compare"),
      currency: z
        .string()
        .optional()
        .describe("Optional target currency code (e.g. IDR, EUR, JPY)"),
    },
    async ({ model_names, currency }) => {
      const flat = await getFlatModels();

      let exchangeRate: number | null = null;
      let targetCode: string | null = null;

      if (currency && currency.toUpperCase() !== "USD") {
        try {
          const conv = await convertCurrency(1, currency);
          exchangeRate = conv.rate;
          targetCode = conv.currency;
        } catch (e) {
          // ignore
        }
      }

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

        const cheapestInputUsd = cheapest[0]?.model.cost?.input ?? null;

        return {
          model: name,
          matched_name: cheapest[0]?.model.name ?? name,
          providers: cheapest.slice(0, 5).map((f) => {
            const inpUsd = f.model.cost?.input ?? null;
            const outUsd = f.model.cost?.output ?? null;
            return {
              provider: f.providerName,
              input_usd: inpUsd,
              output_usd: outUsd,
              ...(exchangeRate && targetCode && inpUsd !== null && outUsd !== null
                ? {
                    converted: {
                      currency: targetCode,
                      input: formatCurrencyValue(inpUsd * exchangeRate, targetCode),
                      output: formatCurrencyValue(outUsd * exchangeRate, targetCode),
                    },
                  }
                : {}),
            };
          }),
          cheapest_input_usd: cheapestInputUsd,
          ...(exchangeRate && targetCode && cheapestInputUsd !== null
            ? {
                cheapest_input_converted: formatCurrencyValue(cheapestInputUsd * exchangeRate, targetCode),
              }
            : {}),
          cheapest_provider: cheapest[0]?.providerName ?? null,
          total_providers: matches.length,
        };
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ currency: targetCode ?? "USD", comparison: table }, null, 2),
          },
        ],
      };
    },
  );

  // 13. estimate_app_budget
  server.tool(
    "estimate_app_budget",
    "Estimate total operational AI cost for an app based on DAU (Daily Active Users), turns per user, and token usage (Daily, Weekly, Monthly, Yearly).",
    {
      model_name: z.string().describe("Model name or ID (e.g. 'Claude 3.5 Sonnet', 'GPT-4o', 'DeepSeek V3')"),
      provider: z.string().optional().describe("Provider ID (optional, uses cheapest/default if omitted)"),
      dau: z.number().default(1000).describe("Daily Active Users (DAU)"),
      turns_per_user_daily: z.number().default(5).describe("Average turns/messages per user per day"),
      input_tokens_per_turn: z.number().default(500).describe("Average input tokens per turn"),
      output_tokens_per_turn: z.number().default(200).describe("Average output tokens per turn"),
      cache_hit_ratio: z.number().optional().default(0).describe("Ratio of input tokens hitting prompt cache (0.0 to 1.0)"),
      currency: z.string().optional().describe("Target currency code for cost conversion (e.g. IDR, EUR, JPY, GBP)"),
    },
    async ({
      model_name,
      provider,
      dau,
      turns_per_user_daily,
      input_tokens_per_turn,
      output_tokens_per_turn,
      cache_hit_ratio,
      currency,
    }) => {
      const flat = await getFlatModels();
      const q = model_name.toLowerCase();

      let matches = flat.filter(
        (f) =>
          f.model.name.toLowerCase().includes(q) ||
          f.model.id.toLowerCase().includes(q),
      );

      if (provider) {
        matches = matches.filter(
          (f) =>
            f.providerId === provider ||
            f.providerName.toLowerCase() === provider.toLowerCase(),
        );
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

      const dailyTurns = dau * turns_per_user_daily;
      const dailyInputTokens = dailyTurns * input_tokens_per_turn;
      const dailyOutputTokens = dailyTurns * output_tokens_per_turn;

      const cachedTokens = dailyInputTokens * Math.min(Math.max(cache_hit_ratio, 0), 1);
      const uncachedInputTokens = dailyInputTokens - cachedTokens;

      const inputCostDaily = (uncachedInputTokens / 1_000_000) * cost.input;
      const cacheCostDaily = cost.cache_read ? (cachedTokens / 1_000_000) * cost.cache_read : 0;
      const outputCostDaily = (dailyOutputTokens / 1_000_000) * cost.output;
      const totalCostDailyUsd = inputCostDaily + cacheCostDaily + outputCostDaily;

      const totalCostWeeklyUsd = totalCostDailyUsd * 7;
      const totalCostMonthlyUsd = totalCostDailyUsd * 30;
      const totalCostYearlyUsd = totalCostDailyUsd * 365;

      let converted: Record<string, string> | null = null;
      let targetCode = "USD";

      if (currency && currency.toUpperCase() !== "USD") {
        try {
          const conv = await convertCurrency(1, currency);
          const rate = conv.rate;
          targetCode = conv.currency;

          converted = {
            currency: targetCode,
            exchange_rate_per_usd: formatCurrencyValue(rate, targetCode),
            daily: formatCurrencyValue(totalCostDailyUsd * rate, targetCode),
            weekly: formatCurrencyValue(totalCostWeeklyUsd * rate, targetCode),
            monthly: formatCurrencyValue(totalCostMonthlyUsd * rate, targetCode),
            yearly: formatCurrencyValue(totalCostYearlyUsd * rate, targetCode),
          };
        } catch (e) {
          // ignore
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                model: match.model.name,
                model_id: match.model.id,
                provider: match.providerName,
                parameters: {
                  dau,
                  turns_per_user_daily,
                  input_tokens_per_turn,
                  output_tokens_per_turn,
                  cache_hit_ratio: `${(cache_hit_ratio * 100).toFixed(0)}%`,
                  total_daily_turns: dailyTurns.toLocaleString(),
                  total_daily_input_tokens: dailyInputTokens.toLocaleString(),
                  total_daily_output_tokens: dailyOutputTokens.toLocaleString(),
                },
                rates_per_1m_usd: {
                  input: cost.input,
                  output: cost.output,
                  cache_read: cost.cache_read ?? null,
                },
                estimated_cost_usd: {
                  daily: `$${totalCostDailyUsd.toFixed(2)}`,
                  weekly: `$${totalCostWeeklyUsd.toFixed(2)}`,
                  monthly: `$${totalCostMonthlyUsd.toFixed(2)}`,
                  yearly: `$${totalCostYearlyUsd.toFixed(2)}`,
                },
                ...(converted ? { estimated_cost_converted: converted } : {}),
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
