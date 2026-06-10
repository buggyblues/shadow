# Messages API

Channel messages are returned oldest-to-newest inside each page. Access is scoped by channel
membership and the authenticated user.

## List Channel Messages

`GET /api/channels/:channelId/messages`

Query parameters:

- `limit`: optional page size, default `50`.
- `cursor`: optional ISO timestamp. When present, returns messages older than the cursor.

Response:

```json
{
  "messages": [],
  "hasMore": false
}
```

## Load Around A Message

`GET /api/channels/:channelId/messages/around/:messageId`

Returns a bounded window that includes `messageId`, with neighboring channel-root messages before
and after it. This is intended for deep links and notification clicks where the target message may
not be present in the currently loaded timeline.

Query parameters:

- `limit`: optional total window size, default `50`, maximum `100`.

Response:

```json
{
  "messages": [],
  "hasMore": false
}
```

`hasMore` indicates whether older channel-root messages exist before the returned window.
