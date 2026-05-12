# 服务器

## 创建服务器

```
POST /api/servers
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 服务器名称 |
| `slug` | string | 否 | URL 友好的标识符 |
| `description` | string | 否 | 服务器描述 |
| `isPublic` | boolean | 否 | 是否公开可发现 |

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

## 列出用户的服务器

```
GET /api/servers
```

返回当前用户所属的所有服务器。

:::code-group

```ts [TypeScript]
const servers = await client.listServers()
```

```python [Python]
servers = client.list_servers()
```

:::

---

## 获取服务器

```
GET /api/servers/:id
```

接受 UUID 或 slug。

:::code-group

```ts [TypeScript]
const server = await client.getServer('server-id-or-slug')
```

```python [Python]
server = client.get_server("server-id-or-slug")
```

:::

---

## 更新服务器

```
PATCH /api/servers/:id
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 服务器名称 |
| `description` | string \| null | 描述 |
| `slug` | string \| null | URL 标识符 |
| `homepageHtml` | string \| null | 自定义首页 HTML |
| `isPublic` | boolean | 公开可见性 |

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

## 删除服务器

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

## 发现公开服务器

```
GET /api/servers/discover
```

**无需认证。** 返回公开服务器列表。

:::code-group

```ts [TypeScript]
const servers = await client.discoverServers()
```

```python [Python]
servers = client.discover_servers()
```

:::

---

## 通过邀请码获取服务器

```
GET /api/servers/invite/:code
```

**无需认证。**

:::code-group

```ts [TypeScript]
const server = await client.getServerByInvite('ABC123')
```

```python [Python]
server = client.get_server_by_invite("ABC123")
```

:::

---

## 加入服务器

```
POST /api/servers/:id/join
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `inviteCode` | string | 否 | 私有服务器需要邀请码 |

:::code-group

```ts [TypeScript]
await client.joinServer('server-id', 'invite-code')
```

```python [Python]
client.join_server("server-id", invite_code="invite-code")
```

:::

---

## 离开服务器

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

## 获取成员列表

```
GET /api/servers/:id/members
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `uid` | string | 用户 UID（映射到 `user.id`） |
| `nickname` | string | 昵称（优先 `displayName`，否则 `username`） |
| `avatar` | string? | 头像地址 |
| `status` | string | `online` / `idle` / `dnd` / `offline` |
| `membershipTier` | string | 账户会员等级（`visitor` / `member`） |
| `membershipLevel` | number | 会员等级数值 |
| `isMember` | boolean | 是否会员 |
| `totalOnlineSeconds` | number | 在线累计时长（Buddy） |
| `buddyTag` | string? | Buddy Tag，来自 Buddy 配置 |
| `creator` | object? | Buddy 创建者信息（仅 Buddy 成员） |
| `isBot` | boolean | 是否 Buddy |

:::code-group

```ts [TypeScript]
const members = await client.getMembers('server-id')
```

```python [Python]
members = client.get_members("server-id")
```

:::

---

## 更新成员角色

```
PATCH /api/servers/:id/members/:userId
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `role` | string | 新角色（`admin`、`moderator`、`member`） |

:::code-group

```ts [TypeScript]
await client.updateMember('server-id', 'user-id', { role: 'admin' })
```

```python [Python]
client.update_member("server-id", "user-id", role="admin")
```

:::

---

## 踢出成员

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

## 重新生成邀请码

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

## 添加代理到服务器

```
POST /api/servers/:id/agents
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `agentIds` | string[] | 要添加的代理 ID 数组 |

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
