# Cloud Template Metadata Assets

Cloud template metadata assets should be declared as structured references and imported into Shadow-controlled media before they are stored on provisioned resources.

Planned asset reference shape:

```json
{
  "kind": "url",
  "url": "https://example.com/avatar.png"
}
```

Supported source kinds:

- `url`: HTTPS only. Fetch through SSRF/private-network checks and byte/MIME limits.
- `base64`: data URL or base64 payload plus MIME type. Enforce byte and MIME limits before upload.
- `github`: explicit GitHub `owner`, `repo`, `ref`, and `path`. Do not accept arbitrary git remotes for v1.
- `official`: ID from the maintained official Shadow avatar/sprite manifest.

Provisioning behavior:

- Import/cache accepted assets into Shadow media.
- Store resolved Shadow media references on server `iconUrl`/`bannerUrl`, channel `iconUrl`/`coverUrl`, and Buddy `avatarUrl`/`coverUrl` fields.
- Resolve identity images such as server icons and Buddy avatars to stable public avatar URLs at API response/render time. Signed media URLs are only for private attachments and workspace files.

Security requirements:

- Reject private/local IPs, localhost, credentials in URLs, oversize payloads, and unexpected MIME types.
- Do not persist raw external URLs for template-provisioned assets unless explicitly operating in a reviewed compatibility mode.
- Reprovisioning should be idempotent for identical asset references.
