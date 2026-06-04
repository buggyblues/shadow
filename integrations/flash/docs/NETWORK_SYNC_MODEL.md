# Network Synchronization Model

This document defines the durable multiplayer synchronization model for Flash boards.

## Durable entities

The server persists cards, arenas, board viewport, selections, command events, board snapshots, and mutation receipts. Persistent updates are generated only by server commands. The client should not treat optimistic ECS state as durable until a returned or streamed command event confirms it.

## Event sequence

`flash_command_events.seq` is retained as a global append sequence for diagnostics. `flash_command_events.board_seq` is the board-local authoritative cursor. API responses expose `FlashCommandEvent.seq = board_seq` and may expose `globalSeq` separately.

Every board event stream is ordered by `board_seq`. Clients must only apply event `N` after event `N - 1`. If event `N + k` arrives first, it must be buffered and a catch-up request must be scheduled.

## Mutation idempotency

Every mutating input supports `clientMutationId` and `baseCursor`. `clientMutationId` should be globally unique from the client perspective, normally generated once per user intent. Reusing the same id means retrying the same command. The server checks existing events and mutation receipts before executing. A completed receipt returns the stored mutation result. A pending receipt returns `mutation_in_flight`. A failed receipt can be reset and retried.

This model prevents double application during HTTP timeout, bridge retry, mobile network reconnect, or user double-submit.

## Causal cursor

`baseCursor` is the durable cursor the client had applied when the user intent was created. The server records `causalLag` as the distance between the latest authoritative cursor and the submitted base cursor. Strict rejection is controlled by `FLASH_ENFORCE_BASE_CURSOR=true`. When enabled, a mutation based on a stale cursor returns `base_cursor_stale` rather than silently overwriting newer state.

Entity-level conflict detection still matters. Card updates support `clientRevision`; arena activation supports `clientRevision`. Commands that mutate specific entities should keep adding per-entity revisions where possible.

## Server append path

The durable append path is:

1. Resolve board and actor.
2. Start mutation transaction and acquire board advisory transaction lock.
3. Reserve or resolve mutation receipt.
4. Check causal cursor and optional entity revision.
5. Apply state writes.
6. Append command event with next board-local sequence.
7. Complete mutation receipt.
8. Publish realtime event.
9. Return `FlashMutationResult` with event and cursor.

The target invariant is that a durable state write and its event append are committed together. Engineers should keep this invariant when adding new mutation methods.

## SSE stream behavior

The board event stream subscribes to realtime first, queues live events while replay catches up, replays events after the requested cursor, flushes queued realtime events, then replays again to close any gap. The client still owns final ordering because network delivery can duplicate or reorder events.

`subscribeBoard` reconnects manually with `getAfter()`, so a reconnect uses the latest locally applied cursor rather than the initial URL cursor.

## Client apply behavior

`FlashBoardSyncState.applyEvent` has these rules:

- Drop an event if its id was already seen or its seq is not newer than the applied cursor.
- Buffer an event if `seq > cursor + 1`.
- Apply contiguous events only.
- Drain the buffer after each successful apply.
- Settle prediction locks when the event contains the same `clientMutationId`.
- Preserve locally predicted layout when a different stale event updates the same card during the hold window.

## Recommended UI integration

All persistent UI actions should route through `FlashBoardSync.submitMutation`. The callback should call the server command with the supplied envelope:

```ts
await sync.submitMutation([cardId], ({ clientMutationId, baseCursor }) =>
  updateCard({
    boardId,
    cardId,
    clientMutationId,
    baseCursor,
    clientRevision: card.revision,
    x,
    y,
    angle,
  }),
)
```

Drag movement should update local ECS immediately, but the durable command should commit the final transform only on pointer release. Remote drag preview belongs in the future transient channel.

## Future transient channel

A game-level multiplayer board should use two channels:

Durable command log: persisted card creation, card update, arena activation, rule result, selection commit, viewport commit, asset upload, and command result.

Transient tick stream: drag preview, cursor, hover, selection preview, remote ghost, animation trigger preview, and input acknowledgement. This can use WebSocket at 20 or 30 Hz with coalescing and ownership leases.
