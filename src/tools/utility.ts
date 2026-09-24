// Tools: Utility & Data

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getUniqueModels, getFlatModels } from "../data/fetcher.js";

export function registerUtilityTools(server: McpServer): void {
  // 32. get_model_schema
  server.tool(
    "get_model_schema",
    "Get the JSON schema/structure of the model data format used by models.dev.",
    {},
    async () => {
      const schema = {
        description: "Models.dev model data schema",
        model_fields: {
          id: "string — Unique model identifier (lab/model-name)",
          name: "string — Display name",
          description: "string? — Brief description",
          family: "string? — Model family (gpt, claude, gemini, etc.)",
          attachment: "boolean — Supports file attachments",
          reasoning: "boolean — Has reasoning capability",
          reasoning_options: "array? — Reasoning config options [{type: 'toggle'|'budget_tokens'|'effort', values?: string[]}]",
          tool_call: "boolean — Supports tool/function calling",
          structured_output: "boolean? — Supports structured JSON output",
          temperature: "boolean — Supports temperature parameter",
          release_date: "string? — Release date (YYYY-MM-DD)",
          last_updated: "string? — Last update date (YYYY-MM-DD)",
          knowledge: "string? — Knowledge cutoff (YYYY-MM)",
          modalities: {
            input: "string[] — Input types: text, image, video, audio, pdf",
            output: "string[] — Output types: text, image",
          },
          open_weights: "boolean — Model weights publicly available",
          license: "string? — License (Apache-2.0, MIT, etc.)",
          limit: {
            context: "number — Max context window (tokens)",
            input: "number? — Max input tokens",
            output: "number? — Max output tokens",
          },
          cost: {
            input: "number — Price per 1M input tokens (USD)",
            output: "number — Price per 1M output tokens (USD)",
            cache_read: "number? — Price per 1M cached tokens (USD)",
          },
          links: "[{label, url, type?}]? — Related links (papers, docs)",
          weights: "[{label, url, format?}]? — Weight download links",
          benchmarks: "[{name, score, metric?, source?}]? — Benchmark results",
        },
        provider_fields: {
          id: "string — Provider identifier",
          name: "string — Provider display name",
          npm: "string? — AI SDK npm package name",
          env: "string[]? — Required environment variable names",
          api: "string? — API base URL (for OpenAI-compatible providers)",
          doc: "string? — Documentation URL",
        },
        api_endpoints: {
          "api.json": "Full data: providers with nested models (https://models.dev/api.json)",
          "models.json": "Provider-agnostic model metadata (https://models.dev/models.json)",
          "catalog.json": "Combined provider + model data (https://models.dev/catalog.json)",
        },
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(schema, null, 2),
          },
        ],
      };
    },
  );

  // 33. get_changelog
  server.tool(
    "get_changelog",
    "Get models that were added or updated within a specific date range.",
    {
      start_date: z
        .string()
        .optional()
        .describe("Start date (YYYY-MM-DD). Defaults to 7 days ago."),
      end_date: z
        .string()
        .optional()
        .describe("End date (YYYY-MM-DD). Defaults to today."),
    },
    async ({ start_date, end_date }) => {
      const models = await getUniqueModels();

      const now = new Date();
      const defaultStart = new Date();
      defaultStart.setDate(defaultStart.getDate() - 7);

      const start = start_date ?? defaultStart.toISOString().slice(0, 10);
      const end = end_date ?? now.toISOString().slice(0, 10);

      const added = models.filter((m) => {
        const rd = m.release_date ?? "";
        return rd >= start && rd <= end;
      });

      const updated = models.filter((m) => {
        const lu = m.last_updated ?? "";
        const rd = m.release_date ?? "";
        return lu >= start && lu <= end && lu !== rd;
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                date_range: { start, end },
                newly_added: {
                  count: added.length,
                  models: added
                    .sort((a, b) => (b.release_date ?? "").localeCompare(a.release_date ?? ""))
                    .map((m) => ({
                      id: m.id,
                      name: m.name,
                      release_date: m.release_date,
                    })),
                },
                updated: {
                  count: updated.length,
                  models: updated
                    .sort((a, b) => (b.last_updated ?? "").localeCompare(a.last_updated ?? ""))
                    .map((m) => ({
                      id: m.id,
                      name: m.name,
                      last_updated: m.last_updated,
                    })),
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

  // 34. get_model_benchmarks
  server.tool(
    "get_model_benchmarks",
    "Get benchmark scores for a specific model, if available.",
    {
      model_id: z.string().describe("Model ID (e.g., 'meta/llama-4-405b')"),
    },
    async ({ model_id }) => {
      const models = await getUniqueModels();
      const q = model_id.toLowerCase();

      const model = models.find(
        (m) =>
          m.id.toLowerCase() === q ||
          m.name.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q),
      );

      if (!model) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Model "${model_id}" not found.`,
            },
          ],
        };
      }

      if (!model.benchmarks || model.benchmarks.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  model: model.name,
                  model_id: model.id,
                  benchmarks: [],
                  message: "No benchmark data available for this model.",
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
                model: model.name,
                model_id: model.id,
                benchmarks: model.benchmarks,
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
