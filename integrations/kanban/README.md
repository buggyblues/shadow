# Kanban App

Kanban is a standalone App. Run it as a separate process and connect it to Shadow through its manifest URL and command protocol.

```bash
cp integrations/kanban/.env.example integrations/kanban/.env
pnpm -C integrations/kanban typegen
pnpm -C integrations/kanban start
```

Or run every standard integration together:

```bash
cp integrations/.env.example integrations/.env
docker compose -f integrations/docker-compose.yaml --env-file integrations/.env up --build
```

Install locally through Shadow with:

```bash
shadowob app install \
  --server <server-id-or-slug> \
  --manifest-url http://host.lima.internal:4201/.well-known/shadow-app.json
```

When Kanban is served from the combined integrations runtime, install the path-mounted manifest instead:

```bash
shadowob app install \
  --server <server-id-or-slug> \
  --manifest-url http://host.lima.internal:4200/kanban/.well-known/shadow-app.json
```

For local host-run Shadow, start the combined runtime with environment-derived
manifest URLs instead of changing source defaults:

```bash
INTEGRATIONS_PUBLIC_BASE_URL=http://localhost:4200 \
INTEGRATIONS_API_BASE_URL=http://localhost:4200 \
pnpm -C integrations/runtime dev
```

For Docker/Lima Shadow, keep the browser-facing base on `localhost` and set the
Shadow-facing API base to the host alias visible from the server container.

Environment:

- `PORT`: App port. Defaults to `4201`.
- `SHADOWOB_SERVER_URL`: Shadow API base URL used for command token introspection. When this app runs directly on the host during local testing, use `http://localhost:3002`.
- `SHADOWOB_APP_PUBLIC_BASE_URL`: Browser-facing iframe/icon/manifest base URL. When the app runs on the host for local testing, use `http://localhost:4201` so the web client can load the iframe.
- `SHADOWOB_APP_API_BASE_URL`: Shadow-facing command API base URL. For local Shadow-in-Docker installs, use `http://host.lima.internal:4201` so the server container can call the app.
- `KANBAN_DATA_FILE`: JSON persistence file. Defaults to `./data/kanban-board.json`.

This integration is the reference App demo. It uses `@shadowob/sdk` for the modeled App runtime, typed command handlers generated from JSON Schema, Shadow OAuth command token introspection, input validation, actor profile display, and JSON persistence.

## Buddy Inbox coordination

Kanban is a generic task board. It does not execute domain work, own Skills, or send work to a default Buddy. People or coordinator Buddies use it to create cards, track state, and attach artifact references.

- `cards.create` creates a normal task card.
- `cards.link` stores typed card relationships such as dependency or parent-child.
- `cards.update` updates status, progress, prompt, labels, priority, and column state.
- `cards.rerun` reopens a card for retry or revision.
- `cards.artifacts.add` attaches workspace artifact references from Buddy/runtime work.

Buddy assignment and real work routing happen outside the Kanban app through Buddy Inbox. A coordinator Buddy can discover server Buddies, create generic cards in Kanban, link those cards into larger work graphs when needed, enqueue work to the chosen Buddies through their Inbox, and submit summaries or artifact references back to Kanban.

Embedded Kanban dispatch has a fixed product sequence:

1. Create the Kanban task card first and refresh the board so the user's work is visible.
2. Ask the Shadow host through bridge for the current server Buddy context and ensure
   `buddy_inbox:deliver` for the selected Buddy.
3. Dispatch the created card through the App Backend -> Shadow path. Bridge must not carry the
   business dispatch command. Shadow keeps the backend dispatch request open for up to 60 seconds
   and polls authorization every 5 seconds, so a just-granted Buddy delivery permission can
   complete the original Send action.
4. After Shadow returns a Buddy Inbox delivery receipt, call `bridge.openCopilot(delivery)` so the
   host enters Copilot mode for the created Inbox task card.

Runtime commands are launch-only. For local smoke tests, install Kanban into a Shadow server and
open it from Shadow so the iframe carries `X-Shadow-Launch-Token`; do not call App routes as an
anonymous local user.
