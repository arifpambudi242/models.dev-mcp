// Tools: Integration & SDK Helper

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProviders, getFlatModels } from "../data/fetcher.js";

export function registerIntegrationTools(server: McpServer): void {
  // 24. generate_sdk_code
  server.tool(
    "generate_sdk_code",
    "Generate a code snippet for using a model with the Vercel AI SDK, including provider setup, model initialization, and basic usage.",
    {
      model_id: z.string().describe("Model ID (e.g., 'openai/gpt-6-sol')"),
      provider_id: z
        .string()
        .optional()
        .describe("Specific provider ID (uses model's default provider if omitted)"),
      language: z
        .enum(["typescript", "javascript"])
        .optional()
        .default("typescript")
        .describe("Code language"),
    },
    async ({ model_id, provider_id, language }) => {
      const providers = await getProviders();
      const flat = await getFlatModels();
      const q = model_id.toLowerCase();

      // Find the model
      const match = flat.find(
        (f) =>
          f.model.id.toLowerCase() === q ||
          f.model.id.toLowerCase().includes(q),
      );

      if (!match) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Model "${model_id}" not found. Use search_models to find the correct ID.`,
            },
          ],
        };
      }

      const pid = provider_id ?? match.providerId;
      const provider = providers.find((p) => p.id === pid);

      if (!provider) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Provider "${pid}" not found.`,
            },
          ],
        };
      }

      const npmPkg = provider.npm ?? "@ai-sdk/openai-compatible";
      const envVars = provider.env ?? [];
      const isOpenAICompat = npmPkg === "@ai-sdk/openai-compatible";
      const providerVarName = provider.id.replace(/[^a-zA-Z0-9]/g, "_");

      const ts = language === "typescript";
      const modelIdForProvider = match.model.id.includes("/")
        ? match.model.id.split("/").pop()!
        : match.model.id;

      let code = `// ${match.model.name} via ${provider.name}\n`;
      code += `// Install: npm install ai ${npmPkg}\n\n`;

      if (isOpenAICompat) {
        code += `import { createOpenAICompatible } from "${npmPkg}";\n`;
        code += `import { generateText } from "ai";\n\n`;
        code += `const ${providerVarName} = createOpenAICompatible({\n`;
        code += `  name: "${provider.id}",\n`;
        code += `  baseURL: "${provider.api ?? "https://api.example.com/v1"}",\n`;
        if (envVars.length > 0) {
          code += `  apiKey: process.env.${envVars[0]}${ts ? "!" : ""},\n`;
        }
        code += `});\n\n`;
      } else {
        const createFn = `create${provider.name.replace(/[^a-zA-Z0-9]/g, "")}`;
        code += `import { ${createFn} } from "${npmPkg}";\n`;
        code += `import { generateText } from "ai";\n\n`;
        code += `const ${providerVarName} = ${createFn}({\n`;
        if (envVars.length > 0) {
          code += `  apiKey: process.env.${envVars[0]}${ts ? "!" : ""},\n`;
        }
        code += `});\n\n`;
      }

      code += `const { text } = await generateText({\n`;
      code += `  model: ${providerVarName}("${modelIdForProvider}"),\n`;
      code += `  prompt: "Hello, how are you?",\n`;
      if (match.model.limit.output) {
        code += `  maxTokens: ${Math.min(match.model.limit.output, 4096)},\n`;
      }
      code += `});\n\n`;
      code += `console.log(text);\n`;

      // Add env var reminder
      code += `\n// Required environment variables:\n`;
      for (const env of envVars) {
        code += `// ${env}=your_api_key_here\n`;
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `\`\`\`${language}\n${code}\`\`\`\n\n**Model**: ${match.model.name}\n**Provider**: ${provider.name}\n**Context**: ${match.model.limit.context?.toLocaleString()} tokens\n**Cost**: $${match.model.cost?.input ?? "?"}/1M input, $${match.model.cost?.output ?? "?"}/1M output`,
          },
        ],
      };
    },
  );

  // 25. get_env_setup
  server.tool(
    "get_env_setup",
    "Get all required environment variables for a provider to configure in .env file.",
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

      const envVars = provider.env ?? [];
      let envFile = `# ${provider.name} Configuration\n`;
      for (const env of envVars) {
        envFile += `${env}=your_key_here\n`;
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                provider: provider.name,
                provider_id: provider.id,
                env_variables: envVars,
                npm_package: provider.npm,
                api_base_url: provider.api ?? null,
                documentation: provider.doc ?? null,
                dotenv_template: envFile,
                install_command: provider.npm ? `npm install ai ${provider.npm}` : null,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // 26. get_model_id_for_provider
  server.tool(
    "get_model_id_for_provider",
    "Get the correct model ID string to use with a specific provider's API.",
    {
      model_name: z.string().describe("Model name (e.g., 'GPT-6 Sol', 'Claude Opus 5.5')"),
      provider_id: z.string().describe("Provider ID (e.g., 'openai', 'openrouter', 'amazon-bedrock')"),
    },
    async ({ model_name, provider_id }) => {
      const flat = await getFlatModels();
      const qm = model_name.toLowerCase();
      const qp = provider_id.toLowerCase();

      const matches = flat.filter(
        (f) =>
          (f.model.name.toLowerCase().includes(qm) || f.model.id.toLowerCase().includes(qm)) &&
          (f.providerId.toLowerCase() === qp || f.providerName.toLowerCase().includes(qp)),
      );

      if (matches.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No match found for "${model_name}" at provider "${provider_id}".`,
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
                model_name: matches[0].model.name,
                provider: matches[0].providerName,
                model_ids: matches.map((m) => ({
                  model_id: m.model.id,
                  context: m.model.limit.context,
                  input_cost: m.model.cost?.input ?? null,
                  output_cost: m.model.cost?.output ?? null,
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

  // 27. validate_model_config
  server.tool(
    "validate_model_config",
    "Validate whether a model supports specific configuration: context length, modality, tool calling, etc.",
    {
      model_id: z.string().describe("Model ID to validate"),
      required_context: z.number().optional().describe("Required context window size"),
      required_modalities: z
        .array(z.string())
        .optional()
        .describe("Required input modalities"),
      requires_reasoning: z.boolean().optional(),
      requires_tool_call: z.boolean().optional(),
      requires_structured_output: z.boolean().optional(),
    },
    async (params) => {
      const flat = await getFlatModels();
      const q = params.model_id.toLowerCase();

      const match = flat.find(
        (f) =>
          f.model.id.toLowerCase() === q ||
          f.model.id.toLowerCase().includes(q),
      );

      if (!match) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Model "${params.model_id}" not found.`,
            },
          ],
        };
      }

      const checks: Array<{ check: string; required: unknown; actual: unknown; passed: boolean }> = [];

      if (params.required_context !== undefined) {
        checks.push({
          check: "context_window",
          required: params.required_context,
          actual: match.model.limit.context,
          passed: (match.model.limit.context ?? 0) >= params.required_context,
        });
      }

      if (params.required_modalities) {
        for (const mod of params.required_modalities) {
          checks.push({
            check: `modality_${mod}`,
            required: true,
            actual: match.model.modalities.input.includes(mod),
            passed: match.model.modalities.input.includes(mod),
          });
        }
      }

      if (params.requires_reasoning !== undefined) {
        checks.push({
          check: "reasoning",
          required: params.requires_reasoning,
          actual: match.model.reasoning,
          passed: match.model.reasoning === params.requires_reasoning,
        });
      }

      if (params.requires_tool_call !== undefined) {
        checks.push({
          check: "tool_call",
          required: params.requires_tool_call,
          actual: match.model.tool_call,
          passed: match.model.tool_call === params.requires_tool_call,
        });
      }

      if (params.requires_structured_output !== undefined) {
        checks.push({
          check: "structured_output",
          required: params.requires_structured_output,
          actual: match.model.structured_output,
          passed: match.model.structured_output === params.requires_structured_output,
        });
      }

      const allPassed = checks.every((c) => c.passed);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                model: match.model.name,
                model_id: match.model.id,
                provider: match.providerName,
                valid: allPassed,
                checks,
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
