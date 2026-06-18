# Channels

## List Server Channels

`GET /api/servers/:serverId/channels`

Returns the server channels visible to the caller. Private channels are included only when the caller can see them.

Each channel can include:

- `lastMessageAt`: timestamp for the latest channel activity, when available.
- `lastMessagePreview`: optional preview of the latest top-level message, shaped as `{ id, content, createdAt, attachmentCount, attachmentPreviews, author }`. `attachmentPreviews` contains up to 3 lightweight attachment entries shaped as `{ id, filename, contentType, kind }` and intentionally omits media URLs. `author` is `null` when the author is unavailable.
- `memberPreviews`: up to 6 current channel members for compact channel avatars. Members with recent top-level messages are ordered by latest speaking time first; remaining channel members fill the list by join order.

When a server has no visible channels, the response is an empty array.
