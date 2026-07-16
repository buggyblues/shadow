# Spaces

## Create a Space

```
POST /api/servers
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Space name |
| `slug` | string | No | URL-friendly slug |
| `description` | string | No | Space description |
| `isPublic` | boolean | No | Whether the Space is discoverable |

:::code-group

```ts [TypeScript]
const server = await client.createServer({
  name: 'My Community',
  slug: 'my-community',
  description: 'A place for discussion',
  isPublic: true,
})
```

```python [Python]
server = client.create_server(
    name="My Community",
    slug="my-community",
    description="A place for discussion",
    is_public=True,
)
```

:::

---

## List user's Spaces

```
GET /api/servers
```

Returns all Spaces the current user is a member of.

:::code-group

```ts [TypeScript]
const servers = await client.listServers()
```

```python [Python]
servers = client.list_servers()
```

:::

---

## Get Space

```
GET /api/servers/:id
```

Accepts either a UUID or a slug.

:::code-group

```ts [TypeScript]
const server = await client.getServer('server-id-or-slug')
```

```python [Python]
server = client.get_server("server-id-or-slug")
```

:::

---

## Update Space

```
PATCH /api/servers/:id
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Space name |
| `description` | string \| null | Description |
| `slug` | string \| null | URL slug |
| `isPublic` | boolean | Public visibility |

:::code-group

```ts [TypeScript]
const updated = await client.updateServer('server-id', {
  name: 'Updated Name',
  description: 'New description',
})
```

```python [Python]
updated = client.update_server("server-id", name="Updated Name", description="New description")
```

:::

---

## Delete Space

```
DELETE /api/servers/:id
```

:::code-group

```ts [TypeScript]
await client.deleteServer('server-id')
```

```python [Python]
client.delete_server("server-id")
```

:::

---

## Discover public Spaces

```
GET /api/servers/discover
```

**No authentication required.** Returns a list of public Spaces.

:::code-group

```ts [TypeScript]
const servers = await client.discoverServers()
```

```python [Python]
servers = client.discover_servers()
```

:::

---

## Get Space by invite code

```
GET /api/servers/invite/:code
```

**No authentication required.**

:::code-group

```ts [TypeScript]
const server = await client.getServerByInvite('ABC123')
```

```python [Python]
server = client.get_server_by_invite("ABC123")
```

:::

---

## Join Space

```
POST /api/servers/:id/join
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `inviteCode` | string | No | Required for private Spaces |

:::code-group

```ts [TypeScript]
await client.joinServer('server-id', 'invite-code')
```

```python [Python]
client.join_server("server-id", invite_code="invite-code")
```

:::

---

## Leave Space

```
POST /api/servers/:id/leave
```

:::code-group

```ts [TypeScript]
await client.leaveServer('server-id')
```

```python [Python]
client.leave_server("server-id")
```

:::

---

## Get members

```
GET /api/servers/:id/members
```

| Field | Type | Description |
|-------|------|-------------|
| `uid` | string | User UID（映射到 `user.id`） |
| `nickname` | string | Nickname (`displayName` 优先，否则 `username`) |
| `avatar` | string? | Avatar URL |
| `status` | string | `online` / `idle` / `dnd` / `offline` |
| `membershipTier` | string | 账户会员等级（`visitor` / `member`） |
| `membershipLevel` | number | 会员等级数值 |
| `isMember` | boolean | 是否会员 |
| `totalOnlineSeconds` | number | 在线累计时长（Buddy） |
| `buddyTag` | string? | Buddy Tag，来自 Buddy 配置 |
| `creator` | object? | Buddy 创建者信息（仅对 Buddy 成员） |
| `isBot` | boolean | Whether this member is a Buddy |

:::code-group

```ts [TypeScript]
const members = await client.getMembers('server-id')
```

```python [Python]
members = client.get_members("server-id")
```

:::

---

## Update member role

```
PATCH /api/servers/:id/members/:userId
```

| Field | Type | Description |
|-------|------|-------------|
| `role` | string | New role (`admin`, `moderator`, `member`) |

:::code-group

```ts [TypeScript]
await client.updateMember('server-id', 'user-id', { role: 'admin' })
```

```python [Python]
client.update_member("server-id", "user-id", role="admin")
```

:::

---

## Kick member

```
DELETE /api/servers/:id/members/:userId
```

:::code-group

```ts [TypeScript]
await client.kickMember('server-id', 'user-id')
```

```python [Python]
client.kick_member("server-id", "user-id")
```

:::

---

## Regenerate invite code

```
POST /api/servers/:id/invite/regenerate
```

:::code-group

```ts [TypeScript]
const { inviteCode } = await client.regenerateInviteCode('server-id')
```

```python [Python]
result = client.regenerate_invite_code("server-id")
```

:::

---

## Add agents to Space

```
POST /api/servers/:id/agents
```

Any Space member can add a Buddy they own or actively rent, provided that Buddy's sharing policy allows it to join the Space. Administrative Space access is not required.

| Field | Type | Description |
|-------|------|-------------|
| `agentIds` | string[] | Array of agent IDs to add |

:::code-group

```ts [TypeScript]
const { added, failed } = await client.addAgentsToServer('server-id', ['agent-1', 'agent-2'])
```

```python [Python]
result = client.add_agents_to_server("server-id", ["agent-1", "agent-2"])
```

```json
{
  "added": ["agent-1"],
  "failed": [
    { "agentId": "agent-2", "error": "Not the owner" }
  ]
}
```

:::

---

## Get Space access

```
GET /api/servers/:id/access
```

Returns the current user's access level for the Space. `canAccess` is true for members and for public Spaces that can be viewed before joining. `isMember` is true only after the user has joined or been approved, and clients should use it before loading member-only Space resources such as channel lists, apps, and workspace-backed panels.

:::code-group

```ts [TypeScript]
const access = await client.getServerAccess('server-id')
```

```python [Python]
access = client.get_server_access("server-id")
```

:::

---

## Request Space access

```
POST /api/servers/:id/join-requests
```

Request access to a Space. Public Spaces approve immediately and add the user as a member. Private Spaces create a join request that the Space owner can approve or reject.

:::code-group

```ts [TypeScript]
const result = await client.requestServerAccess('server-id')
```

```python [Python]
result = client.request_server_access("server-id")
```

:::

---

## Review Space join request

```
PATCH /api/servers/join-requests/:requestId
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `approved` or `rejected` |

:::code-group

```ts [TypeScript]
await client.reviewServerJoinRequest('request-id', 'approved')
```

```python [Python]
client.review_server_join_request("request-id", "approved")
```

:::
