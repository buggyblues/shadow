# Server Desktop Layout

Server desktop layout stores the shared OS desktop state for one Shadow server.
It is server-owned state, not local user preference state. Clients use it for
desktop icons and server widgets such as sticky-note announcement boards and
embedded video players or web pages.

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
  "version": 1,
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
  "version": 1,
  "items": [
    {
      "id": "builtin:workspace",
      "kind": "builtin-app",
      "builtinKey": "workspace",
      "title": "Workspace",
      "x": 24,
      "y": 56
    }
  ],
  "widgets": [
    {
      "id": "widget:notice",
      "kind": "sticky-note",
      "x": 128,
      "y": 168,
      "widthCells": 3,
      "heightCells": 2,
      "content": "## Notice",
      "updatedAt": "2026-06-24T00:00:00.000Z"
    },
    {
      "id": "widget:launch-video",
      "kind": "video-player",
      "provider": "youtube",
      "x": 456,
      "y": 168,
      "widthCells": 5,
      "heightCells": 3,
      "source": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "title": "Launch video",
      "autoplay": false,
      "muted": true,
      "showCover": true,
      "updatedAt": "2026-06-24T00:00:00.000Z"
    },
    {
      "id": "widget:docs",
      "kind": "web-embed",
      "sourceType": "url",
      "source": "https://example.com/docs",
      "x": 976,
      "y": 168,
      "widthCells": 5,
      "heightCells": 4,
      "title": "Docs",
      "updatedAt": "2026-06-24T00:00:00.000Z"
    }
  ]
}
```

## Layout Schema

Top-level layout:

- `version`: currently `1`.
- `items`: up to 200 desktop icons.
- `widgets`: up to 50 desktop widgets.

Supported `items`:

- `workspace-node`: references a workspace file or folder by `workspaceNodeId`.
- `builtin-app`: references a first-party OS app by `builtinKey`.
- `server-app`: references an installed server app by `appKey`, optionally `appId`.

All item coordinates are finite numbers from `0` through `10000`.

Supported `widgets`:

- `sticky-note`: a yellow announcement sticky note with Markdown content.
- `video-player`: an embedded Bilibili or YouTube player.
- `web-embed`: an embedded website URL or a workspace HTML file.

Sticky-note limits:

- `widthCells`: integer from `1` through `6`.
- `heightCells`: integer from `1` through `6`.
- `content`: up to 8000 characters.

Video-player fields and limits:

- `provider`: `bilibili` or `youtube`.
- `source`: video URL, embed URL, or supported video id, up to 2048 characters.
- `title`: optional title, up to 120 characters.
- `coverUrl`: optional cover image URL, up to 2048 characters.
- `widthCells`: integer from `2` through `8`.
- `heightCells`: integer from `2` through `6`.
- `autoplay`, `muted`, `danmaku`, and `showCover`: optional booleans. `danmaku`
  applies to Bilibili players.

Web-embed fields and limits:

- `sourceType`: `url` or `workspace-file`.
- `source`: for `url`, an HTTP(S) URL up to 2048 characters; for
  `workspace-file`, the workspace file id.
- `title`: optional title, up to 120 characters.
- `workspaceFileName`: optional display name for workspace HTML files, up to 255
  characters.
- `widthCells`: integer from `2` through `8`.
- `heightCells`: integer from `2` through `6`.

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
