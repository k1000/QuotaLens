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

## Optional Alibaba Cloud BSS billing integration

When a `qwen` provider is present, QuotaLens can optionally show **delayed Alibaba Cloud billing and account-balance data**. It cannot show Qwen Token Plan credits, quota windows, or reset times.

Configure a separate read-only Alibaba Cloud RAM AccessKey; do **not** reuse the Qwen/DashScope API key:

```bash
export QUOTALENS_ALIBABA_BSS_ACCESS_KEY_ID="..."
export QUOTALENS_ALIBABA_BSS_ACCESS_KEY_SECRET="..."
# Optional; defaults to ap-southeast-1.
export QUOTALENS_ALIBABA_BSS_REGION="ap-southeast-1"
```

The connector calls the documented BSS `QueryAccountBalance` and `QueryBillOverview` APIs for the current UTC billing month. BSS data is delayed and may include Alibaba Cloud services unrelated to Qwen. Without both BSS credentials, Qwen remains hidden as unsupported.

## Kimi Code quota integration

When `kimi-code-api` is present in Pi's live `models.json`, QuotaLens uses its configured Kimi Code credential to read `GET https://api.kimi.com/coding/v1/usages` directly. It shows the shared weekly membership quota and rolling quota windows without requiring `kimi web`, a local server token, or an additional login.

The endpoint was validated with the configured account but is not in Kimi's published account API reference, so the dashboard labels it experimental.

```bash
bun run test
bun run typecheck
```
