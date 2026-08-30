import type {
  ModelDefinition,
  ProviderDefinition,
  ProviderRuntimeConfig,
} from "./types.ts";

export const DEFAULT_MODELS_PATH = "/Users/kamil/.pi/agent/models.json";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readModels(value: unknown): ModelDefinition[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((model): ModelDefinition[] => {
    if (!isRecord(model)) return [];

    const id = asString(model.id);
    if (!id) return [];

    return [{
      id,
      name: asString(model.name) ?? id,
      contextWindow: asNumber(model.contextWindow),
      maxTokens: asNumber(model.maxTokens),
    }];
  });
}

function readProvider(id: string, value: unknown): ProviderRuntimeConfig | undefined {
  if (!isRecord(value)) return undefined;

  const headers = isRecord(value.headers)
    ? Object.fromEntries(
        Object.entries(value.headers).flatMap(([name, headerValue]) => {
          const stringValue = asString(headerValue);
          return stringValue ? [[name, stringValue]] : [];
        }),
      )
    : undefined;

  return {
    id,
    api: asString(value.api),
    baseUrl: asString(value.baseUrl),
    apiKey: asString(value.apiKey),
    authHeader: value.authHeader === true,
    headers,
    models: readModels(value.models),
  };
}

/**
 * Reads Pi's provider configuration every time it is called. It intentionally
 * returns only in-memory runtime configuration; callers must not persist it.
 */
export async function readProviderRegistry(
  modelsPath = DEFAULT_MODELS_PATH,
): Promise<ProviderRuntimeConfig[]> {
  const file = Bun.file(modelsPath);
  if (!(await file.exists())) {
    throw new Error(`Pi models configuration was not found at ${modelsPath}`);
  }

  const document: unknown = JSON.parse(await file.text());
  if (!isRecord(document) || !isRecord(document.providers)) {
    throw new Error("Pi models configuration has no providers object");
  }

  return Object.entries(document.providers).flatMap(([id, provider]) => {
    const config = readProvider(id, provider);
    return config ? [config] : [];
  });
}

/** Removes every credential-bearing field before data crosses the API boundary. */
export function toPublicProvider(
  provider: ProviderRuntimeConfig,
): ProviderDefinition {
  return {
    id: provider.id,
    api: provider.api,
    baseUrl: provider.baseUrl,
    models: provider.models,
  };
}
