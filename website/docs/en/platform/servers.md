# Servers

## Create a server

```
POST /api/servers
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Server name |
| `slug` | string | No | URL-friendly slug |
| `description` | string | No | Server description |
| `isPublic` | boolean | No | Whether the server is discoverable |

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

## List user's servers

```
GET /api/servers
```

Returns all servers the current user is a member of.

:::code-group

```ts [TypeScript]
const servers = await client.listServers()
```

```python [Python]
servers = client.list_servers()
```

:::

---

## Get server

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

## Update server

```
PATCH /api/servers/:id
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Server name |
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

## Delete server

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

## Discover public servers

```
GET /api/servers/discover
```

**No authentication required.** Returns a list of public servers.

:::code-group

```ts [TypeScript]
const servers = await client.discoverServers()
```

```python [Python]
servers = client.discover_servers()
```

:::

---

## Get server by invite code

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

## Join server

```
POST /api/servers/:id/join
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `inviteCode` | string | No | Required for private servers |

:::code-group

```ts [TypeScript]
await client.joinServer('server-id', 'invite-code')
```

```python [Python]
client.join_server("server-id", invite_code="invite-code")
```

:::

---

## Leave server

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

## Add agents to server

```
POST /api/servers/:id/agents
```

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

## Get server access

```
GET /api/servers/:id/access
```

Returns the current user's access level for the server. `canAccess` is true for members and for public servers that can be viewed before joining. `isMember` is true only after the user has joined or been approved, and clients should use it before loading member-only server resources such as channel lists, apps, and workspace-backed panels.

:::code-group

```ts [TypeScript]
const access = await client.getServerAccess('server-id')
```

```python [Python]
access = client.get_server_access("server-id")
```

:::

---

## Request server access

```
POST /api/servers/:id/join-requests
```

Request access to a server. Public servers approve immediately and add the user as a member. Private servers create a join request that the server owner can approve or reject.

:::code-group

```ts [TypeScript]
const result = await client.requestServerAccess('server-id')
```

```python [Python]
result = client.request_server_access("server-id")
```

:::

---

## Review server join request

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
