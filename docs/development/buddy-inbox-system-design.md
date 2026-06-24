# Buddy Inbox System Design

Status: design draft
Date: 2026-06-05

Related documents:

- [Buddy Inbox Protocol](../api/buddy-inbox.md)
- [Server App Integrations](../api/server-app-integrations.md)

## Background

Buddy Inbox already has a basic protocol. It is a private Channel inside a server context, uses
`shadow:buddy-inbox:<agentId>` as the topic for the target Buddy, expresses tasks as
`kind: "task"` cards under `message.metadata.cards[]`, and lets App backends dispatch work
through Shadow REST or `shadow.outbox.inboxTasks` returned by server-origin commands.

This design tightens Buddy Inbox from "a private channel that can contain tasks" into a fixed
communication route to one Buddy inside a server context. A Buddy identity does not belong to one
Server; the Server supplies context, visibility, and authorization for one interaction. Inbox
continues to reuse Channel, Message, Socket, permission, and media infrastructure, while product
semantics, authorization, SDK, CLI, and App bridge behavior are modeled around Task Card
collaboration.

## Goals

1. Inbox is a special Channel, but one Inbox route inside one Server context points to exactly one
   Buddy.
2. Inbox is a fixed Buddy communication route inside a Server context. The Buddy itself does not
   need a static Server binding. Current messages, Task Cards, or App command context inject the
   server context, and routing finds that Buddy's Inbox in that Server.
3. App/Buddy collaboration should not require an App to join an Inbox channel and send ordinary
   messages. Apps collaborate through Task Cards. The current transition path may send as the
   Buddy admin or initiating user so admins can review inputs and outputs.
4. Inbox supports authorized server-side task initiation. Server-origin dispatch must be a
   first-class capability with explicit authorization. Bridge dispatch is only one UI
   host-mediated path.
5. App-side bridge capabilities need a systematic contract that separates user-session bridge
   actions from server-authorized delivery.
6. Inbox UI supports chat mode and task mode. Chat mode keeps normal Channel conversation
   affordances; task mode emphasizes Task Cards, queue state, approvals, and deliverables.
7. TypeScript SDK, Python SDK, and CLI interfaces should be stable, clear, and consistent in names
   and delivery receipts.

## Non-Goals

- Do not build a new message system separate from Channel.
- Do not let App backends hold user JWTs or Buddy tokens.
- Do not model App collaboration as "join a channel and send arbitrary messages."
- Do not redesign every legacy message-card protocol here. New capabilities use
  `metadata.cards[]`.

## Current Implementation Review

### Implemented Capabilities

- Inbox channels bind to Buddies through `topic = shadow:buddy-inbox:<agentId>`;
  `parseBuddyInboxAgentId` is the main detection path.
- `BuddyInboxService.ensure` can create or repair a private Inbox channel and ensure the Buddy bot
  user, requester, and Buddy owner are channel members.
- Ensure and enqueue repair the target agent runtime policy on that channel to `listen: true`,
  `reply: true`, and `mentionOnly: false`.
- `enqueueTaskForAgent` and `enqueueTask` create messages with Task Cards and support `title`,
  `body`, `priority`, `tags`, `app`, `source`, `idempotencyKey`, and `data`.
- Task Cards have a state machine: `queued`, `claimed`, `running`, `completed`, `failed`,
  `canceled`, and `transferred`.
- Claim writes `claim` and temporary `capability` data with `task:read`, `task:update`, and
  `server_app:call` scopes, plus `messageId`, `cardId`, and `claimId` bindings.
- `assertTaskCommandAccess` checks that the Server App caller is the active claim holder and the
  claim has not expired.
- When a Buddy replies to a task message inside an Inbox, `MessageService` tries to mark the
  active Task Card as `completed`.
- Admission policy already supports `allow`, `deny`, `first_time`, and `every_time`, with pending
  deliveries stored in `inboxAdmissionPending` inside agent policy config.
- Web and Mobile Server App hosts support `ShadowBridge.openCopilot()`,
  `ShadowBridge.openWorkspaceResource()`, `ShadowBridge.openBuddyCreator()`, and route sync.
- When App commands return `shadow.outbox.inboxTasks`, `AppIntegrationService` parses the outbox,
  resolves the target Buddy, calls Buddy Inbox enqueue, and attaches a delivery receipt.
- TypeScript SDK, Python SDK, and CLI already have basic Inbox methods and commands.

### Major Gaps

- The "one Server, one Buddy, one Inbox" invariant currently mostly depends on topic lookup. It
  needs a database uniqueness constraint or stronger channel subtype constraint.
- Bridge is a loose set of message types. It needs unified capability discovery, error codes,
  versions, and Web/Mobile parity.
- Bridge enqueue currently uses the current Web/Mobile user session to call REST and marks
  `source.kind = "server_app"`. This is a valid temporary "admin dispatches from App UI" model,
  but it is not equivalent to App-backend server-origin credentials.
- Server App command outbox is already a server-side delivery path, but it only happens as part of
  a command response. It does not cover cron, webhook, external events, or App background jobs.
- CLI lacks admission pending list, approve, and reject commands.
- SDK/CLI support both `channelId` and `serverId + agentId` enqueue paths. Docs and examples
  should prefer `serverId + agentId`; `channelId` should remain a low-level compatibility path.
- Inbox UI is still a special mode of the Channel page. Task Cards are already the primary visual
  object, but the product should keep weakening ordinary chat entry for App collaboration and
  strengthening task input, review, output, and state transitions.
- Pending admission in agent policy config is acceptable for early implementation. If App
  background tasks, retries, and audit queries grow, it should move to a dedicated delivery/pending
  table.

## Security And Authorization Review

The correct architecture separates three capabilities:

- Bridge is a user-session capability. It represents actions confirmed or triggered by the
  current user inside an iframe host.
- Command outbox is the return path of an authorized App command. It cannot bypass command
  permission, approval mode, data class, or the target Buddy's App grant.
- Server-origin delivery is an App-backend capability. It must use a separate delivery token and
  separate App grant. It must not borrow a user JWT, Buddy token, or install admin's normal user
  permission.

Security points to strengthen:

- A server-origin delivery token, even if mapped to an `oauth` Actor, must not inherit server
  membership, channel read, or admin rights from the token creator or authorizing admin. The
  delivery endpoint must use a dedicated `ServerAppDeliveryPolicy` based on server app
  installation, token scope, target allowlist, budget/rate, and Inbox admission.
- `BuddyInboxService.enqueueTaskForAgent` is the user/agent path and depends on `actorUserId` and
  server membership. Server-origin must not pass a delivery token actor into that path directly.
  Add a narrow path such as `enqueueTaskFromServerAppDelivery` that receives policy output
  (`source`, app service author, or system author) and then calls a shared task-creation core.
- App background task messages must not impersonate an admin. Prefer an app service/bot user for
  installed Server Apps, or a Shadow system author. Task Card `source`, delivery audit, and UI must
  clearly show `server_app`, `appKey`, token id, resource, and trigger reason.
- `assigneeLabel` is human-friendly compatibility only. Production dispatch must prefer `agentId`
  or admin-configured `agentRole -> agentId` binding. Ambiguous label matches must fail.
- Bridge host must validate `event.origin`, iframe `contentWindow`, launch token, active server,
  and active app. SDK may keep `targetOrigin` defaults, but production host trust must not rely on
  `*`.
- Bridge request `appKey` is routing and anti-cross-talk metadata. The real app identity comes
  from host active installation and launch context.
- Inbox enqueue `idempotencyKey` should be namespaced by server, app, target, resource, and
  step/attempt to avoid collisions.
- Task input, issue step data, App command input, and AI/JSON config must enforce byte, depth,
  key-count, and array-length limits. User comments and scraped web content are untrusted input and
  need prompt-injection handling.
- User-provided external URLs, asset URLs, renderer webhook URLs, and similar inputs must use SSRF
  guards and must not follow redirects into private networks, metadata services, loopback, or
  `file:` schemes.
- User profiles, reviews, assets, generated content, and packages may contain PII, trade secrets,
  or copyrighted material. Task Cards and artifacts should store resource references, summaries,
  and authorization metadata rather than long private raw content.
- Prompt, material, runtime configuration, and publishing-target changes are high-risk writes.
  They need explicit command permission, approval mode, audit, and version records.
- Rerun of failed steps must remain bounded by the original issue step grant, step permission,
  budget, rate limit, and attempt limit. Rerun cannot bypass Inbox admission or App command
  approval.
- Runtime artifact upload, download, and preview must keep using application-authorized media
  paths. Do not expose public buckets or direct runtime URLs.

## Core Model

### Buddy Identity And Buddy Inbox

Buddy is a cross-server identity plus runtime capability set. A Server provides context only for a
specific interaction: current server, channel/inbox, actor, App installation, workspace,
authorization, and data class. Fields such as `allowedServerIds` mean a private Buddy may be
added, discovered, or routed in those Servers; they do not mean the Buddy identity belongs to a
Server.

### BuddyInbox

BuddyInbox is a logical resource and may not need a separate table, but it must satisfy these
invariants:

- `resourceType = buddy_inbox`
- `serverId` is required
- `agentId` is required
- `channelId` points to a private server text channel
- `channel.topic = shadow:buddy-inbox:<agentId>`
- at most one active Inbox per `(serverId, agentId)`
- one Inbox route points to only one Buddy `agentId`

Short term, topic remains the compatibility source. Next step should add database or service-layer
uniqueness:

```text
unique(server_id, topic) where topic like 'shadow:buddy-inbox:%'
```

If channels later support subtypes, add:

```text
channels.kind = 'server'
channels.subtype = 'buddy_inbox'
channels.metadata.buddyInbox.agentId = <agentId>
```

Topic should remain for compatibility and debugging.

### Task Card

Apps, Buddies, and admins collaborate around Task Cards. A Task Card is the smallest collaboration
unit inside Inbox:

```ts
type BuddyInboxTaskCard = {
  kind: 'task'
  id: string
  version: 1
  title: string
  body?: string
  status: 'queued' | 'claimed' | 'running' | 'completed' | 'failed' | 'canceled' | 'transferred'
  priority?: 'low' | 'normal' | 'high' | 'urgent'
  tags?: Array<string | { label: string; color?: string }>
  app?: {
    appId?: string
    appKey?: string
    name?: string
    iconUrl?: string
  }
  assignee: {
    agentId: string
    userId: string
    label: string
  }
  source: {
    kind: 'user' | 'pat' | 'oauth' | 'agent' | 'system' | 'server_app' | 'buddy'
    userId?: string
    agentId?: string
    appId?: string
    appKey?: string
    command?: string
    resource?: { kind: string; id: string }
    label?: string
  }
  claim?: {
    id: string
    actor: MessageCardSource
    claimedAt: string
    expiresAt: string
  }
  capability?: {
    kind: 'task'
    scope: string[]
    claimId: string
    binding: {
      messageId: string
      cardId: string
      workspaceId?: string
    }
    issuedAt: string
    expiresAt: string
  }
  progress: Array<{
    at: string
    status: string
    actor: MessageCardSource
    note?: string
  }>
  data?: Record<string, unknown>
}
```

Rules:

- Apps cannot write ordinary messages into Inbox; they create Task Cards or attach structured
  output.
- Buddy natural-language replies can remain messages, but they should be linked to the Task Card
  and displayed as task reply/output.
- Task Card `idempotencyKey` lives in `card.data.idempotencyKey` to avoid duplicate delivery.
- Task workspace is bound through `card.data.task.workspaceId` for Buddy runtime, App commands,
  and artifact archive.
- Terminal states should remove active claim/capability so expired capability cannot be reused.

### Issue-First Kanban And Step Plan

Kanban is a generic task-management App, not an execution engine for a specific industry. Content
production, support tickets, code release, and research reports can share the same
issue/card/step/artifact shape, while concrete task type, role, prompt, runtime, and artifact
generation logic belong to the coordinator Buddy, specialist Buddies, or another App.

Core boundaries:

- Kanban App owns its own `issue`, `card`, `issueStep`, and `artifact reference` data model.
- Shadow core does not know Kanban columns, business roles, renderers, industry words, or customer
  material. It only handles App installation authorization, command tokens, Inbox delivery, Task
  Card status, artifact authorization, and audit.
- Users do not set a global default Buddy in Kanban. After a user chooses one coordinator Buddy,
  the coordinator discovers accessible/routable Buddies in the current Server and dispatches real
  work through Buddy Inbox.
- Kanban exposes generic atomic commands such as `cards.create`, `cards.update`, `cards.move`,
  `cards.link`, `cards.comment`, `cards.rerun`, and `cards.artifacts.add`.
- Private input and long source material must not be copied into Kanban card or Inbox message
  metadata. Store only minimum summaries, state, resource ids, and authorized artifact references.

Generic input:

```ts
type IssueCreateInput = {
  title: string
  summary?: string
  privateContextSummary?: string
  steps: Array<{
    id?: string
    title: string
    description?: string
    taskType?: string
    assigneeLabel?: string
    agentId?: string
    agentUserId?: string | null
    assigneeDisplayName?: string
    assigneeAvatarUrl?: string | null
    artifactKind?: string
    prompt?: string
    dependsOn?: string[]
    priority?: 'low' | 'medium' | 'high' | 'urgent'
    labels?: string[]
  }>
}
```

Generic result:

```ts
type IssueStepOutputInput = {
  cardId: string
  status?: 'done' | 'review' | 'failed'
  summary?: string
  artifacts?: Array<{
    kind?: string
    title?: string
    url?: string
    path?: string
    mimeType?: string
    sizeBytes?: number
    summary?: string
    metadata?: Record<string, unknown>
  }>
}
```

Typical coordinator Buddy responsibilities:

1. Read user input and decide which steps are needed.
2. Call Shadow Server to get accessible/routable Buddies and Inboxes in the current Server
   context.
3. Call Kanban `cards.create` to create cards and `cards.link` to express dependencies.
4. Send each ready step to an appropriate Buddy through Buddy Inbox.
5. After Buddies submit output, call `cards.update`, `cards.comment`, or `cards.artifacts.add` to
   write state, summary, and artifact references.
6. Continue dispatching downstream steps, and call `cards.rerun` when failed cards need a new
   attempt.

### Buddy Assignment

Kanban must not depend directly on Buddy display names. A step may carry `agentId` or
`assigneeLabel`, but real dispatch must resolve to a unique Buddy through the coordinator Buddy or
server authorization logic:

- `agentId` is the preferred production path.
- `assigneeLabel` is only for display, search, or migration. If it matches multiple Buddies, the
  request must fail with an ambiguity error.
- A step may configure a backup Buddy, but fallback must also be authorized ahead of time.
- Buddy assignment does not grant the App permission to read Buddy Inbox. It only permits creating
  a Task Card in that Buddy's Inbox through authorized paths.

## Standard Flows

### 1. Inbox Creation And Repair

Triggers:

- A Buddy gets visibility, membership, or routing permission inside a Server.
- A server admin or Buddy owner manually runs ensure.
- An App or admin dispatches to the Buddy for the first time and the actor can create the Inbox.
- A background repair job detects missing Inbox or incorrect runtime policy.

Flow:

1. Validate that the actor is the Buddy owner or a server admin.
2. Ensure the Buddy bot user is a server member.
3. Look up the private channel with `topic = shadow:buddy-inbox:<agentId>`.
4. Create a private text channel if none exists.
5. Add Buddy bot user, Buddy owner, and requester. Server admins do not always need to become
   channel members, but policy must let them manage it.
6. Upsert agent policy: `listen: true`, `reply: true`, `mentionOnly: false`.
7. Emit socket events: `channel:created`, `channel:member-added`, and `agent:policy-changed`.

### 2. Manual Admin Dispatch

Entrypoints:

- Web/Mobile Inbox Task Composer
- `shadowob inbox enqueue --server <server> --agent <agentId>`
- TypeScript/Python SDK `enqueueInboxTaskForAgent`

Semantics:

- actor kind is `user`, `pat`, or `agent`
- source defaults to the actor unless explicitly provided
- server membership and target Inbox admission policy are required
- this is the most direct "admin-reviewed dispatch" path

### 3. App Backend Dispatch

Entrypoint:

```ts
await fetch('/api/skills/grill-me/install', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    targetBuddyAgentId,
    idempotencyKey: `skills:install:grill-me:${targetBuddyAgentId}`,
  }),
})
```

Backend behavior:

1. App View sends the user's intent to the App Backend.
2. App Backend validates app session, Shadow OAuth/server context, app business permission, and
   target Buddy policy.
3. App Backend creates or reuses an idempotent dispatch record linked to its domain object.
4. App Backend calls Shadow REST to enqueue the Inbox task.
5. Buddy Inbox admission policy matches server_app source first, then actor/context.
6. App Backend stores the returned delivery receipt containing available `agentId`, `channelId`,
   `messageId`, `cardId`, `pendingId`, and `idempotencyKey`.
7. App View renders dispatch state from the App Backend.

This is the required App dispatch path for Web, Mobile WebView, independent web, background jobs,
and retries. Bridge must not enqueue tasks directly.

### 4. App Command Outbox Dispatch

Entrypoint:

```ts
return new ShadowServerAppOutbox()
  .enqueueInboxTask({
    agentId,
    title: 'Review submission',
    body: 'Run tests and summarize the failure.',
    resource: { kind: 'submission', id: submissionId },
  })
  .attachTo({ submission })
```

Flow:

1. A user or Buddy calls
   `POST /api/servers/:serverId/apps/:appKey/commands/:commandName`.
2. Shadow validates server membership, App installation, command permission, approval mode, and
   data class.
3. If the command call is Task Card-bound, `assertTaskCommandAccess` validates the active claim
   holder.
4. Shadow calls the App backend, which returns `shadow.outbox.inboxTasks`.
5. Shadow parses the outbox and resolves target Buddy by `agentId`, `agentUserId`, or
   `assigneeLabel`.
6. Shadow validates that the target Buddy's Server App grant includes `buddy_inbox:deliver` or `*`
   and is not expired.
7. If a required delivery is missing that grant, Shadow keeps the original command/outbox request
   open for up to 60 seconds and polls every 5 seconds for a grant update. This lets Web/Mobile
   bridge authorization complete without forcing the user or Buddy CLI to manually retry.
8. Shadow calls `BuddyInboxService.enqueueTaskForAgent`.
9. Shadow attaches delivery/error receipts to the command result.

This path already exists. It is suitable when one user or Buddy triggers an App command and the
App returns follow-up tasks.

### 5. Atomic Kanban Collaboration

Multi-step collaboration should use the generic flow:

1. User submits task input in the App and chooses a coordinator Buddy.
2. App Backend validates the request and uses Shadow REST to create a Task Card in the coordinator
   Buddy Inbox; admin can review input.
3. Coordinator Buddy discovers accessible/routable Buddies in the current Server context and calls
   App commands `cards.create` / `cards.link` to build the task graph. Shadow core stores no
   Kanban-specific fields.
4. Coordinator finds ready steps based on dependencies.
5. Coordinator dispatches ready steps in batch to the appropriate Buddy Inboxes.
6. Shadow runs Inbox admission, delivery idempotency, message creation, and receipt writeback for
   each step.
7. After claiming a step, the Buddy uses Task Card capability to call App commands, read safe
   input, submit structured output, or upload artifacts.
8. App updates card state, comments, and artifact references, unlocks downstream cards, and then
   the coordinator or server-origin delivery dispatches the next ready batch.
9. A failed step can be rerun by a user or authorized Buddy through an App command. Rerun creates a
   new attempt and idempotency key while keeping the failed record.
10. User edits to prompt, material, or parameters are App commands. They require the matching
   `write` or `generate` permission, approval mode, audit, and version records.

Constraints:

- Shadow does not decide which Buddy does what; task type, prompt, skills, and runtime belong to
  the Buddy/business App layer.
- Shadow does not generate business artifacts; it protects runtime command/token, artifact, and
  Task Card result chains.
- Apps must not bypass issue/card state by writing Inbox messages directly. Every step dispatch
  must produce a delivery receipt and write back to Kanban.
- Issue step `resource.kind`, `resource.id`, and `data.issueStep` are generic tracking anchors
  across Apps. Kanban can render them as cards/subtasks; other Apps can render tickets/checklists.
- Batch production and night autopilot are server-origin delivery or scheduler-triggered issue
  creation, not special Kanban logic.

### 6. New Server-Origin Dispatch

App background jobs, webhooks, cron, external events, and server-side workflows need a
server-origin delivery path. It shares the same Inbox task delivery core with server-origin
command outbox, but uses independent authorization.

Recommended endpoint:

```http
POST /api/servers/:serverId/apps/:appKey/inbox-tasks
Authorization: Bearer <server-app-delivery-token>
Content-Type: application/json
```

Request:

```json
{
  "target": {
    "agentId": "agent-id"
  },
  "task": {
    "title": "Process incoming support ticket",
    "body": "Ticket #1288 was updated by the customer.",
    "priority": "high",
    "idempotencyKey": "support:ticket:1288:update:2026-06-05T10:00:00Z",
    "resource": {
      "kind": "support.ticket",
      "id": "1288"
    },
    "data": {
      "ticketId": "1288"
    }
  }
}
```

Delivered response:

```json
{
  "agentId": "agent-id",
  "channelId": "channel-id",
  "messageId": "message-id",
  "cardId": "task-card-id",
  "idempotencyKey": "support:ticket:1288:update:2026-06-05T10:00:00Z"
}
```

Pending-admission response:

```json
{
  "agentId": "agent-id",
  "channelId": "channel-id",
  "pendingId": "pending-id",
  "idempotencyKey": "support:ticket:1288:update:2026-06-05T10:00:00Z"
}
```

#### Server App Delivery Token

App backends cannot use user JWTs or Buddy tokens. Add Server App Delivery Tokens:

- token is created, rotated, and revoked by a server admin
- token binds to exactly one server app installation
- token is stored as a hash
- successful token auth maps to an `oauth` Actor, not a new `server_app` Actor kind
- `actor.appId = serverAppIntegrationId` or stable app client id
- `actor.userId`, if required for compatibility, is audit attribution or an app service user only;
  it must not be used as resource authorization
- scopes include at least `server_app.inbox:enqueue`
- token cannot call user routes, Buddy routes, or App command proxy
- optional restrictions: expiry, allowed origins, allowed IP/CIDR, target Buddy allowlist, max
  rate, and daily task budget

Recommended CLI:

```bash
shadowob app inbox-token create shadow-support \
  --server shadow-plays \
  --name production-webhook \
  --scope server_app.inbox:enqueue \
  --target-agent "$AGENT_ID" \
  --expires-in 90d

shadowob app inbox-token list shadow-support --server shadow-plays
shadowob app inbox-token revoke shadow-support --server shadow-plays --token-id "$TOKEN_ID"
```

#### Authorization Decision

Server-origin enqueue must pass three layers:

1. Token authentication: token is valid, not expired, not revoked, and includes
   `server_app.inbox:enqueue`.
2. App installation grant: App is installed in the target server, server admin authorized it to
   deliver Inbox tasks to the target Buddy or target set, and grant permissions include
   `buddy_inbox:deliver` or `*`.
3. Inbox admission policy: target Buddy Inbox allows, denies, or sends the delivery to pending
   review.

This separates "the App can run in this server" from "the App may dispatch to this Buddy Inbox."

Implementation requirements:

- delivery endpoint must not call ordinary `requireServerMember(actor, serverId)` as its primary
  authorization because that treats token creator membership as App permission.
- delivery endpoint uses
  `requireServerAppDeliveryAccess({ serverId, appKey, tokenId, targetAgentId, action: 'write', dataClass })`.
- after policy passes, delivery service constructs explicit `source.kind = "server_app"` and uses
  an app service author or system author to create the Task Card.
- delivery token can only create tasks; it cannot read Inbox messages, list private channels,
  claim tasks, or call arbitrary Server App commands.
- plaintext token is returned only at creation time. List API returns token id, name, scopes,
  target policy, `lastUsedAt`, `expiresAt`, and `revokedAt`.

## Authorization Rules

| Operation | Actor kind | Resource | Action | Required scope/capability | Data class | Rule |
| --- | --- | --- | --- | --- | --- | --- |
| list server inboxes | user/pat/oauth/agent | server | read | server membership | server-private | Admin can see all; owner or channel member can see visible Inboxes |
| ensure inbox | user/pat/agent | buddy_inbox | manage | server membership | server-private | Buddy owner or server admin |
| update admission policy | user/pat/agent | buddy_inbox | manage | server membership | server-private | Buddy owner or server admin |
| manual enqueue | user/pat/agent | buddy_inbox_task | write | server membership + channel read | server-private | Also passes Inbox admission |
| command outbox enqueue | user/pat/agent | buddy_inbox_task | write | app command permission + approval + `buddy_inbox:deliver` grant | command dataClass | App command is authorized; outbox delivery also passes target Buddy grant and admission |
| server-origin enqueue | oauth | buddy_inbox_task | write | `server_app.inbox:enqueue` + `buddy_inbox:deliver` grant | server-private or manifest data class | delivery token + app grant + Inbox admission |
| create issue | user/pat/agent/oauth | server_app_issue | command action | app command permission + approval | command dataClass | App creates issue/cards; Shadow handles authorization and delivery |
| update issue input | user/pat/agent | server_app_issue | write | app command permission + approval | server-private/secret | Prompt/material/parameter changes need versioning and audit |
| bind issue step | user/pat | server_app_step_binding | manage | server admin | server-private | Manage step-to-Buddy authorization bindings and budgets |
| rerun issue step | user/pat/agent | server_app_issue_step | command action | app command permission + attempt/budget policy | step dataClass | Cannot bypass original step grant, admission, or attempt limit |
| attach issue artifact | user/pat/agent/oauth | issue_artifact | write | app command or task capability | artifact dataClass | Store authorized refs only; download goes through signed media/auth path |
| claim task | agent/user/pat | task_card | write | active task access | server-private | Target Buddy, Buddy owner, or server admin |
| update task | agent/user/pat | task_card | write | active claim capability | server-private | Active claim holder, Buddy owner, or server admin |
| retry task | agent/user/pat | task_card | write | task access | server-private | Failed task only; target Buddy, owner, or admin |
| app command from task | agent/user/pat | server_app_command | command action | active task claim + app command permission | command dataClass | actor must be active claim holder; action comes from manifest command declaration |

System actor should be used only for Shadow internal repair, migration, or compensation jobs. It
may bypass admission but must write audit logs and must not be exposed to ordinary APIs.

## Admission Policy

Admission policy keeps the existing modes:

- `allow`: enqueue immediately.
- `deny`: reject.
- `first_time`: first delivery goes pending; after admin approval an approved rule is stored and
  later deliveries from the same subject are allowed.
- `every_time`: every delivery goes pending; approval only consumes the current delivery.

Subject matching priority:

1. server app, agent, system, or user from `task.source`
2. actor itself

For App scenarios, source should be explicit:

```json
{
  "kind": "server_app",
  "appId": "server-app-integration-id",
  "appKey": "shadow-support",
  "label": "Support Desk",
  "resource": {
    "kind": "support.ticket",
    "id": "1288"
  }
}
```

Pending review UI and CLI should show:

- App name, icon, and appKey
- initiating actor: admin dispatch, Buddy, or server-origin token
- target Buddy
- task title, body, priority, resource, and idempotency key
- whether approval will remember a rule
- rejection reason

Recommended CLI:

```bash
shadowob inbox pending list --server shadow-plays --agent "$AGENT_ID" --json
shadowob inbox pending approve --server shadow-plays --agent "$AGENT_ID" "$PENDING_ID"
shadowob inbox pending reject --server shadow-plays --agent "$AGENT_ID" "$PENDING_ID" --reason "too broad"
```

## Bridge Capability System

Bridge is the user-session capability layer between an App iframe and Shadow host. It is not App
backend authorization and must not carry server-origin credentials.

Recommended capability registry:

```ts
type ShadowBridgeCapability =
  | 'copilot.open'
  | 'workspace.open'
  | 'buddy.create.open'
  | 'buddy.inboxes.list'
  | 'buddy.grant.ensure'
  | 'route.navigate'
```

Capability discovery:

```ts
const capabilities = await bridge.capabilities()
if (capabilities.includes('copilot.open')) {
  await bridge.openCopilot(delivery)
}
```

For embedded Kanban-style apps, `buddy.inboxes.list` and `buddy.grant.ensure` are host-context
capabilities used before backend dispatch. They let the iframe see the current server Buddy list
and ask the host to ensure `buddy_inbox:deliver` for the selected Buddy. They do not dispatch the
task; task delivery still belongs to the App backend and Shadow launch/outbox path.

Host requirements:

- Web and Mobile support the same request/response schemas.
- Requests include `requestId`, `appKey`, `type`, and version.
- Host validates launch token, iframe origin, active server, and active app.
- Errors return stable codes such as `BRIDGE_UNAVAILABLE`, `APP_KEY_MISMATCH`,
  `RESOURCE_NOT_FOUND`, and `PERMISSION_DENIED`.

Recommended response:

```ts
type BridgeResult<T> =
  | { ok: true; result: T }
  | {
      ok: false
      error: string
      code:
        | 'BRIDGE_UNAVAILABLE'
        | 'APP_KEY_MISMATCH'
        | 'RESOURCE_NOT_FOUND'
        | 'PERMISSION_DENIED'
      detail?: unknown
    }
```

## SDK Design

### TypeScript SDK

Keep existing methods:

```ts
client.listBuddyInboxes()
client.listServerBuddyInboxes(serverIdOrSlug)
client.ensureBuddyInbox(serverIdOrSlug, agentId)
client.enqueueInboxTaskForAgent(serverIdOrSlug, agentId, task)
client.enqueueInboxTask(channelId, task)
client.claimNextInboxTask(serverIdOrSlug, agentId)
client.claimTaskCard(messageId, cardId)
client.updateTaskCard(messageId, cardId, { status, note })
client.retryTaskCard(messageId, cardId)
client.promoteMessageToInboxTask(messageId, { serverId, agentId })
client.getBuddyInboxAdmissionPolicy(serverIdOrSlug, agentId)
client.updateBuddyInboxAdmissionPolicy(serverIdOrSlug, agentId, policy)
client.listBuddyInboxAdmissionPending(serverIdOrSlug, agentId)
client.approveBuddyInboxAdmissionPending(serverIdOrSlug, agentId, pendingId)
client.rejectBuddyInboxAdmissionPending(serverIdOrSlug, agentId, pendingId)
```

Add server-origin delivery management methods:

```ts
client.createServerAppInboxDeliveryToken(serverIdOrSlug, appKey, input)
client.listServerAppInboxDeliveryTokens(serverIdOrSlug, appKey)
client.revokeServerAppInboxDeliveryToken(serverIdOrSlug, appKey, tokenId)
client.enqueueServerAppInboxTask(serverIdOrSlug, appKey, input)
```

Kanban relationship maintenance uses generic App commands:

```ts
const research = await client.callServerAppCommand(serverId, 'kanban', 'cards.create', {
  input: {
    title: 'Research source material',
    description: 'Collect source facts and constraints.',
  },
})

const draft = await client.callServerAppCommand(serverId, 'kanban', 'cards.create', {
  input: {
    title: 'Draft deliverable',
    description: 'Prepare the first structured output.',
  },
})

await client.callServerAppCommand(serverId, 'kanban', 'cards.link', {
  input: {
    fromCardId: research.body.card.id,
    toCardId: draft.body.card.id,
    type: 'blocks',
  },
})
```

App backend SDK may provide a narrower client:

```ts
const delivery = new ShadowServerAppDeliveryClient({
  shadowBaseUrl,
  serverId,
  appKey,
  token: process.env.SHADOWOB_APP_DELIVERY_TOKEN,
})

await delivery.enqueueInboxTask({
  target: { agentId },
  task: {
    title: 'Review ticket',
    idempotencyKey: 'support:ticket:1288',
  },
})
```

Future App backend SDK can provide a step helper so Apps do not hand-roll `data.issueStep`:

```ts
const outbox = new ShadowServerAppOutbox()
outbox.enqueueIssueStep({
  appKey,
  issue,
  step,
  target: { agentId },
  inputs: safeInputs,
})
return outbox.attachTo({ issue })
```

`enqueueIssueStep` only generates a standard Inbox Task outbox payload. It does not put Kanban or
any business scenario into the SDK.

### Python SDK

Python names mirror TypeScript names in snake_case:

```python
client.list_buddy_inboxes()
client.list_server_buddy_inboxes(server_id_or_slug)
client.ensure_buddy_inbox(server_id_or_slug, agent_id)
client.enqueue_inbox_task_for_agent(server_id_or_slug, agent_id, title="Review")
client.claim_next_inbox_task(server_id_or_slug, agent_id)
client.update_task_card(message_id, card_id, status="completed")
client.list_buddy_inbox_admission_pending(server_id_or_slug, agent_id)
client.approve_buddy_inbox_admission_pending(server_id_or_slug, agent_id, pending_id)
client.reject_buddy_inbox_admission_pending(server_id_or_slug, agent_id, pending_id)
```

Add:

```python
client.create_server_app_inbox_delivery_token(server_id_or_slug, app_key, ...)
client.list_server_app_inbox_delivery_tokens(server_id_or_slug, app_key)
client.revoke_server_app_inbox_delivery_token(server_id_or_slug, app_key, token_id)
client.enqueue_server_app_inbox_task(server_id_or_slug, app_key, ...)
client.list_server_app_step_plans(server_id_or_slug, app_key)
client.list_server_app_step_plan_bindings(server_id_or_slug, app_key)
client.update_server_app_step_plan_bindings(server_id_or_slug, app_key, bindings)
```

### Bridge SDK

Bridge SDK exposes only host-mediated capabilities:

```ts
bridge.capabilities()
bridge.openCopilot(delivery)
bridge.openWorkspaceResource({ resource })
bridge.openBuddyCreator(...)
```

`ShadowServerAppOutbox` remains the command-response helper:

```ts
new ShadowServerAppOutbox().enqueueInboxTask(task).attachTo(result)
```

## CLI Design

Keep existing commands:

```bash
shadowob inbox list --server shadow-plays --json
shadowob inbox ensure --server shadow-plays --agent "$AGENT_ID"
shadowob inbox enqueue --server shadow-plays --agent "$AGENT_ID" --title "Review"
shadowob inbox claim-next --server shadow-plays --agent "$AGENT_ID" --json
shadowob inbox claim "$MESSAGE_ID" "$CARD_ID"
shadowob inbox update "$MESSAGE_ID" "$CARD_ID" --status completed --note "Done"
shadowob inbox retry "$MESSAGE_ID" "$CARD_ID"
shadowob inbox promote "$MESSAGE_ID" --server shadow-plays --agent "$AGENT_ID"
shadowob inbox policy --server shadow-plays --agent "$AGENT_ID" --json
```

Add admission pending:

```bash
shadowob inbox pending list --server shadow-plays --agent "$AGENT_ID" --json
shadowob inbox pending approve --server shadow-plays --agent "$AGENT_ID" "$PENDING_ID"
shadowob inbox pending reject --server shadow-plays --agent "$AGENT_ID" "$PENDING_ID"
```

Add server-origin delivery token management:

```bash
shadowob app inbox-token create <app-key> --server <server> --name <name>
shadowob app inbox-token list <app-key> --server <server>
shadowob app inbox-token revoke <app-key> --server <server> --token-id <id>
```

Add App backend debug enqueue:

```bash
shadowob app inbox enqueue <app-key> \
  --server shadow-plays \
  --agent "$AGENT_ID" \
  --title "Review ticket" \
  --idempotency-key "support:ticket:1288" \
  --delivery-token "$SHADOWOB_APP_DELIVERY_TOKEN" \
  --json
```

Kanban debug commands use atomic card commands:

```bash
shadowob app call kanban cards.create \
  --server shadow-plays \
  --input-json ./card.json \
  --json

shadowob app call kanban cards.link \
  --server shadow-plays \
  --input-json ./card-link.json \
  --json

shadowob app call kanban cards.rerun \
  --server shadow-plays \
  --input-json ./rerun-card.json \
  --json
```

If an App later offers domain-specific helper CLI, it should remain a high-level wrapper owned by
that App. The underlying path still resolves to atomic card/link/artifact commands, and real
permission still comes from Shadow Server and the App command runtime.

## Events And Receipts

All delivery paths should return a unified receipt:

```ts
type ShadowServerAppInboxDelivery = {
  agentId?: string
  agentUserId?: string
  channelId?: string
  messageId?: string
  cardId?: string | null
  taskId?: string | null
  pendingId?: string | null
  idempotencyKey?: string
  error?: string
}
```

Events:

- `message:new`: Task Card queued.
- `message:updated`: Task Card claim, status update, or retry transfer.
- `buddy-inbox:admission-policy-updated`: admission policy updated.
- `buddy-inbox:admission-pending-updated`: pending created, removed, approved, or rejected.
- `server_app.inbox_task.delivered`: optional audit event for background delivery statistics.
- `server_app.inbox_task.pending`: optional audit event for pending statistics.
- `server_app.inbox_task.failed`: optional audit event for delivery failure.
- `server_app.issue.created`: issue created.
- `server_app.issue.step.dispatched`: issue step delivered to Buddy Inbox.
- `server_app.issue.step.completed`: App accepted step output and updated issue/card.
- `server_app.issue.step.failed`: step failed and waits for human action or rerun.
- `server_app.issue.step.rerun_requested`: user or Buddy requested step rerun.

Issue step event payload should include at least:

```ts
type ShadowIssueStepEventRef = {
  serverId: string
  appKey: string
  stepPlanId?: string
  issue?: { kind: string; id: string; label?: string }
  stepId?: string
  task?: { messageId?: string; cardId?: string; claimId?: string }
  actorKind: string
  timestamp: string
}
```

## UI / Product Constraints

- Inbox may appear in the server channel list as a Buddy queue entry, but it should be visually
  distinct from ordinary channels.
- Inbox header should show target Buddy, queue state, admission management entry, and chat/task
  mode switch.
- Inbox must support chat mode and task mode. Both modes share one underlying Inbox channel,
  message stream, socket event set, and permission model. They differ in information architecture
  and default actions.
- Chat mode shows the full conversation timeline, ordinary composer, replies, attachments, and
  natural-language Buddy communication. It is suitable for admin review, follow-up, explanation,
  and manual collaboration.
- Task mode emphasizes Task Card queue, open/done filters, priority, assignee, claim, progress,
  pending admission, artifact, and rerun operations. Its default action is creating or managing
  Task Cards.
- Users can promote a chat-mode message to a task. Users can open a Task Card's replies/output
  conversation from task mode.
- App collaboration still must not enter Inbox and send ordinary messages. Apps can only create
  Task Cards, submit structured output, or reference artifacts through App Backend -> Shadow REST,
  server-origin command outbox, or server-origin delivery.
- Admins can review App-dispatched task drafts, pending deliveries, Buddy replies, and final
  output in both modes.
- App UI dispatch should clearly show the target Buddy and task summary, then send the request to
  the App Backend.
- Buddy output appears first in the Task Card replies/output area in task mode and remains visible
  in the full chat timeline in chat mode.
- Multi-Buddy collaboration happens through one Buddy forwarding or spawning a task into another
  Buddy Inbox, not through multiple Buddies sharing one Inbox.
- Issue UI should center the issue/card. Kanban board, step graph, timeline, and artifact gallery
  are different views of the same collaboration process.
- Users should see each step's assigned Buddy, attempt, input snapshot, prompt/material version,
  artifact, delivery receipt, and failure reason.
- Rerunning failed steps, changing prompt, replacing material, and switching runtime must go
  through App commands that create versioned records. They should not mutate historical Task Cards.
- Batch production views need budget, queued steps, running runtime, local/cloud location, retry
  failures, and human approval queues.
- Generated content, files, and packages need source step, generation parameters, review state, and
  download permission.

## Multi-Buddy Collaboration

Multi-Buddy collaboration should use Task Card links:

1. App or admin creates a task in Buddy A's Inbox.
2. Buddy A claims and starts work.
3. If Buddy A needs help, it calls CLI/SDK or App command to create a task in Buddy B's Inbox.
4. Buddy B's task source points back to Buddy A's Task Card:

```json
{
  "kind": "agent",
  "agentId": "buddy-a-agent-id",
  "resource": {
    "kind": "buddy_inbox.task",
    "id": "message-id/card-id"
  }
}
```

5. After Buddy B completes, Buddy A can merge the result into the original Task Card.

Each Buddy still has its own fixed Inbox. Collaboration is expressed through task source,
resource references, and reply/output links.

## Data And Audit

Short term:

- keep pending delivery in agent policy config
- use message card, progress, and socket events for task state
- use app command token records for task command context

Medium-term recommended tables:

```text
buddy_inbox_deliveries
  id
  server_id
  inbox_channel_id
  agent_id
  source_kind
  source_app_id
  source_app_key
  actor_kind
  actor_user_id
  task_idempotency_key
  task_title
  status: delivered | pending | rejected | failed
  message_id
  card_id
  pending_id
  error
  created_at
  updated_at

server_app_delivery_tokens
  id
  server_app_id
  server_id
  app_key
  token_hash
  name
  scopes
  target_policy
  expires_at
  revoked_at
  created_by_user_id
  created_at

server_app_step_plan_bindings
  id
  server_app_id
  server_id
  app_key
  step_plan_id
  role_id
  agent_id
  permissions
  approval_mode
  budget_policy
  created_by_user_id
  updated_at

server_app_issues
  id
  server_app_id
  server_id
  app_key
  step_plan_id
  step_plan_version
  issue_kind
  issue_id
  issue_title
  status: queued | running | blocked | completed | failed | canceled
  input_ref
  input_hash
  created_by_actor_kind
  created_by_user_id
  created_at
  updated_at

server_app_issue_steps
  id
  run_id
  step_id
  task_type
  agent_role_id
  agent_id
  status: queued | dispatched | claimed | running | completed | failed | skipped | canceled
  attempt
  depends_on
  inbox_message_id
  inbox_card_id
  input_ref
  output_ref
  prompt_version
  material_version
  error
  created_at
  updated_at

server_app_issue_artifacts
  id
  run_id
  step_id
  kind
  title
  media_attachment_id
  workspace_node_id
  metadata
  data_class
  created_by_actor_kind
  created_at
```

Benefits:

- Large webhook/cron delivery volume does not crowd agent policy config.
- Admission pending can be paginated, searched, and audited.
- Delivery retry, idempotency, and failure analysis become clearer.
- Issue-first step plans can track work across Kanban, research, support, production, and other
  Apps while Apps keep their domain data.
- Prompt/material/output use references and hashes, avoiding large content or sensitive raw input
  in Task Card metadata.

## Implementation Plan

### Phase 1: Fill Current Protocol Boundaries

- Add Inbox uniqueness protection or service-layer conflict checks.
- Standardize docs and SDK examples on `serverId + agentId` enqueue.
- Add CLI admission pending list, approve, and reject.
- Add stable REST/SDK/CLI error-code mapping.
- Add tests for duplicate Inbox ensure, pending approval, CLI pending commands, and Python SDK
  pending methods.
- Mark `assigneeLabel` as fallback; server delivery should prefer `agentId` or role binding.
- Add idempotency namespace rules and collision tests.

### Phase 2: Bridge Capability Registry

- Add `shadow.app.capabilities.request/response`.
- Web/Mobile hosts use the same schema and error codes.
- E2E covers Web and Mobile host UI bridge capabilities such as Copilot, workspace, Buddy creator,
  and route sync.
- Host must validate origin, contentWindow, launch token, active app, and active server.

### Phase 3: Server-Origin Delivery

- Add server app delivery token DAO, service, admin API, and CLI.
- Add `POST /api/servers/:serverId/apps/:appKey/inbox-tasks`.
- Token auth maps to `oauth` Actor with `server_app.inbox:enqueue` scope.
- App grants support target Buddy allowlist, approval mode, budget, and rate limit.
- Delivery endpoint shares `buildShadowServerAppInboxTaskRequest` and Task Card creation core, but
  does not reuse the ordinary user/agent authorization path.
- Add `ServerAppDeliveryPolicy` and prevent delivery token from inheriting creator user
  permissions.
- Add security tests for expired token, revoked token, cross-server token, cross-appKey token,
  missing target grant, and Inbox admission deny/pending.

### Phase 4: Issue-First Step Plan (Optional Later)

- Support optional `stepPlans` metadata from App manifest or dynamic endpoint.
- Add step plan binding API, SDK, and CLI.
- Add `ShadowServerAppOutbox.enqueueIssueStep` helper to standardize `data.issueStep`, resource,
  idempotency, and receipt.
- Add issue/step/artifact audit events.
- Kanban is only a reference App using the generic protocol. It must not introduce Kanban-specific
  or business-specific fields into Shadow core.
- Cover generic multi-step user stories: create issue, decompose steps, authorize dispatch, rerun
  failures, version prompt/material, and link artifacts.

### Phase 5: Task Output And Collaboration UX

- Task Card shows inputs, outputs, replies, linked resources, and spawned tasks.
- Buddy reply auto-completion should converge toward structured output while preserving natural
  language compatibility.
- Multi-Buddy collaboration adds spawned-task links and parent-task links.
- Web/Mobile Inbox adds a chat/task segmented control and separate ordinary composer and task
  composer.
- Kanban/Issue UI shows run graph, step attempts, artifact gallery, and approval queue.

### Phase 6: Docs, SDK, And Verification

- Update `docs/api/buddy-inbox.md` with the server-origin API.
- Update `docs/api/server-app-integrations.md` with the bridge, outbox, and delivery-token paths.
- Update Server App step plan metadata, binding, and step helper docs.
- Update TS SDK, Python SDK, and CLI README.
- Run focused unit tests, SDK tests, CLI tests, and Web/Mobile E2E.
- Run `pnpm check:security-pr` for security-sensitive changes.

## Verification Checklist

- Server unit: BuddyInboxService ensure/enqueue/claim/update/retry/admission.
- Server integration: server-origin token endpoint, App grant, delivery receipt, pending approval.
- App integration: command outbox delivery, task-bound command token introspection.
- Step plan: definition discovery, binding, issue create, step dispatch, step output, rerun
  attempt, artifact auth.
- Web: Server App bridge inbox list/enqueue, pending receipt display, Inbox task UI.
- Mobile: parity with Web bridge schema, Inbox task composer, and Task Card display.
- SDK: TypeScript and Python path, payload, error code, and receipt types.
- CLI: inbox pending, app inbox-token, app inbox enqueue, app call cards.create / cards.link /
  cards.rerun.
- Security: OAuth/PAT/agent/system actor boundaries, delivery token does not inherit user
  permission, scope/capability, resource access, rate/budget, audit log, SSRF guard, artifact
  signed media, prompt/material version audit.

## Decision Summary

- Buddy Inbox continues to use Channel storage, but its product meaning is a fixed task
  communication port for one Buddy.
- The standard App collaboration unit is Task Card, not ordinary channel message.
- Bridge is a user-session capability suitable for host UI actions such as opening Copilot,
  workspace resources, Buddy creation, and route sync.
- Command outbox is the server-side dispatch path in command responses and is mostly implemented.
- Server-origin delivery needs a narrow-scoped token and App grant. It must not use user JWTs or
  Buddy tokens, and must not inherit permissions from the admin who created the token.
- Kanban is a generic issue-first task board. Shadow core does not add a separate orchestration
  engine; it provides Inbox delivery, artifact auth, and audit protocol.
- Concrete roles and runtime behavior are chosen by coordinator Buddies, specialist Buddies, or
  business Apps, not by Shadow core or Kanban defaults.
- SDK/CLI should use `server + agent` as the primary entrypoint and delivery receipt as the shared
  return model for every dispatch path.
