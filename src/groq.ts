import type { ProviderSnapshot, QuotaBucket } from "./types.ts";

type HeaderValues = Record<string, unknown>;

function header(headers: HeaderValues, name: string): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberHeader(headers: HeaderValues, name: string): number | undefined {
  const value = Number(header(headers, name));
  return Number.isFinite(value) ? value : undefined;
}

function resetAt(value: string | undefined, observedAt: Date): string | undefined {
  if (!value) return undefined;

  const matches = [...value.matchAll(/(\d+(?:\.\d+)?)([hms])/g)];
  const milliseconds = matches.reduce((total, match) => {
    const amount = Number(match[1]);
    const unit = match[2];
    return total + amount * (unit === "h" ? 3_600_000 : unit === "m" ? 60_000 : 1_000);
  }, 0);

  return milliseconds > 0 ? new Date(observedAt.getTime() + milliseconds).toISOString() : undefined;
}

function rateLimitBucket(
  id: string,
  label: string,
  unit: "requests" | "tokens",
  limit: number | undefined,
  remaining: number | undefined,
  reset: string | undefined,
): QuotaBucket | undefined {
  if (limit === undefined || remaining === undefined) return undefined;

  const clampedRemaining = Math.max(0, Math.min(limit, remaining));
  return {
    id,
    label,
    unit,
    used: limit - clampedRemaining,
    remaining: clampedRemaining,
    limit,
    policy: "unknown",
    resetAt: reset,
    confidence: "exact",
  };
}

/** Stores only Groq rate-limit numbers observed from Pi response headers. */
export class GroqObservationStore {
  private latest?: ProviderSnapshot;

  observe(headers: HeaderValues, observedAt = new Date()): ProviderSnapshot {
    const requestLimit = numberHeader(headers, "x-ratelimit-limit-requests");
    const requestRemaining = numberHeader(headers, "x-ratelimit-remaining-requests");
    const tokenLimit = numberHeader(headers, "x-ratelimit-limit-tokens");
    const tokenRemaining = numberHeader(headers, "x-ratelimit-remaining-tokens");

    const quotas = [
      rateLimitBucket(
        "groq-requests",
        "Requests",
        "requests",
        requestLimit,
        requestRemaining,
        resetAt(header(headers, "x-ratelimit-reset-requests"), observedAt),
      ),
      rateLimitBucket(
        "groq-tokens",
        "Tokens",
        "tokens",
        tokenLimit,
        tokenRemaining,
        resetAt(header(headers, "x-ratelimit-reset-tokens"), observedAt),
      ),
    ].filter((bucket): bucket is QuotaBucket => bucket !== undefined);

    this.latest = {
      providerId: "groq",
      observedAt: observedAt.toISOString(),
      connection: quotas.length ? "connected" : "error",
      quotas,
      warnings: quotas.length ? [] : ["Groq response did not include rate-limit headers."],
    };

    return this.latest;
  }

  snapshot(): ProviderSnapshot {
    return this.latest ?? {
      providerId: "groq",
      observedAt: new Date().toISOString(),
      connection: "waiting",
      quotas: [],
      warnings: ["Waiting for the first Groq response observed by Pi."],
    };
  }
}
