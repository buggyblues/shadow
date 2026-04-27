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
| `dmMessageId` | string | No | Link attachment to a DM message |

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

:::code-group

```ts [TypeScript]
const attachment = await client.uploadMedia(blob, 'photo.png', 'image/png', {
  dmMessageId: 'dm-message-id',
})
```

```python [Python]
attachment = client.upload_media(
    file_bytes,
    "photo.png",
    "image/png",
    dm_message_id="dm-message-id",
)
```

:::

---

## Get file

```
GET /api/media/:id
```

Redirects to a presigned download URL for the file.

:::code-group

```ts [TypeScript]
const url = `${client.baseUrl}/api/media/${attachmentId}`
// Redirect — use in <img> or <a> tags directly
```

```python [Python]
url = f"{client.base_url}/api/media/{attachment_id}"
# Redirect — follow to download
```

:::
