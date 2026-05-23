# StarPet Inn

StarPet Inn is a playable Server App pet game with persistent pet state, care, route training, ranked minigames, adventure maps, furniture upgrades, evolution progress, generated game art, procedural sound effects, and a leaderboard.

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
- `cats.pet`
- `cats.play`
- `cats.clean`
- `cats.rest`
- `cats.train`
- `cats.minigame`
- `cats.adventure`
- `cats.furniture.upgrade`
- `cats.leaderboard`

State persists through `PETCAT_DATA_FILE`.
