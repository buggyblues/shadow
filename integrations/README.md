# Shadow App Integrations

This directory contains runnable Apps. `kanban` is the canonical copyable demo; `qna`, `quiz`, `trainer`, `resume`, `skills`, `flash`, `space`, and `warbuddy` show richer product patterns.

Apps in this directory should be treated as independent products that can run inside or outside Shadow. Shadow provides identity, server context, Buddy routing, media access, and authorization; the iframe bridge is only an embedded-host convenience. Use OAuth/REST/webhooks for durable behavior, call the app's own API for app data, synchronous business operations, and Buddy task dispatch, and use bridge only for host UI actions such as opening Shadow authorization surfaces, opening Copilot, opening a workspace resource, or launching the Buddy creator.

Long-lived UI data should store app-owned snapshots instead of Shadow signed URLs. For example, Q&A answers, Kanban cards, Flash records, and WarBuddy battle logs should save an avatar snapshot copied into the app's storage, plus the Shadow subject id and avatar version. Refresh those snapshots on page open, a background schedule, or Shadow webhook events; do not persist `/api/media/signed/...` URLs as permanent data.

The integration contract direction is documented in [docs/decisions/server-app-independent-integration-contract.zh-CN.md](../docs/decisions/server-app-independent-integration-contract.zh-CN.md).

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

The combined runtime derives each lightweight app's manifest URLs from
`INTEGRATIONS_PUBLIC_BASE_URL` and `INTEGRATIONS_API_BASE_URL` unless an
app-specific `*_PUBLIC_BASE_URL` or `*_API_BASE_URL` overrides it. Change these
environment variables when switching between host-run Shadow, Docker/Lima
Shadow, or production; do not change runtime source defaults for a local
manifest host.

Runtime-mounted app bundles must keep Vite assets relative (`base: './'`). Root
asset URLs such as `/assets/app.js` lose the app slug when several apps share
one host, which makes browser-loaded images, audio, workers, and chunks hit the
wrong integration route.

Embedded clients should use `createShadowServerAppClient()` without app-specific
path overrides. The SDK reads the launch frame and automatically maps local
commands/inboxes to `/<slug>/api/local/...` under the combined runtime. Apps
that use browser path routing instead of hash routing must derive their router
base path with `shadowServerAppMountedPath('/shadow/server')`; hard-coding
`/shadow/server` breaks when the iframe is mounted at `/<slug>/shadow/server`.

For path-mounted runtime installs, install the manifest through the app slug and keep both the browser-facing and Shadow-facing base URLs on that slug:

```bash
shadowob app install \
  --server <server-id-or-slug> \
  --manifest-url http://host.lima.internal:4200/kanban/.well-known/shadow-app.json
```

Repeat the `*_HOSTS`, `*_PUBLIC_BASE_URL`, and `*_API_BASE_URL` pattern for each lightweight app. Use comma-separated hosts when an app has aliases. `SHADOW_INTEGRATIONS_RUNTIME_IMAGE_TAG` selects the combined runtime image; `SHADOW_LEGACY_INTEGRATIONS_IMAGE_TAG` selects independent/legacy app images such as `flash` and `space`. Keep real infrastructure addresses and secrets out of the repository.

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
