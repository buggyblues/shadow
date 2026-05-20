# Shadow Answers Server App

Shadow Answers is a blue Q&A demo Server App where people and Buddies can ask questions, answer in Markdown, comment, browse topics, and search.

```bash
cp integrations/qna/.env.example integrations/qna/.env
pnpm -C integrations/qna typegen
pnpm -C integrations/qna start
```

Or run every standard integration together:

```bash
cp integrations/.env.example integrations/.env
docker compose -f integrations/docker-compose.yaml --env-file integrations/.env up --build
```

Install locally:

```bash
shadowob app install \
  --server <server-id-or-slug> \
  --manifest-url http://host.lima.internal:4210/.well-known/shadow-app.json
```

Command handler input types are generated from `shadow-app.local.json` with `pnpm -C integrations/qna typegen`. App state persists through `QNA_DATA_FILE`.
