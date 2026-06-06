# Server App Metadata i18n

Server App `appKey` values, command names, permission names, and event names are machine
protocol identifiers. They are not localized. User-facing app metadata comes from the
manifest `name`, `description`, `marketplace`, and `i18n` fields; the server must not infer
display names from a first-party allowlist.

## Manifest Shape

```json
{
  "schemaVersion": "shadow.app/1",
  "appKey": "skills",
  "name": "Skills",
  "description": "A server-owned skill library...",
  "marketplace": {
    "tagline": "A server-owned library for reusable working skills.",
    "summary": "Skills lets a server publish...",
    "categories": ["Developer Tools", "Productivity"]
  },
  "i18n": {
    "zh-CN": {
      "name": "Skills Library",
      "description": "A server-owned skill library...",
      "marketplace": {
        "tagline": "A reusable working-skill library inside a server.",
        "summary": "The Skills Library lets a server...",
        "categories": ["Developer Tools", "Productivity", "Knowledge"],
        "gallery": [{ "alt": "Skills Library cover" }],
        "links": [{ "label": "Home" }],
        "publisher": { "name": "Shadow" }
      }
    }
  }
}
```

`i18n.<locale>.marketplace` only overrides translatable fields. Image URLs, link URLs,
`appKey`, command names, permissions, and other stable identifiers continue to use the default
manifest values.

## Resolution Rules

1. APIs accept `?locale=...`; without a query parameter they read the first locale from
   `Accept-Language`.
2. Locale lookup order is: exact locale, normalized locale, lower-case locale, language subtag,
   then `en`.
3. Missing translations fall back to the default manifest fields.
4. Display names come directly from the manifest. If an app should not show a `shadow-` or
   `Shadow` prefix, the app manifest should be corrected.
5. First-party integrations should not use a `shadow-` prefix in `appKey`; third-party apps use
   the same manifest metadata and i18n mechanism.

## API Coverage

These endpoints return localized display metadata:

- `GET /api/discover/server-apps?locale=...`
- `GET /api/discover/server-apps/:appKey?locale=...`
- `GET /api/admin/server-app-catalog?locale=...`
- `GET /api/servers/:serverId/apps?locale=...`
- `GET /api/servers/:serverId/apps?summary=1&locale=...`
- `GET /api/servers/:serverId/apps/catalog?locale=...`
- `GET /api/servers/:serverId/apps/:appKey?locale=...`
