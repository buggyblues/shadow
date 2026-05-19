# Shadow Kanban Server App

Shadow Kanban is a standalone Server App. Run it as a separate process and connect it to Shadow through its manifest URL and command protocol.

```bash
cp integrations/kanban/.env.example integrations/kanban/.env
pnpm -C integrations/kanban typegen
pnpm -C integrations/kanban start
```

Or run every standard integration together:

```bash
cp integrations/.env.example integrations/.env
docker compose -f integrations/compose.yaml --env-file integrations/.env up --build
```

Install locally through Shadow with:

```bash
shadowob app install \
  --server <server-id-or-slug> \
  --manifest-url http://host.lima.internal:4201/.well-known/shadow-app.json
```

Environment:

- `PORT`: App port. Defaults to `4201`.
- `SHADOW_SERVER_URL`: Shadow API base URL used for command token introspection. When this app runs directly on the host during local testing, use `http://localhost:3002`.
- `SHADOW_APP_PUBLIC_BASE_URL`: Browser-facing iframe/icon/manifest base URL. When the app runs on the host for local testing, use `http://localhost:4201` so the web client can load the iframe.
- `SHADOW_APP_API_BASE_URL`: Shadow-facing command API base URL. For local Shadow-in-Docker installs, use `http://host.lima.internal:4201` so the server container can call the app.
- `KANBAN_DATA_FILE`: JSON persistence file. Defaults to `./data/kanban-board.json`.

This integration is the reference Server App demo. It uses `@shadowob/sdk` for the modeled Server App runtime, typed command handlers generated from JSON Schema, Shadow OAuth command token introspection, input validation, actor profile display, and JSON persistence.
