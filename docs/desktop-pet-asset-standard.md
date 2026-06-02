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
  "spritesheetPath": "spritesheet.webp"
}
```

Required fields:

- `id`: lowercase Codex pet slug.
- `displayName`: user-visible pet name.
- `spritesheetPath`: safe relative path to the atlas.

Recommended field:

- `description`: short package description.

`version` may be present for marketplace display, but Shadow does not require it.

## Spritesheet Contract

- Format: PNG or WebP.
- Dimensions: `1536 x 1872`.
- Grid: 8 columns x 9 rows.
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
- The spritesheet is exactly `1536 x 1872`.
- The package has no symlinks, scripts, HTML, binaries, remote paths, absolute
  paths, or path traversal.
