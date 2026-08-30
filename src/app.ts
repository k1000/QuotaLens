import { Hono } from "hono";

import { ConnectorRegistry } from "./connectors.ts";
import { dashboardPage } from "./dashboard.ts";
import {
  DEFAULT_MODELS_PATH,
  readProviderRegistry,
  toPublicProvider,
} from "./registry.ts";

export interface AppOptions {
  modelsPath?: string;
  connectors?: ConnectorRegistry;
}

export function createApp({
  modelsPath = DEFAULT_MODELS_PATH,
  connectors = new ConnectorRegistry(),
}: AppOptions = {}) {
  const app = new Hono();

  app.get("/", (c) => c.html(dashboardPage));

  app.get("/health", (c) => c.json({ status: "ok" }));

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
