# Code Trainer

Code Trainer is a Shadow Server App for LeetCode-style practice. Learners submit code, and a Buddy or human grader can fetch pending submissions, execute them externally, and write back verdicts with learning advice.

```bash
pnpm -C integrations/trainer typegen
pnpm -C integrations/trainer dev
```

Open `http://localhost:4213/shadow/server`.

Commands:

- `challenges.list`
- `challenges.get`
- `submissions.create`
- `submissions.list`
- `submissions.get`
- `submissions.pending`
- `submissions.judge`

State persists through `TRAINER_DATA_FILE`.
