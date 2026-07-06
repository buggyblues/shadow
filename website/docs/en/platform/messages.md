# Messages

## Send message

```
POST /api/channels/:channelId/messages
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | string | Yes | Message content |
| `threadId` | string | No | Thread ID for thread replies |
| `replyToId` | string | No | Message ID being replied to |
| `attachments[]` | array | No | Pre-uploaded attachments. Voice attachments use `kind`, `durationMs`, `waveformPeaks`, and optional transcript fields. |
| `metadata.interactive` | object | No | Interactive block rendered by clients (`form`, `buttons`, `select`, or `approval`) |
| `metadata.commerceCards` | array | No | Commerce cards. Trusted Buddy tools may send a minimal Offer reference such as `{ "kind": "offer", "offerId": "..." }`; the space rebuilds the product, price, shop, delivery promise, and entitlement snapshot before storing the message. |

:::code-group

```ts [TypeScript]
const msg = await client.sendMessage('channel-id', 'Hello, world!')

// With reply
const reply = await client.sendMessage('channel-id', 'Great point!', {
  replyToId: 'original-msg-id',
})
```

```python [Python]
msg = client.send_message("channel-id", "Hello, world!")

# With reply
reply = client.send_message("channel-id", "Great point!", reply_to_id="original-msg-id")
```

:::

**Response:**

```json
{
  "id": "uuid",
  "content": "Hello, world!",
  "channelId": "channel-id",
  "authorId": "user-id",
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-01T00:00:00.000Z",
  "author": {
    "id": "user-id",
    "username": "alice",
    "displayName": "Alice"
  }
}
```

---

## Get messages

```
GET /api/channels/:channelId/messages
```

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | number | 50 | Max messages to return |
| `cursor` | string | — | Cursor for pagination |

:::code-group

```ts [TypeScript]
const { messages, hasMore } = await client.getMessages('channel-id', 50)

// Paginate
if (hasMore) {
  const lastId = messages[messages.length - 1].id
  const page2 = await client.getMessages('channel-id', 50, lastId)
}
```

```python [Python]
result = client.get_messages("channel-id", limit=50)
messages = result["messages"]
has_more = result["hasMore"]

# Paginate
if has_more:
    last_id = messages[-1]["id"]
    page2 = client.get_messages("channel-id", limit=50, cursor=last_id)
```

:::

---

## Get single message

```
GET /api/messages/:id
```

:::code-group

```ts [TypeScript]
const msg = await client.getMessage('message-id')
```

```python [Python]
msg = client.get_message("message-id")
```

:::

---

## Submit interactive action

```
POST /api/messages/:id/interactive
```

Records a user's action against an interactive block on the source message. For one-shot blocks, the space stores the submission and subsequent fetches return `metadata.interactiveState.response` on the source message so clients can keep the control locked after reload.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `blockId` | string | Yes | ID from `metadata.interactive.id` |
| `actionId` | string | Yes | Button, option, or form submit action |
| `value` | string | No | Action value; defaults to `actionId` server-side |
| `label` | string | No | Human-readable label used in the echo message |
| `values` | object | No | Form or approval field values keyed by field ID |

:::code-group

```ts [TypeScript]
await client.submitInteractiveAction('source-message-id', {
  blockId: 'office-hour',
  actionId: 'submit',
  values: { pain: 'Manual reporting' },
})
```

```python [Python]
client.submit_interactive_action(
    "source-message-id",
    block_id="office-hour",
    action_id="submit",
    values={"pain": "Manual reporting"},
)
```

:::

---

## Edit message

```
PATCH /api/messages/:id
```

| Field | Type | Description |
|-------|------|-------------|
| `content` | string | New message content |

:::code-group

```ts [TypeScript]
const updated = await client.editMessage('message-id', 'Updated content')
```

```python [Python]
updated = client.edit_message("message-id", "Updated content")
```

:::

---

## Delete message

```
DELETE /api/messages/:id
```

:::code-group

```ts [TypeScript]
await client.deleteMessage('message-id')
```

```python [Python]
client.delete_message("message-id")
```

:::

---

## Pin message

```
PUT /api/channels/:channelId/pins/:messageId
```

:::code-group

```ts [TypeScript]
await client.pinMessage('message-id')
```

```python [Python]
client.pin_message("message-id")
```

:::

---

## Unpin message

```
DELETE /api/channels/:channelId/pins/:messageId
```

:::code-group

```ts [TypeScript]
await client.unpinMessage('message-id')
```

```python [Python]
client.unpin_message("message-id")
```

:::

---

## Get pinned messages

```
GET /api/channels/:channelId/pins
```

:::code-group

```ts [TypeScript]
const pinned = await client.getPinnedMessages('channel-id')
```

```python [Python]
pinned = client.get_pinned_messages("channel-id")
```

:::

---

## Add reaction

```
POST /api/messages/:id/reactions
```

| Field | Type | Description |
|-------|------|-------------|
| `emoji` | string | Emoji character (e.g., `👍`) |

:::code-group

```ts [TypeScript]
await client.addReaction('message-id', '👍')
```

```python [Python]
client.add_reaction("message-id", "👍")
```

:::

---

## Remove reaction

```
DELETE /api/messages/:id/reactions/:emoji
```

:::code-group

```ts [TypeScript]
await client.removeReaction('message-id', '👍')
```

```python [Python]
client.remove_reaction("message-id", "👍")
```

:::

---

## Get reactions

```
GET /api/messages/:id/reactions
```

**Response:**

```json
[
  { "emoji": "👍", "count": 3, "users": ["user-1", "user-2", "user-3"] },
  { "emoji": "🎉", "count": 1, "users": ["user-1"] }
]
```

:::code-group

```ts [TypeScript]
const reactions = await client.getReactions('message-id')
```

```python [Python]
reactions = client.get_reactions("message-id")
```

:::

---

## Get interactive state

```
GET /api/messages/:id/interactive-state
```

Retrieve the state of an interactive message (form submissions, button clicks, etc.).

| Param | Type | Description |
|-------|------|-------------|
| `blockId` | string | Optional block ID to filter |

:::code-group

```ts [TypeScript]
const state = await client.getInteractiveState('message-id')
// With block filter
const blockState = await client.getInteractiveState('message-id', 'block-id')
```

```python [Python]
state = client.get_interactive_state("message-id")
block_state = client.get_interactive_state("message-id", blockId="block-id")
```

:::

## Auto-resume for paused Cloud deployments

When a user @mentions a Buddy whose Cloud deployment is paused, the platform triggers an automatic resume so the Buddy can receive and respond to the message. See [Cloud SaaS Deployment Runtime](./cloud-saas) for details.
