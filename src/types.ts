export type QuotaPolicy =
  | "rolling"
  | "fixed-window"
  | "billing-cycle"
  | "unknown";

export type QuotaUnit =
  | "tokens"
  | "requests"
  | "messages"
  | "credits"
  | "currency"
  | "percent"
  | "time";

export interface ModelDefinition {
  id: string;
  name: string;
  contextWindow?: number;
  maxTokens?: number;
}

/** Safe metadata that may be returned to the dashboard. */
export interface ProviderDefinition {
  id: string;
  api?: string;
  baseUrl?: string;
  models: ModelDefinition[];
}

/** Backend-only configuration read from Pi's live models.json file. */
export interface ProviderRuntimeConfig extends ProviderDefinition {
  apiKey?: string;
  authHeader?: boolean;
  headers?: Record<string, string>;
}

export interface SubscriptionStatus {
  status: "active" | "cancelled" | "expired" | "unknown";
  plan?: string;
  renewalAt?: string;
  price?: {
    amount: number;
    currency: string;
  };
}

export interface QuotaBucket {
  id: string;
  label: string;
  modelIds?: string[];
  unit: QuotaUnit;
  used?: number;
  remaining?: number;
  limit?: number;
  policy: QuotaPolicy;
  window?: string;
  resetAt?: string;
  confidence: "exact" | "estimated" | "unknown";
}

export interface ProviderSnapshot {
  providerId: string;
  observedAt: string;
  connection: "connected" | "unauthorized" | "unsupported" | "waiting" | "error";
  subscription?: SubscriptionStatus;
  quotas: QuotaBucket[];
  warnings: string[];
}
