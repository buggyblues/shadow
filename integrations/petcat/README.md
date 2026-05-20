# Cloud Cat

Cloud Cat is a Shadow Server App pet game with generated transparent cat assets, persistent pet state, attribute decay, care actions, automation commands, and a cat leaderboard.

```bash
pnpm -C integrations/petcat typegen
pnpm -C integrations/petcat dev
```

Open `http://localhost:4215/shadow/server`.

Commands:

- `cats.assets.list`
- `cats.adopt`
- `cats.list`
- `cats.get`
- `cats.feed`
- `cats.play`
- `cats.clean`
- `cats.rest`
- `cats.auto_feed`
- `cats.leaderboard`

State persists through `PETCAT_DATA_FILE`.
