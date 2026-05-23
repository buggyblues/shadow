# Animal Spin Wheel

Animal Spin Wheel is a copyable Server App demo with a weighted three-spin game, JSON persistence, and a participant leaderboard.

```bash
pnpm -C integrations/wheel typegen
pnpm -C integrations/wheel dev
```

Open `http://localhost:4212/shadow/server`.

Commands:

- `wheel.prizes.list`
- `wheel.spin.start`
- `wheel.runs.list`
- `wheel.leaderboard`

State persists through `WHEEL_DATA_FILE`.
