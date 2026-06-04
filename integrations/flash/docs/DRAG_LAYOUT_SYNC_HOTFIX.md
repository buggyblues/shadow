# Drag, stacked-card movement, and layout conflict hotfix

This note documents the 2026-06-04 hotfix for three runtime failures observed after the systemic engine patch:

1. `card_revision_conflict` surfaced during drag/layout writes.
2. In multi-select drag, the card closest to the pointer could jump or fly away.
3. Moving tightly stacked cards could produce unstable transforms or undefined `.length` errors.

## Root causes

`cards.update` originally used the same optimistic revision rule for all card mutations. That is correct for content, metadata, assets, and rule changes, but it is too strict for high-frequency layout commits. A drag-end packet can legitimately carry an older `clientRevision` because another tab, user, event replay, or rule card may have advanced the same card revision while the pointer was down. Treating that stale layout-only write as a hard 409 caused noisy server errors and visible rollback.

Multi-select drag also had an input-model mismatch. Matter.js selects a physics body from its collision query, while the renderer uses visual order, hidden state, and current deck/card ordering. In a stacked group these two answers can differ. The old handler used the physics body as the drag leader, so follower offsets were computed from a body that was not necessarily the visual card the user grabbed. This is the main cause of the nearest card jumping away from the mouse.

Stacked-card movement compounded the issue by issuing multiple independent move animations into a pile of overlapping physics bodies. The commands were not a single deterministic transform batch, so residual velocity, animation timing, or body ordering could make the pile drift or explode.

Several renderer and command paths also assumed that arrays such as `cards` or `linkedCardIds` were always present. During partial snapshot/replay or hand-written command invocation this can fail with `Cannot read properties of undefined (reading 'length')`.

## Server behavior

Layout-only stale writes now use merge/rebase semantics by default. When a `cards.update` input only contains layout fields (`x`, `y`, `angle`, `flipped`, `hidden`, `locked`) plus envelope fields, a stale `clientRevision` no longer throws `card_revision_conflict` unless `FLASH_REJECT_STALE_LAYOUT=true` is set. The service rebases the final transform onto the current row and records the event with `conflictPolicy: "merge-layout"` and `conflictResolved: "layout_rebased"`.

Non-layout mutations still keep strict optimistic concurrency. A stale content, metadata, file, script, or rule update continues to return 409 because automatic merge would be unsafe.

A new command, `cards.layout.update`, commits one or more final transforms as a single durable mutation. It is intended for drag-end, stacked-card move, arena layout, and rule-generated layout output. By default it records per-card conflicts but applies the final layout anyway. Tools that require exact revision matching may pass `conflictPolicy: "reject"`.

Recommended drag-end input:

```json
{
  "clientMutationId": "flash_layout_<client-generated-id>",
  "baseCursor": 123,
  "conflictPolicy": "merge-layout",
  "updates": [
    { "cardId": "card-a", "clientRevision": 7, "x": 320, "y": 240, "angle": 0.01 },
    { "cardId": "card-b", "clientRevision": 9, "x": 338, "y": 248, "angle": 0.02 }
  ]
}
```

## Client behavior

The drag leader is now chosen from renderer hit testing, not from Matter's arbitrary collision result. If Matter attached the mouse constraint to a different body, the input handler retargets the constraint to the visual leader before computing group offsets.

Follower cards are positioned relative to the leader throughout the drag and committed once at drag end. On release, leader and followers have their velocity and angular velocity cleared, then their final transforms are snapshotted and emitted via `onCardTransformsCommit`.

`FlashBoardSync.submitLayoutUpdates()` is the preferred client API for committing those snapshots. It performs local optimistic layout update, holds prediction locks, and sends `cards.layout.update` with the current board cursor. Legacy `updateCard()` layout-only calls are still tolerated by the service, but batching is more stable for multi-select and stacked-card operations.

`DeskLoop` now keeps local echo suppression for longer by default so a slow durable event does not immediately overwrite the just-released local transform.

## Stacked-card movement

The `/stack` command no longer dispatches multiple independent animated `/move` commands. It computes a deterministic pile from the first selected/card ID and directly sets each body position, angle, velocity, and sleeping state. This makes a stack operation one stable transform rather than many overlapping physics animations.

When committing stacked movement to the server, use `cards.layout.update` with the complete transformed set. A partial per-card commit can still produce order-dependent effects if another client observes the pile between individual writes.

## Defensive normalization

The renderer and command parser now normalize incoming card arrays before reading `.length`, iterating, or indexing. `linkedCardIds` is treated as an optional array when hashing textures. These guards do not replace schema validation, but they prevent transient partial snapshots from breaking the render loop.

## Operational flags

`FLASH_REJECT_STALE_LAYOUT=true` restores strict 409 behavior for stale layout-only `cards.update` inputs. This is useful for debugging but should normally stay off for interactive multiplayer boards.
