# Shadow Kanban Server App

Shadow Kanban is a standalone Server App. Run it as a separate process and connect it to Shadow through its manifest URL and command protocol.

```bash
cp apps/kanban/.env.example apps/kanban/.env
pnpm -C apps/kanban start
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
