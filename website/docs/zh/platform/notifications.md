# 通知

## 列出通知

```
GET /api/notifications
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `limit` | number | 50 | 最大通知数 |
| `offset` | number | 0 | 分页偏移量 |

:::code-group

```ts [TypeScript]
const notifications = await client.listNotifications(50, 0)
```

```python [Python]
notifications = client.list_notifications(limit=50, offset=0)
```

:::

---

## 标记通知已读

```
PATCH /api/notifications/:id/read
```

:::code-group

```ts [TypeScript]
await client.markNotificationRead('notification-id')
```

```python [Python]
client.mark_notification_read("notification-id")
```

:::

---

## 标记全部已读

```
POST /api/notifications/read-all
```

:::code-group

```ts [TypeScript]
await client.markAllNotificationsRead()
```

```python [Python]
client.mark_all_notifications_read()
```

:::

---

## 按范围标记已读

```
POST /api/notifications/read-scope
```

将特定空间或频道的所有通知标记为已读。

| 字段 | 类型 | 说明 |
|------|------|------|
| `serverId` | string | 空间 ID（可选） |
| `channelId` | string | 频道 ID（可选） |

:::code-group

```ts [TypeScript]
await client.markScopeRead({ serverId: 'server-id' })
```

```python [Python]
client.mark_scope_read(server_id="server-id")
```

:::

---

## 获取未读数量

```
GET /api/notifications/unread-count
```

:::code-group

```ts [TypeScript]
const { count } = await client.getUnreadCount()
```

```python [Python]
result = client.get_unread_count()
count = result["count"]
```

:::

---

## 获取分类未读数量

```
GET /api/notifications/scoped-unread
```

返回按空间/频道分组的未读计数。

:::code-group

```ts [TypeScript]
const scoped = await client.getScopedUnread()
```

```python [Python]
scoped = client.get_scoped_unread()
```

:::

---

## 获取通知偏好设置

```
GET /api/notifications/preferences
```

:::code-group

```ts [TypeScript]
const prefs = await client.getNotificationPreferences()
```

```python [Python]
prefs = client.get_notification_preferences()
```

:::

---

## 更新通知偏好设置

```
PATCH /api/notifications/preferences
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `strategy` | string | `all`、`mention_only` 或 `none` |
| `mutedServerIds` | string[] | 要静音的空间 ID |
| `mutedChannelIds` | string[] | 要静音的频道 ID |

:::code-group

```ts [TypeScript]
const updated = await client.updateNotificationPreferences({
  strategy: 'mention_only',
  mutedServerIds: ['server-1'],
})
```

```python [Python]
updated = client.update_notification_preferences(
    strategy="mention_only",
    mutedServerIds=["server-1"],
)
```

:::
