# Quiz Server App

Quiz is a Server App for publishing quizzes with standard answers, step-by-step answering, submissions, and human or Buddy grading.

```bash
cp integrations/quiz/.env.example integrations/quiz/.env
pnpm -C integrations/quiz typegen
pnpm -C integrations/quiz start
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
  --manifest-url http://host.lima.internal:4211/.well-known/shadow-app.json
```

Command handler input types are generated from `shadow-app.local.json` with `pnpm -C integrations/quiz typegen`. App state persists through `QUIZ_DATA_FILE`.
