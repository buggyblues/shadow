# Content Subscriptions and Feed API

Content subscriptions turn server channels into account-level content sources. Only messages with
content attachments or Server App cards are indexed.

By default, every non-archived server channel the actor can read is treated as an active content
subscription. The `channel_content_subscriptions` table stores only user overrides such as paused
channels, rule changes, delivery preferences, or read cursors. This keeps feed reads access-driven
without pre-writing one row per user and channel.

Account-level default rules live in `content_subscription_preferences`. Channel subscription rows
only override those defaults when `ruleCustomized` is true; system writes such as read cursors do
not become custom rules.

## Content Rules

The first phase indexes:

- image attachments
- HTML attachments
- PDF attachments
- regular file attachments
- voice attachments
- `message.metadata.cards[]` entries where `kind` is `server_app`

Compatibility card arrays such as `commerceCards`, `paidFileCards`, and `oauthLinkCards` are not
part of the new content-card protocol. They remain readable for existing chat surfaces only.

## Subscribe To A Channel

```http
POST /api/channels/{channelId}/content-subscription
Authorization: Bearer <token>
```

The actor must have channel read access. Only server channels can be subscribed.

Response:

```json
{
  "id": "sub-id",
  "userId": "user-id",
  "channelId": "channel-id",
  "serverId": "server-id",
  "status": "active",
  "includeKinds": ["image", "html", "pdf", "file", "voice", "card"],
  "excludeMimeTypes": [],
  "minAttachmentSize": null,
  "maxAttachmentSize": null,
  "pushEnabled": true,
  "digestMode": "realtime",
  "lastReadAt": null,
  "createdAt": "2026-06-01T00:00:00.000Z",
  "updatedAt": "2026-06-01T00:00:00.000Z",
  "isDefault": false
}
```

## List Subscriptions

```http
GET /api/content-subscriptions
```

Returns the current user's accessible channel subscriptions with channel and server summary.
Implicit defaults are returned with `isDefault: true` and an id shaped as `default:{channelId}`.
Pass `serverId` to scope the list to one server, which is the preferred path for channel menus and
other latency-sensitive surfaces.

## Default Subscription Rules

```http
GET /api/content-subscriptions/defaults
PATCH /api/content-subscriptions/defaults
Content-Type: application/json
```

Supported `PATCH` fields:

- `includeKinds`
- `pushEnabled`
- `digestMode`

These rules apply to every readable channel unless that channel is paused or has custom rules.

## Update Subscription Rules

```http
PATCH /api/content-subscriptions/{id}
Content-Type: application/json
```

Supported fields:

- `status`: `active` or `paused`
- `includeKinds`: array of `image`, `html`, `pdf`, `file`, `voice`, `card`
- `excludeMimeTypes`
- `minAttachmentSize`
- `maxAttachmentSize`
- `pushEnabled`
- `digestMode`: `realtime`, `daily`, or `none`
- `lastReadAt`
- `resetRules`: set to `true` to restore this channel to account defaults

## Delete Subscription

```http
DELETE /api/content-subscriptions/{id}
```

Pauses the subscription. For implicit defaults, this creates a paused override row so the channel
does not reappear just because the user still has read access.

## Query Feed

```http
GET /api/content-feed?limit=30&sort=latest
```

Query parameters:

- `cursor`: opaque cursor from the previous page
- `limit`: 1 to 50, default 30
- `kinds`: comma-separated content kinds
- `channelId`
- `serverId`
- `unreadOnly`: `true` or omitted
- `sort`: `latest` or `recommended`; default is `latest`

Feed queries enforce current server and private-channel access in bulk. Results exclude hidden and
dismissed items.

`interactions.likeCount` and `interactions.viewerLiked` are derived from the source message's
`reactions` rows. `interactions.commentCount` counts normal message replies where
`messages.reply_to_id` is the source message id, so feed comments use the same message reply flow,
thread behavior, and reply notification logic as chat. `interactions.viewerSaved` reflects whether
the current user's latest feed event state is `saved`.

Response:

```json
{
  "items": [
    {
      "id": "feed-item-id",
      "messageId": "message-id",
      "channelId": "channel-id",
      "serverId": "server-id",
      "title": "Quarterly report.pdf",
      "summary": "Report summary",
      "contentKinds": ["pdf"],
      "primaryAttachmentId": "attachment-id",
      "primaryAttachmentContentType": "application/pdf",
      "primaryAttachmentSize": 1048576,
      "primaryAttachmentDurationMs": null,
      "attachmentIds": ["attachment-id"],
      "cardRefs": [],
      "readState": "unread",
      "interactions": {
        "likeCount": 12,
        "viewerLiked": false,
        "commentCount": 3,
        "viewerSaved": false
      },
      "publishedAt": "2026-06-01T00:00:00.000Z",
      "channel": { "id": "channel-id", "name": "reports", "type": "text" },
      "server": { "id": "server-id", "name": "Team", "slug": "team" },
      "author": { "id": "user-id", "username": "mao" }
    }
  ],
  "hasMore": false,
  "nextCursor": null
}
```

## Record Feed Event

```http
POST /api/content-feed/{feedItemId}/events
Content-Type: application/json
```

Body:

```json
{
  "state": "opened",
  "lastPosition": { "page": 3 }
}
```

Allowed states: `seen`, `opened`, `saved`, `hidden`, `dismissed`.

## Open Message Thread For Feed Cards

```http
POST /api/messages/{messageId}/thread
Content-Type: application/json
```

Ensures and returns the canonical chat Thread for the source message behind a feed item. Feed
comments are normal Thread messages; there is no feed-specific comment table or reply endpoint.
Access is checked through the parent message's channel, so private-channel and server membership
rules still apply.

Optional body:

```json
{
  "name": "Thread"
}
```

Response:

```json
{
  "id": "thread-id",
  "name": "Thread",
  "channelId": "channel-id",
  "parentMessageId": "source-message-id",
  "creatorId": "user-id",
  "isArchived": false,
  "createdAt": "2026-06-01T00:00:00.000Z",
  "updatedAt": "2026-06-01T00:00:00.000Z"
}
```

List comments:

```http
GET /api/threads/{threadId}/messages?limit=20
```

Create a comment:

```http
POST /api/threads/{threadId}/messages
Content-Type: application/json
```

Body:

```json
{
  "content": "Looks good"
}
```

Thread message response:

```json
[
  {
    "id": "message-id",
    "content": "Looks good",
    "channelId": "channel-id",
    "authorId": "user-id",
    "threadId": "thread-id",
    "replyToId": null,
    "createdAt": "2026-06-01T00:01:00.000Z",
    "updatedAt": "2026-06-01T00:01:00.000Z",
    "author": {
      "id": "user-id",
      "username": "mao",
      "displayName": "Mao",
      "avatarUrl": null,
      "isBot": false
    }
  }
]
```

## Feed Reactions

Feed likes are normal message reactions on the source message using the heart emoji:

```http
POST /api/messages/{messageId}/reactions
Content-Type: application/json
```

Body:

```json
{
  "emoji": "❤️"
}
```

The Feed interaction count reads the same `reactions` rows, so chat and Feed stay synchronized.

## Mark Read

```http
POST /api/content-feed/read-scope
Content-Type: application/json
```

Body must include one of:

- `feedItemId`
- `channelId`
- `serverId`
- `all: true`

Response:

```json
{ "updated": 1 }
```
