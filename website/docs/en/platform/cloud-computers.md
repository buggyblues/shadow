---
title: Cloud Computer API
description: AI API for managing Buddy cloud runtime environments through cloud computer objects.
---

# Cloud Computer API

Cloud Computer API belongs under AI, not the low-level Cloud deployment API. Web, Mobile, the community desktop, and SDKs use cloud computer objects to access files, terminal, browser, desktop, Buddies, workspace mounts, and backups.

A cloud computer may reuse Cloud deployments, namespaces, PVCs, exposures, backups, and cloud workers behind the scenes. Clients should not handle those infrastructure objects directly; Pod details, logs, pause/resume operations, and deployment internals stay in Cloud developer options.

A cloud computer represents one deployed cloud runtime environment. It is not a Buddy list item. A Buddy is the Shadow AI identity; when a Buddy is added to a cloud computer, the platform wires the internal runner runtime, connector binding, and Buddy identity into the same environment.

## Product Model

```text
Cloud Computer
  -> files
  -> terminal
  -> browser
  -> desktop
  -> workspace mounts
  -> buddies[]
  -> backups[]
  -> developer deployment details
```

Clients should treat cloud computers as community objects, not raw deployments. Developer options can drill into deployments, Pods, logs, template snapshots, and costs.

## Developer Quick Start

Use this page when you are integrating cloud computers in a community surface. If you only need lower-level deployment primitives, use [Cloud SaaS Runtime](./cloud-saas) instead.

For local development:

```bash
pnpm dev
```

Then open:

- Web: `/app/cloud-computers`
- Community desktop: `/app/space`, then open the built-in Cloud Computers app
- Mobile: `/(main)/cloud-computers`
- API: `GET /api/cloud-computers?limit=100&offset=0`

Cloud computer development needs the normal Shadow Space plus the Cloud worker/Kubernetes capability configured for your environment. In a lightweight dev environment without a working cluster, the UI should still render list, empty, loading, error, and repair states; runtime actions such as terminal, desktop, browser, backups, and workspace mounts will return configuration or pod errors until Cloud is available.

Common development environment knobs:

| Variable | Purpose |
| --- | --- |
| `CLOUD_COMPUTER_FILE_ROOT` | Preferred root path for file APIs inside the runtime container. |
| `CLOUD_COMPUTER_FILE_MAX_BYTES` | Max text/file preview size for file reads. |
| `CLOUD_COMPUTER_FILE_MAX_NODES` | Max nodes returned by tree traversal. |
| `CLOUD_COMPUTER_FILE_MAX_DEPTH` | Max folder depth traversed by the tree API. |
| `CLOUD_COMPUTER_DESKTOP_IMAGE` | Image used when repairing or attaching desktop/VNC support. |
| `CLOUD_COMPUTER_BROWSER_IMAGE` | Image used when repairing or attaching browser/CDP support. |
| `CLOUD_COMPUTER_DESKTOP_WIDTH` / `CLOUD_COMPUTER_DESKTOP_HEIGHT` | Default desktop session resolution. |

## SDK Shape

The TypeScript SDK exposes the AI cloud computer routes directly:

```ts
const computers = await client.listCloudComputers({ limit: 100 })
const computer = await client.createCloudComputer({ name: 'Studio Computer' })
await client.updateCloudComputer(computer.id, { name: 'Research Runtime', shellColor: 'grape' })
await client.pauseCloudComputer(computer.id)
await client.resumeCloudComputer(computer.id)
await client.createCloudComputerBackup(computer.id, { label: 'Before browser login' })
```

Browser, desktop, workspace mount, backup, and Cloud Buddy helpers are also available through `client.*CloudComputer*` methods. Prefer these methods in clients instead of calling `/api/cloud-saas/deployments/*` directly.

## Lifecycle And Status

Cloud computer cards should be written defensively because a single card summarizes several underlying resources: deployment row, Kubernetes namespace, pod, PVC, optional browser, optional desktop, optional Cloud Buddy runner, and backups.

| Status | Product meaning | Client behavior |
| --- | --- | --- |
| `pending` / `deploying` | Deployment exists but the runtime is not ready. | Show progress and disable terminal/browser/desktop actions. |
| `deployed` / `running` | Runtime is available. | Enable files, terminal, browser, desktop, Buddies, backups, and workspace mounts based on capabilities. |
| `paused` / `stopped` | Runtime state is retained but compute is not active. | Show resume/repair actions and keep backups visible. |
| `failed` | Deployment or runtime repair failed. | Show the latest error and a repair action. |
| `destroyed` | Historical record only. | Hide by default unless `includeHistory=1` is requested. |

Do not infer capabilities from status alone. Always read the `capabilities` object in the list/detail response.

## Authorization Model

Every route requires Shadow authentication and resolves an explicit Actor through the standard auth middleware.

| Route | Actor | Resource | Action | Data class |
| --- | --- | --- | --- | --- |
| `GET /api/cloud-computers` | user/pat/oauth | `cloud_computer:*` | `read` | `server-private` |
| `POST /api/cloud-computers` | user/pat/oauth | `cloud_computer:*` | `deploy` | `cloud-secret` |
| `GET /api/cloud-computers/:id` | user/pat/oauth | `cloud_computer:{id}` | `read` | `server-private` |
| `PATCH /api/cloud-computers/:id` | user/pat/oauth | `cloud_computer:{id}` | `manage` | `server-private` |
| `POST /api/cloud-computers/:id/pause` | user/pat/oauth | `cloud_computer:{id}` | `manage` | `server-private` |
| `POST /api/cloud-computers/:id/resume` | user/pat/oauth | `cloud_computer:{id}` | `manage` | `server-private` |
| `POST /api/cloud-computers/:id/cancel` | user/pat/oauth | `cloud_computer:{id}` | `manage` | `server-private` |
| `DELETE /api/cloud-computers/:id` | user/pat/oauth | `cloud_computer:{id}` | `manage` | `cloud-secret` |
| `/api/cloud-computers/:id/files/*` | user/pat/oauth | `cloud_computer:{id}/files` | `read/write` | `secret` |
| Socket.IO `cloud-computer:terminal:*` | user session | `cloud_computer:{id}/pod:{pod}` | `manage` | `cloud-secret` |
| `POST /api/cloud-computers/:id/browser/session` | user session | `cloud_computer:{id}/browser` | `manage` | `cloud-secret` |
| `GET /api/cloud-computers/:id/browser/ws` | signed browser session | `cloud_computer:{id}/browser` | `manage` | `cloud-secret` |
| `POST /api/cloud-computers/:id/desktop/session` | user session | `cloud_computer:{id}/desktop` | `manage` | `cloud-secret` |
| `POST /api/cloud-computers/:id/workspace-mounts` | user session | `cloud_computer:{id}/workspace-mounts` | `manage` | `cloud-secret` |
| `GET/POST /api/cloud-computers/:id/buddies` | user/pat/oauth | `cloud_computer:{id}/buddies` | `read/deploy` | `server-private` |
| `GET/POST /api/cloud-computers/:id/backups` | user/pat/oauth | `cloud_computer:{id}/backups` | `read/write` | `cloud-secret` |
| `POST /api/cloud-computers/:id/restore` | user/pat/oauth | `cloud_computer:{id}/restore` | `manage` | `cloud-secret` |

OAuth/PAT scope is not sufficient on its own. The service also checks deployment owner access, Space membership, Buddy ownership, workspace mount policy, backup ownership, and root path policy.

## List Cloud Computers

```http
GET /api/cloud-computers?limit=100&offset=0
```

Response:

```json
[
  {
    "id": "cc_stable-environment-id",
    "name": "Team Runtime",
    "status": "deployed",
    "agentCount": 2,
    "createdAt": "2026-06-27T00:00:00.000Z",
    "updatedAt": "2026-06-27T00:00:00.000Z",
    "lastActiveAt": "2026-06-27T00:00:00.000Z",
    "capabilities": {
      "files": true,
      "terminal": true,
      "browser": true,
      "desktop": true,
      "buddies": true,
      "backups": true
    }
  }
]
```

Use `includeHistory=1` to include destroyed or historical deployments.

## Create And Update

```http
POST /api/cloud-computers
Content-Type: application/json

{
  "name": "My Cloud Computer"
}
```

Create selects a deployable cloud computer template and runs the same validated Cloud SaaS deployment pipeline. Template, namespace, and resource tier are internal details.

Cloud computers use the hourly price returned in `cost.hourlyCredits`. If the balance becomes
insufficient, compute is paused and a renewal notification is sent. The Cloud Computer entry,
namespace, persistent volumes, workspace, connectors, and configuration remain in place. After
adding funds, resume the same Cloud Computer; paused time is not billed. Billing must never remove a
Cloud Computer or destroy its persistent resources.

When a cloud computer is not ready, clients show the reason and only the first supported
`nextActions` item. Do not render repair, restore, and recreation as competing buttons. Internal
actions such as `rebuild-runtime` are labeled “Set up again” in product UI, and tool shortcuts stay
hidden until the cloud computer is ready.

```http
PATCH /api/cloud-computers/:id
Content-Type: application/json

{
  "name": "Studio Computer",
  "shellColor": "grape"
}
```

### Lifecycle

```text
POST   /api/cloud-computers/:id/pause
POST   /api/cloud-computers/:id/resume
POST   /api/cloud-computers/:id/cancel
DELETE /api/cloud-computers/:id
```

Pause and resume apply to every runtime agent in the cloud computer when no agent is specified. Cancel targets an in-progress deploy or destroy operation. Delete queues destruction and returns `status: "destroying"`; clients should keep polling the list until the object disappears instead of removing it optimistically.

Update changes the display name and the translucent CRT shell color. Supported colors are `aqua`,
`grape`, `tangerine`, `lime`, `strawberry`, `blueberry`, and `graphite`. The color is returned as
`appearance.shellColor`, persists in the deployment configuration snapshot, and survives runtime
repair or redeploy. The update does not create a separate Cloud Computer record.

## Files

```http
GET    /api/cloud-computers/:id/files/tree
GET    /api/cloud-computers/:id/files/stats
GET    /api/cloud-computers/:id/files/files/search?searchText=app
POST   /api/cloud-computers/:id/files/folders
PATCH  /api/cloud-computers/:id/files/folders/:folderId
DELETE /api/cloud-computers/:id/files/folders/:folderId
POST   /api/cloud-computers/:id/files/files
GET    /api/cloud-computers/:id/files/files/:fileId
PATCH  /api/cloud-computers/:id/files/files/:fileId
DELETE /api/cloud-computers/:id/files/files/:fileId
POST   /api/cloud-computers/:id/files/files/:fileId/clone
POST   /api/cloud-computers/:id/files/upload
POST   /api/cloud-computers/:id/files/nodes/paste
```

Rules:

- Root uses `CLOUD_COMPUTER_FILE_ROOT` when configured, otherwise the first available path from `/workspace`, `/workspaces`, `/home/shadow`, `/state`, and `/tmp`.
- Node ids are opaque `cf_...` values; clients must not parse them.
- Paths stay under the resolved root. `..`, control characters, root deletion, and names containing `/` are rejected.
- Upload and text save write to the running pod through Kubernetes exec.
- Tree traversal has node, depth, and file-size limits.
- Preview uses short-lived signed URLs so browsers do not receive Kubernetes, VNC, CDP, MinIO, or user tokens.

```http
GET /api/cloud-computers/:id/files/files/:fileId/media-url?disposition=inline
```

## Terminal

Terminal uses the authenticated Socket.IO connection:

- `cloud-computer:terminal:start`
- `cloud-computer:terminal:input`
- `cloud-computer:terminal:resize`
- `cloud-computer:terminal:stop`
- Space events: `cloud-computer:terminal:data`, `cloud-computer:terminal:exit`

The backend wraps `kubectl exec -it` with `node-pty`, so TUI programs, resize, Ctrl+C/Ctrl+D, and normal shell behavior work. If a host cannot start the native PTY helper, Shadow falls back to a line-edited `kubectl exec -i` session so commands remain usable. Interactive terminal access requires a user session; agent tokens cannot open a shell as the user.

## Browser

```http
POST /api/cloud-computers/:id/browser/session
POST /api/cloud-computers/:id/browser/screenshot
POST /api/cloud-computers/:id/browser/navigate
POST /api/cloud-computers/:id/browser/click
POST /api/cloud-computers/:id/browser/type
POST /api/cloud-computers/:id/browser/key
POST /api/cloud-computers/:id/browser/repair
GET  /api/cloud-computers/:id/browser/ws?token=...
```

The browser is a browser-native CDP surface. `browser/session` returns a short-lived signed `websocketUrl`; the Web and mobile clients use it for CDP screencast frames plus real-time mouse, touch, scroll, and keyboard input. The screenshot and discrete action endpoints remain available as compatibility fallbacks. It is for manual login, MFA, and human verification, not CAPTCHA solving or bypassing third-party controls.

## Desktop

```http
POST /api/cloud-computers/:id/desktop/session
POST /api/cloud-computers/:id/desktop/repair
GET  /api/cloud-computers/:id/desktop/ws?token=...
```

The web client uses noVNC. The service verifies the short-lived session token and bridges to the namespace-local VNC service through `kubectl port-forward`. The VNC service must stay ClusterIP/internal-only.

## Workspace Mounts

```http
POST /api/cloud-computers/:id/workspace-mounts
Content-Type: application/json

{
  "serverId": "server-id-or-slug",
  "rootId": "optional-workspace-folder-node-id",
  "mountPath": "/workspace/server-workspaces/server-id",
  "readOnly": true
}
```

Mounts use the `shadowob workspace webdav` runtime, keeping authorization behind Shadow workspace APIs and avoiding direct object-storage mounts. Responses never return a full user token; the runtime receives only a Kubernetes Secret reference.

## Buddies

```http
GET  /api/cloud-computers/:id/buddies
POST /api/cloud-computers/:id/buddies
POST /api/cloud-computers/:id/buddies/:buddyId/start
POST /api/cloud-computers/:id/buddies/:buddyId/stop
```

These routes manage only Cloud Buddies in the selected cloud computer. Creating a Buddy appends the Buddy identity, internal runner runtime, and connector binding to the underlying deployment config, then runs Cloud SaaS redeploy. It does not create a second cloud computer.

## Backups And Recovery

```http
GET  /api/cloud-computers/:id/backups
POST /api/cloud-computers/:id/backups
POST /api/cloud-computers/:id/restore
POST /api/cloud-computers/:id/runtime/repair
```

Cloud computer UI should use these routes. `/api/cloud-saas/deployments/*` remains for Cloud developer options. Backups may use CSI VolumeSnapshot or object archive fallback depending on cluster capability and configuration.

## Frontend Integration Checklist

- Treat cloud computers as community objects, not raw deployment records.
- Route from the community desktop and the standalone page to the same Cloud Computers UI.
- Use short-lived session URLs for desktop and browser surfaces; never store VNC, CDP, Kubernetes, MinIO, or user tokens in client state.
- Keep files, terminal, browser, desktop, Buddies, backups, and workspace mounts independently recoverable. One failed component should not blank the whole page.
- Mobile can expose list, create, repair, Buddies, backups, workspace mounts, files, browser actions, and desktop session entry, but should keep terminal and desktop controls compact.

## Seeded Docs Screenshots

Product documentation screenshots should be generated from a stable, business-realistic seed instead of hand-maintained throwaway data.

```bash
DOCS_SCREENSHOT_SEED=shadow-docs-v1 pnpm e2e:docs-screenshots:local
```

The seed flow creates independent community scenarios with stable members, avatars, Space branding, wallpapers, channels, workspace files, Buddies, Buddy Inbox, community apps, cloud computers, and desktop layouts. Playwright refreshes the Retina documentation screenshots and automatically publishes the three homepage WebP assets:

- `docs-desktop-travel-home.png` / `travel-home.webp`
- `docs-desktop-gaming-channel.png` / `gaming-channel.webp`
- `docs-desktop-family-file.png`
- `docs-desktop-art-cloud-computer.png`
- `docs-desktop-music-buddy-inbox.png` / `music-buddy-inbox.webp`

When cloud computer UI changes, update the faker scenario in `scripts/e2e/docs-screenshot-faker.mjs` and regenerate the screenshots instead of editing the PNGs manually.

---

- [Spaces](./spaces)
- [Workspace](./workspace)
- [Cloud](./cloud)
- [Space Apps](./space-apps)
