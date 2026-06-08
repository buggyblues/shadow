# Shadow App Integrations

This directory contains runnable Apps. `kanban` is the canonical copyable demo; `qna`, `quiz`, `trainer`, `resume`, `skills`, `flash`, `space`, and `warbuddy` show richer product patterns.

Run all standard demos locally:

```bash
cp integrations/.env.example integrations/.env
docker compose -f integrations/docker-compose.yaml --env-file integrations/.env up --build
```

Most apps keep JSON state in a named compose volume. `flash` uses its own PostgreSQL and Redis compose services for persistent boards and realtime rooms. Override ports, public iframe URLs, API URLs, and `SHADOW_SERVER_URL` in `integrations/.env`.

## Production Runtime

The production compose file uses one combined `shadow-integrations` runtime for the lightweight apps:

- `kanban`
- `qna`
- `quiz`
- `trainer`
- `resume`
- `skills`
- `warbuddy`

Their source trees stay separate under `integrations/<app>`, but production runs them in one Node process on port `4200`. The runtime routes by `Host` first and also supports `/<slug>/...` as a fallback for local debugging. `flash` and `space` remain separate services because they have heavier runtime dependencies.

Build and publish the combined image with the `publish-integrations-runtime` GitHub Actions workflow. Deploy it by pulling `shadow-integrations:<tag>` and starting `integrations-runtime` from `integrations/docker-compose.prod.yaml`; the production compose file does not contain `build:` sections.

Important runtime env vars:

```dotenv
SHADOW_INTEGRATIONS_IMAGE_TAG=latest
INTEGRATIONS_RUNTIME_PORT=4200

KANBAN_HOSTS=kanban.example.com
KANBAN_PUBLIC_BASE_URL=https://kanban.example.com
KANBAN_API_BASE_URL=http://host.docker.internal:4200
```

Repeat the `*_HOSTS`, `*_PUBLIC_BASE_URL`, and `*_API_BASE_URL` pattern for each lightweight app. Use comma-separated hosts when an app has aliases. Keep real infrastructure addresses and secrets out of the repository.

For Nginx, forward WebSocket upgrades to the same runtime for `warbuddy`, set upload limits high enough for Q&A image uploads and Skills packages, cache hashed `/assets/*` responses aggressively, and avoid caching SPA shell routes such as `/shadow/server`.

For independent app development with Vite client HMR and a watched server process:

```bash
pnpm -C integrations/kanban compose:dev
pnpm -C integrations/qna compose:dev
pnpm -C integrations/quiz compose:dev
pnpm -C integrations/trainer compose:dev
pnpm -C integrations/resume compose:dev
pnpm -C integrations/skills compose:dev
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
pnpm -C integrations/skills typegen
pnpm -C integrations/flash typegen
pnpm -C integrations/space typegen
pnpm -C integrations/warbuddy typegen
```
