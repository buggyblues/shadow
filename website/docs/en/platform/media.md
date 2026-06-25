# Media

## Upload file

```
POST /api/media/upload
```

Upload a file attachment. Uses multipart form data.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | Yes | The file to upload |
| `messageId` | string | No | Link attachment to a message |
| `kind` | `file` / `image` / `voice` / `avatar` | No | Use `avatar` for avatar uploads and `voice` for voice messages |
| `durationMs` | number | For voice | Voice duration, 1-60 seconds |
| `waveformPeaks` | JSON number array | No | 32-96 waveform peak values, `0..100` |
| `transcriptText` | string | No | Optional visible voice transcript |

**Response:**

```json
{
  "id": "attachment-uuid",
  "url": "https://cdn.shadow.app/...",
  "filename": "photo.png",
  "contentType": "image/png",
  "size": 102400
}
```

Voice uploads are stored as private `/shadow/voice/...` content references and are still delivered
through signed media URLs.

Avatars are not signed media. User avatars, server icons, Buddy avatars, and other identity images
are returned by APIs as stable public URLs such as `/api/media/avatar/...` or as their original
HTTPS image URL. Server Apps and integrations should render that URL directly in `<img src>` and
should not request attachment media URLs or persist short-lived media URLs for avatars.

:::code-group

```ts [TypeScript]
const attachment = await client.uploadMedia(blob, 'photo.png', 'image/png', 'message-id')
```

```python [Python]
attachment = client.upload_media(
    file_bytes,
    "photo.png",
    "image/png",
    message_id="message-id",
)
```

:::

---

## Resolve attachment media URL

```
GET /api/attachments/:id/media-url?disposition=inline
```

Returns a short-lived browser-renderable URL after authenticating the caller and verifying access to
the parent channel. Store only the attachment `url` / content reference returned by upload;
do not persist this signed URL.

**Response:**

```json
{
  "url": "/api/media/signed/<token>",
  "expiresAt": "2026-05-07T10:00:00.000Z"
}
```

:::code-group

```ts [TypeScript]
const media = await client.resolveAttachmentMediaUrl(attachmentId, {
  disposition: 'inline',
})
```

```python [Python]
media = client.resolve_attachment_media_url(
    attachment_id,
    disposition="inline",
)
```

:::

## Deliver signed media

```
GET /api/media/signed/:token
```

Does not require a Bearer token. The token binds the bucket/key, content type, disposition, and
expiration. Active content such as HTML, SVG, JavaScript, and XML is always delivered as an
attachment even when `inline` was requested. Responses include `Cache-Control: private`,
`X-Content-Type-Options: nosniff`, and support `Range` requests.
