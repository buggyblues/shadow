# Shadow Server App Integrations

This directory contains runnable Server Apps. `kanban` is the canonical copyable demo; `qna` and `quiz` show richer product patterns.

Run all standard demos locally:

```bash
cp integrations/.env.example integrations/.env
docker compose -f integrations/compose.yaml --env-file integrations/.env up --build
```

Each app keeps JSON state in a named compose volume. Override ports, public iframe URLs, API URLs, and `SHADOW_SERVER_URL` in `integrations/.env`.

When editing a manifest schema, regenerate the typed manifest module:

```bash
pnpm -C integrations/kanban typegen
pnpm -C integrations/qna typegen
pnpm -C integrations/quiz typegen
```
