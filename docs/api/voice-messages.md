# Voice Messages

Voice messages are regular message attachments with `kind: "voice"`. They use the same
authorized media delivery path as files and images; raw object URLs are not public. Clients
must render them as voice bubbles rather than file cards, and recording clients should send
the recorded voice immediately instead of putting it into the generic pending attachment UI.

## Upload

`POST /api/media/upload`

Use multipart form data. When `kind=voice`, `file` must be `audio/*`.

| Field | Type | Required | Notes |
|---|---|---:|---|
| `file` | File | Yes | Recorded audio file |
| `messageId` | string | No | If present, attach directly to an existing sender-owned message |
| `kind` | `"voice"` | Yes | Marks the attachment as a voice message |
| `durationMs` | number | Yes | `1000..60000` |
| `waveformPeaks` | `number[]` JSON | No | 32-96 integers, `0..100` |
| `transcriptText` | string | No | Optional visible transcript from client/runtime |
| `transcriptLanguage` | string | No | BCP-47 style language hint |
| `transcriptSource` | `"client"` or `"runtime"` | No | Defaults to `client` |

Pre-uploaded attachments can also be passed to `POST /api/channels/:channelId/messages` or
`POST /api/threads/:id/messages` with the same voice fields.

## Playback

`PUT /api/attachments/:attachmentId/voice-playback`

```json
{ "positionMs": 2300, "completed": true }
```

The server stores playback per `(attachmentId, userId)`. Message reads include
`attachment.playback`, so clients can render per-user unplayed indicators. Senders receive
`playedCount` instead of an unread state.

## Transcript

`POST /api/attachments/:attachmentId/transcript`

Requests server-side transcript generation. If `VOICE_TRANSCRIPT_PROVIDER` and
`VOICE_TRANSCRIPT_API_KEY` are configured, the server reads the private voice object, calls the
configured STT provider, and returns a `ready` or `failed` transcript. Without provider config it
returns `failed` with `VOICE_TRANSCRIPT_PROVIDER_NOT_CONFIGURED`.

The message send path also triggers this server fallback automatically for voice attachments that
do not include `transcriptText`, so Buddy runtimes can receive text when STT is available.

`PUT /api/attachments/:attachmentId/transcript`

Allows the voice message author/runtime sender to write a visible transcript:

```json
{ "source": "runtime", "language": "zh-CN", "text": "..." }
```

Transcript text is channel-private and only returned to actors that can read the parent message.
OpenClaw and Hermes treat a ready voice transcript as the inbound text body when the Shadow message
content is otherwise empty.

## Realtime

- `message:new` / `message:updated`: carry voice attachment fields.
- `voice:playback-updated`: emitted to the user room after playback changes.
- `voice:transcript-updated`: emitted to the channel when transcript state changes.
