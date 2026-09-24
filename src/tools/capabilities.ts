// Tools: Capability Filtering & Comparison

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getUniqueModels, getFlatModels } from "../data/fetcher.js";

export function registerCapabilityTools(server: McpServer): void {
  // 18. filter_models
  server.tool(
    "filter_models",
    "Filter models by multiple criteria: reasoning, tool_call, modalities, context size, price range, open weights, etc.",
    {
      reasoning: z.boolean().optional().describe("Requires reasoning"),
      tool_call: z.boolean().optional().describe("Requires tool calling"),
      structured_output: z.boolean().optional().describe("Requires structured output"),
      temperature: z.boolean().optional().describe("Supports temperature control"),
      open_weights: z.boolean().optional().describe("Open weights only"),
      modality_input: z
        .array(z.string())
        .optional()
        .describe("Required input modalities (e.g., ['text', 'image'])"),
      modality_output: z
        .array(z.string())
        .optional()
        .describe("Required output modalities"),
      context_min: z.number().optional().describe("Minimum context window"),
      context_max: z.number().optional().describe("Maximum context window"),
      family: z.string().optional().describe("Filter by model family"),
      sort_by: z
        .enum(["name", "context", "release_date"])
        .optional()
        .default("context")
        .describe("Sort field"),
      order: z.enum(["asc", "desc"]).optional().default("desc"),
      limit: z.number().optional().default(20).describe("Max results"),
    },
    async (params) => {
      let models = await getUniqueModels();

      if (params.reasoning !== undefined) models = models.filter((m) => m.reasoning === params.reasoning);
      if (params.tool_call !== undefined) models = models.filter((m) => m.tool_call === params.tool_call);
      if (params.structured_output !== undefined) models = models.filter((m) => m.structured_output === params.structured_output);
      if (params.temperature !== undefined) models = models.filter((m) => m.temperature === params.temperature);
      if (params.open_weights !== undefined) models = models.filter((m) => m.open_weights === params.open_weights);
      if (params.family) {
        const fam = params.family.toLowerCase();
        models = models.filter((m) => (m.family ?? "").toLowerCase() === fam);
      }
      if (params.modality_input) {
        models = models.filter((m) =>
          params.modality_input!.every((mod) => m.modalities.input.includes(mod)),
        );
      }
      if (params.modality_output) {
        models = models.filter((m) =>
          params.modality_output!.every((mod) => m.modalities.output.includes(mod)),
        );
      }
      if (params.context_min) models = models.filter((m) => (m.limit.context ?? 0) >= params.context_min!);
      if (params.context_max) models = models.filter((m) => (m.limit.context ?? Infinity) <= params.context_max!);

      const sorted = [...models].sort((a, b) => {
        let cmp = 0;
        switch (params.sort_by) {
          case "name":
            cmp = a.name.localeCompare(b.name);
            break;
          case "context":
            cmp = (a.limit.context ?? 0) - (b.limit.context ?? 0);
            break;
          case "release_date":
            cmp = (a.release_date ?? "").localeCompare(b.release_date ?? "");
            break;
        }
        return params.order === "desc" ? -cmp : cmp;
      });

      const page = sorted.slice(0, params.limit);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                total_matched: models.length,
                showing: page.length,
                filters_applied: Object.entries(params)
                  .filter(([k, v]) => v !== undefined && !["sort_by", "order", "limit"].includes(k))
                  .map(([k, v]) => `${k}=${JSON.stringify(v)}`),
                models: page.map((m) => ({
                  id: m.id,
                  name: m.name,
                  family: m.family,
                  context: m.limit.context,
                  output: m.limit.output,
                  reasoning: m.reasoning,
                  tool_call: m.tool_call,
                  structured_output: m.structured_output,
                  open_weights: m.open_weights,
                  modalities_input: m.modalities.input,
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

  // 19. compare_models
  server.tool(
    "compare_models",
    "Compare 2-5 models side-by-side on specs, capabilities, pricing, and context limits.",
    {
      model_ids: z
        .array(z.string())
        .min(2)
        .max(5)
        .describe("List of model IDs to compare (e.g., ['openai/gpt-6-sol', 'anthropic/claude-opus-5-5'])"),
    },
    async ({ model_ids }) => {
      const allModels = await getUniqueModels();
      const flat = await getFlatModels();

      const comparison = model_ids.map((id) => {
        const q = id.toLowerCase();
        const base = allModels.find(
          (m) => m.id.toLowerCase() === q || m.name.toLowerCase().includes(q),
        );

        // Find cheapest provider price
        const providerEntries = flat.filter(
          (f) =>
            f.model.name.toLowerCase().includes(q) ||
            f.model.id.toLowerCase().includes(q),
        );
        const cheapest = providerEntries
          .filter((f) => f.model.cost)
          .sort((a, b) => (a.model.cost?.input ?? Infinity) - (b.model.cost?.input ?? Infinity))[0];

        if (!base) {
          return { id, error: "Model not found" };
        }

        return {
          id: base.id,
          name: base.name,
          family: base.family,
          context: base.limit.context,
          output_limit: base.limit.output,
          reasoning: base.reasoning,
          tool_call: base.tool_call,
          structured_output: base.structured_output,
          temperature: base.temperature,
          open_weights: base.open_weights,
          modalities_input: base.modalities.input,
          modalities_output: base.modalities.output,
          release_date: base.release_date,
          knowledge_cutoff: base.knowledge,
          license: base.license,
          cheapest_price: cheapest
            ? {
                provider: cheapest.providerName,
                input_per_1m: cheapest.model.cost?.input,
                output_per_1m: cheapest.model.cost?.output,
              }
            : null,
          total_providers: providerEntries.length,
        };
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ comparison }, null, 2),
          },
        ],
      };
    },
  );

  // 20. find_best_model_for
  server.tool(
    "find_best_model_for",
    "Recommend the best models for a specific use case: coding, chat, vision, agents, summarization, etc.",
    {
      use_case: z
        .enum(["coding", "chat", "vision", "agents", "summarization", "reasoning", "multimodal", "embedding"])
        .describe("Use case to optimize for"),
      budget: z
        .enum(["free", "cheap", "moderate", "premium", "any"])
        .optional()
        .default("any")
        .describe("Budget preference"),
      limit: z.number().optional().default(10),
    },
    async ({ use_case, budget, limit }) => {
      const flat = await getFlatModels();

      // Define use-case requirements
      const requirements: Record<string, (f: (typeof flat)[number]) => boolean> = {
        coding: (f) => f.model.tool_call && (f.model.limit.context ?? 0) >= 32000,
        chat: (f) => f.model.temperature && (f.model.limit.context ?? 0) >= 8000,
        vision: (f) => f.model.modalities.input.includes("image"),
        agents: (f) => f.model.tool_call && f.model.reasoning && (f.model.limit.context ?? 0) >= 64000,
        summarization: (f) => (f.model.limit.context ?? 0) >= 100000,
        reasoning: (f) => f.model.reasoning,
        multimodal: (f) => f.model.modalities.input.length > 1,
        embedding: () => true, // all models
      };

      let filtered = flat.filter(requirements[use_case] ?? (() => true));

      // Budget filter
      if (budget === "free") {
        filtered = filtered.filter((f) => f.model.cost && f.model.cost.input === 0);
      } else if (budget === "cheap") {
        filtered = filtered.filter((f) => f.model.cost && f.model.cost.input <= 1);
      } else if (budget === "moderate") {
        filtered = filtered.filter((f) => f.model.cost && f.model.cost.input <= 5);
      } else if (budget === "premium") {
        filtered = filtered.filter((f) => f.model.cost && f.model.cost.input > 5);
      }

      // Deduplicate by model name
      const seen = new Map<string, (typeof flat)[number]>();
      for (const f of filtered) {
        const existing = seen.get(f.model.name);
        if (!existing || (f.model.cost?.input ?? Infinity) < (existing.model.cost?.input ?? Infinity)) {
          seen.set(f.model.name, f);
        }
      }

      // Score and rank
      const scored = [...seen.values()]
        .map((f) => {
          let score = 0;
          if (f.model.reasoning) score += 3;
          if (f.model.tool_call) score += 2;
          if (f.model.structured_output) score += 1;
          if ((f.model.limit.context ?? 0) >= 200000) score += 2;
          else if ((f.model.limit.context ?? 0) >= 100000) score += 1;
          if (f.model.modalities.input.length > 1) score += 1;
          return { flat: f, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                use_case,
                budget,
                total: scored.length,
                recommendations: scored.map((s, i) => ({
                  rank: i + 1,
                  model_name: s.flat.model.name,
                  model_id: s.flat.model.id,
                  provider: s.flat.providerName,
                  relevance_score: s.score,
                  context: s.flat.model.limit.context,
                  reasoning: s.flat.model.reasoning,
                  tool_call: s.flat.model.tool_call,
                  input_cost: s.flat.model.cost?.input ?? null,
                  output_cost: s.flat.model.cost?.output ?? null,
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

  // 21. get_multimodal_models
  server.tool(
    "get_multimodal_models",
    "Find models supporting specific input/output modalities (text, image, video, audio, pdf).",
    {
      input_modality: z
        .string()
        .optional()
        .describe("Required input modality (e.g., 'image', 'video', 'audio')"),
      output_modality: z
        .string()
        .optional()
        .describe("Required output modality (e.g., 'image')"),
      limit: z.number().optional().default(20),
    },
    async ({ input_modality, output_modality, limit }) => {
      let models = await getUniqueModels();

      if (input_modality) {
        models = models.filter((m) => m.modalities.input.includes(input_modality));
      }
      if (output_modality) {
        models = models.filter((m) => m.modalities.output.includes(output_modality));
      }

      const results = models.slice(0, limit).map((m) => ({
        id: m.id,
        name: m.name,
        input_modalities: m.modalities.input,
        output_modalities: m.modalities.output,
        context: m.limit.context,
        reasoning: m.reasoning,
        open_weights: m.open_weights,
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { total: results.length, input_modality, output_modality, models: results },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // 22. get_reasoning_models
  server.tool(
    "get_reasoning_models",
    "Get all models with reasoning capabilities, including their reasoning options (toggle, budget_tokens, effort levels).",
    {
      limit: z.number().optional().default(30),
    },
    async ({ limit }) => {
      const flat = await getFlatModels();

      // Deduplicate by model name
      const seen = new Map<string, (typeof flat)[number]>();
      for (const f of flat) {
        if (!f.model.reasoning) continue;
        if (!seen.has(f.model.name)) {
          seen.set(f.model.name, f);
        }
      }

      const results = [...seen.values()].slice(0, limit).map((f) => ({
        model_name: f.model.name,
        model_id: f.model.id,
        reasoning_options: f.model.reasoning_options ?? [],
        context: f.model.limit.context,
        tool_call: f.model.tool_call,
        structured_output: f.model.structured_output,
        open_weights: f.model.open_weights,
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ total: results.length, reasoning_models: results }, null, 2),
          },
        ],
      };
    },
  );

  // 23. get_open_weight_models
  server.tool(
    "get_open_weight_models",
    "Get all open-weight / open-source models with license info and weight download links.",
    {
      license: z.string().optional().describe("Filter by license (e.g., 'Apache-2.0', 'MIT')"),
      limit: z.number().optional().default(30),
    },
    async ({ license, limit }) => {
      let models = await getUniqueModels();

      models = models.filter((m) => m.open_weights);

      if (license) {
        const l = license.toLowerCase();
        models = models.filter((m) => (m.license ?? "").toLowerCase().includes(l));
      }

      const results = models.slice(0, limit).map((m) => ({
        id: m.id,
        name: m.name,
        family: m.family,
        license: m.license ?? "Unknown",
        weights: m.weights ?? [],
        context: m.limit.context,
        reasoning: m.reasoning,
        tool_call: m.tool_call,
        release_date: m.release_date,
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ total: results.length, open_weight_models: results }, null, 2),
          },
        ],
      };
    },
  );
}
