// TypeScript types for models.dev data structures

export interface ReasoningOption {
  type: "toggle" | "budget_tokens" | "effort";
  values?: string[];
}

export interface Modalities {
  input: string[];
  output: string[];
}

export interface ModelLimit {
  context: number;
  input?: number;
  output?: number;
}

export interface ModelCost {
  input: number;
  output: number;
  cache_read?: number;
}

export interface ModelLink {
  label: string;
  url: string;
  type?: string;
}

export interface ModelWeight {
  label: string;
  url: string;
  format?: string;
}

export interface ModelBenchmark {
  name: string;
  score: number;
  metric?: string;
  source?: string;
}

export interface ProviderModel {
  id: string;
  name: string;
  description?: string;
  family?: string;
  attachment: boolean;
  reasoning: boolean;
  reasoning_options?: ReasoningOption[];
  tool_call: boolean;
  structured_output?: boolean;
  temperature: boolean;
  release_date?: string;
  last_updated?: string;
  knowledge?: string;
  modalities: Modalities;
  open_weights: boolean;
  limit: ModelLimit;
  cost?: ModelCost;
  license?: string;
  links?: ModelLink[];
  weights?: ModelWeight[];
  benchmarks?: ModelBenchmark[];
}

export interface Provider {
  id: string;
  name: string;
  env?: string[];
  npm?: string;
  api?: string;
  doc?: string;
  models: Record<string, ProviderModel>;
}

export interface BaseModel {
  id: string;
  name: string;
  description?: string;
  family?: string;
  attachment: boolean;
  reasoning: boolean;
  reasoning_options?: ReasoningOption[];
  tool_call: boolean;
  structured_output?: boolean;
  temperature: boolean;
  release_date?: string;
  last_updated?: string;
  knowledge?: string;
  modalities: Modalities;
  open_weights: boolean;
  limit: ModelLimit;
  license?: string;
  links?: ModelLink[];
  weights?: ModelWeight[];
  benchmarks?: ModelBenchmark[];
}

// api.json shape: Record<providerId, Provider>
export type ApiData = Record<string, Provider>;

// models.json shape: Record<modelId, BaseModel>
export type ModelsData = Record<string, BaseModel>;

// Flat view used internally for easier querying
export interface FlatModel {
  modelId: string;
  providerId: string;
  providerName: string;
  model: ProviderModel;
}
