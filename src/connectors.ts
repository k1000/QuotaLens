import { SafeCredentialResolver, bearerAuthorizationHeader } from "./credentials.ts";
import { GroqObservationStore } from "./groq.ts";
import type { ProviderRuntimeConfig, ProviderSnapshot, QuotaBucket } from "./types.ts";

/**
 * Provider implementations own their official account, billing, and quota API
 * quirks. Inference protocol compatibility is not used to infer quota support.
 */
export interface ProviderConnector {
  readonly providerId: string;
  fetchSnapshot(provider: ProviderRuntimeConfig): Promise<ProviderSnapshot>;
}

type FetchLike = typeof fetch;
type JsonRecord = Record<string, unknown>;

interface ConnectorOptions {
  fetch?: FetchLike;
  credentials?: SafeCredentialResolver;
  groqObservations?: GroqObservationStore;
}

function observedAt(): string {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function officialUrl(provider: ProviderRuntimeConfig, fallbackBase: string, path: string): string {
  const base = provider.baseUrl ?? fallbackBase;
  const url = new URL(base);
  url.pathname = path;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function errorSnapshot(providerId: string, connection: ProviderSnapshot["connection"], warning: string): ProviderSnapshot {
  return {
    providerId,
    observedAt: observedAt(),
    connection,
    quotas: [],
    warnings: [warning],
  };
}

async function readJson(response: Response): Promise<unknown | undefined> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function credentialReference(provider: ProviderRuntimeConfig): string | undefined {
  return (
    provider.apiKey ??
    provider.headers?.authorization ??
    provider.headers?.Authorization ??
    provider.headers?.["api-key"] ??
    provider.headers?.["x-api-key"]
  );
}

async function fetchAccountJson(
  connector: string,
  provider: ProviderRuntimeConfig,
  url: string,
  fetchImpl: FetchLike,
  credentials: SafeCredentialResolver,
): Promise<{ connection: "connected"; json: unknown; warnings: string[] } | ProviderSnapshot> {
  const credential = await credentials.resolve(credentialReference(provider));
  if (!credential.value) {
    return errorSnapshot(provider.id, "unauthorized", credential.warning ?? "Provider credential is unavailable.");
  }

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: bearerAuthorizationHeader(credential.value),
      },
    });

    if (response.status === 401 || response.status === 403) {
      return errorSnapshot(provider.id, "unauthorized", `${connector} account API rejected the configured credential.`);
    }

    if (!response.ok) {
      return errorSnapshot(provider.id, "error", `${connector} account API returned HTTP ${response.status}.`);
    }

    const json = await readJson(response);
    if (json === undefined) {
      return errorSnapshot(provider.id, "error", `${connector} account API returned invalid JSON.`);
    }

    return { connection: "connected", json, warnings: [] };
  } catch {
    return errorSnapshot(provider.id, "error", `${connector} account API request failed.`);
  }
}

function moneyBucket(id: string, label: string, remaining: number | undefined): QuotaBucket | undefined {
  if (remaining === undefined) return undefined;
  return {
    id,
    label,
    unit: "currency",
    remaining,
    policy: "unknown",
    confidence: "exact",
  };
}

export class MoonshotBalanceConnector implements ProviderConnector {
  readonly providerId = "moonshot";
  private readonly fetchImpl: FetchLike;
  private readonly credentials: SafeCredentialResolver;

  constructor(options: ConnectorOptions = {}) {
    this.fetchImpl = options.fetch ?? fetch;
    this.credentials = options.credentials ?? new SafeCredentialResolver();
  }

  async fetchSnapshot(provider: ProviderRuntimeConfig): Promise<ProviderSnapshot> {
    const result = await fetchAccountJson(
      "Moonshot",
      provider,
      officialUrl(provider, "https://api.moonshot.ai/v1", "/v1/users/me/balance"),
      this.fetchImpl,
      this.credentials,
    );
    if ("providerId" in result) return result;

    const data = isRecord(result.json) && isRecord(result.json.data) ? result.json.data : result.json;
    const quotas = isRecord(data)
      ? [
          moneyBucket("moonshot-available-balance", "Available balance", asFiniteNumber(data.available_balance)),
          moneyBucket("moonshot-cash-balance", "Cash balance", asFiniteNumber(data.cash_balance)),
          moneyBucket("moonshot-voucher-balance", "Voucher balance", asFiniteNumber(data.voucher_balance)),
        ].filter((bucket): bucket is QuotaBucket => bucket !== undefined)
      : [];

    return {
      providerId: provider.id,
      observedAt: observedAt(),
      connection: "connected",
      quotas,
      warnings: quotas.length ? result.warnings : ["Moonshot balance response did not contain recognized balance fields."],
    };
  }
}

export class DeepSeekBalanceConnector implements ProviderConnector {
  readonly providerId = "deepseek";
  private readonly fetchImpl: FetchLike;
  private readonly credentials: SafeCredentialResolver;

  constructor(options: ConnectorOptions = {}) {
    this.fetchImpl = options.fetch ?? fetch;
    this.credentials = options.credentials ?? new SafeCredentialResolver();
  }

  async fetchSnapshot(provider: ProviderRuntimeConfig): Promise<ProviderSnapshot> {
    const result = await fetchAccountJson(
      "DeepSeek",
      provider,
      officialUrl(provider, "https://api.deepseek.com", "/user/balance"),
      this.fetchImpl,
      this.credentials,
    );
    if ("providerId" in result) return result;

    const root = isRecord(result.json) ? result.json : {};
    const balanceInfos = Array.isArray(root.balance_infos) ? root.balance_infos : [];
    const quotas = balanceInfos.flatMap((item): QuotaBucket[] => {
      if (!isRecord(item)) return [];
      const currency = asString(item.currency) ?? "balance";
      const total = asFiniteNumber(item.total_balance);
      const bucket = moneyBucket(
        `deepseek-balance-${currency.toLowerCase()}`,
        `DeepSeek ${currency} balance`,
        total,
      );
      return bucket ? [bucket] : [];
    });

    const warnings = [...result.warnings];
    if (root.is_available === false) warnings.push("DeepSeek reports the account balance is unavailable.");
    if (!quotas.length) warnings.push("DeepSeek balance response did not contain recognized balance fields.");

    return {
      providerId: provider.id,
      observedAt: observedAt(),
      connection: "connected",
      quotas,
      warnings,
    };
  }
}

function resetAtFromNextResetTime(record: JsonRecord): string | undefined {
  const nextResetTime = asFiniteNumber(record.nextResetTime);
  if (nextResetTime === undefined) return undefined;

  const date = new Date(nextResetTime);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function zaiWindowLabel(unit: number | undefined): string {
  if (unit === 3) return "5h";
  if (unit === 6) return "7d";
  return unit === undefined ? "unknown-window" : `unit-${unit}`;
}

function zaiTokensLimitBucket(entry: JsonRecord, index: number): QuotaBucket | undefined {
  const percentage = asFiniteNumber(entry.percentage);
  if (percentage === undefined) return undefined;

  const used = Math.min(100, Math.max(0, percentage));
  const window = zaiWindowLabel(asFiniteNumber(entry.unit));
  return {
    id: `zai-tokens-limit-${window}-${index}`,
    label: `Z.AI tokens ${window}`,
    unit: "percent",
    used,
    remaining: 100 - used,
    limit: 100,
    policy: "unknown",
    window,
    resetAt: resetAtFromNextResetTime(entry),
    confidence: "estimated",
  };
}

function zaiTimeLimitBucket(entry: JsonRecord, index: number): QuotaBucket | undefined {
  const used = asFiniteNumber(entry.currentValue);
  const limit = asFiniteNumber(entry.usage);
  if (used === undefined && limit === undefined) return undefined;

  const window = zaiWindowLabel(asFiniteNumber(entry.unit));
  return {
    id: `zai-time-limit-${window}-${index}`,
    label: `Z.AI time ${window}`,
    unit: "time",
    used,
    remaining: used !== undefined && limit !== undefined ? Math.max(0, limit - used) : undefined,
    limit,
    policy: "unknown",
    window,
    resetAt: resetAtFromNextResetTime(entry),
    confidence: "estimated",
  };
}

function collectZaiQuotaBuckets(value: unknown): QuotaBucket[] {
  const limits = isRecord(value) && Array.isArray(value.limits) ? value.limits : [];
  return limits.flatMap((entry, index): QuotaBucket[] => {
    if (!isRecord(entry)) return [];

    const type = asString(entry.type);
    const bucket = type === "TOKENS_LIMIT"
      ? zaiTokensLimitBucket(entry, index)
      : type === "TIME_LIMIT"
        ? zaiTimeLimitBucket(entry, index)
        : undefined;

    return bucket ? [bucket] : [];
  });
}

export class ZaiQuotaConnector implements ProviderConnector {
  readonly providerId = "zai";
  private readonly fetchImpl: FetchLike;
  private readonly credentials: SafeCredentialResolver;

  constructor(options: ConnectorOptions = {}) {
    this.fetchImpl = options.fetch ?? fetch;
    this.credentials = options.credentials ?? new SafeCredentialResolver();
  }

  async fetchSnapshot(provider: ProviderRuntimeConfig): Promise<ProviderSnapshot> {
    const result = await fetchAccountJson(
      "Z.AI",
      provider,
      officialUrl(provider, "https://api.z.ai", "/api/monitor/usage/quota/limit"),
      this.fetchImpl,
      this.credentials,
    );
    if ("providerId" in result) return result;

    const root = isRecord(result.json) && "data" in result.json ? result.json.data : result.json;
    const quotas = collectZaiQuotaBuckets(root);
    const warnings = [
      "Experimental Z.AI quota connector: endpoint source and percentage semantics may change.",
      ...result.warnings,
    ];
    if (!quotas.length) warnings.push("Z.AI quota response did not contain recognized percentage or reset fields.");

    return {
      providerId: provider.id,
      observedAt: observedAt(),
      connection: "connected",
      quotas,
      warnings,
    };
  }
}

export class GroqRateLimitConnector implements ProviderConnector {
  readonly providerId = "groq";

  constructor(private readonly observations: GroqObservationStore) {}

  async fetchSnapshot(_provider: ProviderRuntimeConfig): Promise<ProviderSnapshot> {
    return this.observations.snapshot();
  }
}

export class ConnectorRegistry {
  private readonly connectors = new Map<string, ProviderConnector>();

  constructor(connectors: ProviderConnector[] = []) {
    for (const connector of connectors) {
      this.connectors.set(connector.providerId, connector);
    }
  }

  async snapshotFor(
    provider: ProviderRuntimeConfig,
  ): Promise<ProviderSnapshot> {
    const connector = this.connectors.get(provider.id);
    if (!connector) {
      return {
        providerId: provider.id,
        observedAt: observedAt(),
        connection: "unsupported",
        quotas: [],
        warnings: [
          "No account API connector is implemented for this provider yet.",
        ],
      };
    }

    return connector.fetchSnapshot(provider);
  }
}

export function createDefaultConnectorRegistry(options: ConnectorOptions = {}): ConnectorRegistry {
  return new ConnectorRegistry([
    new MoonshotBalanceConnector(options),
    new DeepSeekBalanceConnector(options),
    new ZaiQuotaConnector(options),
    new GroqRateLimitConnector(options.groqObservations ?? new GroqObservationStore()),
  ]);
}
