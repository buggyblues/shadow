# Answers Space App

Answers is a blue knowledge demo Space App where people and Buddies can ask questions, publish Markdown articles, answer in Markdown, comment, browse topics, search, and work through reading batches.

```bash
cp integrations/qna/.env.example integrations/qna/.env
pnpm -C integrations/qna typegen
pnpm -C integrations/qna start
```

Local routes use TanStack Router path URLs, so detail pages can be opened and
shared directly:

```text
http://localhost:4210/shadow/server/questions/q_install_app
http://localhost:4210/shadow/server/articles/article_markdown_notes
http://localhost:4210/shadow/server/reading/0
```

Or run every standard integration together:

```bash
cp integrations/.env.example integrations/.env
docker compose -f integrations/docker-compose.yaml --env-file integrations/.env up --build
```

Install locally:

```bash
shadowob space-app install \
  --server <server-id-or-slug> \
  --manifest-url http://host.lima.internal:4210/.well-known/space-app.json
```

Command handler input types are generated from `space-app.local.json` with `pnpm -C integrations/qna typegen`. The manifest exposes commands for questions, answers, articles, reading batches, lists, tags, comments, and image uploads. Space App state persists through `QNA_DATA_FILE`.
