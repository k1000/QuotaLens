import { afterEach, expect, test } from "bun:test";

import {
  createDefaultConnectorRegistry,
  DeepSeekBalanceConnector,
  MoonshotBalanceConnector,
  ZaiQuotaConnector,
} from "../src/connectors.ts";
import { SafeCredentialResolver, bearerAuthorizationHeader } from "../src/credentials.ts";
import { GroqObservationStore } from "../src/groq.ts";
import type { ProviderRuntimeConfig } from "../src/types.ts";
import { createApp } from "../src/app.ts";

const originalMoonshotKey = process.env.QUOTALENS_TEST_MOONSHOT_KEY;
const originalFetch = globalThis.fetch;

afterEach(() => {
  if (originalMoonshotKey === undefined) {
    delete process.env.QUOTALENS_TEST_MOONSHOT_KEY;
  } else {
    process.env.QUOTALENS_TEST_MOONSHOT_KEY = originalMoonshotKey;
  }
  globalThis.fetch = originalFetch;
});

type FetchInput = Parameters<typeof fetch>[0];

function jsonFetch(expectedUrl: string, body: unknown) {
  return (async (input: FetchInput, init?: RequestInit) => {
    expect(String(input)).toBe(expectedUrl);
    expect(init?.method).toBe("GET");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-key");
    return Response.json(body);
  }) as typeof fetch;
}

test("safe credential resolver supports literals, environment references, and exact Pi Keychain references", async () => {
  process.env.QUOTALENS_TEST_MOONSHOT_KEY = "env-secret";
  const keychainRequests: unknown[] = [];
  const resolver = new SafeCredentialResolver(async (request) => {
    keychainRequests.push(request);
    return { value: "keychain-secret" };
  });

  expect(await resolver.resolve("literal-secret")).toEqual({ value: "literal-secret" });
  expect(await resolver.resolve("$QUOTALENS_TEST_MOONSHOT_KEY")).toEqual({ value: "env-secret" });
  expect(await resolver.resolve("!security find-generic-password -a account -s service -w")).toEqual({ value: "keychain-secret" });
  expect(keychainRequests).toEqual([{ account: "account", service: "service" }]);
  expect(await resolver.resolve("$QUOTALENS_TEST_MISSING_KEY")).toEqual({
    warning: "Provider credential environment variable is not set.",
  });
  expect(await resolver.resolve("security find-generic-password -a account -s service -w")).toEqual({
    warning: "Provider credential reference is not allowed by the safe resolver.",
  });
  expect(await resolver.resolve("!security find-generic-password -s service -a account -w")).toEqual({
    warning: "Provider credential reference is not allowed by the safe resolver.",
  });
  expect(bearerAuthorizationHeader("Bearer already-prefixed")).toBe("Bearer already-prefixed");
});

test("Moonshot connector reads the official balance endpoint", async () => {
  const connector = new MoonshotBalanceConnector({
    fetch: jsonFetch("https://api.moonshot.ai/v1/users/me/balance", {
      code: 0,
      data: {
        available_balance: "12.5",
        cash_balance: 7,
        voucher_balance: 5.5,
      },
    }),
  });

  const snapshot = await connector.fetchSnapshot({
    id: "moonshot",
    apiKey: "test-key",
    baseUrl: "https://api.moonshot.ai/v1",
    models: [],
  });

  expect(snapshot).toMatchObject({
    providerId: "moonshot",
    connection: "connected",
    warnings: [],
    quotas: [
      { id: "moonshot-available-balance", remaining: 12.5, unit: "currency" },
      { id: "moonshot-cash-balance", remaining: 7, unit: "currency" },
      { id: "moonshot-voucher-balance", remaining: 5.5, unit: "currency" },
    ],
  });
});

test("DeepSeek connector reads the official balance endpoint", async () => {
  const connector = new DeepSeekBalanceConnector({
    fetch: jsonFetch("https://api.deepseek.com/user/balance", {
      is_available: true,
      balance_infos: [
        {
          currency: "USD",
          total_balance: "3.25",
          granted_balance: "1.00",
          topped_up_balance: "2.25",
        },
      ],
    }),
  });

  const snapshot = await connector.fetchSnapshot({
    id: "deepseek",
    apiKey: "test-key",
    baseUrl: "https://api.deepseek.com/v1",
    models: [],
  });

  expect(snapshot).toMatchObject({
    providerId: "deepseek",
    connection: "connected",
    warnings: [],
    quotas: [
      { id: "deepseek-balance-usd", label: "DeepSeek USD balance", remaining: 3.25, unit: "currency" },
    ],
  });
});

test("Z.AI connector returns experimental array-shaped token and time limits", async () => {
  const fiveHourReset = 1796083200000;
  const sevenDayReset = 1796688000000;
  const timeReset = 1796090400000;
  const connector = new ZaiQuotaConnector({
    fetch: jsonFetch("https://api.z.ai/api/monitor/usage/quota/limit", {
      data: {
        limits: [
          {
            type: "TOKENS_LIMIT",
            unit: 3,
            number: 5,
            percentage: 42,
            nextResetTime: fiveHourReset,
            private_amount: 12345,
          },
          {
            type: "TOKENS_LIMIT",
            unit: 6,
            number: 7,
            percentage: 80,
            nextResetTime: sevenDayReset,
          },
          {
            type: "TIME_LIMIT",
            unit: 3,
            currentValue: 15,
            usage: 60,
            nextResetTime: timeReset,
          },
        ],
      },
    }),
  });

  const snapshot = await connector.fetchSnapshot({
    id: "zai",
    apiKey: "test-key",
    baseUrl: "https://api.z.ai/api/coding/paas/v4",
    models: [],
  });

  expect(snapshot).toMatchObject({
    providerId: "zai",
    connection: "connected",
    quotas: [
      {
        id: "zai-tokens-limit-5h-0",
        label: "Z.AI tokens 5h",
        unit: "percent",
        used: 42,
        remaining: 58,
        limit: 100,
        window: "5h",
        resetAt: new Date(fiveHourReset).toISOString(),
        confidence: "estimated",
      },
      {
        id: "zai-tokens-limit-7d-1",
        label: "Z.AI tokens 7d",
        unit: "percent",
        used: 80,
        remaining: 20,
        limit: 100,
        window: "7d",
        resetAt: new Date(sevenDayReset).toISOString(),
        confidence: "estimated",
      },
      {
        id: "zai-time-limit-5h-2",
        label: "Z.AI time 5h",
        unit: "time",
        used: 15,
        remaining: 45,
        limit: 60,
        window: "5h",
        resetAt: new Date(timeReset).toISOString(),
        confidence: "estimated",
      },
    ],
  });
  expect(snapshot.warnings).toContain("Experimental Z.AI quota connector: endpoint source and percentage semantics may change.");
  expect(JSON.stringify(snapshot)).not.toContain("12345");
});

test("Groq observations retain only rate-limit headroom and reset times", () => {
  const store = new GroqObservationStore();
  const observedAt = new Date("2026-09-01T12:00:00.000Z");
  const snapshot = store.observe({
    "x-ratelimit-limit-requests": "14400",
    "x-ratelimit-remaining-requests": "14370",
    "x-ratelimit-reset-requests": "2m59.56s",
    "x-ratelimit-limit-tokens": "18000",
    "x-ratelimit-remaining-tokens": "17997",
    "x-ratelimit-reset-tokens": "7.66s",
    authorization: "must-not-be-stored",
  }, observedAt);

  expect(snapshot).toMatchObject({
    connection: "connected",
    quotas: [
      { id: "groq-requests", used: 30, remaining: 14370, limit: 14400, unit: "requests" },
      { id: "groq-tokens", used: 3, remaining: 17997, limit: 18000, unit: "tokens" },
    ],
  });
  expect(snapshot.quotas[0]?.resetAt).toBe("2026-09-01T12:02:59.560Z");
  expect(JSON.stringify(snapshot)).not.toContain("must-not-be-stored");
});

test("Groq observation API updates the configured provider snapshot", async () => {
  const store = new GroqObservationStore();
  const app = createApp({
    modelsPath: `${import.meta.dir}/connectors.fixture.json`,
    groqObservations: store,
  });

  const response = await app.request("/api/observations/groq", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      headers: {
        "x-ratelimit-limit-requests": "100",
        "x-ratelimit-remaining-requests": "75",
      },
    }),
  });
  expect(response.status).toBe(202);

  const snapshotResponse = await app.request("/api/providers/groq/snapshot");
  expect(await snapshotResponse.json()).toMatchObject({
    snapshot: { connection: "connected", quotas: [{ id: "groq-requests", remaining: 75 }] },
  });
});

test("default app wires Moonshot, DeepSeek, and Z.AI while Alibaba/Qwen remains unsupported", async () => {
  process.env.QUOTALENS_TEST_MOONSHOT_KEY = "test-key";
  const fixturePath = `${import.meta.dir}/connectors.fixture.json`;
  const calls: string[] = [];

  globalThis.fetch = (async (input: FetchInput) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("moonshot")) return Response.json({ data: { available_balance: 1 } });
    if (url.includes("deepseek")) return Response.json({ is_available: true, balance_infos: [{ currency: "CNY", total_balance: 2 }] });
    if (url.includes("z.ai")) return Response.json({ data: { limits: [{ type: "TOKENS_LIMIT", unit: 3, percentage: 80, nextResetTime: 1796083200000 }] } });
    throw new Error("unexpected fetch");
  }) as typeof fetch;

  const app = createApp({ modelsPath: fixturePath });

  const moonshot = await (await app.request("/api/providers/moonshot/snapshot")).json() as { snapshot: unknown };
  const deepseek = await (await app.request("/api/providers/deepseek/snapshot")).json() as { snapshot: unknown };
  const zai = await (await app.request("/api/providers/zai/snapshot")).json() as { snapshot: unknown };
  const qwen = await (await app.request("/api/providers/qwen/snapshot")).json() as { snapshot: unknown };

  expect(moonshot.snapshot).toMatchObject({
    connection: "connected",
    quotas: [{ id: "moonshot-available-balance", remaining: 1 }],
  });
  expect(deepseek.snapshot).toMatchObject({
    connection: "connected",
    quotas: [{ id: "deepseek-balance-cny", remaining: 2 }],
  });
  expect(zai.snapshot).toMatchObject({
    connection: "connected",
    quotas: [{ id: "zai-tokens-limit-5h-0", used: 80, remaining: 20, unit: "percent" }],
  });
  expect(qwen.snapshot).toMatchObject({
    providerId: "qwen",
    connection: "unsupported",
    quotas: [],
  });

  expect(calls).toEqual([
    "https://api.moonshot.ai/v1/users/me/balance",
    "https://api.deepseek.com/user/balance",
    "https://api.z.ai/api/monitor/usage/quota/limit",
  ]);
});
