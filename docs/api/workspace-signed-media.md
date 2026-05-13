# Workspace Signed Media URLs

Workspace file media must be resolved through an authorized endpoint. Raw `/shadow/uploads/...` paths remain blocked from direct browser access.

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
