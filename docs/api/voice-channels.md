# Voice Channels

Shadow voice channels use Agora RTC for media transport and Shadow auth for channel access. The server is the only place that reads Agora project secrets; web, mobile, CLI, SDK, and Buddy-style external systems receive short-lived RTC credentials only after Shadow authorization passes.

## Configuration

Set these on the server process:

- `AGORA_APP_ID`: Agora project app ID.
- `AGORA_APP_CERTIFICATE`: Agora app certificate. If omitted, join responses return `token: null` for Agora projects that run without token authentication.

Do not set or depend on `VITE_AGORA_*` in web or mobile clients. Clients call the authenticated Shadow `join` API and receive only scoped RTC data: `appId`, `agoraChannelName`, `uid`, `screenUid`, `token`, `screenToken`, and `expiresAt`.

## Authorization

All voice routes require `PolicyService.requireChannelRead(actor, channelId)`. The target channel must be a server channel with `type: "voice"`.

Required boundary:

- Actor kind: user, PAT, OAuth, agent, or system actor converted to an authorized user-capable actor.
- Resource: channel ID.
- Action: `read` for join/state/leave/update, `manage` for voice policy updates.
- Data class: channel-private RTC metadata.

OAuth/PAT scope alone is not sufficient. The actor must also have access to the server/channel resource.

## Lifecycle

1. Client requests `POST /api/channels/:channelId/voice/join`.
2. Server validates channel access and issues Agora credentials.
3. Client joins Agora with `credentials.uid` for audio.
4. Client publishes microphone or custom audio track.
5. Client uses `credentials.screenUid` on a second Agora client when publishing screen share.
6. Client sends state updates for mute, deafen, speaking, and screen sharing.
7. Client sends `voice:heartbeat` over Socket.IO while connected.
8. Client calls `leave`; the frontend/CLI also clears local UI/process state immediately.

Participants that do not heartbeat for 90 seconds are removed. Empty sessions are retained for a 5 minute grace period before cleanup.

## REST API

### `GET /api/channels/:channelId/voice/state`

Returns current voice presence.

```json
{
  "channelId": "uuid",
  "agoraChannelName": "shadow_uuid",
  "participants": [],
  "participantCount": 0,
  "emptySince": null,
  "graceEndsAt": null
}
```

### `POST /api/channels/:channelId/voice/join`

Issues Agora credentials and marks the actor connected.

```json
{
  "clientId": "web-tab-1",
  "muted": false,
  "deafened": false
}
```

Response includes:

- `credentials.appId`
- `credentials.agoraChannelName`
- `credentials.uid`
- `credentials.screenUid`
- `credentials.token`
- `credentials.screenToken`
- `credentials.expiresAt`
- `participant`
- `state`

### `POST /api/channels/:channelId/voice/leave`

Marks the actor disconnected and broadcasts `voice:participant-left`.

### `PATCH /api/channels/:channelId/voice/state`

Updates local voice state.

```json
{
  "muted": true,
  "deafened": false,
  "speaking": false,
  "screenSharing": true
}
```

### `GET /api/channels/:channelId/voice-policy?agentId=:agentId`

Returns Buddy voice standby policy for a channel.

### `PUT /api/channels/:channelId/voice-policy`

Requires channel manage permission. Stores Buddy voice standby policy.

```json
{
  "agentId": "uuid",
  "listen": true,
  "autoJoin": true,
  "consumeAudio": true,
  "consumeScreenShare": true,
  "screenshotIntervalSeconds": 30
}
```

## Socket.IO Events

Client to server:

- `voice:join`
- `voice:leave`
- `voice:state:update`
- `voice:heartbeat`

Server to client:

- `voice:state`
- `voice:participant-joined`
- `voice:participant-left`
- `voice:participant-updated`
- `voice:policy-updated`

## TypeScript SDK

REST voice state:

```ts
const state = await client.getVoiceState(channelId)
const joined = await client.joinVoiceChannel(channelId, {
  clientId: 'my-app',
  muted: false,
})
await client.updateVoiceState(channelId, { muted: true })
await client.leaveVoiceChannel(channelId)
```

Browser RTC consumer:

```ts
import { ShadowClient, ShadowVoiceConsumer } from '@shadowob/sdk'

const client = new ShadowClient(serverUrl, accessToken)
const voice = new ShadowVoiceConsumer({
  client,
  channelId,
  onRemoteAudio({ uid, track }) {
    track.play()
  },
  onRemoteScreen({ uid, track }) {
    track.play(`screen-${uid}`)
  },
})

await voice.join()
await voice.setMuted(false)
await voice.startScreenShare()
await voice.stopScreenShare()
await voice.leave()
```

`ShadowVoiceConsumer` dynamically imports `agora-rtc-sdk-ng`. The SDK declares Agora as an optional peer dependency so Node-only consumers and the CLI do not install browser RTC code by default. Browser apps that use `ShadowVoiceConsumer` must install `agora-rtc-sdk-ng`.

## Python SDK

```python
state = client.get_voice_state(channel_id)
joined = client.join_voice_channel(channel_id, client_id="ai-buddy", muted=False)
client.update_voice_state(channel_id, speaking=True)
client.leave_voice_channel(channel_id)
```

The Python SDK exposes Shadow voice control and credentials. RTC media transport should be handled by a browser bridge, native Agora SDK, or an external process that can join Agora with the returned credentials.

## CLI Media Bridge

`shadowob voice bridge <channel-id>` joins through the authenticated Shadow voice API, receives scoped Agora credentials from the server, and starts a local browser runtime to bridge RTC media for external systems such as AI Buddy.

Supported flows:

- `--record-out <dir>` records a complete local archive: remote audio as WAV and remote video/screen-share tracks as WebM.
- `--audio-out <dir>` records remote audio tracks as per-user WAV files.
- `--video-out <dir>` records remote video/screen-share tracks as WebM files.
- `--screen-out <dir>` records remote screen shares as PNG frame sequences.
- `--input <file>` publishes an audio file into the voice channel.
- `--stdin-pcm --sample-rate <hz> --channels <1|2>` publishes raw signed 16-bit little-endian PCM from stdin.

The CLI does not depend on Playwright, Puppeteer, or a bundled browser at install time. Browser runtime options:

- `shadowob voice browser install`: dynamically installs an isolated Chromium runtime under `~/.cache/shadowob/browsers`.
- `shadowob voice browser path`: prints the installed managed browser path.
- `shadowob voice bridge --install-browser`: installs the managed browser on demand before joining.
- `--browser <path>` or `SHADOWOB_BROWSER`: uses an explicit Chrome/Chromium executable.
- Managed browser cache can be overridden with `SHADOWOB_BROWSER_CACHE_DIR`.

Agora browser bundle options:

- If `agora-rtc-sdk-ng` is installed near the CLI/SDK workspace, the bridge resolves `AgoraRTC_N-production.js`.
- `--agora-sdk <path>` or `SHADOWOB_AGORA_WEB_SDK` can point directly at `AgoraRTC_N-production.js`.

Examples:

```bash
# Install isolated Chromium for RTC tests and AI bridge usage
shadowob voice browser install

# Record remote voice, video, and screen-share media
shadowob voice bridge <channel-id> --record-out ./voice-recordings --json

# Record separate outputs for downstream pipelines
shadowob voice bridge <channel-id> --audio-out ./audio --video-out ./video --screen-out ./screens --json

# Publish a generated reply file into the channel
shadowob voice bridge <channel-id> --input ./reply.wav --duration 30 --json

# Stream model-generated PCM into the call
model-audio-producer | shadowob voice bridge <channel-id> \
  --stdin-pcm \
  --sample-rate 24000 \
  --channels 1 \
  --json

# One-shot command that installs the managed browser if needed
shadowob voice bridge <channel-id> --install-browser --audio-out ./audio --json
```

## AI Buddy Integration

For an Omni-style Buddy that listens, reasons, and speaks:

1. Use Shadow auth to get a token for the Buddy/user actor.
2. Join the voice channel through REST or `shadowob voice bridge`.
3. Consume remote WAV files from `--audio-out` or `--record-out`, or use the SDK credentials with a native Agora client.
4. Consume screen-share WebM files from `--video-out` / `--record-out`, or PNG frames from `--screen-out` when visual grounding is enabled.
5. Feed ASR / multimodal model input from the recorded audio and video/screen frames.
6. Send generated speech back with `--stdin-pcm` or `--input`.
7. Update speaking/mute/screen state through REST or Socket.IO.
8. Leave the channel on shutdown and handle SIGINT/SIGTERM.

## Validation

The real RTC smoke test should verify:

- Backend join returns server-issued Agora credentials.
- Two different Shadow users receive different Agora audio/screen UIDs.
- Receiver bridge emits `remote-audio:subscribed`.
- Receiver bridge writes a WAV file with non-zero peak/RMS and can retain remote video/screen-share WebM when a video publisher is present.
- Sender and receiver both leave and final participant count returns to `0`.

The local validation run on 2026-05-16 used isolated Chromium installed by `shadowob voice browser install`; sender published a WAV with `--input`, receiver recorded a remote WAV with `--audio-out`, and the recording had `dataBytes=1056768`, `peak=18550`, `rms=10786`. A follow-up `--record-out` run wrote `audio/*.wav` with `dataBytes=671744`, `peak=14909`, `rms=8708`.

## Troubleshooting

- `Agora RTC is not configured`: set `AGORA_APP_ID` on the server and restart the server process.
- Browser asks for macOS keychain: use `shadowob voice browser install` or `--install-browser` instead of system Chrome.
- No browser found: install managed Chromium, set `SHADOWOB_BROWSER`, or pass `--browser`.
- `Agora Web SDK is not available`: install `agora-rtc-sdk-ng` near the CLI/SDK, or set `SHADOWOB_AGORA_WEB_SDK`.
- Receiver records no WAV: confirm two different profiles/users are used, the channel is a voice channel, and the sender emits `input:file-published`.
- Stats collector network failures: Agora telemetry endpoints can be blocked by local networks; media can still work when join/publish/subscribe events succeed.
