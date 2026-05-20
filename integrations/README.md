# Shadow Server App Integrations

This directory contains runnable Server Apps. `kanban` is the canonical copyable demo; `qna`, `quiz`, `wheel`, `trainer`, `resume`, `petcat`, and `flash` show richer product patterns.

Run all standard demos locally:

```bash
cp integrations/.env.example integrations/.env
docker compose -f integrations/docker-compose.yaml --env-file integrations/.env up --build
```

Most apps keep JSON state in a named compose volume. `flash` uses its own PostgreSQL and Redis compose services for persistent boards and realtime rooms. Override ports, public iframe URLs, API URLs, and `SHADOW_SERVER_URL` in `integrations/.env`.

When editing a manifest schema, regenerate the typed manifest module:

```bash
pnpm -C integrations/kanban typegen
pnpm -C integrations/qna typegen
pnpm -C integrations/quiz typegen
pnpm -C integrations/wheel typegen
pnpm -C integrations/trainer typegen
pnpm -C integrations/resume typegen
pnpm -C integrations/petcat typegen
pnpm -C integrations/flash typegen
```
