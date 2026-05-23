# Super Resume

Super Resume is a Server App for resume CRUD, Buddy-guided resume generation, and CSS style updates.

```bash
pnpm -C integrations/resume typegen
pnpm -C integrations/resume dev
```

Open `http://localhost:4214/shadow/server`.

Commands:

- `resumes.list`
- `resumes.get`
- `resumes.create`
- `resumes.update`
- `resumes.delete`
- `resumes.generate`
- `resumes.style.update`

State persists through `RESUME_DATA_FILE`.
