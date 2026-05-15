# Desktop E2E Pipeline

The desktop E2E suite now targets the XiaDou pet client instead of the old web-shell and OpenClaw flows.

## What it covers

- Electron launches a transparent always-on-top pet window.
- The renderer stays sandboxed with `contextIsolation` and no Node access.
- The pet sprite, interaction actions, and bridge API render correctly.

## Key files

- `../../apps/desktop/e2e/00_pet/00_window.spec.ts` — Electron window, sprite, and security checks.
- `../../apps/desktop/e2e/helpers.ts` — shared Electron launch helper.
- `../../apps/desktop/__tests__` — game loop, auth callback parsing, and community URL unit tests.

## Local usage

From the repository root:

- `pnpm --filter @shadowob/desktop test`
- `pnpm --filter @shadowob/desktop test:e2e`

The E2E command builds the desktop app first so Playwright launches the current Electron bundle.
