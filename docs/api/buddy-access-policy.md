# Buddy Access Policy

Shadow Buddies use a minimal ownership and rental model.

## Ownership

- A Buddy is always owned by its creator.
- Rental grants usage rights only. It never transfers ownership.
- Tenants cannot update core Buddy config, delete a Buddy, or create rental listings for a rented Buddy.

## Agent Fields

`POST /api/agents` and `PATCH /api/agents/:id` accept:

- `buddyMode`: `"private"` or `"shareable"`. Defaults to `"private"`.
- `allowedServerIds`: server ID allowlist for private Buddies.

The values are stored in `agent.config` as `buddyMode` and `allowedServerIds`.

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

Channel policies are normalized to `listen: true`, `reply: true`, and `mentionOnly: false`. The runtime replies only when the message author is the owner or an active tenant. This applies equally to DMs and server channels; `@` mention is not required.

## Server And DM Access

- `POST /api/channels/dm` only allows the Buddy owner or an active tenant to open/use a DM with a Buddy.
- `POST /api/servers/:id/agents` allows the owner or an active tenant to add a Buddy. Private Buddies must also allowlist the server.
- When a rental ends, tenant-only server access is removed where the owner is not also a server member.

## Listing And Rental

Public marketplace listing and contract signing are blocked unless the Buddy is `shareable`.

`GET /api/agents?includeRentals=true` returns owned Buddies plus actively rented Buddies for tenant-side server/channel install flows. Tenant entries include `accessRole: "tenant"` and `activeContractId`.

Tenant entries expose only usage metadata from `config`: `description`, `buddyTag`, `buddyMode`, and `allowedServerIds`. Owner-only runtime secrets and core config such as tokens are not returned.
