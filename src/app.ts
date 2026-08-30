import { Hono } from "hono";

import { ConnectorRegistry, createDefaultConnectorRegistry } from "./connectors.ts";
import { dashboardPage } from "./dashboard.ts";
import { GroqObservationStore } from "./groq.ts";
import {
  DEFAULT_MODELS_PATH,
  readProviderRegistry,
  toPublicProvider,
} from "./registry.ts";

export interface AppOptions {
  modelsPath?: string;
  connectors?: ConnectorRegistry;
  groqObservations?: GroqObservationStore;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createApp(options: AppOptions = {}) {
  const modelsPath = options.modelsPath ?? DEFAULT_MODELS_PATH;
  const groqObservations = options.groqObservations ?? new GroqObservationStore();
  const connectors = options.connectors ?? createDefaultConnectorRegistry({ groqObservations });
  const app = new Hono();

  app.get("/", (c) => c.html(dashboardPage));

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.post("/api/observations/groq", async (c) => {
    const body: unknown = await c.req.json().catch(() => undefined);
    if (!isRecord(body) || !isRecord(body.headers)) {
      return c.json({ error: "Groq observation headers are required." }, 400);
    }

    const snapshot = groqObservations.observe(body.headers);
    return c.json({ accepted: true, observedAt: snapshot.observedAt }, 202);
  });

  app.get("/api/providers", async (c) => {
    try {
      const providers = await readProviderRegistry(modelsPath);
      return c.json({ providers: providers.map(toPublicProvider) });
    } catch {
      return c.json({ error: "Pi provider registry is unavailable." }, 503);
    }
  });

  app.get("/api/providers/:providerId/snapshot", async (c) => {
    try {
      const providers = await readProviderRegistry(modelsPath);
      const provider = providers.find((item) => item.id === c.req.param("providerId"));

      if (!provider) {
        return c.json({ error: "Provider was not found in Pi configuration." }, 404);
      }

      return c.json({
        provider: toPublicProvider(provider),
        snapshot: await connectors.snapshotFor(provider),
      });
    } catch {
      return c.json({ error: "Pi provider registry is unavailable." }, 503);
    }
  });

  return app;
}
