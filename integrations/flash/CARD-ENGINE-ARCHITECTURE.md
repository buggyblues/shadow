# Flash Card Engine Architecture

Flash is moving toward a game-style card engine: ECS owns runtime state,
Workers own expensive asset preparation, and WebGL/WebGPU own composition.
React is only the playground/control surface.

## Goals

- Keep per-frame work bounded and predictable, even with animated cards.
- Make card rendering extensible by plugins without moving card faces into DOM.
- Treat card images, animation frames, and generated faces as assets with
  budgets, cache state, and lifecycle.
- Keep WebGPU as the target compositor with WebGL as the production fallback.

## Runtime Shape

```text
Card data
  -> ECS scene entity
  -> card face bake request
  -> asset pipeline cache
  -> GPU texture upload queue
  -> WebGL/WebGPU compositor
  -> single canvas
```

Native DOM events are collected at the canvas/container boundary and copied into
ECS input resources. Hover, drag, active animation, visibility, and texture
residency are ECS state. React does not process per-card pointer movement.

Dynamic runtime activation is also ECS state. The runtime component records
runtime kind, active/autoplay/preload/prewarm flags, and whether a dynamic
source may be prepared this frame. Content plugins consume this state through a
small runtime-state accessor, rather than starting GIF, Lottie, Three.js, or
Live2D work directly from React or ad hoc local decisions.

GIF, Lottie, Three.js, and Live2D preparation now runs in an ECS
runtime-prepare system. Their content systems only draw static stage/poster
geometry and record the dynamic layer rectangle; hover and prewarm no longer
have to dirty the full card face to start the runtime.

## Asset Pipeline

The asset pipeline is the stable integration point for card plugins and future
open-source backends.

## Open-Source Policy

Prefer proven libraries for domain-heavy systems. The engine should spend
custom code on orchestration, ECS state, shader composition, and plugin
contracts instead of reimplementing solved infrastructure.

| Domain | Library | Role |
| --- | --- | --- |
| ECS | `bitecs` | Dense SoA components and cache-friendly runtime state. |
| Spatial queries | `rbush` | Hover, selection, viewport prewarm, and dirty-region queries. |
| Physics | `matter-js`; future `@dimforge/rapier2d` | Current desktop physics; Rapier if Matter becomes CPU bound. |
| 3D dynamic source | `three` | Isolated 3D card content rendered into dynamic layers. |
| Live2D | `pixi.js` + `pixi-live2d-display` | Shared renderer for Live2D card content. |
| Lottie migration | `@lottiefiles/dotlottie-web` or ThorVG | Replace `lottie-web` hotspots with WASM/canvas renderers. |
| Authored vector animation | `@rive-app/webgl` | Preferred path for high-quality interactive vector animation. |
| Worker RPC | `comlink` | Worker bake/decode APIs without hand-written message plumbing. |
| High-quality 2D | `canvaskit-wasm` | Optional Skia backend for premium card-face baking. |
| GPU image assets | KTX2/Basis Universal tooling | Compressed card art, mipmaps, and lower upload/memory pressure. |

Any library adopted into runtime must sit behind a small engine-owned adapter so
plugins and render systems do not couple directly to vendor APIs.

### Static Face

The default backend is Canvas 2D. It bakes a complete card face into a reusable
canvas keyed by card hash and LOD. Future backends can be added behind the same
contract:

- Canvas 2D: default, smallest runtime cost.
- OffscreenCanvas Worker: background baking for large batches.
- CanvasKit/Skia: high-quality vector paths, filters, and Skottie.
- SDF text backend: crisp text when text must remain dynamic on the GPU.

### Image Assets

Large card art should become GPU assets instead of raw image uploads:

- KTX2/Basis Universal for compressed GPU textures.
- Mipmaps for zoomed-out cards.
- Worker decode and staged upload.
- LRU eviction by byte size and last-used frame.

The first KTX2/Basis integration registers compressed image candidates in the
asset pipeline while Canvas baking uses a drawable fallback. This prevents
blank card faces today and gives the GPU compositor a stable handoff point for
future direct compressed-texture upload.

The KTX2 runtime now ships a shared Basis transcoder path and a cached
`KTX2Loader` adapter for GPU sources that already have a Three.js renderer.
The WebGL renderer detects hardware compressed-texture support at startup, and
runtime stats expose both registered candidates and loaded KTX2 entries.

Image cards now register a static art layer instead of drawing the large image
into the baked face. The baked face keeps only cheap framing and caption
content, while WebGL composites the art as an independent GPU texture under the
same upload budget. The art shader supports `fill`, `contain`, and cropped
`cover` sampling with rounded masks, so high-resolution pictures can stay sharp
without invalidating the full card texture. Oversized source images are
downsampled to a bounded GPU edge before upload, avoiding multi-megabyte card
art uploads for small on-screen cards.

### Animation Assets

Animated cards should use one scheduler and one upload/composite path:

- Rive WebGL for authored interactive vector animation.
- dotLottie/ThorVG for existing Lottie assets.
- GIF converted to sprite sheet or video frames.
- Live2D through a shared Pixi renderer, manually ticked.
- Three.js through a shared renderer/context, with per-card scene state.

PixiJS and Three.js are exposed as shared runtime resources instead of being
hidden inside individual plugins. Live2D uses the shared Pixi app today, and 3D
cards use a single shared Three.js WebGL renderer while keeping independent
per-card scene/camera state. Future Pixi, Rive, or dotLottie adapters should
reuse the same lifecycle and scheduler.

Only visible, hovered, autoplay, or prewarm cards may tick. Inactive animated
cards show a poster frame.

Dynamic runtimes are materialized lazily. A GIF image element, Lottie player,
Three.js scene, or Live2D model is created only when the card is hovered,
autoplaying, or explicitly marked with `preload`. Normal visible cards render
lightweight poster content so the playground can display many animated card
types without silently starting dozens of decoders, RAF loops, WebGL contexts,
or model loaders. The shared Three.js renderer removes the old per-card WebGL
context cap and renders each due scene into that card's lightweight dynamic
source canvas for GPU compositing.

For GIF, Lottie, Three.js, and Live2D cards, hover changes only ECS runtime
state and the separate dynamic layer. The baked card face remains stable;
runtime first-frame completion invalidates the baked face once so inactive
cards get a real poster, while animation frame events bump only dynamic-layer
versions instead of invalidating the whole card texture.

The renderer maintains a small RBush-backed prewarm window for dynamic card
types. Only the nearest few visible/nearby dynamic cards become prewarm
candidates, which gives hover a warm start without reintroducing unbounded
runtime creation.

### Animation Runtime Scheduler

Dynamic runtimes must not own independent unconstrained frame work. All
animation sources request time from the shared animation scheduler:

- Three.js scenes have a per-frame tick cap and lower autoplay FPS.
- GIF/video/image-frame sources only mark new frames when active and under
  frame-mark budget.
- Lottie is paused outside hover/autoplay and its `enterFrame` marks are
  throttled by the scheduler.
- Live2D uses the shared Pixi renderer and a smaller per-frame tick budget.
- dotLottie/ThorVG/Rive adapters must implement the same runtime-source
  contract instead of starting their own RAF loops.

The scheduler is intentionally library-neutral. Open-source runtimes provide
decoding/rendering, while the engine owns activation, frame budgets, upload
budgets, and ECS state.

## GPU Compositor

The compositor draws cards as batched GPU instances:

- Position, scale, rotation, hover, flip, and texture layer are per-instance
  data.
- Static card faces are sampled from texture objects or texture arrays.
- Static art layers are sampled separately from the baked face.
- Dynamic animation layers are composited as separate GPU layers.
- Shader effects handle material, lighting, shadow, hover tilt, and foil-like
  styling.

Texture uploads are explicitly budgeted. A sudden batch of dirty card faces must
spread over frames instead of blocking one frame with dozens of `texImage2D`,
`texSubImage2D`, or `queue.writeTexture` calls.

## Spatial Runtime

The interaction layer uses `rbush` as the spatial index:

- Scene transforms produce conservative world-space bounds for each card.
- Pointer hover queries a tiny AABB instead of scanning every card.
- Rectangle selection searches the same index and then applies exact tests.
- Results are resolved by ECS render order so topmost cards win.
- The index is a resource rebuilt from ECS state; React never participates.

## Plugin Boundaries

Card plugins may provide:

- Content systems for static face baking.
- Render hints for full-bleed or background treatment.
- Asset hooks for external images, animation sources, poster frames, and
  preferred LOD.
- Optional runtime systems that read/write ECS state.

Plugins should not create independent RAF loops or long-lived DOM per card.
They should register assets and let the engine schedule ticks and uploads.

## Frame Budget Model

Each frame has fixed buckets:

- ECS update: input, visibility, hover, flip, animation activation.
- Physics: bounded delta, optional lower rate if needed.
- Asset upload: limited count and bytes per frame.
- Dynamic animation: active sources only.
- Render submit: one WebGL/WebGPU pass plus dynamic overlays.

The first implementation budgets texture uploads globally. Future iterations
will add Worker bake queues, KTX2 upload paths, and dynamic-layer frame budgets.

Runtime budget counters are exposed through `DeskLoopStats` so tooling can
observe upload count, upload bytes, skipped uploads, CPU texture-cache bytes,
animation ticks, frame marks, and skipped animation work without coupling to
React or DOM overlays.

## Resource Lifecycle

Card assets are allowed to move between CPU cache, GPU residency, and fully
evicted states:

- CPU card-face textures use an LRU cache with a byte budget.
- WebGL textures and WebGPU texture-array layers are released when non-visible
  cards sit idle or when resident bytes exceed budget.
- Eviction never destroys ECS card state; it only drops recreatable resources.
- Returning cards reuse the CPU face cache when available, otherwise rebake and
  upload through the same budgeted path.
- Dynamic media layers follow the same direction: active cards get GPU
  residency, inactive cards fall back to poster/static card faces.
