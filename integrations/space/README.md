# Space Server App

Space is a portfolio Server App for publishing personal HTML webpage artworks. It includes a profile homepage with custom CSS, Pinterest-style tags, public/private artworks, comments and interactions, remixes, favorites, version history, rollback, and HTML/ZIP upload into a MinIO-compatible CDN store.

```bash
pnpm -C integrations/space typegen
pnpm -C integrations/space dev
```

Open <http://localhost:4217/shadow/server> for local development.

For client HMR plus watched server reloads through Docker Compose:

```bash
pnpm -C integrations/space compose:dev
```

Uploads accept a single `.html` file or a `.zip` package. ZIP packages should include `index.html` at the root when possible; otherwise Space uses the shortest HTML file path as the preview entry.

Artwork covers and the portfolio cover accept PNG, JPEG, WebP, GIF, or SVG files.

Storage:

- With `SPACE_MINIO_ENDPOINT` or `MINIO_ENDPOINT`, uploaded version files are written to MinIO/S3-compatible storage.
- Without MinIO, Space falls back to `SPACE_CDN_DIR` or `./data/space-cdn` and serves files through `/cdn/...`.
- Preview URLs use `/preview/:artworkId/:versionId` and serve HTML with a sandboxing CSP.

Command handler input types are generated from `shadow-app.local.json` with `pnpm -C integrations/space typegen`. App state persists through `SPACE_DATA_FILE`.
