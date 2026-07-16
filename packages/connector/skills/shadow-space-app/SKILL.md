---
name: shadow-space-app
description: Build, publish, and operate Space Apps from an agent runtime. Use when an agent needs to create a Space App, expose an agent-hosted service safely, mount it under a Shadow domain, define Space App commands, register host-rendered desktop or mobile widgets, or call installed Space Apps through the shadowob CLI.
---

# Space App

Use this skill when creating, reviewing, publishing, or operating a Space App. An Space App is installed into a specific Shadow server, may expose a full Space App UI and host-rendered widgets, and exposes Buddy-callable commands through the Space App protocol.

This skill is distributed as a standard Skill package. Cloud runtimes receive it through the `shadowob` plugin's official skill injection, and local runtimes receive it through `shadowob-connector`; do not depend on a separate docs directory or CLI docs subcommand.

## Read References

- Read `references/space-app-standard.md` before designing or changing a Space App.
- Read `references/widgets.md` before adding or reviewing a host-rendered widget.
- Read `references/scaffold.md` before creating a new Space App from scratch or deciding whether to use the scaffold generator.
- Read `references/runtime-publish-backup.md` before exposing an agent container service, publishing to a `shadowob.com` subdomain, or designing persistence and backup.

## Non-Negotiable Rules

- Keep Space App-owned `/api/*` separate from Shadow gateway ingress. New Space Apps must expose Shadow platform routes only under `/.shadow/*`.
- Use the modeled `@shadowob/sdk` Space App helpers instead of reimplementing manifest rewriting, Shadow command token validation, command request parsing, JSON Schema validation, or actor labels.
- Use `shadow.space-app/1` manifests, stable `appKey` values, stable command names, and explicit `permission`, `action`, and `dataClass` on every command.
- Register small dashboard views through manifest widgets and a read-only command. Never inject Space App HTML, CSS, or JavaScript into the widget host, or implement widget-owned move and resize behavior.
- Buddies must operate installed Space Apps through `shadowob space-app discover`, `shadowob space-app skills`, and `shadowob space-app call`; never hand a Buddy raw HTTP routes, app tokens, or shared secrets.
- For local development, install with `--manifest-file`; production manifests, iframe URLs, API URLs, icon URLs, and OAuth redirect URIs must be stable HTTPS origins.
- Never publish public `http://<ip>:<port>` origins in a manifest. If a proxy forwards to a private host, keep the private address out of the public manifest.
- Never load Shadow OAuth inside the Space App iframe. Use a top-level popup or navigation and include `allow-popups-to-escape-sandbox` on the iframe sandbox.
- Keep iframe URLs stable. Space App UI must call Space App-owned `/api/*`; it must not call command ingress routes or Shadow gateway routes directly.
- Declare state paths and backup policy before publishing an agent-hosted app. Runtime code, build output, config, secrets, and mutable app state must have separate ownership and lifecycle.
- For a new Space App, start from `shadowob space-app generate <app-key>` or `node scripts/create-space-app.mjs <app-key>` unless the user asks for a different stack.

## CLI Workflow

```bash
shadowob space-app discover --server <active-server-id-or-slug> --json
shadowob space-app skills <app-key> --server <active-server-id-or-slug>
shadowob space-app call <app-key> <command> \
  --server <active-server-id-or-slug> \
  --json-input '{"key":"value"}' \
  --json
```

For binary command input:

```bash
shadowob space-app call <app-key> <command> \
  --server <active-server-id-or-slug> \
  --json-input '{"purpose":"import"}' \
  --file ./input.pdf \
  --json
```
