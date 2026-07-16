# Scaffold

Use this reference when creating a new Space App. The scaffold must stay domain-neutral so agents can build the user's requested Space App instead of copying a particular existing application.

## Preferred Generator

Use the Shadow CLI generator:

```bash
shadowob space-app generate <app-key> --dir <output-directory>
```

Optional flags:

```bash
shadowob space-app generate <app-key> \
  --dir <output-directory> \
  --name "<display name>" \
  --description "<manifest description>" \
  --port 4201
```

When working directly from the mounted skill package, this wrapper is equivalent:

```bash
node scripts/create-space-app.mjs <app-key> --dir <output-directory>
```

Use `--force` only when the user has asked to overwrite generated scaffold files.

## Generated Baseline

The generator creates:

- `space-app.local.json` with `shadow.space-app/1`, a Space App-owned API base URL, iframe entry, icon route, and one neutral `status.get` command whose ingress is `/.shadow/commands/status.get`.
- `src/space-app.generated.ts`, generated from the manifest so command input types are inferred from JSON Schema.
- `src/manifest.ts`, using `defineShadowSpaceApp`.
- `src/commands.ts`, using `shadowSpaceApp.defineCommands` for domain command handlers.
- `src/server.ts`, exporting an import-safe Hono app with Space App-owned `/api/*` routes and Shadow gateway ingress under `/.shadow/*`.
- `src/data.ts`, using `createShadowSpaceAppJsonStore`.
- `src/ui.ts`, a minimal iframe shell that should be replaced with the user's Space App experience.
- `README.md`, `Dockerfile`, `tsconfig.json`, `package.json`, and `.env.example`.

The generated `status.get` command is only a protocol smoke test. Replace or extend it with commands that match the user's requested domain.

## After Generating

1. Install dependencies.
2. Copy `.env.example` to `.env`.
3. Run the type generator after changing `space-app.local.json`.
4. Implement domain data and commands.
5. Replace the iframe shell with the real Space App UI. The UI must call Space App-owned `/api/*`, not command ingress routes.
6. Run local preview through `shadowob space-app preview --manifest-file`.
7. For Cloud runtime publish, keep the project under `$SHADOWOB_WORKSPACE`, `/workspace`, or `/home/shadow`, then run `PORT=<port> pnpm start:background` and verify `/health` with `curl`.
8. Publish only after state paths and backup policy are declared.

## Guardrails

- Do not copy commands, permissions, schemas, or data models from unrelated Space Apps.
- Do not embed public hosts, app keys, or ports from prior work.
- Keep permission names under the generated Space App key unless the user defines another permission namespace.
- Keep generated files small; add abstractions only after the user's Space App needs them.
- Keep platform ingress outside Space App-owned `/api/*`.
- Keep the Dockerfile non-root and production-only; do not add runtime docs bundles or app-specific patches to the image.
