// Data fetcher: HTTP fetch with caching for models.dev API

import { Cache } from "./cache.js";
import type { ApiData, ModelsData, FlatModel, Provider, BaseModel } from "./types.js";

const BASE_URL = "https://models.dev";
const cache = new Cache(5 * 60 * 1000); // 5 minute TTL

async function fetchJson<T>(url: string): Promise<T> {
  const cached = cache.get<T>(url);
  if (cached) return cached;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as T;
  cache.set(url, data);
  return data;
}

/** Fetch full API data (providers + their models) */
export async function getApiData(): Promise<ApiData> {
  return fetchJson<ApiData>(`${BASE_URL}/api.json`);
}

/** Fetch provider-agnostic model metadata */
export async function getModelsData(): Promise<ModelsData> {
  return fetchJson<ModelsData>(`${BASE_URL}/models.json`);
}

/** Get all providers as an array */
export async function getProviders(): Promise<Provider[]> {
  const api = await getApiData();
  return Object.values(api);
}

/** Get a single provider by ID */
export async function getProvider(providerId: string): Promise<Provider | null> {
  const api = await getApiData();
  return api[providerId] ?? null;
}

/** Flatten all models across all providers into a searchable list */
export async function getFlatModels(): Promise<FlatModel[]> {
  const api = await getApiData();
  const flat: FlatModel[] = [];

  for (const provider of Object.values(api)) {
    for (const model of Object.values(provider.models)) {
      flat.push({
        modelId: model.id,
        providerId: provider.id,
        providerName: provider.name,
        model,
      });
    }
  }

  return flat;
}

/** Get all unique base models (deduplicated by model ID pattern lab/name) */
export async function getUniqueModels(): Promise<BaseModel[]> {
  const models = await getModelsData();
  return Object.values(models);
}

/** Get a single base model by ID */
export async function getBaseModel(modelId: string): Promise<BaseModel | null> {
  const models = await getModelsData();
  return models[modelId] ?? null;
}

/** Get all flat models for a specific base model ID */
export async function getModelProviders(modelId: string): Promise<FlatModel[]> {
  const flat = await getFlatModels();
  // Match by base model - model IDs in api.json are like "provider/model-name"
  // and the base_model ID is like "lab/model-name"
  // We need to match where the model name (after /) matches
  const modelName = modelId.includes("/") ? modelId.split("/").slice(1).join("/") : modelId;

  return flat.filter((f) => {
    const fModelName = f.model.id.includes("/")
      ? f.model.id.split("/").slice(1).join("/")
      : f.model.id;
    return (
      f.model.id === modelId ||
      f.modelId === modelId ||
      fModelName === modelName ||
      f.model.name.toLowerCase() === modelName.toLowerCase()
    );
  });
}

/** Clear all cached data */
export function clearCache(): void {
  cache.clear();
}
