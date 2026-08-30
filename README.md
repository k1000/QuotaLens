# QuotaLens

A local-first dashboard for AI provider subscriptions, quota availability, reset windows, and renewal dates.

QuotaLens reads the live Pi provider configuration at runtime, queries provider-specific account APIs through dedicated connectors, and normalizes account snapshots without exposing credentials to the UI.

## Development

```bash
bun install
bun run dev
```

The local API is available at `http://localhost:3000`:

- `GET /health`
- `GET /api/providers` — reads Pi's `models.json` on every request and returns safe provider metadata only
- `GET /api/providers/:providerId/snapshot` — returns the current connector snapshot; providers without an account API connector report `unsupported`
- `POST /api/observations/groq` — accepts only Groq rate-limit headers observed by Pi

## Groq rate-limit integration

After adding a `groq` provider to Pi's live `models.json`, install this repository as a local Pi package:

```bash
pi install /absolute/path/to/QuotaLens
```

The bundled extension forwards only Groq's documented rate-limit headers to the local dashboard. It does not forward prompts, completions, API keys, or other headers. QuotaLens shows data after the first Groq response in Pi.

```bash
bun run test
bun run typecheck
```
