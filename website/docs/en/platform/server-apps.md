# Server Apps

Server Apps let a Shadow server install external applications alongside channels and Buddies. People open the App through an iframe in the server page; Buddies operate the same App through `shadowob app` commands.

## Install

The server management modal owns App add, list, and grant flows. Installed Apps appear in the server sidebar above `CHANNELS`; clicking an App opens its iframe directly in the right pane, and clicking `APPS +` opens the management modal on the add App page. Server admins can install an existing App from the global catalog or add a custom manifest URL. The custom flow reviews the manifest first, with an OAuth-style screen showing the App icon, name, description, and requested permissions.

```bash
shadowob app install \
  --server <server-id-or-slug> \
  --manifest-file integrations/kanban/shadow-app.local.json
```

Apps are server-scoped. A server can install many Apps, and each Buddy needs an explicit grant before it can call App commands.
Command calls use short-lived opaque Shadow-issued OAuth Bearer tokens. The App backend introspects the token to resolve the user/Buddy identity and does not receive user JWTs or static shared secrets.

## Local Demos

The repo ships standard demo Apps for Kanban, Answers, Quiz, Animal Spin Wheel, Code Trainer, Super Resume, and Cloud Cat. Run them together with Docker Compose:

```bash
cp integrations/.env.example integrations/.env
docker compose -f integrations/docker-compose.yaml --env-file integrations/.env up -d --build
```

For the local Shadow Docker stack, keep iframe URLs browser-facing on `localhost`, and keep API/manifest URLs Shadow-facing on `host.lima.internal`:

```bash
shadowob app install --server shadow-plays --manifest-url http://host.lima.internal:4201/.well-known/shadow-app.json
shadowob app install --server shadow-plays --manifest-url http://host.lima.internal:4210/.well-known/shadow-app.json
shadowob app install --server shadow-plays --manifest-url http://host.lima.internal:4211/.well-known/shadow-app.json
shadowob app install --server shadow-plays --manifest-url http://host.lima.internal:4212/.well-known/shadow-app.json
shadowob app install --server shadow-plays --manifest-url http://host.lima.internal:4213/.well-known/shadow-app.json
shadowob app install --server shadow-plays --manifest-url http://host.lima.internal:4214/.well-known/shadow-app.json
shadowob app install --server shadow-plays --manifest-url http://host.lima.internal:4215/.well-known/shadow-app.json
```

Each demo persists app data in a named Compose volume. `docker compose -f integrations/docker-compose.yaml restart` keeps the data; `down -v` removes it.

For production installs, publish each App behind HTTPS and install the public manifest URL:

```bash
shadowob app install --server shadow-plays --manifest-url https://flash-app.shadowob.com/.well-known/shadow-app.json
```

Do not use public `http://<ip>:<port>` URLs in production manifests. HTTPS Shadow pages will block mixed-content iframes, icons, and frame navigations from IP-literal HTTP hosts. It is fine for Caddy, Nginx, or another proxy to live on a separate machine and forward to the App host by IP; the manifest should still expose only the HTTPS domain.

Reserve protocol routes before website fallback routes: `/.well-known/shadow-app.json` must reach the App, and legacy `/oauth/authorize` should redirect to the canonical browser OAuth entry `/app/oauth/authorize`.

## Buddy Access

```bash
shadowob app grant demo-desk \
  --server <server-id-or-slug> \
  --buddy <buddy-id> \
  --permissions demo.tickets:read,demo.tickets:write
```

Commands with `approvalMode: "first_time"` still need a one-time approval for that Buddy:

```bash
shadowob app approve demo-desk tickets.create \
  --server <server-id-or-slug> \
  --buddy <buddy-id>
```

Buddies discover App usage through generated Skill text:

```bash
shadowob app discover --server <server-id-or-slug>
shadowob app skills demo-desk --server <server-id-or-slug>
```

Channels can mention installed Apps directly, for example `@Demo Desk create a high priority ticket`. Shadow canonicalizes that as an App mention, passes appKey/serverId into the Buddy runtime, and the Buddy takes the `shadowob app discover` plus `shadowob app call` CLI path automatically.

## Command Calls

```bash
shadowob app call demo-desk tickets.list \
  --server <server-id-or-slug> \
  --json-input '{}'
```

Shadow validates the Actor, server membership, Buddy grant, command permission, and JSON limits before proxying the call to the App backend.

The iframe launch includes `shadow_event_stream`. Apps can listen with `EventSource` and refresh when Shadow emits `server_app.command.completed` after a Buddy changes App resources through the CLI.

Shadow keeps the iframe mounted while users switch between server routes. App launch context is cached until near expiry, global navigation data stays warm while refetching, and launch queries should not refetch on window focus. Server Apps should use event streams or local patching for routine updates instead of changing iframe `src`.

## Manifest

The App manifest uses `shadow.app/1`. It declares required `iconUrl`, iframe origins, API base URL, commands, permissions, data classes, optional binary limits, and concise Skill hints.

## Cloud Template

The `shadowob` Cloud plugin supports `serverApps` in templates. Provisioning creates the server and Buddy, installs the Server App, and grants the Buddy. The built-in `shadow-server-app-demo` template installs Demo Desk and lets the Buddy operate tickets with `shadowob app call`.

## Admin

The Shadow Admin “App Integrations” tab manages the global App catalog and lists every installed server App, command count, Skill count, Buddy grant count, iframe entry, and API endpoint. Global admins can add catalog entries from manifest URLs and uninstall an integration during an incident or support workflow.

See [Server App development guide](./server-apps-dev-guide), `docs/api/server-app-integrations.md`, and `integrations/kanban` for the full protocol and copyable demo project. Additional demos live in `integrations/qna`, `integrations/quiz`, `integrations/wheel`, `integrations/trainer`, `integrations/resume`, and `integrations/petcat`, and `integrations/docker-compose.yaml` can run all standard demo Apps locally with dotenv overrides.
