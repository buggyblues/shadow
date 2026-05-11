# 主页留言

用户可以在其他用户的主页上留言和添加反应。

## 获取留言

```
GET /api/profile-comments/:profileUserId
```

获取用户主页的留言。

| 参数 | 类型 | 描述 |
|-------|------|-------------|
| `limit` | number | 最大结果数（默认: 20） |
| `offset` | number | 分页偏移 |

:::code-group

```ts [TypeScript]
const comments = await client.getProfileComments('user-id', { limit: 20 })
```

```bash [CLI]
shadowob profile-comments get <user-id> --limit 20 --json
```

:::

---

## 获取留言统计

```
GET /api/profile-comments/:profileUserId/stats
```

返回主页留言的反应统计。

:::code-group

```ts [TypeScript]
const stats = await client.getProfileCommentStats('user-id')
```

:::

---

## 获取留言回复

```
GET /api/profile-comments/replies/:parentId
```

获取特定留言的回复。

| 参数 | 类型 | 描述 |
|-------|------|-------------|
| `limit` | number | 最大结果数 |
| `offset` | number | 分页偏移 |

:::code-group

```ts [TypeScript]
const replies = await client.getCommentReplies('comment-id', { limit: 10 })
```

:::

---

## 创建留言

```
POST /api/profile-comments
```

| 字段 | 类型 | 必填 | 描述 |
|-------|------|----------|-------------|
| `profileUserId` | string | 是 | 目标主页用户 ID |
| `content` | string | 是 | 留言内容（最多 500 字） |
| `parentId` | string | 否 | 父留言 ID（用于回复） |

:::code-group

```ts [TypeScript]
const comment = await client.createProfileComment({
  profileUserId: 'user-id',
  content: '很棒的主页！',
})
```

```bash [CLI]
shadowob profile-comments create --user-id <user-id> --content "很棒的主页！" --json
```

:::

---

## 删除留言

```
DELETE /api/profile-comments/:id
```

删除自己的留言。

:::code-group

```ts [TypeScript]
await client.deleteProfileComment('comment-id')
```

```bash [CLI]
shadowob profile-comments delete <comment-id>
```

:::

---

## 添加反应

```
POST /api/profile-comments/:id/reactions
```

| 字段 | 类型 | 描述 |
|-------|------|-------------|
| `emoji` | string | 允许: 👍 👎 ❤️ 😂 🎉 👀 🔥 👣 🙏 💪 |

:::code-group

```ts [TypeScript]
await client.addProfileCommentReaction('comment-id', '👍')
```

:::

---

## 移除反应

```
DELETE /api/profile-comments/:id/reactions
```

| 字段 | 类型 | 描述 |
|-------|------|-------------|
| `emoji` | string | 要移除的表情 |

:::code-group

```ts [TypeScript]
await client.removeProfileCommentReaction('comment-id', '👍')
```

:::
