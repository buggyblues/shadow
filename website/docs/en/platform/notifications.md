# Notifications

## List notifications

```
GET /api/notifications
```

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | number | 50 | Max notifications |
| `offset` | number | 0 | Offset for pagination |

:::code-group

```ts [TypeScript]
const notifications = await client.listNotifications(50, 0)
```

```python [Python]
notifications = client.list_notifications(limit=50, offset=0)
```

:::

---

## Mark notification as read

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

## Mark all as read

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

## Mark scope as read

```
POST /api/notifications/read-scope
```

Mark all notifications for a specific server or channel as read.

| Field | Type | Description |
|-------|------|-------------|
| `serverId` | string | Server ID (optional) |
| `channelId` | string | Channel ID (optional) |

:::code-group

```ts [TypeScript]
await client.markScopeRead({ serverId: 'server-id' })
```

```python [Python]
client.mark_scope_read(server_id="server-id")
```

:::

---

## Get unread count

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

## Get scoped unread counts

```
GET /api/notifications/scoped-unread
```

Returns unread counts grouped by server/channel.

:::code-group

```ts [TypeScript]
const scoped = await client.getScopedUnread()
```

```python [Python]
scoped = client.get_scoped_unread()
```

:::

---

## Get notification preferences

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

## Update notification preferences

```
PATCH /api/notifications/preferences
```

| Field | Type | Description |
|-------|------|-------------|
| `strategy` | string | `all`, `mention_only`, or `none` |
| `mutedServerIds` | string[] | Server IDs to mute |
| `mutedChannelIds` | string[] | Channel IDs to mute |

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

---

## Channel notification preferences

```
GET /api/notifications/channel-preferences
PATCH /api/notifications/channel-preferences
```

Get or update per-channel notification preferences.

| Field | Type | Description |
|-------|------|-------------|
| `kind` | string | Notification kind |
| `channel` | string | Channel ID |
| `enabled` | boolean | Whether notifications are enabled |

:::code-group

```ts [TypeScript]
// Get
const prefs = await client.getNotificationChannelPreferences()

// Update
const updated = await client.updateNotificationChannelPreference({
  kind: 'message',
  channel: 'channel-id',
  enabled: false,
})
```

```python [Python]
prefs = client.get_notification_channel_preferences()

updated = client.update_notification_channel_preference(
    kind="message",
    channel="channel-id",
    enabled=False,
)
```

:::

---

## Register push token

```
POST /api/notifications/push-tokens
DELETE /api/notifications/push-tokens/:idOrToken
```

Register a mobile push notification token.

| Field | Type | Description |
|-------|------|-------------|
| `platform` | string | `ios`, `android`, or `web` |
| `token` | string | Push token |
| `deviceName` | string | Optional device name |

:::code-group

```ts [TypeScript]
await client.registerPushToken({
  platform: 'ios',
  token: 'push-token-string',
  deviceName: 'iPhone',
})
```

```python [Python]
client.register_push_token(
    platform="ios",
    token="push-token-string",
    deviceName="iPhone",
)
```

:::

---

## Register web push subscription

```
POST /api/notifications/web-push-subscriptions
DELETE /api/notifications/web-push-subscriptions/:idOrEndpoint
```

Register a Web Push API subscription.

| Field | Type | Description |
|-------|------|-------------|
| `endpoint` | string | Push subscription endpoint |
| `keys.p256dh` | string | P-256 DH key |
| `keys.auth` | string | Auth secret |
| `userAgent` | string | Optional user agent |

:::code-group

```ts [TypeScript]
await client.registerWebPushSubscription({
  endpoint: 'https://...',
  keys: { p256dh: '...', auth: '...' },
  userAgent: navigator.userAgent,
})
```

```python [Python]
client.register_web_push_subscription(
    endpoint="https://...",
    keys={"p256dh": "...", "auth": "..."},
)
```

:::
