// Tools: Model Discovery & Search

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  getUniqueModels,
  getBaseModel,
  getFlatModels,
} from "../data/fetcher.js";

export function registerDiscoveryTools(server: McpServer): void {
  // 1. search_models
  server.tool(
    "search_models",
    "Search models by name, lab, family, or keyword in description. Supports fuzzy matching.",
    {
      query: z.string().describe("Search query (model name, lab, keyword)"),
      limit: z.number().optional().default(20).describe("Max results to return"),
    },
    async ({ query, limit }) => {
      const models = await getUniqueModels();
      const q = query.toLowerCase();

      const results = models
        .filter((m) => {
          const searchable = [
            m.id,
            m.name,
            m.description ?? "",
            m.family ?? "",
          ]
            .join(" ")
            .toLowerCase();
          return searchable.includes(q);
        })
        .slice(0, limit);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                total: results.length,
                query,
                models: results.map((m) => ({
                  id: m.id,
                  name: m.name,
                  description: m.description,
                  family: m.family,
                  context: m.limit.context,
                  reasoning: m.reasoning,
                  tool_call: m.tool_call,
                  open_weights: m.open_weights,
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

  // 2. list_models
  server.tool(
    "list_models",
    "List all models with pagination and sorting. Sort by name, context, release_date, or family.",
    {
      sort_by: z
        .enum(["name", "context", "release_date", "family"])
        .optional()
        .default("release_date")
        .describe("Sort field"),
      order: z
        .enum(["asc", "desc"])
        .optional()
        .default("desc")
        .describe("Sort order"),
      offset: z.number().optional().default(0).describe("Pagination offset"),
      limit: z.number().optional().default(20).describe("Results per page"),
    },
    async ({ sort_by, order, offset, limit }) => {
      const models = await getUniqueModels();

      const sorted = [...models].sort((a, b) => {
        let cmp = 0;
        switch (sort_by) {
          case "name":
            cmp = a.name.localeCompare(b.name);
            break;
          case "context":
            cmp = (a.limit.context ?? 0) - (b.limit.context ?? 0);
            break;
          case "release_date":
            cmp = (a.release_date ?? "").localeCompare(b.release_date ?? "");
            break;
          case "family":
            cmp = (a.family ?? "").localeCompare(b.family ?? "");
            break;
        }
        return order === "desc" ? -cmp : cmp;
      });

      const page = sorted.slice(offset, offset + limit);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                total: models.length,
                offset,
                limit,
                sort_by,
                order,
                models: page.map((m) => ({
                  id: m.id,
                  name: m.name,
                  family: m.family,
                  context: m.limit.context,
                  output: m.limit.output,
                  reasoning: m.reasoning,
                  tool_call: m.tool_call,
                  open_weights: m.open_weights,
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

  // 3. get_model
  server.tool(
    "get_model",
    "Get full details of a model by its ID (e.g., 'openai/gpt-6-sol', 'anthropic/claude-opus-5-5').",
    {
      model_id: z.string().describe("Model ID (e.g., 'openai/gpt-6-sol')"),
    },
    async ({ model_id }) => {
      const model = await getBaseModel(model_id);

      if (!model) {
        // Try fuzzy match
        const all = await getUniqueModels();
        const q = model_id.toLowerCase();
        const match = all.find(
          (m) =>
            m.id.toLowerCase() === q ||
            m.name.toLowerCase() === q ||
            m.id.toLowerCase().includes(q),
        );
        if (match) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(match, null, 2),
              },
            ],
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: `Model "${model_id}" not found. Use search_models to find the correct ID.`,
            },
          ],
        };
      }

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(model, null, 2) },
        ],
      };
    },
  );

  // 4. list_model_families
  server.tool(
    "list_model_families",
    "List all model families (e.g., gpt, claude, gemini, qwen, llama) with model count per family.",
    {},
    async () => {
      const models = await getUniqueModels();
      const families = new Map<string, number>();

      for (const m of models) {
        const family = m.family ?? "unknown";
        families.set(family, (families.get(family) ?? 0) + 1);
      }

      const sorted = [...families.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([family, count]) => ({ family, model_count: count }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { total_families: sorted.length, families: sorted },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // 5. get_models_by_family
  server.tool(
    "get_models_by_family",
    "Get all models in a given family (e.g., 'gpt', 'claude', 'gemini', 'llama').",
    {
      family: z.string().describe("Model family name (e.g., 'gpt', 'claude')"),
    },
    async ({ family }) => {
      const models = await getUniqueModels();
      const f = family.toLowerCase();
      const results = models.filter(
        (m) => (m.family ?? "").toLowerCase() === f,
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                family,
                total: results.length,
                models: results.map((m) => ({
                  id: m.id,
                  name: m.name,
                  context: m.limit.context,
                  reasoning: m.reasoning,
                  open_weights: m.open_weights,
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

  // 6. get_latest_models
  server.tool(
    "get_latest_models",
    "Get models released or updated within the last N days.",
    {
      days: z
        .number()
        .optional()
        .default(7)
        .describe("Number of days to look back"),
      limit: z
        .number()
        .optional()
        .default(20)
        .describe("Max results"),
    },
    async ({ days, limit }) => {
      const models = await getUniqueModels();
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffStr = cutoff.toISOString().slice(0, 10);

      const recent = models
        .filter((m) => {
          const date = m.last_updated ?? m.release_date ?? "";
          return date >= cutoffStr;
        })
        .sort((a, b) => {
          const da = a.last_updated ?? a.release_date ?? "";
          const db = b.last_updated ?? b.release_date ?? "";
          return db.localeCompare(da);
        })
        .slice(0, limit);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                days,
                cutoff_date: cutoffStr,
                total: recent.length,
                models: recent.map((m) => ({
                  id: m.id,
                  name: m.name,
                  family: m.family,
                  release_date: m.release_date,
                  last_updated: m.last_updated,
                  context: m.limit.context,
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

  // 7. get_trending_models
  server.tool(
    "get_trending_models",
    "Get the most popular models ranked by number of providers offering them.",
    {
      limit: z.number().optional().default(15).describe("Max results"),
    },
    async ({ limit }) => {
      const flat = await getFlatModels();
      const counts = new Map<string, { name: string; count: number }>();

      for (const f of flat) {
        const key = f.model.name;
        const existing = counts.get(key);
        if (existing) {
          existing.count++;
        } else {
          counts.set(key, { name: f.model.name, count: 1 });
        }
      }

      const sorted = [...counts.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, limit)
        .map(([, v], i) => ({
          rank: i + 1,
          model_name: v.name,
          provider_count: v.count,
        }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { total: sorted.length, trending: sorted },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
