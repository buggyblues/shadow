# Rendering and Animation Performance Model

Flash rendering is designed around frame budgets instead of unlimited per-frame work. The goal is to keep input latency and frame pacing stable when the board contains hundreds or thousands of cards, some with dynamic media.

## Runtime loop

`DeskLoop` owns the browser runtime. It calls animation updates, command animation ticks, fixed-step physics, renderer submission, and stats recording. Physics uses `FrameGovernor` so simulation steps are fixed and backlog is capped. This avoids large `delta` spikes after tab throttling, resize, or GC pause.

## Render budget governor

`RenderBudgetGovernor` tracks frame time samples, p95 frame time, dropped physics backlog, and card count. It outputs a quality tier and per-frame recommendations:

- texture upload count
- texture upload bytes
- animation tick count
- Three.js tick count
- Live2D tick count
- dynamic frame mark count

`DeskLoop` applies these recommendations to `cardAssetPipeline.configureTextureUploadBudget` and `animationManager.configureScheduler` before each frame.

## Quality tiers

`ultra` allows high animation and upload throughput. `high` is normal operating mode. `balanced` reduces upload and animation work for dense boards. `recovery` prioritizes input and visible frame pacing after p95 frame time or dropped backlog exceeds the budget.

The tier system should be treated as a governor, not a replacement for algorithmic work. A persistent `recovery` tier means the renderer still needs batching, culling, asset compression, or worker offload.

## Metrics exposed by `DeskLoop.getStats()`

Important fields include:

- `fps`
- `frameMs`
- `frameP95Ms`
- `physicsMs`
- `renderMs`
- `physicsSteps`
- `physicsDroppedMs`
- `textureCacheBytes`
- `assetUploadBytes`
- `assetSkippedUploads`
- `animationTicks`
- `animationSkippedTicks`
- `renderQualityTier`
- `locallyControlledCards`

A debug HUD should display these values directly. Performance investigations should use p95 and backlog rather than only average FPS.

## Asset pipeline

`cardAssetPipeline` gates texture uploads. Future card-face baking should go through this boundary, including OffscreenCanvas, compressed textures, atlas/array allocation, and GPU memory LRU. Direct per-card texture uploads in render systems should be avoided unless they request budget first.

## Animation scheduler

Dynamic cards should animate only when hovered, explicitly autoplaying, visible enough, or required by a rule/command. GIF, Lottie, Three.js, Live2D, and other runtimes should all pass through the shared animation scheduler to prevent runtime stampedes.

## Acceptance targets

Use repeatable scenes:

- 500 static cards, 0 dynamic cards.
- 1000 static cards, 10% dynamic cards.
- 1000 cards with continuous zoom and pan.
- 500 cards with 4 concurrent local/remote drag previews.
- Arena activation affecting 50 cards.
- Rule script returning 50 card layout updates.
- Disconnect and reconnect after 500 durable events.

Track p50/p95 frame time, worst frame time, texture upload bytes per frame, skipped uploads, animation skipped ticks, and visual correctness after catch-up.

## Next renderer work

The next rendering package should add OffscreenCanvas card bake workers, texture atlas or texture array allocation, visibility culling linked to spatial index, GPU memory LRU, and a built-in debug HUD. WebGPU should use the same budget and stats interfaces so backend switching does not bypass scheduling.
