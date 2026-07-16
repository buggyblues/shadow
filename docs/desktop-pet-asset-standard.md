# Shadow Desktop Pet Codex Package Standard

## Goals

Shadow desktop pets use the Codex pet package contract so creators can reuse the
same package across Codex-compatible galleries and the Shadow desktop app. A
package is data-only: one `pet.json` manifest and one fixed-grid transparent
spritesheet.

## Pack Layout

```text
pet-pack/
  pet.json
  spritesheet.webp
```

Rules:

- `pet.json` is required and must be UTF-8 JSON.
- `spritesheetPath` must point to a local PNG or WebP in the same package folder.
- Paths are relative to `pet.json`.
- No remote URLs, absolute paths, `..`, symlinks, scripts, HTML, or executable files.
- Recommended package size limit: 80 MB.
- Recommended `pet.json` size limit: 64 KB.

## pet.json

Minimum manifest:

```json
{
  "id": "creator-lazy",
  "displayName": "Lazy Buddy",
  "description": "A concise Codex pet description.",
  "spriteVersionNumber": 2,
  "spritesheetPath": "spritesheet.webp"
}
```

Required fields:

- `id`: lowercase Codex pet slug.
- `displayName`: user-visible pet name.
- `spritesheetPath`: safe relative path to the atlas.

Recommended field:

- `description`: short package description.

`spriteVersionNumber` selects the Codex atlas contract:

- Omitted or `1`: legacy 8 x 9 atlas.
- `2`: extended 8 x 11 atlas with 16 look-direction cells.

`version` may be present for marketplace display, but Shadow does not require it.

## Spritesheet Contract

- Format: PNG or WebP.
- Dimensions: `1536 x 1872` for v1 or `1536 x 2288` for v2.
- Grid: 8 columns x 9 rows for v1 or 8 columns x 11 rows for v2.
- Cell: `192 x 208`.
- Background: transparent.
- Unused cells after each state's used frame count: fully transparent.

Rows:

| Row | State | Used frames |
| --- | --- | ---: |
| 0 | `idle` | 6 |
| 1 | `running-right` | 8 |
| 2 | `running-left` | 8 |
| 3 | `waving` | 4 |
| 4 | `jumping` | 5 |
| 5 | `failed` | 8 |
| 6 | `waiting` | 6 |
| 7 | `running` | 6 |
| 8 | `review` | 6 |

V2 adds two look-direction rows after the standard animation rows:

| Row | Directions |
| --- | --- |
| 9 | `000`, `022.5`, `045`, `067.5`, `090`, `112.5`, `135`, `157.5` |
| 10 | `180`, `202.5`, `225`, `247.5`, `270`, `292.5`, `315`, `337.5` |

## Codex Rendering Contract

Shadow renders the atlas with the same frame geometry and playback rules as the
Codex desktop pet:

- The visible viewport keeps the native `192 / 208` aspect ratio.
- The atlas background is sized to `800% x 900%` for v1 and `800% x 1100%` for
  v2. Frame positions use `column / 7` and `row / (rowCount - 1)` percentages;
  pixel offsets or a uniform frame rate are not compatible with Codex rendering.
- Each state uses the Codex per-frame timings. A non-idle state plays three
  complete cycles, then transitions to the slow idle loop.
- Idle uses the six standard idle cells with the Codex slow-idle timing.
- With reduced motion enabled, the renderer holds the first frame of the active
  state.
- V2 pointer tracking selects the nearest of the 16 look-direction cells. The
  standard animation continues when the pointer is inside the character
  deadzone; v1 packages do not use the look-direction rows.

Shadow maps care and runtime interactions onto those Codex states:

| Shadow interaction | Codex state |
| --- | --- |
| Idle / calm | `idle` |
| Drag right | `running-right` |
| Drag left | `running-left` |
| Pat / feed / tea / speaking | `waving` |
| Play / level up | `jumping` |
| Sick / runtime failed | `failed` |
| Rest / hungry / sleepy / voice input / waiting for approval | `waiting` |
| Explore / active runtime session | `running` |
| Completed runtime session | `review` |

## Marketplace Flow

Creator publishing:

1. Creator packages a folder as `.zip` with `pet.json` and `spritesheet.webp` at
   the archive root, or inside one top-level folder.
2. Creator opens the personal shop creator studio and chooses the
   `desktop_pet_pack` delivery preset.
3. The preset stores the archive as a protected `workspace_file`, grants
   `capability: "download"`, defaults to one-time purchase, and adds marketplace
   tags `desktop-pet-pack` and `虾豆桌面宠物`.

Buyer import:

1. Purchase creates a `workspace_file` entitlement with a paid-file deliverable
   for the package archive.
2. Purchase metadata records `desktopPetPack.kind = "desktop_pet_pack"`.
3. Desktop downloads the archive through the paid-file grant, extracts it
   locally, validates `pet.json` and the Codex spritesheet, then installs it into
   `userData/desktop-pet-packs`.
4. Local import accepts either an extracted package folder or a `.zip` /
   `.codex-pet.zip` package from Codex pet galleries. Users can also drop the
   archive directly onto the desktop pet to install it.
5. Settings shows purchased packages, installed packages, previews every Codex
   state, and lets the user choose the active pet.

## Validation Checklist

- `pet.json` parses and is below 64 KB.
- `id` is a stable lowercase slug.
- `spritesheetPath` is a safe relative PNG or WebP path.
- The spritesheet exists and is decodable.
- The spritesheet dimensions match `spriteVersionNumber`: `1536 x 1872` for v1 or
  `1536 x 2288` for v2.
- The package has no symlinks, scripts, HTML, binaries, remote paths, absolute
  paths, or path traversal.
