# Desktop Release Downloads

Desktop release download endpoints provide stable Shadow Desktop installer URLs without mixing SDK
package releases and desktop artifacts on a shared GitHub release page.

The server selects the latest non-draft, non-prerelease GitHub release whose tag starts with
`desktop-v`. Set `SHADOW_DESKTOP_RELEASE_REPO=owner/repo` to override the release repository. Release
metadata is cached for five minutes.

## Browser Downloads

`GET /desktop/releases/latest`

Redirects to the latest stable desktop GitHub release page.

`GET /desktop/download`

Redirects to a platform-specific download URL inferred from the user agent.

`GET /desktop/download/:platform`

Redirects to the latest stable installer asset for one of these platforms:

- `macos-arm64`
- `macos-x64`
- `windows-x64`
- `linux-x64`

Unsupported platforms return `404`.

## API Metadata

`GET /api/desktop/releases/latest`

Returns stable desktop release metadata for SDK and web clients.

Response:

```json
{
  "tagName": "desktop-v1.2.3",
  "htmlUrl": "https://github.com/buggyblues/shadow/releases/tag/desktop-v1.2.3",
  "downloads": [
    {
      "id": "macos-arm64",
      "label": "macOS Apple Silicon",
      "url": "/desktop/download/macos-arm64",
      "assetName": "Shadow-1.2.3-macos-arm64.dmg"
    }
  ]
}
```
