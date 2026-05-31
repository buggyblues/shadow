# Search API

## GET /api/search/messages

Search messages visible to the authenticated actor.

Query parameters:

- `query` or `q` (required): Search text. Minimum length is 2 characters after trimming.
- `serverId` (optional): Restrict search to channels visible to the actor in one server.
- `channelId` (optional): Restrict search to one readable channel.
- `from` or `authorId` (optional): Restrict search to one author.
- `hasAttachment` or `hasAttachments` (optional): Use `true` or `1` to return only messages with attachments.
- `limit` (optional): Result limit, clamped to 1-100. Default is 50.
- `offset` (optional): Result offset, clamped to 0-10000. Default is 0.

Response: an array of messages ordered newest first. SDK clients may normalize the same response to `{ messages, total }` for backwards compatibility.
