---
name: shadow-server-app
description: Build, publish, and operate Shadow Apps from an agent runtime. Use when an agent needs to create a server-installed App, expose an agent-hosted service safely, mount it under a Shadow domain, define App commands, or call installed Apps through the shadowob CLI.
---

# Shadow App

Use this skill when creating, reviewing, publishing, or operating a Shadow App. An App is installed into a specific Shadow server, renders an iframe UI, and exposes Buddy-callable commands through the Shadow App protocol.

This skill is distributed as a standard Skill package. Cloud runtimes receive it through the `shadowob` plugin's official skill injection, and local runtimes receive it through `shadowob-connector`; do not depend on a separate docs directory or CLI docs subcommand.

## Read References

- Read `references/server-app-standard.md` before designing or changing an App.
- Read `references/scaffold.md` before creating a new App from scratch or deciding whether to use the scaffold generator.
- Read `references/runtime-publish-backup.md` before exposing an agent container service, publishing to a `shadowob.com` subdomain, or designing persistence and backup.

## Non-Negotiable Rules

- Keep App-owned `/api/*` separate from Shadow gateway ingress. New Apps must expose Shadow platform routes only under `/.shadow/*`.
- Use the modeled `@shadowob/sdk` App helpers instead of reimplementing manifest rewriting, Shadow command token validation, command request parsing, JSON Schema validation, or actor labels.
- Use `shadow.app/1` manifests, stable `appKey` values, stable command names, and explicit `permission`, `action`, and `dataClass` on every command.
- Buddies must operate installed Apps through `shadowob app discover`, `shadowob app skills`, and `shadowob app call`; never hand a Buddy raw HTTP routes, app tokens, or shared secrets.
- For local development, install with `--manifest-file`; production manifests, iframe URLs, API URLs, icon URLs, and OAuth redirect URIs must be stable HTTPS origins.
- Never publish public `http://<ip>:<port>` origins in a manifest. If a proxy forwards to a private host, keep the private address out of the public manifest.
- Never load Shadow OAuth inside the App iframe. Use a top-level popup or navigation and include `allow-popups-to-escape-sandbox` on the iframe sandbox.
- Keep iframe URLs stable. App UI must call App-owned `/api/*`; it must not call command ingress routes or Shadow gateway routes directly.
- Declare state paths and backup policy before publishing an agent-hosted app. Runtime code, build output, config, secrets, and mutable app state must have separate ownership and lifecycle.
- For a new App, start from `shadowob app generate <app-key>` or `node scripts/create-server-app.mjs <app-key>` unless the user asks for a different stack.

## CLI Workflow

```bash
shadowob app discover --server <active-server-id-or-slug> --json
shadowob app skills <app-key> --server <active-server-id-or-slug>
shadowob app call <app-key> <command> \
  --server <active-server-id-or-slug> \
  --json-input '{"key":"value"}' \
  --json
```

For binary command input:

```bash
shadowob app call <app-key> <command> \
  --server <active-server-id-or-slug> \
  --json-input '{"purpose":"import"}' \
  --file ./input.pdf \
  --json
```
