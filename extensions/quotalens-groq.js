/**
 * Sends only Groq's documented rate-limit response headers to local QuotaLens.
 * Prompts, responses, credentials, and unrelated headers never leave Pi.
 */
export default function (pi) {
  const endpoint = `${process.env.QUOTALENS_URL ?? "http://127.0.0.1:31337"}/api/observations/groq`;
  const rateLimitHeaders = [
    "x-ratelimit-limit-requests",
    "x-ratelimit-remaining-requests",
    "x-ratelimit-reset-requests",
    "x-ratelimit-limit-tokens",
    "x-ratelimit-remaining-tokens",
    "x-ratelimit-reset-tokens",
  ];

  pi.on("after_provider_response", async (event, ctx) => {
    if (ctx.model?.provider !== "groq") return;

    const headers = Object.fromEntries(
      rateLimitHeaders.flatMap((name) => {
        const value = event.headers[name];
        return typeof value === "string" ? [[name, value]] : [];
      }),
    );
    if (Object.keys(headers).length === 0) return;

    await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ headers }),
    }).catch(() => undefined);
  });
}
