# Shadow Kanban App

Shadow Kanban is a standalone App. Run it as a separate process and connect it to Shadow through its manifest URL and command protocol.

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

Environment:

- `PORT`: App port. Defaults to `4201`.
- `SHADOW_SERVER_URL`: Shadow API base URL used for command token introspection. When this app runs directly on the host during local testing, use `http://localhost:3002`.
- `SHADOW_APP_PUBLIC_BASE_URL`: Browser-facing iframe/icon/manifest base URL. When the app runs on the host for local testing, use `http://localhost:4201` so the web client can load the iframe.
- `SHADOW_APP_API_BASE_URL`: Shadow-facing command API base URL. For local Shadow-in-Docker installs, use `http://host.lima.internal:4201` so the server container can call the app.
- `KANBAN_DATA_FILE`: JSON persistence file. Defaults to `./data/kanban-board.json`.

This integration is the reference App demo. It uses `@shadowob/sdk` for the modeled App runtime, typed command handlers generated from JSON Schema, Shadow OAuth command token introspection, input validation, actor profile display, and JSON persistence.

## Buddy Inbox workflow

Shadow Kanban demonstrates the Multica-style task flow without adding Kanban or issue concepts to Shadow core.

- `cards.create_and_dispatch` creates a board card, assigns a Buddy label, and returns `shadow.outbox.inboxTasks`.
- `cards.dispatch` assigns a board card to a Buddy label and returns `shadow.outbox.inboxTasks`.
- `cards.comment` stores the comment and returns `shadow.outbox.inboxTasks` when the body mentions `@Strategy Buddy`.

Shadow Server consumes `shadow.protocol === "shadow.app/1"` plus `shadow.outbox.inboxTasks`, resolves the target Buddy in the current server, publishes a Task Card to the Buddy Inbox channel, and returns delivery receipts under `shadow.outbox.deliveries`.

Kanban intentionally does not own Skills or scheduled Autopilot behavior. Skills live in the standalone `shadow-skills` App. Scheduled work should be modeled by an automation app or platform scheduler that enqueues ordinary Inbox task cards.

Local command smoke tests:

```bash
curl -s http://localhost:4201/api/local/commands/cards.create_and_dispatch \
  -H 'Content-Type: application/json' \
  -d '{"input":{"title":"Review release risks","assigneeLabel":"Strategy Buddy"}}'

curl -s http://localhost:4201/api/local/commands/cards.dispatch \
  -H 'Content-Type: application/json' \
  -d '{"input":{"cardId":"card_bot","assigneeLabel":"Strategy Buddy"}}'

curl -s http://localhost:4201/api/local/commands/cards.comment \
  -H 'Content-Type: application/json' \
  -d '{"input":{"cardId":"card_bot","body":"@Strategy Buddy please review launch risks"}}'
```
