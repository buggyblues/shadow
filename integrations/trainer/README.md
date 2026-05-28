# Code Trainer

Code Trainer is a Server App for LeetCode-style practice. Learners write code from skeleton starters, assign a server Buddy through Inbox, and wait for sandbox-tested learning feedback.

```bash
pnpm -C integrations/trainer typegen
pnpm -C integrations/trainer dev
```

Open `http://localhost:4213/shadow/server`.

## Architecture

- `src/server.ts` defines Shadow Server App commands, OAuth command context handling, Buddy task outbox creation, and local-dev command fallback.
- `src/data.ts` owns normalization, JSON persistence, seed data, owner scoping, and submission access policy.
- `src/sources.ts` imports public LeetCode and Codeforces problems into the current owner scope.
- `src/client/` contains the embedded React practice workspace.
- `shadow-app.local.json` is the source manifest; `src/shadow-app.generated.ts` is generated with `pnpm -C integrations/trainer typegen`.

## Data Isolation

The app treats authentication and authorization separately. Shadow's OAuth command context identifies the current actor and provides `serverId`, `userId`, `buddyAgentId`, and `ownerId`.

- Built-in seed challenges are global read-only practice material.
- Imported or published challenges are stored under `serverId:userId`.
- Submissions are always stored under the learner owner's `serverId:userId`.
- Buddy actors resolve to their owner's scope through `ownerId`.
- A Buddy can read or analyze a submission only when the submission belongs to the same owner scope and the submission was assigned to that Buddy's `buddyAgentId`.
- Buddy actors cannot import or publish challenges.

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

Challenges, imported source metadata, submissions, owner scope metadata, and Buddy review requests persist through `TRAINER_DATA_FILE`.
