# Client Sync Compatibility Hotfix

This hotfix addresses two rollout failures observed after adopting durable board-local events:

1. UI code still receiving legacy command-completed notifications after every Flash mutation and issuing a full `boards.get` refresh.
2. Client sync code assuming every command result had an `events` array and every snapshot had complete arrays.

The engine should treat `flash.events.appended` and `boards.events` as the durable incremental path. `boards.get` should be used for initial load, explicit repair, or unrecoverable cursor gaps only. It should not run after every card move, selection update, or card click.


## SDK command unwrap fix

The root cause of `result.events is not iterable` was not only a missing guard in `FlashBoardSync`. The generic SDK command unwrapping function recursively unwrapped any object with a `result` property. `FlashMutationResult` legitimately contains both `result` and `events`; recursive unwrapping reduced it to only the domain `result` and discarded `events`, `cursor`, and `hasMore`.

`packages/sdk/src/server-app.ts` now unwraps only actual protocol envelopes, identified by `ok` or the Shadow protocol metadata. Domain results that happen to have a `result` field are left intact.

`src/client/api.ts` also avoids the generic SDK unwrap for local Flash commands and returns the top-level `payload.result` directly. This gives Flash stable command result semantics even during mixed rebuilds.

## Response normalization

`src/client/api.ts` now normalizes command responses at the API boundary.

All Flash mutation helpers return a `FlashMutationResult` with these invariants:

- `events` is always an array.
- `cursor` is always a non-negative number.
- `hasMore` is normalized when present and defaults to `false` for mutation results.
- protocol envelopes such as `{ ok: true, result: ... }` are unwrapped before the caller receives the result.
- malformed or empty event payloads are converted into an empty incremental result instead of throwing `result.events is not iterable`.

`getBoard()` also normalizes snapshots so `cards`, `arenas`, `selections`, and `events` are arrays even when an old bridge, partial response, or local development endpoint returns an incomplete shape.

This does not make malformed responses authoritative. It prevents the render loop from crashing and lets `FlashBoardSync` immediately run `boards.events` catch-up from the current cursor.

## Sync-layer hardening

`FlashBoardSync` now accepts unknown command results and normalizes them before applying events. Empty mutation results no longer throw; they schedule incremental catch-up.

Patch application is defensive. Missing `patches`, malformed `cards.updated`, or incomplete `selection.updated` payloads are ignored rather than terminating the loop.

This is especially important during mixed-version rollout, where one client may already publish board-local events while another client still has older command result assumptions.

## Full refresh suppression

`subscribeAppEvents()` now suppresses redundant `shadow.command.completed` events for durable Flash mutation commands when a board event stream is active.

The suppressed commands are:

- `assets.upload`
- `boards.viewport.update`
- `cards.create`
- `cards.update`
- `cards.layout.update`
- `cards.delete`
- `cards.command`
- `selection.update`
- `arenas.create`
- `arenas.activate`

Legacy callers that refresh the full board on `shadow.command.completed` should stop issuing `boards.get` after every click or move as long as they also subscribe to `flash.events`.

Older UIs that do not yet consume `flash.events` can opt back into the old behavior:

```ts
subscribeAppEvents(boardId, onEvent, {
  suppressDurableCommandCompleted: false,
})
```

That option should be temporary. The target architecture is incremental events by default and full snapshots only on initial load or explicit repair.

## Expected network pattern

A healthy interaction sequence should look like this:

```text
initial load:        boards.get
stream start:        /api/boards/:boardId/events?after=<cursor>
click selection:     selection.update -> flash.events.appended
card drag release:   cards.layout.update or layout-only cards.update -> flash.events.appended
catch-up if needed:  boards.events?after=<cursor>
```

It should not look like this during normal interaction:

```text
selection.update -> boards.events -> boards.get
cards.update     -> boards.events -> boards.get
```

A `boards.get` after every mutation means the UI is still listening to command-completed as a full-refresh trigger or treating an empty/malformed incremental result as fatal.

## Operational note

During rollout, keep the durable board event stream enabled and leave `suppressDurableCommandCompleted` at its default. If a client still fails to apply incremental events, the failure should be handled as a UI integration bug rather than reintroducing full-board refreshes for every command.
