# Shadow App Integrations

This directory contains runnable Server App demos. `kanban` is the canonical copyable app; `qna`, `quiz`, `trainer`, `skills`, `flash`, `space`, and `warbuddy` cover richer product patterns.

For implementation rules, start with [Server App 开发手册](../docs/development/server-app-development-guide.zh-CN.md). This README is only the local runtime and deployment entry point.

## Document Map

| Need | Document |
| --- | --- |
| Architecture, client/server boundaries, implementation checklist | [Server App 开发手册](../docs/development/server-app-development-guide.zh-CN.md) |
| Manifest, endpoints, SDK, command protocol, security model | [Server App API Reference](../docs/api/server-app-integrations.md) |
| OAuth inside Shadow host | [Bridge OAuth 最佳实践](../docs/development/server-app-bridge-oauth-best-practices.zh-CN.md) |
| Sending work to Buddy Inbox | [Buddy 派任务最佳实践](../docs/development/server-app-buddy-task-dispatch-best-practices.zh-CN.md) |
| App UI/UX | [Server App UI/UX 设计规范](../docs/design-system/server-app-ui-ux-guidelines.zh-CN.md) |

## Local Development

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
pnpm -C integrations/skills compose:dev
pnpm -C integrations/flash compose:dev
pnpm -C integrations/space compose:dev
pnpm -C integrations/warbuddy compose:dev
```

Use the matching `compose:dev:down` script from the same app directory to stop a dev compose project.

## Production Runtime

The production compose file uses one combined `shadow-integrations` runtime for lightweight apps:

- `kanban`
- `qna`
- `quiz`
- `trainer`
- `skills`
- `warbuddy`

Their source trees stay separate under `integrations/<app>`, but production runs them in one Node process on port `4200`. The runtime routes by `Host` first and also supports `/<slug>/...` as a fallback for local debugging. `flash` and `space` remain separate services because they have heavier runtime dependencies.

Build and publish the combined image with the `publish-integrations-runtime` GitHub Actions workflow. Publish independent `flash` and `space` images with `publish-integration-images` when those app images change. Deploy by pulling published images and starting services from `integrations/docker-compose.prod.yaml`; the production compose file does not contain `build:` sections.

Important runtime env vars:

```dotenv
SHADOW_INTEGRATIONS_RUNTIME_IMAGE_TAG=latest
SHADOW_LEGACY_INTEGRATIONS_IMAGE_TAG=latest
INTEGRATIONS_RUNTIME_PORT=4200
INTEGRATIONS_PUBLIC_BASE_URL=https://apps.example.com
INTEGRATIONS_API_BASE_URL=http://integrations-runtime:4200

KANBAN_HOSTS=kanban.example.com
KANBAN_PUBLIC_BASE_URL=https://kanban.example.com
KANBAN_API_BASE_URL=http://integrations-runtime:4200/kanban
```

The combined runtime derives each lightweight app's manifest URLs from `INTEGRATIONS_PUBLIC_BASE_URL` and `INTEGRATIONS_API_BASE_URL` unless an app-specific `*_PUBLIC_BASE_URL` or `*_API_BASE_URL` overrides it. Change these environment variables when switching between host-run Shadow, Docker/Lima Shadow, or production; do not change runtime source defaults for a local manifest host.

Runtime-mounted app bundles must keep Vite assets relative (`base: './'`). Root asset URLs such as `/assets/app.js` lose the app slug when several apps share one host, which makes browser-loaded images, audio, workers, and chunks hit the wrong integration route.

## Installing Manifests

For a standalone local app:

```bash
shadowob app install \
  --server <server-id-or-slug> \
  --manifest-url http://host.lima.internal:4201/.well-known/shadow-app.json
```

For a path-mounted app in the combined runtime, install through the app slug and keep both browser-facing and Shadow-facing base URLs on that slug:

```bash
shadowob app install \
  --server <server-id-or-slug> \
  --manifest-url http://host.lima.internal:4200/kanban/.well-known/shadow-app.json
```

Repeat the `*_HOSTS`, `*_PUBLIC_BASE_URL`, and `*_API_BASE_URL` pattern for each lightweight app. Use comma-separated hosts when an app has aliases. Keep real infrastructure addresses and secrets out of the repository.

For Nginx, forward WebSocket upgrades to the same runtime for `warbuddy`, set upload limits high enough for Q&A image uploads and Skills packages, cache hashed `/assets/*` responses aggressively, and avoid caching SPA shell routes such as `/shadow/server`.

## Common Commands

Regenerate typed manifest modules after editing a manifest schema:

```bash
pnpm -C integrations/kanban typegen
pnpm -C integrations/qna typegen
pnpm -C integrations/quiz typegen
pnpm -C integrations/trainer typegen
pnpm -C integrations/skills typegen
pnpm -C integrations/flash typegen
pnpm -C integrations/space typegen
pnpm -C integrations/warbuddy typegen
```

Run focused validation for an app:

```bash
pnpm -C integrations/<app> typecheck
pnpm -C integrations/<app> build
pnpm biome check integrations/<app>/src --diagnostic-level=error
```

When SDK source changes affect integration imports, rebuild SDK before app typecheck:

```bash
pnpm -C packages/sdk build
pnpm -C integrations/<app> typecheck
```
