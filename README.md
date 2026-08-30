# QuotaLens

A local-first dashboard for AI provider subscriptions, quota availability, reset windows, and renewal dates.

QuotaLens reads the live Pi provider configuration at runtime, queries provider-specific account APIs through dedicated connectors, and normalizes account snapshots without exposing credentials to the UI.

## Development

```bash
bun install
bun run index.ts
```
