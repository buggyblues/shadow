# Code Trainer

Code Trainer is a Server App for LeetCode-style practice. Learners write code from skeleton starters, assign a server Buddy through Inbox, and wait for sandbox-tested learning feedback.

```bash
pnpm -C integrations/trainer typegen
pnpm -C integrations/trainer dev
```

Open `http://localhost:4213/shadow/server`.

Commands:

- `challenges.list`
- `challenges.get`
- `challenges.upsert`
- `sources.search`
- `sources.import`
- `submissions.create`
- `submissions.list`
- `submissions.get`
- `submissions.pending`
- `submissions.analyze`

Challenges, imported source metadata, submissions, and Buddy review requests persist through `TRAINER_DATA_FILE`.
