# Flash Card Engine System Architecture

Flash is now organized as a card-first game engine rather than a single board UI. The engine model is split into durable state, event log, client sync, ECS/renderer, rules runtime, and operational tooling. Cards are the primary entity. Arenas and rule cards are higher-level systems that mutate groups of cards through explicit commands and durable events.

## Engine layers

The server owns durable state. `flash_cards`, `flash_arenas`, `flash_boards`, `flash_selections`, `flash_command_events`, and `flash_mutation_receipts` form the authoritative store. Every mutating command is expected to produce a durable command event with a board-local cursor. Clients must treat the event log as the canonical state transition stream.

The network layer has two responsibilities. Durable state changes go through command APIs and are published through the board event stream. Local and transient interactions are handled by the client prediction layer and can later move to a separate transient WebSocket channel. The durable channel must never carry uncontrolled drag spam; it should commit final transforms, arena activation results, rule results, selection changes, and persistent card changes.

The client sync layer is represented by `FlashBoardSync` and `FlashBoardSyncState`. It applies events only in board-local cursor order, buffers gaps, catches up through `boards.events`, and suppresses stale server echo while a local mutation is still predicted. UI entry points should route card creation, card updates, drag commits, selection, viewport updates, arena activation, and rule commands through this layer.

The ECS and renderer layer lives under `packages/cards`. `DeskLoop` owns the runtime loop, fixed-step physics, renderer, input handler, arena resource, animation manager, and render budget governor. The renderer should receive a stable card snapshot from sync state and should not directly infer server ordering.

The rules layer has two primitives. A `rule` card carries a script and config in metadata. A field/arena can also carry a script. Both execute in `FlashScriptEngine` with a bounded Worker/VM runtime, deterministic helpers, timeout, max output count, and capability filtering. Script output is normalized before it is persisted.

## Authoritative state principle

The server is authoritative for persistent state. The client may predict local drag and local UI state, but persistent mutations must return an event and cursor. A local prediction is considered settled only when its `clientMutationId` appears in a durable event or when the mutation fails and the client catches up.

## Board-local cursor principle

`FlashCommandEvent.seq` is now the board-local cursor, mapped from `flash_command_events.board_seq`. The database still keeps the global sequence as `globalSeq` for diagnostics. Client state must not compare cursors across boards.

## Mutation lifecycle

A mutation has `clientMutationId`, `baseCursor`, optional entity revision, command input, state writes, event append, mutation receipt completion, realtime publish, and client reconciliation. Reusing the same `clientMutationId` must return the same durable result rather than applying the command again.

## Renderer principle

Rendering and animation are budgeted. The loop measures frame time, physics time, render time, p95 frame time, dropped physics backlog, texture upload bytes, animation ticks, and local prediction count. These metrics drive texture upload and animation budgets. High-card-count boards should degrade animation and upload throughput before input latency degrades.

## Rules principle

Scripts do not mutate database state directly. They return declarative outputs: card layout/meta/visibility updates, arena membership/layout updates, and logs. The service validates capability, card scope, script size, output size, and timeout before applying the normalized result.

## Next architectural boundary

The current durable SSE channel is suitable for persisted state. The next major boundary is a transient WebSocket/tick channel for high-frequency drag previews, remote cursor, hover, presence, selection preview, and input acknowledgement. It should not replace the durable event log.
