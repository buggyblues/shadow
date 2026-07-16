# Space Apps

This directory contains production-grade Space App projects. `kanban` and `qna` are the most mature apps and should be treated as the current reference implementations. `quiz`, `trainer`, `skills`, `flash`, `space`, and `warbuddy` are real product surfaces, but still need hardening before they should be considered equally mature, especially around authentication, authorization, and command consent paths.

For implementation rules, start with [Space App 开发手册](../docs/development/space-app-development-guide.zh-CN.md). This README is only the local runtime and deployment entry point.

## Document Map

| Need | Document |
| --- | --- |
| Architecture, client/server boundaries, implementation checklist | [Space App 开发手册](../docs/development/space-app-development-guide.zh-CN.md) |
| Manifest, endpoints, SDK, command protocol, security model | [Space App API Reference](../docs/api/space-apps.md) |
| OAuth inside Shadow host | [Bridge OAuth 最佳实践](../docs/development/space-app-bridge-oauth-best-practices.zh-CN.md) |
| Sending work to Buddy Inbox | [Buddy 派任务最佳实践](../docs/development/space-app-buddy-task-dispatch-best-practices.zh-CN.md) |
| Space App UI/UX | [Space App UI/UX 设计规范](../docs/design-system/space-app-ui-ux-guidelines.zh-CN.md) |

## Local Development

Run all bundled Space Apps locally:

```bash
cp integrations/.env.example integrations/.env
docker compose -f integrations/docker-compose.yaml --env-file integrations/.env up --build
```

Most apps keep JSON state in a named compose volume. `flash` uses its own PostgreSQL and Redis compose services for persistent boards and realtime rooms. Override ports, public iframe URLs, API URLs, and `SHADOWOB_SERVER_URL` in `integrations/.env`.

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

Their source trees stay separate under `integrations/<app>`, but production runs them in one Node process on port `4200`. The shared service dispatches requests by `Host` first and also supports `/<slug>/...` as a fallback for local debugging. `flash` and `space` remain separate services because they have heavier dependencies.

Build and publish the combined image with the `publish-integrations-runtime` GitHub Actions workflow. Publish independent `flash` and `space` images with `publish-integration-images` when those app images change. Deploy by pulling published images and starting services from `integrations/docker-compose.prod.yaml`; the production compose file does not contain `build:` sections.

Important runtime env vars:

```dotenv
SHADOWOB_INTEGRATIONS_RUNTIME_IMAGE_TAG=latest
SHADOWOB_INTEGRATIONS_RUNTIME_IMAGE_TAG=latest
INTEGRATIONS_RUNTIME_PORT=4200
SHADOWOB_INTEGRATIONS_SERVER_URL=https://shadow.example.com
SHADOWOB_INTEGRATIONS_WEB_BASE_URL=https://shadow.example.com
# Optional same-site optimization; leave unset unless this URL is explicitly managed.
# SHADOWOB_INTEGRATIONS_INTERNAL_SERVER_URL=http://shadow-internal:3002
INTEGRATIONS_PUBLIC_BASE_URL=https://apps.example.com
INTEGRATIONS_API_BASE_URL=http://integrations-runtime:4200

KANBAN_HOSTS=kanban.example.com
KANBAN_PUBLIC_BASE_URL=https://kanban.example.com
KANBAN_API_BASE_URL=http://integrations-runtime:4200/kanban
```

In production, Space Apps should use Shadow's public HTTPS origin for `SHADOWOB_INTEGRATIONS_SERVER_URL` and `SHADOWOB_INTEGRATIONS_WEB_BASE_URL`. If an internal same-site route is required, configure `SHADOWOB_INTEGRATIONS_INTERNAL_SERVER_URL` explicitly; app code must not infer Docker hostnames or rewrite a configured public URL.

The combined runtime derives each lightweight app's manifest URLs from `INTEGRATIONS_PUBLIC_BASE_URL` and `INTEGRATIONS_API_BASE_URL` unless an app-specific `*_PUBLIC_BASE_URL` or `*_API_BASE_URL` overrides it. Change these environment variables when switching between host-run Shadow, Docker/Lima Shadow, or production; do not change runtime source defaults for a local manifest host.

Runtime-mounted app bundles must keep Vite assets relative (`base: './'`). Root asset URLs such as `/assets/app.js` lose the app slug when several apps share one host, which makes browser-loaded images, audio, workers, and chunks hit the wrong integration route.

## Maturity

| Space App | Status | Notes |
| --- | --- | --- |
| `kanban` | Mature | Reference implementation for manifest, command protocol, iframe UI, persistence, and Buddy task flows. |
| `qna` | Mature | Production-oriented Q&A/content workflow with image upload and persistent app state. |
| `quiz` | Hardening | Needs more auth/consent review before matching Kanban/Q&A maturity. |
| `trainer` | Hardening | Needs deeper authorization and command-boundary review. |
| `skills` | Hardening | Needs package upload and execution-path authorization review. |
| `flash` | Hardening | Heavier runtime with PostgreSQL/Redis; auth and realtime room boundaries need continued review. |
| `space` | Hardening | Product surface shares naming with platform Space; auth and terminology need extra care. |
| `warbuddy` | Hardening | Rich realtime/game-like app; auth, websocket, and asset access paths need more polish. |

## Space App Standard

New integrations should be production-grade Space Apps, not demos. Start from
`kanban` when you need a lightweight collaborative app with JSON persistence,
commands, iframe UI, and Buddy task flows. Start from `qna` when you need uploads,
content workflow, and persistent server-scoped state.

Use the SDK path as the default:

1. Treat `space-app.local.json` as the source of truth for app metadata,
   permissions, `action`, `dataClass`, approval mode, command schemas, Skills,
   events, and iframe/API routes.
2. Run `shadow-space-app typegen space-app.local.json src/space-app.generated.ts`
   and import the generated manifest into the app server.
3. Use `defineShadowSpaceApp()`, `shadowSpaceApp.defineCommands()`,
   `createShadowSpaceAppManifest()`, and `ShadowSpaceAppOutbox` instead of
   hand-rolling command dispatch, manifest rebasing, or Shadow-side effects.
4. Separate command actor, iframe launch session, and OAuth-bound user identity.
   Command handlers should trust the SDK context, not request-body identity.
5. Scope shared state by `context.serverId`; keep per-user preferences separate
   from shared server state; use idempotent mutation ids and event/cursor catch-up
   for collaborative or realtime flows.

The current standard baseline is implemented by `kanban` and `qna`:

- Embedded clients use `createShadowSpaceAppClient({ appKey: manifest.appKey })` and app-owned `/api/*`
  routes.
- Space App backends use the SDK's opaque Space App session manager. The embedded client
  exchanges its in-memory launch credential once, then Space App APIs use an
  `HttpOnly` session cookie plus CSRF token. Only the Space App Backend uses
  launch-scoped APIs for Buddy inboxes and `ShadowSpaceAppOutbox` delivery.
- Persisted people use SDK identity snapshots (`stableKey`, `subjectKind`,
  `userId`, `buddyAgentId`, `ownerId`, display name, avatar URL) so human and
  Buddy identities render consistently.
- Identity image URLs in those snapshots are stable public URLs from Shadow, not
  short-lived media URLs. Integrations should render user avatars, server icons,
  and Buddy avatars directly instead of refreshing or proxying them through media
  authorization endpoints.
- Shadow OAuth is optional account binding. A standard first-party Space App must not
  block core server access just because an app-specific OAuth client is missing.

## Installing Manifests

For a standalone local Space App:

```bash
shadowob space-app install \
  --server <server-id-or-slug> \
  --manifest-url http://host.lima.internal:4201/.well-known/space-app.json
```

For a path-mounted app in the combined runtime, install through the app slug and keep both browser-facing and Shadow-facing base URLs on that slug:

```bash
shadowob space-app install \
  --server <server-id-or-slug> \
  --manifest-url http://host.lima.internal:4200/kanban/.well-known/space-app.json
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

Run focused validation for a Space App:

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
