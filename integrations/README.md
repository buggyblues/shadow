# Shadow Server App Integrations

This directory contains runnable Server Apps. `kanban` is the canonical copyable demo; `qna`, `quiz`, `trainer`, `resume`, `flash`, `space`, and `warbuddy` show richer product patterns.

Run all standard demos locally:

```bash
cp integrations/.env.example integrations/.env
docker compose -f integrations/docker-compose.yaml --env-file integrations/.env up --build
```

Most apps keep JSON state in a named compose volume. `flash` uses its own PostgreSQL and Redis compose services for persistent boards and realtime rooms. Override ports, public iframe URLs, API URLs, and `SHADOW_SERVER_URL` in `integrations/.env`.

For independent app development with Vite client HMR and a watched server process:

```bash
pnpm -C integrations/kanban compose:dev
pnpm -C integrations/qna compose:dev
pnpm -C integrations/quiz compose:dev
pnpm -C integrations/trainer compose:dev
pnpm -C integrations/resume compose:dev
pnpm -C integrations/flash compose:dev
pnpm -C integrations/space compose:dev
pnpm -C integrations/warbuddy compose:dev
```

Use the matching `compose:dev:down` script from the same app directory to stop a
dev compose project.

When editing a manifest schema, regenerate the typed manifest module:

```bash
pnpm -C integrations/kanban typegen
pnpm -C integrations/qna typegen
pnpm -C integrations/quiz typegen
pnpm -C integrations/trainer typegen
pnpm -C integrations/resume typegen
pnpm -C integrations/flash typegen
pnpm -C integrations/space typegen
pnpm -C integrations/warbuddy typegen
```
