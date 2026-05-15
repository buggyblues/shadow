# E2E Screenshot Pipeline

This directory stores reusable screenshot artifacts for Shadow README and docs workflows.

## What it covers

The screenshot pipeline has two tracks:

- README website/gallery captures from the public docs site
- multi-user product captures from the authenticated app flow

The current web screenshot flow captures:

- owner creates an invite code
- viewer registers with the invite code
- viewer joins a server from the invite page
- team channel conversation
- discover communities
- buddy marketplace
- workspace page
- owner / viewer DM thread

## Key files

- `session.json` — generated runtime session metadata for the current run
- `screenshots/` — exported PNG artifacts
- `../../scripts/e2e/capture-readme-gallery.mjs` — rebuilds docs site and refreshes `website/docs/public/readme/*`
- `../../scripts/e2e/seed-screenshot-env.mjs` — prepares reusable scenario data
- `../../apps/desktop/e2e/05_web/00_multi_user_gallery.spec.ts` — multi-user Playwright flow
- `../../apps/desktop/e2e/04_visual/01_readme_gallery.spec.ts` — README marketing/gallery flow
- `../../docker-compose.e2e.yml` — dedicated screenshot/E2E compose stack

## Local usage

From the repository root:

- `pnpm e2e:screenshots:all`
- `pnpm e2e:screenshots:readme`
- `pnpm e2e:screenshots:local`
- `pnpm e2e:screenshots:seed`
- `pnpm e2e:screenshots:web`

These commands expect an accessible Shadow web/server stack.

## Docker usage

From the repository root:

- `pnpm e2e:screenshots:docker`

This uses the dedicated compose file and writes artifacts back into this folder.

## Notes

- registration is invite-code gated by design
- the seed step generates a unique viewer account for rerun safety
- screenshots are intended to be reusable in README, docs, or release materials

## README image slots

README image assets are now refreshed by scripts:

- `website/docs/public/readme/*` — website / marketing surfaces
- `docs/e2e/screenshots/*` — authenticated product surfaces

## Current artifact set

- `01-owner-invite-created.png` — owner creates invite link
- `02-owner-invite-used.png` — invite management after viewer registration
- `03-viewer-server-invite.png` — viewer lands on server invite page
- `04-team-general-channel.png` — real team channel activity
- `05-owner-dm-thread.png` — owner / viewer DM thread
- `06-discover-communities.png` — discover page
- `07-buddy-marketplace.png` — buddy marketplace page
- `08-workspace.png` — shared workspace page
