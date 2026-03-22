---
name: demo-gif-engine
description: >
  Create animated demo GIFs for product pages using Playwright keyframe capture
  and the demo-gif rendering engine. Use when: (1) building a visual product
  walkthrough for a README or marketing page, (2) updating the Shadow demo GIF
  with new scenes or features, (3) adapting the engine for a different product.
  NOT for: static screenshots, video recording, or runtime E2E validation.
---

# Demo GIF Engine — AI Skill Guide

A two-stage pipeline that turns a live web app into a polished animated GIF:

1. **Capture** — A Playwright spec drives the real app, performing user actions
   and saving sequential PNG keyframes.
2. **Render** — The engine annotates frames (zoom, highlight, label badge),
   generates title cards via a pluggable theme, applies crossfade transitions
   and typewriter text reveals, then assembles everything into an optimised
   animated GIF using ffmpeg.

## Directory Layout

```
scripts/e2e/demo-gif/
├── engine/               # ← Generic, reusable toolkit
│   ├── index.mjs         #    Public API re-exports
│   ├── effects.mjs       #    Crossfade, zoom, highlight, label, easing
│   ├── assembler.mjs     #    ffmpeg 2-pass GIF assembly
│   └── renderer.mjs      #    Core rendering pipeline (scene loop)
├── theme.mjs             # ← Shadow-specific branding (swap for other products)
├── scenes.mjs            # ← i18n scene definitions & timing config
├── render.mjs            # ← Entry point (wires engine + theme + scenes)
└── orchestrate.mjs       # ← Full pipeline runner (Playwright → render)

apps/desktop/
├── e2e/04_visual/03_demo_flow.spec.ts   # Playwright frame capture spec
└── playwright.demo.config.ts            # Playwright config for demo capture
```

## Prerequisites

- Node ≥ 22 (top-level await)
- pnpm (workspace package manager)
- `sharp` installed in `apps/desktop` (image processing)
- `ffmpeg` on PATH (`brew install ffmpeg`)
- Playwright browsers installed (`pnpm --filter desktop exec playwright install`)
- App running locally (typically `pnpm dev` or `docker compose up`)
- E2E session seeded (`pnpm e2e:screenshots:seed`)

## Step 1 — Writing a Playwright Capture Spec

The capture spec is a standard Playwright test that drives the live app and
saves PNG screenshots as sequential keyframes.

### Key Patterns

```typescript
import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

const framesDir = path.resolve(__dirname, '../../../../docs/readme/showcase/demo-frames')

let frameIndex = 0

/** Save a numbered keyframe PNG. */
async function frame(page: Page, name: string) {
  const buf = await page.screenshot({ type: 'png' })
  const file = `${String(frameIndex++).padStart(2, '0')}-${name}.png`
  fs.mkdirSync(framesDir, { recursive: true })
  fs.writeFileSync(path.join(framesDir, file), buf)
}

test('product walkthrough', async ({ page }) => {
  // Navigate, interact, capture
  await page.goto('/app/some-page')
  await frame(page, 'page-overview')

  // Type into an input
  await page.locator('[data-testid="editor"]').pressSequentially('Hello world')
  await frame(page, 'typing')
})
```

### Best Practices

- **Sequential filenames** — Use `00-name.png`, `01-name.png`, etc. The
  `source` field in scenes.mjs references these filenames directly.
- **Viewport** — Match the product's expected display size. Shadow uses
  1420×900 (set in `playwright.demo.config.ts`).
- **Dark mode** — Set `colorScheme: 'dark'` in the Playwright config if the
  product has a dark theme.
- **Real data** — Use API calls within the test to seed realistic content
  (messages, users, etc.) before capturing frames.
- **Wait for stability** — Use `expect(locator).toBeVisible()` before
  screenshots to avoid capturing loading states.
- **Authentication** — Inject tokens via `localStorage.setItem()` or use
  Playwright's `storageState` for authenticated sessions.

## Step 2 — Defining Scenes

Edit `scenes.mjs` to declare the scene sequence, timing, and annotations.

### Scene Types

| Type    | Description | Required Fields |
|---------|-------------|-----------------|
| `title` | Brand title card (rendered by theme) | `text`, `style`, `duration` |
| `frame` | Playwright screenshot | `source`, `duration` |

### Frame Annotations

| Field       | Format | Effect |
|-------------|--------|--------|
| `zoom`      | `{ cx, cy, scale }` | Centre-based zoom-in/out animation. Values are normalised (0–1 for position, >1 for scale). |
| `highlight` | `{ x, y, r }` | Highlight ring callout. Normalised centre + radius. |
| `label`     | `string` or `{ en, zh }` | Bottom badge caption. Supports i18n. |

### i18n

Text and label fields can be plain strings (shared) or `{ en, zh }` objects.
The `scenesFor(lang)` function resolves the appropriate locale.

### Timing Config

```javascript
export const config = {
  outputWidth: 720,
  heroDuration: 2000,        // Hero title hold time (ms)
  actDuration: 1000,         // Act title hold time
  taglineDuration: 1600,     // Tagline hold time
  frameDuration: 1800,       // Normal frame hold time
  frameZoomedDuration: 1200, // Zoomed-in hold time
  shortFrameDuration: 1000,  // Quick frame
  closingDuration: 2400,     // Closing card
  typewriterDelay: 70,       // Per-character reveal delay
  zoomFrames: 4,             // Interpolation steps for zoom
  zoomFrameDelay: 50,        // Delay per zoom step
  crossfadeFrames: 3,        // Transition blend steps
  crossfadeDelay: 60,        // Delay per blend step
}
```

## Step 3 — Creating or Customising a Theme

A theme is an object with two properties:

```javascript
export const myTheme = {
  /** Render a title card frame. Called by the engine for every title scene. */
  async renderTitleFrame(sharp, scene, W, H, charCount, lang) {
    // Return a PNG buffer of size W×H.
    // `charCount` controls typewriter reveal (Infinity = full text).
    // `scene.style` is one of: 'hero', 'tagline', 'act', 'closing'.
  },

  /** Style tokens used for highlight rings and label badges. */
  style: {
    font: "'Inter', sans-serif",
    accentColor: '#00f3ff',
    accentMuted: 'rgba(0,243,255,0.6)',
  },
}
```

The Shadow theme (`theme.mjs`) provides a reference implementation with:
- Dot grid background with gradient colour blobs
- Cat logo SVG on hero / closing cards
- Halo ring glow effect behind the logo
- Gradient text for act titles
- Typewriter cursor

## Step 4 — Running the Pipeline

### Full pipeline (Playwright capture + render):

```bash
node scripts/e2e/demo-gif/orchestrate.mjs
# Or via pnpm script:
pnpm e2e:demo-gif
```

### Render only (when frames already exist):

```bash
node scripts/e2e/demo-gif/render.mjs
```

### Programmatic usage:

```javascript
import { renderGif } from './engine/index.mjs'
import { myTheme } from './theme.mjs'

await renderGif({
  sharp,                     // sharp constructor
  config,                    // timing config from scenes.mjs
  scenesFor,                 // i18n scene resolver
  locales: ['en'],           // locales to generate
  theme: myTheme,            // your theme object
  paths: {
    framesDir: './frames',   // where Playwright PNGs live
    showcaseDir: './output', // where GIF goes
  },
})
```

## Adapting for a Different Product

1. **Write a Playwright spec** that captures your product's key screens.
2. **Create `scenes.mjs`** listing your scenes with timing and annotations.
3. **Create a theme** with your brand's title card renderer and style tokens.
4. **Create a thin `render.mjs`** entry point that wires engine + theme + scenes.
5. **Run the pipeline** — the engine handles crossfade, zoom, typewriter,
   highlight, label badges, and GIF assembly automatically.

## Engine API Reference

### `engine/effects.mjs`

| Export | Signature | Description |
|--------|-----------|-------------|
| `easeInOutCubic(t)` | `number → number` | Cubic ease-in-out (0–1) |
| `lerp(a, b, t)` | `(number, number, number) → number` | Linear interpolation |
| `crossfade(sharp, src, dst, t, w, h)` | async | Pixel-level crossfade blend |
| `zoomRect(z, scale, w, h)` | `→ {left,top,width,height}` | Calculate crop rect |
| `zoomCrop(sharp, buf, z, scale, w, h)` | async | Crop-zoom + resize |
| `zoomAtT(sharp, buf, z, t, w, h)` | async | Zoom at interpolation t |
| `highlightSvg(hl, w, h, color)` | `→ string` | SVG highlight ring overlay |
| `labelBadgeSvg(text, w, h, style)` | `→ string` | SVG label badge overlay |

### `engine/assembler.mjs`

| Export | Signature | Description |
|--------|-----------|-------------|
| `checkFfmpeg()` | `→ boolean` | Verify ffmpeg availability |
| `assembleGif(dir, out, frames, opts)` | async | Two-pass ffmpeg GIF assembly |

### `engine/renderer.mjs`

| Export | Signature | Description |
|--------|-----------|-------------|
| `renderGif(opts)` | async | Full rendering pipeline |
