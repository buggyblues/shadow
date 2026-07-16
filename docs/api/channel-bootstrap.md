# Channel Bootstrap

Channel chat routes should use the bootstrap endpoint for first paint instead of issuing separate access, channel, message, member, Buddy Inbox, Space App summary, and slash-command requests.

## Get Channel Bootstrap

`GET /api/channels/:channelId/bootstrap`

Query:

- `messagesLimit`: optional initial message page size, defaults to `50`, capped at `100`.

Authorization:

- The caller must be authenticated.
- The response always includes channel access status.
- Message, member, Buddy Inbox, Space App summary, and slash-command data are only included when the caller can read the channel.
- For a private channel the caller cannot read, the endpoint still returns server shell data and the visible channel list when the caller is a member of that server. This lets clients render the access request state without falling back to separate server/channel bootstrap requests.

Response:

```json
{
  "access": { "canAccess": true },
  "channel": { "id": "channel-id", "name": "general" },
  "server": { "id": "server-id", "name": "Shadow" },
  "channels": [],
  "buddyInboxes": [],
  "appSummaries": [],
  "members": [],
  "messages": { "messages": [], "hasMore": false },
  "slashCommands": { "commands": [] }
}
```

SDKs:

- TypeScript: `client.getChannelBootstrap(channelId, { messagesLimit: 50 })`
- Python: `client.get_channel_bootstrap(channel_id, messages_limit=50)`
