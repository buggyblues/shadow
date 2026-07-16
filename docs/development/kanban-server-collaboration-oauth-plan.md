# Kanban Server Collaboration And Shadow OAuth Plan

> Superseded on 2026-06-25 by [Space App Shadow Gateway 契约简化](../decisions/space-app-shadow-gateway-contract.zh-CN.md). Keep this file only as historical Kanban context; do not copy its old runtime-command routing model into new Apps.

## Goal

Kanban is moving from a local single-board demo to a server-scoped collaboration app for humans and
Buddies. Under the current contract, Kanban keeps a Trello-familiar board/list/card surface while
using Space App-owned `/api/*` for UI business operations and Shadow gateway commands only for Buddy/CLI
automation.

## Product Model

Kanban owns generic project state only:

- Server: the Shadow collaboration boundary.
- Project: a server-owned workspace for related boards.
- Board: a project view with lists, cards, links, comments, and artifact references.
- List: a workflow stage.
- Card: the smallest work record, assignable to people or Buddies.
- Actor reference: the audited identity that created, updated, commented, dispatched, or completed
  work.

Kanban must not own domain execution, runtime skills, default business flows, or private source
material. Buddies and runtime tools do work through Buddy Inbox and write back status, comments, and
workspace artifact references through Kanban commands.

## Flash OAuth Pattern To Reuse

Historical Flash pattern:

- `/api/oauth/session` exposes OAuth configuration and the current user profile to the iframe.
- `/shadow/oauth/start` and `/shadow/oauth/callback` run a Shadow OAuth authorization-code flow and
  store a signed httpOnly app-session cookie.
- Shadow gateway commands execute through `/.shadow/commands/*` with Shadow command tokens.
- Local browser operations use Space App-owned `/api/*`.

Kanban should reuse only the OAuth account-linking split. The Space App session tells the embedded UI who
the local App user is. Shadow gateway command authorization decides what a Buddy/CLI actor may do.

## Kanban-Specific Differences From Flash

Flash resolves a personal board by `serverId + ownerUserId`. Kanban must not do that because Kanban
is a multi-user server collaboration surface.

Kanban resolves state by:

```text
serverId -> projectId -> boardId
```

`ownerId` remains useful only for Buddy inheritance and audit display. It must not be the board
partition key.

## Authorization Rules

- Frontend input never supplies trusted `serverId`, `actor`, `ownerId`, or Buddy identity.
- Space App-owned `/api/*` derives trusted user identity from the Kanban Space App session.
- Shadow gateway command handlers derive trusted automation scope from the Shadow command context.
- `/.shadow/commands/*` is the Space App command boundary for Shadow/Buddy execution. It uses
  Shadow command tokens and does not depend on the browser OAuth cookie.
- Read commands require `kanban.boards:read`.
- Write commands require `kanban.cards:write` unless a future command declares a more specific
  permission.
- Browser writes must use Space App-owned `/api/*`; Buddy/CLI writes must use Shadow gateway commands.

## Buddy Identity Inheritance

When a Buddy calls a Kanban command, Shadow provides:

- `actor.kind = agent`
- `actor.buddyAgentId`
- `actor.ownerId`
- `actor.userId`

Kanban stores these as a normalized `BoardPerson`. UI must distinguish:

- Human user
- Buddy actor
- Buddy actor with inherited owner
- System/local actor

Activity and comments should read as Buddy-authored when the actor is a Buddy, while still retaining
owner metadata for audit and support.

For iframe OAuth matching, Kanban compares the OAuth user to the launch actor's inherited subject:

```text
actor.ownerId ?? actor.userId
```

This means a Buddy-launched board must be authorized by the Buddy owner account, not by the Buddy's
runtime user id.

## State Shape

The persisted state is upgraded from a single `BoardState` file to a scoped store:

```ts
interface KanbanStoreState {
  schemaVersion: 'kanban.store/2'
  projects: KanbanProject[]
  boards: BoardState[]
  updatedAt: string
}
```

Each `BoardState` includes:

- `serverId`
- `projectId`
- `boardId`
- `members`
- existing columns/cards/links/artifacts/issues

Legacy single-board JSON is migrated into a default local project/board.

## UI Contract

The board header shows:

- OAuth/session state
- server/project/board context
- current actor
- live event state
- Buddy roster availability

The primary board remains Trello-familiar:

- Horizontal lists on desktop.
- Compact single-column behavior on small screens.
- Cards show labels, assignees, Buddy status, comments, artifacts, and issue metadata.
- Card detail remains the workbench for dispatch, prompt/context, artifacts, comments, and completion.

Unauthenticated, misconfigured, missing-launch, and identity-mismatch states render an explicit OAuth
gate and do not fetch board data behind the gate.

## Implemented Module Boundaries

- `src/oauth-access.ts`: signed OAuth session cookies, compact user profile, launch subject matching,
  and OAuth access state.
- `src/server.ts`: Hono routes, Shadow launch introspection, launch-aware OAuth enforcement, command
  execution, and static shell serving.
- `src/data.ts`: scoped JSON store, server/project/board partitioning, card state transitions,
  dependency guards, artifact policy, comments, links, and dispatch state.
- `src/client/api.ts`: Shadow bridge/Space App command client and board-scoped command wrappers.
- `src/client/query-keys.ts`: shared React Query cache keys.
- `src/client/identity.ts`: Buddy/person identity normalization for user, Buddy, inherited owner, and
  manual/system actors.
- `src/client/components/auth-gate.tsx`: OAuth gate and session strip.
- `src/client/components/board-view.tsx`: board toolbar, search/filter, lists, collapsed card composer,
  card metadata, and card navigation.
- `src/client/components/coordinator-request-bar.tsx`: Buddy coordination request flow.
- `src/client/components/card-detail.tsx`: dispatch, assignment, prompt/context, artifacts, comments,
  and completion workbench.

## Data Reliability

Kanban persists through `createShadowSpaceAppJsonStore`, which validates and normalizes the file on
read/write and keeps the schema at `kanban.store/2`. Legacy single-board files are migrated into the
default local server/project/board. The store is partitioned by `serverId + projectId + boardId`, so
two Shadow servers with the same board id cannot share cards.

Durable writes run through data-layer functions that update board timestamps and persist immediately.
Runtime scope comes from the Space App context, not from frontend input.

## Tests

- `src/oauth-access.test.ts`: signed session cookies, OAuth-required state, OAuth not configured, and
  Buddy owner identity inheritance.
- `src/data.test.ts`: scoped board isolation, Buddy actor audit metadata, card status/progress,
  dependency gates, artifact policy, dispatch enrichment, and workspace artifact requirements.
- `src/client/auth-gate.test.tsx`: OAuth gate rendering and access predicate.
- `src/client/board-view.test.ts`: card search and status filter logic.

## Verification Checklist

- `pnpm -C integrations/kanban typecheck`
- `pnpm -C integrations/kanban test`
- `pnpm -C integrations/kanban build`
- `pnpm biome check <changed-kanban-files>`
- `pnpm check:security-pr`
