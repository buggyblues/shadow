# OpenClaw Shadowob Discord Parity Plan

## Background

OpenClaw's Discord channel extension is a useful reference because it models a chat provider as an action-gated message tool instead of a set of hardcoded special cases. The Discord docs require baseline permissions such as view channels, send messages, read message history, embeds, attachments, reactions, and thread messaging. The upstream implementation also keeps read/search actions in gateway mode while normal write actions can run locally.

For Shadowob, parity should mean registering the Shadow platform capabilities that have real SDK/API support and keeping Discord-only concepts out of the public action surface until Shadow has product equivalents.

## Upstream Reference

- Docs: `https://docs.openclaw.ai/channels/discord`
- Source snapshot: `openclaw@b867ed4f`
- Discovery: `extensions/discord/src/channel-actions.ts`
- Action dispatcher: `extensions/discord/src/actions/handle-action.ts`
- Message runtime: `extensions/discord/src/send.messages.ts`

## Current Shadowob Surface

Shadowob currently discovers:

- `send`
- `upload-file`
- `react`
- `edit`
- `delete`

The plugin advertises channel, thread, direct chat, reactions, media, reply, edit, and unsend capabilities. The SDK already exposes more primitives than the OpenClaw action adapter currently registers, including message reads, pins, reaction listing/removal, thread operations, DM reads, typing, and message search.

## Capability Matrix

### Phase 1: Register supported message operations

These can be implemented first because the Shadow SDK already has direct methods or the CLI skill documents matching commands.

| OpenClaw action | Shadow SDK/API mapping | Execution mode | Notes |
| --- | --- | --- | --- |
| `read` | `getMessages`, `getThreadMessages`, `getDmMessages` | gateway | Default to current channel; clamp `limit` to 1..100; support `cursor`, `before`, `after`, `around` only where Shadow has equivalent pagination. |
| `fetch` or `fetch-message` | `getMessage` | gateway | Discord has internal `fetchMessage`; Shadow should expose a canonical fetch action for a single message. |
| `reactions` | `getReactions` | gateway | Read-only summary for a message. |
| `react` remove mode | `removeReaction` | local | Keep current add behavior; add `remove: true` or `action: unreact` alias. |
| `pin` | `pinMessage` | local | Replace current unsupported branch. |
| `unpin` | `unpinMessage` | local | Replace current unsupported branch. |
| `list-pins` | `getPinnedMessages` | gateway | Use channel target; current channel fallback is required. |
| `thread-list` | `listThreads` | gateway | Channel target required or current channel fallback. |
| `thread-create` | `createThread` | local | Requires parent message id because Shadow threads are message-rooted. |
| `thread-reply` | `sendToThread` | local | Already exists indirectly through outbound/send path; register canonical action. |
| `search` | `searchMessages` | gateway | Require query and apply server/channel scoping from target context. |

### Phase 2: Register platform metadata operations

These need tighter product/API checks before discovery because they expose broader workspace state.

| Capability | Candidate action names | Requirement |
| --- | --- | --- |
| Channel metadata | `channel-info`, `channel-list` | Use `channels get/list`; require server/channel scope and permission checks. |
| Member metadata | `member-info`, `member-list` | Use server members API; redact sensitive profile fields. |
| Server metadata | `server-info`, `server-list` | Useful for routing, but should not become a broad admin surface. |
| Agent status | `agent-info`, `agent-list` | Only if the token is authorized to inspect agents. |
| Typing/presence | `typing`, `set-presence` | Shadow already has typing; presence needs product semantics before registration. |
| Workspace files | `workspace-read`, `workspace-search` | Not a Discord parity feature, but Shadow-specific and should be a separate gated capability group. |

### Not recommended until Shadow has matching product semantics

Do not register these just because Discord does:

- `poll`
- `sticker`, `emoji-list`, `emoji-upload`, `sticker-upload`
- `role-info`, `role-add`, `role-remove`
- `permissions`
- `voice-status`
- `event-list`, `event-create`
- `timeout`, `kick`, `ban`
- `channel-create`, `channel-edit`, `channel-delete`, category operations

Those actions should appear only after Shadow has explicit APIs, product rules, authorization gates, and tests for them.

## Action Discovery Design

Shadowob should move from a static action array to action discovery derived from:

1. Account enabled/configured state.
2. Platform capability flags from plugin config, for example `capabilities.messages`, `capabilities.pins`, `capabilities.threads`, `capabilities.search`, `capabilities.metadata`.
3. SDK/API availability and server feature negotiation when possible.
4. Security policy for the current session and target channel.

The public action list should only include actions the adapter can actually handle successfully. Unsupported branches that return "not yet supported" should be removed from discovered actions.

## Target Resolution

Use the same target discipline across all actions:

- Accept explicit `shadowob:channel:<id>` and `shadowob:thread:<id>`; direct channels also use `shadowob:channel:<id>`.
- Fall back to OpenClaw's current channel context only when the current provider is Shadowob.
- Refuse broad cross-server reads unless the action is explicitly scoped.
- Preserve thread-aware routing for replies and reads.

## Result Normalization

Read-style actions should return normalized message objects with:

- `id`, `channelId`, `threadId`, `dmChannelId`
- `authorId`, author display fields when available
- `content`
- `attachments`
- `replyToId`
- `createdAt`, `updatedAt`
- `timestampMs`, `timestampUtc`
- provider raw object under `raw` only when useful and safe

This mirrors Discord's raw-provider-plus-normalized-fields pattern and keeps agents from guessing timestamp formats.

## Security Rules

- Keep `read` and `search` in gateway mode so OpenClaw can enforce current-channel context and channel policy.
- Cap list limits to 100.
- Never expose tokens, env vars, encrypted fields, or internal authorization headers in action results.
- Use the agent token's server-side authorization for all SDK calls; do not add client-side bypasses.
- Add explicit tests for forbidden cross-channel reads, DM reads, pin/unpin authorization, and search scoping.

## Implementation Order

1. Replace static discovered actions with capability-gated discovery.
2. Implement `read`, `fetch-message`, `reactions`, reaction removal, pins, thread list/create/reply, and search.
3. Normalize message results and timestamps.
4. Add unit tests in `packages/openclaw-shadowob`.
5. Add smoke coverage for channel read, thread read, DM read, pin/list-pins, and search.
6. Only then evaluate metadata/admin actions.
