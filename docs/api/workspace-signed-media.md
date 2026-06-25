# Signed Media URLs

Workspace file and attachment media must be resolved through authorized endpoints. Raw `/shadow/uploads/...` paths remain blocked from direct browser access.

Identity images are not part of this flow. User avatars, server icons, Buddy avatars, and other avatar-like identity images are returned by APIs as stable public image URLs such as `/api/media/avatar/...` or as their original external HTTPS URL. Server Apps and integrations should render those URLs directly and should not refresh, proxy, or persist a short-lived media URL for avatars.

## Get A Signed Workspace Media URL

`GET /api/servers/:serverId/workspace/files/:fileId/media-url`

Query:

- `disposition`: `inline` or `attachment`, defaults to `inline`.
- `contentRef`: optional content reference for a stored version. If omitted, the file's current `contentRef` is used.

Authorization:

- The caller must be authenticated.
- The caller must be a member of the server.
- For private-channel attachment files, the caller must also have access to the source channel.

Response:

```json
{
  "url": "/api/media/signed/...",
  "expiresAt": "2026-05-13T04:00:00.000Z"
}
```

SDKs:

- TypeScript: `client.resolveWorkspaceMediaUrl(serverId, fileId, { disposition, contentRef })`
- Python: `client.resolve_workspace_media_url(server_id, file_id, disposition="inline", content_ref=None)`

## Get A Signed Attachment Media URL

`GET /api/attachments/:attachmentId/media-url`

Query:

- `disposition`: `inline` or `attachment`, defaults to `inline`.
- `variant`: optional image delivery variant. Supported values are `avatar`, `preview`, and `banner`.

Variant behavior:

- Variants are only applied to transformable image content requested with `disposition=inline`.
- `avatar` returns a small cropped WebP for compact attachment thumbnails. Identity avatars use the stable public avatar URL described above.
- `preview` returns a bounded WebP suitable for chat attachment previews.
- `banner` returns a wide bounded WebP suitable for server/banner surfaces.
- Variants are generated at upload time and stored as private MinIO objects. Legacy images without variants are backfilled into MinIO on first variant request; variants are not cached in application memory.
- Non-transformable or active content such as SVG is delivered as an attachment and ignores `variant`.

Authorization:

- The caller must be authenticated.
- The caller must have access to the message/channel that owns the attachment.

Response:

```json
{
  "url": "/api/media/signed/...",
  "expiresAt": "2026-05-13T04:00:00.000Z"
}
```

SDKs:

- TypeScript: `client.resolveAttachmentMediaUrl(attachmentId, { disposition, variant })`
- Python: `client.resolve_attachment_media_url(attachment_id, disposition="inline", variant="preview")`
