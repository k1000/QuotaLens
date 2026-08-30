import { createApp } from "./src/app.ts";

const app = createApp();

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3000);

  Bun.serve({
    fetch: app.fetch,
    port,
  });

  console.log(`QuotaLens listening on http://localhost:${port}`);
}
