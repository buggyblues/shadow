# Messages API

Channel messages are returned oldest-to-newest inside each page. Access is scoped by channel
membership and the authenticated user.

## Message Metadata

`metadata` is a bounded object with explicit top-level keys. Unknown top-level keys are rejected.

Runtime-generated agent replies may include `metadata.agentChain` for traceability:

```json
{
  "agentChain": {
    "agentId": "brandscout",
    "depth": 1,
    "participants": ["bot-user-id"],
    "startedAt": 1802000000000,
    "rootMessageId": "message-id"
  }
}
```

`agentChain` records runtime lineage only. It is not an authorization source and must not be used
to grant channel, server, wallet, deployment, or plugin access.

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

## Poll Messages

Shadow polls follow the Discord poll model: a poll is a channel message with a `poll` card in
`metadata.cards`, backed by first-class poll state and vote APIs. Polls support 2-10 answers,
single-select or multi-select voting, visible voter lists, changing/removing votes while active,
creator/admin early close, and lazy finalization after expiry.

Poll messages use a zero-width message body (`\u200B`) and render from the poll card plus
`GET /api/messages/:id/poll` state:

```json
{
  "metadata": {
    "cards": [
      {
        "id": "poll-id",
        "kind": "poll",
        "version": 1,
        "pollId": "poll-id",
        "title": "Which time works best?",
        "allowMultiselect": false,
        "status": "active",
        "expiresAt": "2026-07-09T12:00:00.000Z"
      }
    ]
  }
}
```

Poll messages cannot be edited through `PATCH /api/messages/:id`; create a new poll or close the
existing poll instead.

### Create Poll

`POST /api/channels/:channelId/polls`

Request:

```json
{
  "question": "Which time works best?",
  "answers": [
    { "text": "10:00" },
    { "text": "14:00", "emoji": ":clock2:" }
  ],
  "allowMultiselect": false,
  "durationHours": 24,
  "layoutType": 1
}
```

Constraints:

- `question`: 1-300 characters.
- `answers`: 2-10 items; answer text is 1-55 characters.
- `durationHours`: 1-768 hours.
- `allowMultiselect`: optional, default `false`.
- `layoutType`: currently `1`.

Response: created message, status `201`. The server emits `message:new` to the channel.

### Get Poll State

`GET /api/messages/:messageId/poll`

Response:

```json
{
  "id": "poll-id",
  "messageId": "message-id",
  "channelId": "channel-id",
  "serverId": "server-id",
  "creatorId": "user-id",
  "question": "Which time works best?",
  "allowMultiselect": false,
  "status": "active",
  "layoutType": 1,
  "expiresAt": "2026-07-09T12:00:00.000Z",
  "finalizedAt": null,
  "isExpired": false,
  "isFinalized": false,
  "totalVotes": 3,
  "viewerOptionIds": ["option-id"],
  "viewerAnswerIds": [1],
  "viewerCanEnd": true,
  "options": [
    {
      "id": "option-id",
      "answerId": 1,
      "text": "10:00",
      "emoji": null,
      "voteCount": 3,
      "votedByViewer": true
    }
  ],
  "createdAt": "2026-07-08T12:00:00.000Z",
  "updatedAt": "2026-07-08T12:00:00.000Z"
}
```

Expired active polls are finalized when read or voted on.

### Vote Or Change Vote

`POST /api/messages/:messageId/poll/votes`

Request with option ids:

```json
{
  "optionIds": ["option-id"]
}
```

Request with stable answer ids:

```json
{
  "answerIds": [1, 2]
}
```

For single-select polls, only one answer is accepted. Passing an empty `optionIds` array removes
the current user's vote. Bot users cannot vote.

Response: current poll state. The server emits `poll:updated` to the channel.

### Remove Vote

`DELETE /api/messages/:messageId/poll/votes`

Response: current poll state. The server emits `poll:updated` to the channel.

### End Poll

`POST /api/messages/:messageId/poll/end`

The poll creator or a user with channel management access can close an active poll early.

Response: finalized poll state. The server emits `poll:updated` to the channel.

### List Voters

`GET /api/messages/:messageId/poll/options/:optionId/voters`

Query parameters:

- `limit`: optional page size, default `50`, maximum `100`.
- `cursor`: optional ISO timestamp returned as `nextCursor`.

Response:

```json
{
  "voters": [
    {
      "id": "user-id",
      "username": "alex",
      "displayName": "Alex",
      "avatarUrl": "https://cdn.example/avatar.png",
      "votedAt": "2026-07-08T12:05:00.000Z"
    }
  ],
  "hasMore": false,
  "nextCursor": null
}
```

Polls are not anonymous; clients may show voter lists per answer.

### Realtime Event

`poll:updated`

```json
{
  "messageId": "message-id",
  "channelId": "channel-id"
}
```

The event does not include viewer-specific poll state. Clients should invalidate cached poll state
for `messageId` and refetch `GET /api/messages/:messageId/poll` as the current viewer.

### SDK Examples

TypeScript:

```ts
const message = await client.createPoll(channelId, {
  question: 'Which time works best?',
  answers: ['10:00', '14:00'],
  durationHours: 24,
})

const poll = await client.votePoll(message.id, { answerIds: [1] })
await client.removePollVote(message.id)
await client.endPoll(message.id)
```

Python:

```python
message = client.create_poll(
    channel_id,
    question="Which time works best?",
    answers=["10:00", "14:00"],
    duration_hours=24,
)

poll = client.vote_poll(message["id"], answer_ids=[1])
client.remove_poll_vote(message["id"])
client.end_poll(message["id"])
```
