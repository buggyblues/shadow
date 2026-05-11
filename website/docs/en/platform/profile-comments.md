# Profile Comments

Users can leave comments and reactions on other users' profile pages.

## Get comments

```
GET /api/profile-comments/:profileUserId
```

Retrieve comments for a user's profile.

| Param | Type | Description |
|-------|------|-------------|
| `limit` | number | Max results (default: 20) |
| `offset` | number | Pagination offset |

:::code-group

```ts [TypeScript]
const comments = await client.getProfileComments('user-id', { limit: 20 })
```

```bash [CLI]
shadowob profile-comments get <user-id> --limit 20 --json
```

:::

---

## Get comment stats

```
GET /api/profile-comments/:profileUserId/stats
```

Returns reaction statistics for a profile's comments.

:::code-group

```ts [TypeScript]
const stats = await client.getProfileCommentStats('user-id')
```

:::

---

## Get comment replies

```
GET /api/profile-comments/replies/:parentId
```

Retrieve replies to a specific comment.

| Param | Type | Description |
|-------|------|-------------|
| `limit` | number | Max results |
| `offset` | number | Pagination offset |

:::code-group

```ts [TypeScript]
const replies = await client.getCommentReplies('comment-id', { limit: 10 })
```

:::

---

## Create comment

```
POST /api/profile-comments
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `profileUserId` | string | Yes | Target profile user ID |
| `content` | string | Yes | Comment text (max 500 chars) |
| `parentId` | string | No | Parent comment ID for replies |

:::code-group

```ts [TypeScript]
const comment = await client.createProfileComment({
  profileUserId: 'user-id',
  content: 'Great profile!',
})
```

```bash [CLI]
shadowob profile-comments create --user-id <user-id> --content "Great profile!" --json
```

:::

---

## Delete comment

```
DELETE /api/profile-comments/:id
```

Delete your own comment.

:::code-group

```ts [TypeScript]
await client.deleteProfileComment('comment-id')
```

```bash [CLI]
shadowob profile-comments delete <comment-id>
```

:::

---

## Add reaction

```
POST /api/profile-comments/:id/reactions
```

| Field | Type | Description |
|-------|------|-------------|
| `emoji` | string | Allowed: 👍 👎 ❤️ 😂 🎉 👀 🔥 👣 🙏 💪 |

:::code-group

```ts [TypeScript]
await client.addProfileCommentReaction('comment-id', '👍')
```

:::

---

## Remove reaction

```
DELETE /api/profile-comments/:id/reactions
```

| Field | Type | Description |
|-------|------|-------------|
| `emoji` | string | Emoji to remove |

:::code-group

```ts [TypeScript]
await client.removeProfileCommentReaction('comment-id', '👍')
```

:::
