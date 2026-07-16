# Flash Operations and Migration Notes

This document describes rollout and operational behavior for the systemic Flash engine changes.

## Database migration

The migration adds or ensures:

- `flash_cards.revision`
- `flash_arenas.script`
- `flash_arenas.revision`
- `flash_command_events.board_seq`
- `flash_command_events.client_mutation_id`
- `flash_command_events.base_cursor`
- `flash_command_events.causal_lag`
- unique board-local event cursor index on `(board_id, board_seq)`
- unique mutation id index on `(board_id, client_mutation_id)` for non-null ids
- `flash_board_snapshots`
- `flash_mutation_receipts`

Existing command events are backfilled with `ROW_NUMBER() OVER (PARTITION BY board_id ORDER BY seq, created_at, id)`.

## Environment flags

`FLASH_ENFORCE_BASE_CURSOR=true` enables strict stale-base rejection. Leave it disabled during initial rollout if the UI has not fully adopted `FlashBoardSync` and `baseCursor`.

`FLASH_UPLOAD_DIR` controls image upload storage.

Standalone OAuth and Space App session settings remain independent. The board event stream always enforces the current Space App session or standalone identity boundary; there is no anonymous development bypass.

## Rollout order

1. Apply migration.
2. Deploy server with board-local cursor and mutation receipts.
3. Deploy client API reconnect changes.
4. Route UI mutation entry points through `FlashBoardSync`.
5. Enable debug HUD for render/network stats.
6. Turn on `FLASH_ENFORCE_BASE_CURSOR=true` only after conflict handling is confirmed.

## Incident diagnosis

For state divergence, inspect events by board-local cursor, not global cursor. Compare:

- current card/arena rows
- latest `flash_command_events` for the board
- `client_mutation_id`
- `base_cursor`
- `causal_lag`
- pending rows in `flash_mutation_receipts`

High `causal_lag` indicates a client acted on stale state. Repeated pending mutation receipts indicate client retries, server crash during mutation, or long-running command execution.

## Repair policy

A durable repair should be a new command event rather than direct silent table editing. If manual table repair is unavoidable, append a compensating event immediately afterward so clients can converge.

## Snapshot policy

`flash_board_snapshots` exists as the compaction boundary. The current code path still loads table state plus recent events. Future compaction should periodically store a snapshot at durable cursor N and allow clients to hydrate from snapshot plus events after N.

## Testing matrix

Minimum scenarios for engineers:

- Same `clientMutationId` retried after HTTP timeout.
- Two clients drag the same card with `clientRevision` conflict.
- SSE disconnect, 500 events produced, reconnect catches up.
- Live event arrives before replayed event; client buffers and applies in order.
- Arena activation with script output and rule card output.
- Rule script tries to modify card outside active ids; update is filtered.
- 1000-card render scene enters balanced or recovery tier without input lockup.
