# Shadow Skills Server App

Shadow Skills is a standalone Server App for server-owned Buddy skills. It is intentionally separate from Kanban and other domain apps.

```bash
pnpm -C integrations/skills typegen
pnpm -C integrations/skills build
pnpm -C integrations/skills start
```

Install locally through Shadow with:

```bash
shadowob app install \
  --server <server-id-or-slug> \
  --manifest-url http://host.lima.internal:4220/.well-known/shadow-app.json
```

Commands:

- `skills.list`: list skills in the server library.
- `skills.search`: search local packages and the indexed skills.sh snapshot.
- `skills.get`: read a skill.
- `skills.snapshot`: refresh the skills.sh snapshot.
- `skills.download`: download the complete skill package zip.
- `skills.upload`: upload a zip package or standalone `SKILL.md`.
- `skills.install`: dispatch an Inbox task asking a Buddy to download and install the zip.

Skill shape:

- A skill is stored as a package, not a single text blob.
- `SKILL.md` is the entrypoint.
- `references/`, `scripts/`, `assets/`, and `examples/` are first-class supporting files.
- The Vite/TanStack frontend can search, inspect, upload, download through commands, and install packages through Buddy Inbox.
- The built-in library starts empty. Public directory entries are added only by the skills.sh snapshot loop.

Environment:

- `PORT`: App port. Defaults to `4220`.
- `SHADOW_SERVER_URL`: Shadow API base URL used for command token introspection.
- `SHADOW_APP_PUBLIC_BASE_URL`: Browser-facing iframe/icon/manifest base URL.
- `SHADOW_APP_API_BASE_URL`: Shadow-facing command API base URL.
- `SKILLS_DATA_FILE`: JSON persistence file. Defaults to `./data/skills-library.json`.
- `SKILLS_SH_SNAPSHOT_INTERVAL_MS`: skills.sh refresh interval. Defaults to six hours.
- `SKILLS_SH_SNAPSHOT_DISABLED`: set to `1` to disable the startup/periodic snapshot loop.
