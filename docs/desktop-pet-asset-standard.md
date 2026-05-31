# Shadow Desktop Pet Asset Pack Standard

## Goals

Desktop pet packs should be safe to publish, easy to preview, and expressive enough for lively animation. The first runtime target is frame-based sprites. The schema leaves room for Live2D-style model runtimes later without mixing executable code into marketplace assets.

## Pack Layout

```text
pet-pack/
  metadata.json
  preview/
    cover.webp
    thumbnail.webp
  sprites/
    idle.png
    pet.png
    feed.png
    play.png
    rest.png
    explore.png
    tea.png
    sick.png
    level-up.png
  audio/
    optional.ogg
```

Rules:

- `metadata.json` is required and must be UTF-8 JSON.
- Paths are relative to `metadata.json`.
- No remote URLs, absolute paths, `..`, symlinks, scripts, HTML, or executable files.
- Recommended pack size limit: 80 MB.
- Recommended `metadata.json` size limit: 128 KB.
- Recommended image maximum: 4096 x 4096 per file.

## metadata.json

Minimum example:

```json
{
  "schemaVersion": "shadow.desktopPet.pack.v1",
  "id": "creator.slug",
  "version": "1.0.0",
  "displayName": {
    "en": "Harbor Buddy",
    "zh-CN": "港湾伙伴"
  },
  "description": {
    "en": "A calm desktop companion with soft idle motion."
  },
  "author": {
    "name": "Creator Name",
    "url": "https://example.com"
  },
  "license": {
    "kind": "marketplace-commercial",
    "summary": "Usable in Shadow desktop after purchase."
  },
  "compatibility": {
    "shadowDesktop": ">=0.2.1",
    "renderer": ["sprite-sheet"],
    "features": ["emotion-overrides", "hit-areas"]
  },
  "entry": {
    "renderer": "sprite-sheet",
    "pixelRatio": 2,
    "canvas": { "width": 256, "height": 320 },
    "anchor": { "x": 0.5, "y": 0.88 }
  },
  "files": {
    "cover": "preview/cover.webp",
    "thumbnail": "preview/thumbnail.webp"
  },
  "sprites": {
    "idle": {
      "src": "sprites/idle.png",
      "frame": { "width": 256, "height": 320, "count": 6, "fps": 6 },
      "loop": true
    },
    "pet": {
      "src": "sprites/pet.png",
      "frame": { "width": 256, "height": 320, "count": 8, "fps": 10 },
      "loop": false
    }
  },
  "expressions": {
    "content": { "motion": "idle", "overlay": null },
    "hungry": { "motion": "idle", "tint": "#fff2d6" },
    "sleepy": { "motion": "rest", "opacity": 0.92 },
    "sick": { "motion": "sick", "tint": "#b7ffd9" }
  },
  "hitAreas": {
    "body": { "x": 0.22, "y": 0.22, "width": 0.56, "height": 0.65, "actions": ["pet"] }
  },
  "interactionMap": {
    "feed": { "motion": "feed", "expression": "content" },
    "play": { "motion": "play", "expression": "excited" },
    "rest": { "motion": "rest", "expression": "sleepy" }
  }
}
```

Required top-level fields:

- `schemaVersion`
- `id`
- `version`
- `displayName`
- `compatibility`
- `entry`
- `sprites.idle`

Recommended fields:

- `description`
- `author`
- `license`
- `files.cover`
- `files.thumbnail`
- `sprites.pet/feed/play/rest/explore/tea/sick/level-up`
- `expressions`
- `hitAreas`
- `interactionMap`

## Sprite Specification

Supported image formats:

- PNG for lossless transparent animation.
- WebP for preview and optional sprite sheets.

Frame sheet rules:

- Horizontal sheet by default.
- Every frame has identical width and height.
- Transparent background.
- Chroma-key or solid cyan/magenta backgrounds must be cleaned before publishing.
- Anchor should place the pet's feet/body base consistently across all motions.
- Default canvas: 256 x 320 logical pixels.
- Recommended fps: idle 4-8, interaction 8-12, level-up 10-14.
- Recommended frame count: idle 4-10, interaction 6-16.

Motion keys:

- `idle`
- `pet`
- `feed`
- `play`
- `rest`
- `explore`
- `tea`
- `sick`
- `level-up`

Emotion keys:

- `excited`
- `content`
- `calm`
- `lonely`
- `hungry`
- `sleepy`
- `sick`

The runtime should fall back to `idle` when a motion is missing. During idle or fallback states,
`expressions.<emotion>.sprite` or `expressions.<emotion>.motion` can point to a sprite key such as
`hungry`, `sleepy`, or `sick`; if that referenced sprite is missing, the importer rejects the pack.
`hitAreas` use normalized 0..1 coordinates relative to the logical canvas, so creator packs scale
cleanly across compact and expanded desktop pet windows.

## Live2D-Compatible Direction

Live2D Cubism separates a model setting file from motions, expressions, physics, pose, user data, and display info. Shadow follows the same principle: `metadata.json` references assets, but does not embed or execute runtime logic.

Future runtime type:

```json
{
  "entry": {
    "renderer": "live2d-cubism",
    "model": "live2d/model3.json",
    "anchor": { "x": 0.5, "y": 0.9 }
  },
  "live2d": {
    "motionGroups": {
      "idle": "Idle",
      "pet": "TapBody",
      "feed": "Feed"
    },
    "expressionMap": {
      "excited": "smile.exp3.json",
      "sleepy": "sleepy.exp3.json"
    }
  }
}
```

This should require a separate renderer capability gate and Live2D license review before marketplace acceptance.

## Marketplace Flow

Creator publishing:

1. Creator packages a folder as `.shadowpet`, `.shadowpet.zip`, or `.zip` with `metadata.json` at
   the archive root.
2. Creator opens the personal shop creator studio and chooses the `desktop_pet_pack` delivery
   preset.
3. The preset stores the archive as a protected `workspace_file`, grants `capability: "download"`,
   defaults to one-time purchase, and adds marketplace tags `desktop-pet-pack` and `虾豆桌面宠物`.
4. Creator uploads a 3:2 product cover for storefront browsing; the desktop settings preview is
   generated from sprite frame metadata after import.
5. Product page shows provider, preview, compatibility, license, refund/support rule, and asset-home link.

Buyer import:

1. Purchase creates a `workspace_file` entitlement with a paid-file deliverable for the pack archive.
2. Purchase metadata records `desktopPetPack.kind = "desktop_pet_pack"` and `schemaVersion = "shadow.desktopPet.pack.v1"`.
3. Desktop fetches `/api/entitlements`, filters active desktop-pet-pack entitlements, and opens the paid file through `/api/paid-files/:fileId/open`.
4. Desktop downloads the archive with the short-lived paid-file grant token, extracts it locally, and validates the pack before installation.
5. Settings shows purchased packs, installed packs, preview, version, source product, and active toggle.

Current desktop implementation supports the same flow for local creator testing: Settings -> Pet
Packs -> Import Pack selects a folder, validates `metadata.json`, copies the pack into the
desktop `userData/desktop-pet-packs` directory, and renders previews through
`shadow-pet-asset://<pack-id>/<relative-path>`. The renderer CSP explicitly allows
`shadow-pet-asset:` image loading so imported packs render as their original transparent sprites
instead of a tinted fallback. Marketplace downloads should feed the downloaded folder or extracted
archive into this importer after entitlement checks.

Preview:

- Store and settings previews should render sprite sheets by frame metadata, not by displaying the
  whole sheet as a static image.
- Preview containers should preserve each sprite frame's `frame.width / frame.height` ratio. The
  default reference ratio is 256 x 320 logical pixels.
- Store preview should render idle, each interaction motion, and each emotion override.
- Broken or missing optional motions should be visible as fallback badges.
- The preview should never run scripts from the pack.

Settings:

- Installed packs list.
- Active pack selector.
- Preview animation grid.
- Reset to default pack.
- Pack source link and license summary.
- Remove local pack while keeping marketplace entitlement.

## Validation Checklist

- `metadata.json` parses and has `schemaVersion: "shadow.desktopPet.pack.v1"`.
- `id` is stable, lowercase slug-like, and unique per creator.
- `version` is semver.
- All file paths are relative safe paths.
- Required sprite files exist and are decodable.
- Frame metadata matches actual image dimensions.
- Every frame count is positive and within configured caps.
- No unsupported file extensions exist in the archive.
- Preview assets exist and are not oversized.
- Marketplace product has tag `desktop-pet-pack` and the public discovery tag `虾豆桌面宠物`.
- Marketplace product grants `resourceType: "workspace_file"` with `capability: "view"` or `download`.
- Paid file is a `.zip`, `.shadowpet`, or `.shadowpet.zip` archive containing `metadata.json` at the root.
- Desktop import also accepts archives with exactly one top-level folder when that folder contains
  `metadata.json`; this supports the common “zip the pet-pack folder” creator workflow.
