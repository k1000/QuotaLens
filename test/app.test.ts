import { expect, test } from "bun:test";

import { createApp } from "../src/app.ts";

const fixturePath = `${import.meta.dir}/models.fixture.json`;

test("serves the QuotaLens dashboard", async () => {
  const app = createApp({ modelsPath: fixturePath });
  const response = await app.request("/");

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/html");
  const page = await response.text();
  expect(page).toContain("QuotaLens");
  expect(page).toContain("Active providers");
  expect(page).toContain("progressbar");
});

test("lists the live provider registry without credentials", async () => {
  const app = createApp({ modelsPath: fixturePath });
  const response = await app.request("/api/providers");

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    providers: [
      {
        id: "example",
        api: "openai-completions",
        baseUrl: "https://api.example.test/v1",
        models: [
          {
            id: "example-chat",
            name: "Example Chat",
            contextWindow: 128000,
            maxTokens: 8192,
          },
        ],
      },
    ],
  });
});

test("reports unsupported until a provider-specific account API connector exists", async () => {
  const app = createApp({ modelsPath: fixturePath });
  const response = await app.request("/api/providers/example/snapshot");

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    provider: { id: "example" },
    snapshot: {
      providerId: "example",
      connection: "unsupported",
      quotas: [],
    },
  });
});

test("rereads the registry for every request", async () => {
  const path = `${process.env.TMPDIR ?? "/tmp"}/quotalens-runtime-${crypto.randomUUID()}.json`;
  await Bun.write(path, JSON.stringify({ providers: { first: { models: [] } } }));
  const app = createApp({ modelsPath: path });

  expect(await (await app.request("/api/providers")).json()).toEqual({
    providers: [{ id: "first", models: [] }],
  });

  await Bun.write(path, JSON.stringify({ providers: { second: { models: [] } } }));

  expect(await (await app.request("/api/providers")).json()).toEqual({
    providers: [{ id: "second", models: [] }],
  });
});
