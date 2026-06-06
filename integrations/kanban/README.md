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

Environment:

- `PORT`: App port. Defaults to `4201`.
- `SHADOW_SERVER_URL`: Shadow API base URL used for command token introspection. When this app runs directly on the host during local testing, use `http://localhost:3002`.
- `SHADOW_APP_PUBLIC_BASE_URL`: Browser-facing iframe/icon/manifest base URL. When the app runs on the host for local testing, use `http://localhost:4201` so the web client can load the iframe.
- `SHADOW_APP_API_BASE_URL`: Shadow-facing command API base URL. For local Shadow-in-Docker installs, use `http://host.lima.internal:4201` so the server container can call the app.
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

Local command smoke tests:

```bash
curl -s http://localhost:4201/api/local/commands/cards.create \
  -H 'Content-Type: application/json' \
  -d '{"input":{"id":"card_release_risks","title":"Review release risks","label":"Risk"}}'

curl -s http://localhost:4201/api/local/commands/cards.create \
  -H 'Content-Type: application/json' \
  -d '{"input":{"id":"card_source_research","title":"Research source material","label":"Research","prompt":"Summarize reusable facts."}}'

curl -s http://localhost:4201/api/local/commands/cards.link \
  -H 'Content-Type: application/json' \
  -d '{"input":{"sourceCardId":"card_release_risks","targetCardId":"card_source_research","kind":"related"}}'

curl -s http://localhost:4201/api/local/commands/cards.comment \
  -H 'Content-Type: application/json' \
  -d '{"input":{"cardId":"card_release_risks","body":"Ready for review."}}'
```
