# Shadow Server App Demo

Demo Desk is a small TypeScript App that behaves like a real Shadow Server App:

- serves `/.well-known/shadow-app.json`
- serves `/assets/icon.svg` for OAuth-style install review
- renders `/shadow/server` as an iframe UI
- verifies Shadow OAuth Bearer command calls through token introspection
- exposes ticket commands for Buddies through `shadowob app call`
- includes a multipart command for binary protocol testing
- listens to Shadow's iframe event stream and refreshes after CLI writes

## Run

```bash
cd examples/shadow-server-app-demo
pnpm install
SHADOW_SERVER_URL="http://localhost:3002" pnpm dev
```

## Install Into Shadow

Use a user token with server admin rights:

```bash
shadowob app preview \
  --server <server-id-or-slug> \
  --manifest-url http://localhost:4199/.well-known/shadow-app.json
```

```bash
shadowob app install \
  --server <server-id-or-slug> \
  --manifest-file examples/shadow-server-app-demo/shadow-app.local.json
```

Grant a Buddy:

```bash
shadowob app grant demo-desk \
  --server <server-id-or-slug> \
  --buddy <buddy-agent-id> \
  --permissions demo.tickets:read,demo.tickets:write,demo.files:write
```

Call it as the Buddy:

```bash
shadowob app call demo-desk tickets.list \
  --server <server-id-or-slug> \
  --json-input '{}'

shadowob app call demo-desk tickets.create \
  --server <server-id-or-slug> \
  --json-input '{"title":"Prepare launch checklist","priority":"high"}'
```

Binary command:

```bash
shadowob app call demo-desk files.summarize_upload \
  --server <server-id-or-slug> \
  --json-input '{"purpose":"review"}' \
  --file ./README.md
```

## Docker Compose

The repository `docker-compose.yml` includes this demo as `shadow-server-app-demo`. The server is configured with `SHADOW_SERVER_APP_ALLOW_PRIVATE_HOSTS=shadow-server-app-demo` so Cloud templates can install the demo App from inside the compose network.
