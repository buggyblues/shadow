# Buddy Access Policy

Shadow Buddies use a minimal ownership and rental model.

## Ownership

- A Buddy is always owned by its creator.
- Rental grants usage rights only. It never transfers ownership.
- Tenants cannot update core Buddy config, delete a Buddy, or create rental listings for a rented Buddy.

## Agent Fields

`POST /api/agents` and `PATCH /api/agents/:id` accept:

- `buddyMode`: `"private"` or `"shareable"`. Defaults to `"private"`.
- `allowedServerIds`: server ID allowlist for where a private Buddy may be added, discovered, or routed.

The values are stored in `agent.config` as `buddyMode` and `allowedServerIds`. This allowlist is an access boundary, not Buddy ownership or identity binding; runtime calls still receive the current server context from the message, Inbox task, bridge launch, or App command.

## Modes

- `private`: cannot be publicly rented and cannot be publicly added to servers. Only allowlisted servers can add and use it.
- `shareable`: can be rented. Active tenants can DM the Buddy and add it to servers during the rental.

## Reply Policy

The runtime remote config returned by `GET /api/agents/:id/config` includes:

- `ownerId`
- `buddyMode`
- `allowedServerIds`
- `activeTenantIds`
- `allowedTriggerUserIds`

Channel policies keep their configured `listen`, `reply`, `mentionOnly`, and `config` values. When no explicit channel or server default policy exists, the runtime uses conservative IM defaults: `listen=true`, `reply=true`, and `mentionOnly=true`.

For human-authored messages, the runtime receives owner/tenant trigger metadata and normally replies only when the author is the owner or an active tenant, unless the stored policy adds narrower trigger rules. A human explicitly mentioning the Buddy can override `reply=false` and owner/tenant trigger gates for that message, but it does not override `listen=false`, channel membership, or collaboration safety limits.

For Buddy-authored messages, owner/tenant trigger gates are not used. Buddy-to-Buddy replies are controlled by explicit collaboration policy such as `replyToBuddy`, allow/block lists, and `maxBuddyChainDepth`. Buddy owners and active tenants can update per-channel reply policy through `PUT /api/channels/:channelId/agents/:agentId/policy`.

For the proposed multi-Buddy collaboration model and the runtime fixes needed to keep channel IM readable, see [`docs/development/multi-buddy-channel-collaboration.zh-CN.md`](../development/multi-buddy-channel-collaboration.zh-CN.md).

## Server And DM Access

- `POST /api/channels/dm` only allows the Buddy owner or an active tenant to open/use a DM with a Buddy.
- `POST /api/servers/:id/agents` allows the owner or an active tenant to add a Buddy. Private Buddies must also allowlist the server.
- When a rental ends, tenant-only server access is removed where the owner is not also a server member.

## Listing And Rental

Public marketplace listing and contract signing are blocked unless the Buddy is `shareable`.

`GET /api/agents?includeRentals=true` returns owned Buddies plus actively rented Buddies for tenant-side server/channel install flows. Tenant entries include `accessRole: "tenant"` and `activeContractId`.

Tenant entries expose only usage metadata from `config`: `description`, `buddyTag`, `buddyMode`, and `allowedServerIds`. Owner-only runtime secrets and core config such as tokens are not returned.
