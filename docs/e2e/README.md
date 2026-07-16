# E2E Screenshot Pipeline

This directory stores reusable screenshot artifacts for Shadow docs and README workflows.

## What it covers

The screenshot pipeline has two tracks:

- reusable website docs screenshots that are explicitly referenced by `website/docs`
- product documentation screenshots generated from an independent, seed-stable product scenario

README images should use current product screenshots from `docs/e2e/screenshots`, not the removed
legacy marketing gallery.

## Key files

- `session.json` — generated runtime session metadata for the current run
- `screenshots/` — exported PNG artifacts
- `../../scripts/e2e/seed-screenshot-env.mjs` — prepares reusable scenario data
- `../../scripts/e2e/docs-screenshot-faker.mjs` — deterministic business faker for docs screenshots
- `../../scripts/e2e/seed-docs-screenshot-env.mjs` — prepares the community desktop / Cloud Computers docs scenario
- `../../apps/desktop/e2e/05_web/00_multi_user_gallery.spec.ts` — multi-user Playwright flow
- `../../apps/desktop/e2e/05_web/04_docs_screenshots.spec.ts` — product docs screenshot flow
- `../../docker-compose.e2e.yml` — dedicated screenshot/E2E compose stack

## Local usage

From the repository root:

- `pnpm e2e:screenshots:all`
- `pnpm e2e:screenshots:local`
- `pnpm e2e:screenshots:seed`
- `pnpm e2e:screenshots:web`
- `pnpm e2e:docs-screenshots:local`
- `pnpm e2e:docs-screenshots:seed`
- `pnpm e2e:docs-screenshots:web`

These commands expect an accessible Shadow web/server stack. For docs screenshot generation, start
the server with `SHADOWOB_DISABLE_RATE_LIMITS=true` and
`ENABLE_CLOUD_DEPLOYMENT_PROCESSOR=false`; the seed step creates multiple realistic servers, users,
channels, files, cloud computer records, and Buddy Inbox tasks in one pass and should not be slowed
down by request throttling or real cloud deployment reconciliation.

The docs-specific flow uses `DOCS_SCREENSHOT_SEED` to keep generated names, avatars, server
branding, wallpaper, workspace files, messages, agents, shop data, and desktop layout stable.
It creates separate community desktop scenes for travel, gaming, family, drawing, and music so product
docs can show different wallpapers, component layouts, and open-window states. Screenshots use a
1600x1000 CSS viewport with `E2E_SCREENSHOT_DEVICE_SCALE_FACTOR=2`, producing retina-ready
3200x2000 PNG files:

Seeded visual assets must come from `website/docs/public`: wallpapers, workspace photo widgets,
server icons, Buddy/user avatars, and Space App icons are uploaded from that public asset tree. The
generated session records the selected public paths in `publicAssets` so stale screenshots can be
traced back to the source assets that produced them.

```sh
DOCS_SCREENSHOT_SEED=shadow-docs-v1 pnpm e2e:docs-screenshots:local
```

The seed step writes `.tmp/e2e/docs-screenshot-session.json`. The Playwright step reads that file
and refreshes:

- `docs-desktop-travel-home.png`
- `docs-desktop-gaming-channel.png`
- `docs-desktop-family-file.png`
- `docs-desktop-art-cloud-computer.png`
- `docs-desktop-music-buddy-inbox.png`

## Docker usage

From the repository root:

- `pnpm compose:e2e:screenshots`

This uses the dedicated compose file and writes artifacts back into this folder. The compose
screenshot stack disables rate limits by default through `SHADOWOB_DISABLE_RATE_LIMITS` and keeps the
cloud deployment processor disabled through `ENABLE_CLOUD_DEPLOYMENT_PROCESSOR=false`.

## Notes

- registration is open for basic accounts; screenshot seeds use admin-created invite codes when they need member capabilities
- the docs seed has its own stable server, user, Buddy, file, wallpaper, and layout data
- screenshots are intended to be reusable in README, docs, or release materials

## README image slots

README image assets should reference authenticated product surfaces from `docs/e2e/screenshots/*`.

Current README slot:

- `docs-desktop-travel-home.png` — product desktop overview

## Current website docs artifact set

- `21-oauth-create-form.png` — OAuth app creation form
- `23-oauth-app-card.png` — OAuth app card
- `23b-oauth-edit-form.png` — OAuth app edit form
- `23c-oauth-app-card-with-logo.png` — OAuth app card with logo
- `27-oauth-authorize-consent.png` — OAuth authorization consent screen
- `28-oauth-authorize-redirect-success.png` — OAuth redirect success
- `33-tavern-lobby-channel.png` — Tavern lobby channel
- `34-tavern-bar-channel.png` — Tavern bar channel
- `35-tavern-smithy-channel.png` — Tavern smithy channel
- `36-tavern-arena-channel.png` — Tavern arena channel
- `37-tavern-quest-board.png` — Tavern quest board
