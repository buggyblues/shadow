# Server Desktop Layout

Server desktop layout stores the shared community desktop state for one Shadow server.
It is server-owned state, not local user preference state. Clients use it for
desktop icons and server widgets such as sticky-note announcement boards,
chat inputs, photo frames, typewriter plain text layers, and embedded video
players or web pages.

Personal UI state such as open windows, focused windows, and Dock visibility may
remain local to a client. Anything that should look the same to every member of
the server should live in this layout.

## Endpoints

### `GET /api/servers/:serverIdOrSlug/desktop-layout`

Returns the shared desktop layout for a server.

Access:

- Server members can read the layout.
- Public servers can be read by authenticated non-members.
- Private servers reject non-members with `403`.

Response:

```json
{
  "version": 2,
  "items": [],
  "widgets": []
}
```

### `PATCH /api/servers/:serverIdOrSlug/desktop-layout`

Replaces the shared desktop layout for a server.

Access:

- Requires an authenticated actor with `admin` or `owner` role on the server.

Request and response body:

```json
{
  "version": 2,
  "items": [
    {
      "id": "builtin:workspace",
      "kind": "builtin-app",
      "builtinKey": "workspace",
      "title": "Workspace",
      "x": 24,
      "y": 56
    },
    {
      "id": "buddy-inbox:550e8400-e29b-41d4-a716-446655440001",
      "kind": "buddy-inbox",
      "agentId": "550e8400-e29b-41d4-a716-446655440001",
      "channelId": "550e8400-e29b-41d4-a716-446655440002",
      "title": "Planner Buddy",
      "x": 128,
      "y": 56
    }
  ],
  "widgets": [
    {
      "id": "widget:notice",
      "kind": "sticky-note",
      "x": 128,
      "y": 168,
      "widthCells": 6,
      "heightCells": 4,
      "rotation": 4,
      "content": "## Notice",
      "updatedAt": "2026-06-24T00:00:00.000Z"
    },
    {
      "id": "widget:chat",
      "kind": "chat-input",
      "x": 456,
      "y": 168,
      "widthCells": 10,
      "heightCells": 4,
      "rotation": -3,
      "defaultAgentId": "550e8400-e29b-41d4-a716-446655440001",
      "inboxViewMode": "chat",
      "placeholder": "Ask Buddy anything",
      "completionItems": ["Summarize today", "Draft a reply"],
      "updatedAt": "2026-06-24T00:00:00.000Z"
    },
    {
      "id": "widget:launch-video",
      "kind": "video-player",
      "provider": "youtube",
      "x": 760,
      "y": 168,
      "widthCells": 10,
      "heightCells": 6,
      "rotation": 7,
      "source": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "title": "Launch video",
      "autoplay": false,
      "muted": true,
      "showCover": true,
      "updatedAt": "2026-06-24T00:00:00.000Z"
    },
    {
      "id": "widget:photo",
      "kind": "photo",
      "sourceType": "workspace-file",
      "source": "550e8400-e29b-41d4-a716-446655440000",
      "x": 24,
      "y": 392,
      "widthCells": 6,
      "aspectRatio": 1.5,
      "rotation": -6,
      "title": "Launch photo",
      "workspaceFileName": "launch.jpg",
      "updatedAt": "2026-06-24T00:00:00.000Z"
    },
    {
      "id": "widget:typewriter",
      "kind": "typewriter",
      "x": 456,
      "y": 504,
      "widthCells": 8,
      "heightCells": 6,
      "rotation": -8,
      "content": "hello",
      "speedMs": 160,
      "pauseMs": 1800,
      "loop": true,
      "cursor": true,
      "fontFamily": "handwriting",
      "fontSize": 64,
      "color": "#ffffff",
      "textShadow": "soft",
      "textStrokeWidth": 0,
      "textStrokeColor": "#000000",
      "updatedAt": "2026-06-24T00:00:00.000Z"
    },
    {
      "id": "widget:docs",
      "kind": "web-embed",
      "sourceType": "url",
      "source": "https://example.com/docs",
      "x": 976,
      "y": 168,
      "widthCells": 10,
      "heightCells": 8,
      "rotation": 5,
      "title": "Docs",
      "updatedAt": "2026-06-24T00:00:00.000Z"
    }
  ]
}
```

## Layout Schema

Top-level layout:

- `version`: currently `2`. Version `1` layouts are legacy full-cell
  layouts; clients migrate widget cell counts to the finer v2 grid on read.
- `items`: up to 200 desktop icons.
- `widgets`: up to 50 desktop widgets.

Supported `items`:

- `workspace-node`: references a workspace file or folder by `workspaceNodeId`.
- `builtin-app`: references a first-party desktop app by `builtinKey`.
- `server-app`: references an installed server app by `appKey`, optionally `appId`.
- `buddy-inbox`: references a Buddy by `agentId` and optionally its inbox
  `channelId`; clients resolve the latest Buddy profile, avatar, and presence at
  render time.

All item coordinates are finite numbers from `0` through `10000`.

Supported `widgets`:

- `sticky-note`: a yellow announcement sticky note with Markdown content.
- `chat-input`: a compact composer that targets a server Buddy inbox, can
  default to chat or task mode, and may define custom placeholder copy and
  ordered input completions.
- `photo`: a Polaroid-style image frame backed by an image URL or workspace
  image file.
- `typewriter`: an animated plain text layer with configurable typing speed,
  looping, cursor visibility, font, size, shadow, and stroke.
- `video-player`: an embedded Bilibili or YouTube player.
- `web-embed`: an embedded website URL or a workspace HTML file.

All widget kinds support optional `rotation` in degrees, from `-45` through
`45`. Photo widgets require `rotation`; other widget kinds may omit it and
default to `0` in clients.

Sticky-note limits:

- `widthCells`: integer from `2` through `12`.
- `heightCells`: integer from `2` through `12`.
- `content`: up to 8000 characters.

Chat-input fields and limits:

- `widthCells`: integer from `6` through `16`.
- `heightCells`: integer from `2` through `8`.
- `defaultAgentId`: optional Buddy agent UUID or `null`.
- `inboxViewMode`: `chat` or `tasks`.

Typewriter fields and limits:

- `content`: text to type, up to 4000 characters.
- `widthCells`: integer from `4` through `16`.
- `heightCells`: integer from `2` through `12`.
- `speedMs`: typing delay per character, from `15` through `240`.
- `pauseMs`: pause after the full text is typed before looping, from `500`
  through `8000`.
- `loop` and `cursor`: booleans.
- `fontFamily`: `system`, `serif`, `mono`, or `handwriting`.
- `fontSize`: integer from `12` through `96`.
- `color` and `textStrokeColor`: six-digit hex colors such as `#ffffff`.
- `textShadow`: `none`, `soft`, `glow`, or `strong`.
- `textStrokeWidth`: integer from `0` through `8`.

Photo fields and limits:

- `sourceType`: `url` or `workspace-file`.
- `source`: for `url`, an image URL up to 2048 characters; for
  `workspace-file`, the workspace file id.
- `title`: optional title, up to 120 characters.
- `workspaceFileName`: optional display name for workspace image files, up to
  255 characters.
- `widthCells`: integer from `4` through `8`.
- `aspectRatio`: stored natural image width divided by height, from `0.1`
  through `10`.
- `rotation`: frame rotation in degrees, from `-45` through `45`.

Video-player fields and limits:

- `provider`: `bilibili` or `youtube`.
- `source`: video URL, embed URL, or supported video id, up to 2048 characters.
- `title`: optional title, up to 120 characters.
- `coverUrl`: optional cover image URL, up to 2048 characters.
- `widthCells`: integer from `4` through `16`.
- `heightCells`: integer from `4` through `12`.
- `autoplay`, `muted`, `danmaku`, and `showCover`: optional booleans. `danmaku`
  applies to Bilibili players.

Web-embed fields and limits:

- `sourceType`: `url` or `workspace-file`.
- `source`: for `url`, an HTTP(S) URL up to 2048 characters; for
  `workspace-file`, the workspace file id.
- `title`: optional title, up to 120 characters.
- `workspaceFileName`: optional display name for workspace HTML files, up to 255
  characters.
- `widthCells`: integer from `4` through `16`.
- `heightCells`: integer from `4` through `12`.

## Missing References

Clients should tolerate stale references. If a `workspace-node` points at a
workspace file that has been deleted, the client should skip that desktop item
while keeping the rest of the layout usable. Future widget kinds should follow
the same rule: unknown or invalid widget records are ignored by clients that do
not support them.

## SDK Helpers

TypeScript:

```ts
await client.getServerDesktopLayout('shadow-plays')
await client.updateServerDesktopLayout('shadow-plays', layout)
```

Python:

```py
client.get_server_desktop_layout("shadow-plays")
client.update_server_desktop_layout("shadow-plays", layout)
```
