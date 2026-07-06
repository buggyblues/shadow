# Cloud Computer API

Cloud Computer is the product-layer API over existing Cloud SaaS deployment infrastructure. The
underlying runtime is still a Cloud deployment; this API gives Web, Mobile, the community desktop, SDKs, and future
Cloud Computer apps one stable surface.

A Cloud Computer represents one deployed container environment. It is not a Buddy list item. Buddy
accounts are Shadow IM/bot accounts; when a Buddy is added to a Cloud Computer, the facade wires the
required internal runner runtime and connector binding for that container.

Cloud Computer is a facade over Cloud SaaS deployment infrastructure. Creating a Cloud Computer
creates an underlying deployment; existing deployments are projected back as Cloud Computers by
environment.

## Security Model

Every route requires Shadow authentication and resolves an explicit Actor through the standard auth
middleware.

| Route | Actor | Resource | Action | Scope/capability | Data class |
| --- | --- | --- | --- | --- | --- |
| `GET /api/cloud-computers` | user/pat/oauth | `cloud_computer:*` | `read` | cloud deployment owner access | server-private |
| `POST /api/cloud-computers` | user/pat/oauth | `cloud_computer:*` | `deploy` | `cloud:deploy` membership capability | cloud-secret |
| `GET /api/cloud-computers/:id` | user/pat/oauth | `cloud_computer:{id}` | `read` | cloud deployment owner access | server-private |
| `PATCH /api/cloud-computers/:id` | user/pat/oauth | `cloud_computer:{id}` | `manage` | cloud deployment owner access | server-private |
| `/api/cloud-computers/:id/files/*` | user/pat/oauth | `cloud_computer:{id}/files` | `read/write` | cloud deployment owner access + root path policy | secret |
| Socket.IO `cloud-computer:terminal:*` | user session | `cloud_computer:{id}/pod:{pod}` | `manage` | cloud deployment owner access | cloud-secret |
| `POST /api/cloud-computers/:id/browser/session` | user session | `cloud_computer:{id}/browser` | `manage` | cloud deployment owner access | cloud-secret |
| `POST /api/cloud-computers/:id/browser/repair` | user session | `cloud_computer:{id}/browser` | `manage` | cloud deployment owner access | cloud-secret |
| `POST /api/cloud-computers/:id/desktop/session` | user session | `cloud_computer:{id}/desktop` | `manage` | cloud deployment owner access | cloud-secret |
| `POST /api/cloud-computers/:id/desktop/repair` | user session | `cloud_computer:{id}/desktop` | `manage` | cloud deployment owner access | cloud-secret |
| WebSocket `/api/cloud-computers/:id/desktop/ws` | signed desktop session | `cloud_computer:{id}/desktop` | `manage` | short-lived session token | cloud-secret |
| `POST /api/cloud-computers/:id/workspace-mounts` | user session | `cloud_computer:{id}/workspace-mounts` | `manage` | cloud deployment owner access + server membership | cloud-secret |
| `GET /api/cloud-computers/:id/buddies` | user/pat/oauth | `cloud_computer:{id}/buddies` | `read` | cloud deployment owner access | server-private |
| `POST /api/cloud-computers/:id/buddies` | user/pat/oauth | `cloud_computer:{id}/buddies` | `deploy` | cloud deployment owner access + Cloud redeploy capability | cloud-secret |
| `POST /api/cloud-computers/:id/buddies/:buddyId/:action` | user/pat/oauth | `cloud_computer:{id}/buddies:{buddyId}` | `manage` | cloud deployment owner access + Buddy ownership + cloud binding | server-private |
| `GET /api/cloud-computers/:id/backups` | user/pat/oauth | `cloud_computer:{id}/backups` | `read` | cloud deployment owner access | cloud-secret |
| `POST /api/cloud-computers/:id/backups` | user/pat/oauth | `cloud_computer:{id}/backups` | `write` | cloud deployment owner access | cloud-secret |
| `POST /api/cloud-computers/:id/restore` | user/pat/oauth | `cloud_computer:{id}/restore` | `manage` | cloud deployment owner access + backup ownership | cloud-secret |

Cloud Computer file routes resolve the caller's deployment, pick a running pod in the deployment
namespace, and expose the container workspace through the same front-end file-manager contract used
by server workspaces. Raw file previews use short-lived signed URLs and do not expose Kubernetes,
VNC, CDP, MinIO, or user tokens to the browser.

## List Cloud Computers

```http
GET /api/cloud-computers?limit=100&offset=0
```

Query:

- `limit`: `1..100`, default handled by the Cloud SaaS use case.
- `offset`: non-negative integer.
- `includeHistory`: `1` or `true` to include destroyed/historical deployments.

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

## Create Cloud Computer

```http
POST /api/cloud-computers
Content-Type: application/json

{
  "name": "My Cloud Computer"
}
```

Input:

- `name`: optional display name. Defaults to `My Cloud Computer`.

The endpoint selects a deployable Cloud Computer template and delegates to the same validated Cloud
SaaS deployment pipeline used by developer options. The response is the resulting Cloud Computer
object. Template, namespace, and resource tier remain implementation details of the facade.

## Get Cloud Computer

```http
GET /api/cloud-computers/:id
```

Returns one Cloud Computer object. A missing or unauthorized deployment returns `404`.

## Update Cloud Computer

```http
PATCH /api/cloud-computers/:id
Content-Type: application/json

{
  "name": "Studio Computer"
}
```

Input:

- `name`: optional display name, `1..80` characters after trimming.

This is a facade update over the underlying Cloud deployment row. It does not create a separate
Cloud Computer record, and the response is the updated Cloud Computer object.

## Files

```http
GET /api/cloud-computers/:id/files
GET /api/cloud-computers/:id/files/tree
GET /api/cloud-computers/:id/files/stats
GET /api/cloud-computers/:id/files/files/search?searchText=app
POST /api/cloud-computers/:id/files/folders
PATCH /api/cloud-computers/:id/files/folders/:folderId
DELETE /api/cloud-computers/:id/files/folders/:folderId
POST /api/cloud-computers/:id/files/files
GET /api/cloud-computers/:id/files/files/:fileId
PATCH /api/cloud-computers/:id/files/files/:fileId
DELETE /api/cloud-computers/:id/files/files/:fileId
POST /api/cloud-computers/:id/files/files/:fileId/clone
POST /api/cloud-computers/:id/files/upload
POST /api/cloud-computers/:id/files/nodes/paste
```

Behavior:

- The root path is `CLOUD_COMPUTER_FILE_ROOT` when configured, otherwise the first existing path of
  `/workspace`, `/workspaces`, `/home/shadow`, `/state`, with `/workspace`/`/tmp` fallback.
- Node ids are opaque `cf_...` ids encoding container paths. Clients must not parse them.
- Paths are constrained to the resolved root. `..`, control characters, root deletion, and names
  containing `/` are rejected.
- Upload and text-save write file bytes into the running pod through Kubernetes exec. The default
  max file size is `CLOUD_COMPUTER_FILE_MAX_BYTES` (25 MiB).
- Tree traversal is bounded by `CLOUD_COMPUTER_FILE_MAX_NODES` and `CLOUD_COMPUTER_FILE_MAX_DEPTH`.
- ZIP download is not advertised until a stable container-side archive contract is available.

### File Media URL

```http
GET /api/cloud-computers/:id/files/files/:fileId/media-url?disposition=inline
```

Response:

```json
{
  "url": "/api/cloud-computers/cc_stable-environment-id/files/signed/<token>",
  "expiresAt": "2026-06-27T00:05:00.000Z"
}
```

The signed URL is self-authenticating and short-lived so browser previews can load media without
embedding a bearer token in image/video/audio elements.

## Terminal

Interactive terminals use the existing authenticated Socket.IO connection.

Events:

- `cloud-computer:terminal:start`: `{ computerId, pod?, agent?, container?, shell?, cols?, rows? }`
  with ack `{ ok, sessionId, namespace, pod, container? }`.
- `cloud-computer:terminal:input`: `{ sessionId, data }`.
- `cloud-computer:terminal:resize`: `{ sessionId, cols, rows }`.
- `cloud-computer:terminal:stop`: `{ sessionId }`.
- Server emits `cloud-computer:terminal:data` and `cloud-computer:terminal:exit`.

The server uses `node-pty` around `kubectl exec -it`, so TUI programs, resize, Ctrl+C/Ctrl+D, and
normal shell behavior work through `@xterm/xterm` in the web client. Agent tokens are not allowed to
open interactive terminals; this route requires a user session and owner access to the deployment.

## Runtime Repair

Files and terminals depend on the cloud computer's main runtime pod. When that runtime is missing,
failed, or otherwise unavailable, clients should call the runtime repair facade instead of calling
Cloud SaaS deployment routes directly.

```http
POST /api/cloud-computers/:id/runtime/repair
```

Behavior:

- Paused or resuming cloud computers delegate to the underlying resume operation.
- Other repairable states delegate to the underlying redeploy operation.
- The response always includes `cloudComputerId`, `component: "runtime"`, and `recoveryAction` so
  user-facing clients can show a cloud-computer-level recovery state.
- If the underlying deployment cannot be repaired because of status, locks, missing snapshots, or
  Kubernetes failures, the facade keeps the same status code and includes the lower-level error with
  the runtime component metadata.

Example response:

```json
{
  "cloudComputerId": "cc_stable-environment-id",
  "component": "runtime",
  "recoveryAction": "redeploy",
  "status": "pending"
}
```

## Browser

Browser sessions use a browser-native CDP surface. The user interacts with a real Chrome/Chromium
profile through screenshot, navigation, click, text, and key APIs while the cloud computer keeps the
browser profile/state in its namespace. This API does not automate CAPTCHA solving or bypass
third-party access controls.

```http
POST /api/cloud-computers/:id/browser/session
```

Response:

```json
{
  "ok": true,
  "surface": "cdp",
  "token": "short-lived-token",
  "expiresAt": "2026-06-27T00:05:00.000Z",
  "cloudComputerId": "cc_stable-environment-id",
  "page": null,
  "endpoints": {
    "screenshot": "/api/cloud-computers/cc_stable-environment-id/browser/screenshot",
    "navigate": "/api/cloud-computers/cc_stable-environment-id/browser/navigate",
    "click": "/api/cloud-computers/cc_stable-environment-id/browser/click",
    "type": "/api/cloud-computers/cc_stable-environment-id/browser/type",
    "key": "/api/cloud-computers/cc_stable-environment-id/browser/key"
  },
  "runtimeEnsured": true,
  "repairAvailable": true,
  "componentStatus": "ensured"
}
```

Browser operation endpoints require the user session, resolve the selected cloud computer, start a
short-lived server-side `kubectl port-forward` to the internal Chrome DevTools service, run the CDP
command, close the port-forward, and return the current browser screenshot and page metadata.

```http
POST /api/cloud-computers/:id/browser/screenshot
POST /api/cloud-computers/:id/browser/navigate
POST /api/cloud-computers/:id/browser/click
POST /api/cloud-computers/:id/browser/type
POST /api/cloud-computers/:id/browser/key
```

Examples:

```json
{ "url": "https://example.com" }
```

```json
{ "x": 420, "y": 180 }
```

```json
{ "text": "hello" }
```

Response:

```json
{
  "ok": true,
  "image": "data:image/png;base64,...",
  "page": {
    "title": "Example Domain",
    "url": "https://example.com/"
  }
}
```

Configuration:

- `CLOUD_COMPUTER_BROWSER_SERVICE`: Kubernetes Service name, default `cloud-computer-browser`.
- `CLOUD_COMPUTER_BROWSER_CDP_PORT`: Chrome DevTools target port, default `9222`.
- `CLOUD_COMPUTER_BROWSER_SESSION_TTL_SECONDS`: session token TTL, clamped to `30..900` seconds.
- `CLOUD_COMPUTER_BROWSER_IMAGE`: when set, the session API applies a browser Deployment, Service,
  `/dev/shm` memory volume, downloads volume, and profile PVC automatically.
  Local compose defaults to the official Playwright image
  `mcr.microsoft.com/playwright:v1.59.1-noble`; production deployments should override it with a
  tested, pinned Chrome/Chromium image that exposes CDP only on the internal ClusterIP Service.
- `CLOUD_COMPUTER_BROWSER_START_COMMAND`: optional container start command. The default starts
  Chrome/Chromium with remote debugging bound to the internal CDP port; set this to `0` when using an
  image that already starts a browser session itself.
- `CLOUD_COMPUTER_BROWSER_PROFILE_PVC`: set to `0` to use `emptyDir` instead of a PVC.
- `CLOUD_COMPUTER_BROWSER_PROFILE_STORAGE`: profile PVC request, default `5Gi`.
- `CLOUD_COMPUTER_BROWSER_PROFILE_STORAGE_CLASS`: optional storage class.
- `CLOUD_COMPUTER_BROWSER_PROFILE_MOUNT_PATH`: default `/root/.config/google-chrome`.
- `CLOUD_COMPUTER_BROWSER_DOWNLOADS_MOUNT_PATH`: default `/root/Downloads`.
- `CLOUD_COMPUTER_BROWSER_WIDTH` / `CLOUD_COMPUTER_BROWSER_HEIGHT`: default `1440x900`.

The recommended runtime image should be a maintained Chrome/Chromium image with DevTools listening
only on the internal Service and no public ingress.

### Browser Repair

```http
POST /api/cloud-computers/:id/browser/repair
```

When `CLOUD_COMPUTER_BROWSER_IMAGE` is configured, this endpoint applies the browser Deployment,
profile PVC when enabled, and ClusterIP Service into the cloud computer namespace. It returns the
same component status fields used by the session endpoint. When the image is not configured, the API
returns `422` with `code: cloud_computer_browser_repair_not_configured` so clients can show an
installation path instead of a generic retry.

## Desktop

Desktop sessions use noVNC on the web client and a raw WebSocket gateway on the server.

```http
POST /api/cloud-computers/:id/desktop/session
```

Response:

```json
{
  "ok": true,
  "token": "short-lived-token",
  "expiresAt": "2026-06-27T00:05:00.000Z",
  "websocketUrl": "wss://shadow.example/api/cloud-computers/cc_stable-environment-id/desktop/ws?token=...",
  "runtimeEnsured": false,
  "repairAvailable": false,
  "componentStatus": "not-configured"
}
```

The raw WebSocket endpoint verifies the signed session, re-checks deployment ownership for the token
user, starts a local `kubectl port-forward` to the configured desktop VNC service, and bridges RFB
bytes between noVNC and the VNC server.

Configuration:

- `CLOUD_COMPUTER_DESKTOP_SERVICE`: Kubernetes Service name in each cloud computer namespace,
  default `cloud-computer-desktop`.
- `CLOUD_COMPUTER_DESKTOP_VNC_PORT`: VNC target port, default `5900`.
- `CLOUD_COMPUTER_DESKTOP_SESSION_TTL_SECONDS`: session token TTL, clamped to `30..900` seconds.
- `CLOUD_COMPUTER_DESKTOP_IMAGE`: when set, the session API applies a desktop Deployment and
  ClusterIP Service automatically. Local `docker-compose.yml` defaults this to
  `dorowu/ubuntu-desktop-lxde-vnc:latest`; production deployments should override it with a tested,
  pinned KasmVNC/TigerVNC desktop image. When omitted, the API assumes an existing internal service.
- `CLOUD_COMPUTER_DESKTOP_WIDTH` / `CLOUD_COMPUTER_DESKTOP_HEIGHT`: default `1440x900`.

The VNC service must stay ClusterIP/internal-only. Browser clients never receive Kubernetes
credentials or a direct VNC address.

### Desktop Repair

```http
POST /api/cloud-computers/:id/desktop/repair
```

When `CLOUD_COMPUTER_DESKTOP_IMAGE` is configured, this endpoint applies the VNC desktop Deployment
and ClusterIP Service into the cloud computer namespace. When omitted, the API returns `422` with
`code: cloud_computer_desktop_repair_not_configured`.

## Workspace Mounts

Cloud Computer can attach a Shadow server workspace to a cloud computer namespace through the
`shadowob workspace webdav` runtime. This keeps authorization behind Shadow workspace APIs and avoids
direct object-storage mounts.

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

Response:

```json
{
  "ok": true,
  "serverId": "server-id",
  "serviceName": "workspace-mount-4bdf4b4f2f12",
  "mountPath": "/workspace/server-workspaces/server-id",
  "webdavUrl": "http://workspace-mount-4bdf4b4f2f12.namespace.svc.cluster.local:8765/",
  "mode": "webdav",
  "runtimeEnsured": true,
  "repairAvailable": true,
  "componentStatus": "ensured"
}
```

Rules and configuration:

- Requires a user session, owner access to the cloud deployment, and membership in the target server.
- `CLOUD_COMPUTER_WORKSPACE_MOUNT_IMAGE`: image containing `shadowob` CLI. When omitted, or when
  the configured token Secret is missing, the API returns the deterministic service/mount descriptor
  with `componentStatus: "not-configured"` but does not apply a runtime. Local `docker-compose.yml`
  defaults this to
  `shadow/workspace-mount:dev`, built from `apps/cloud/images/workspace-mount/Dockerfile`.
  Production deployments should override it with a tested, pinned image tag.
- `CLOUD_COMPUTER_WORKSPACE_MOUNT_SERVER_URL` or `SHADOWOB_AGENT_SERVER_URL`/`SHADOWOB_SERVER_URL`:
  Shadow API base URL reachable from the mount pod.
- `CLOUD_COMPUTER_WORKSPACE_MOUNT_TOKEN_SECRET_NAME`: Kubernetes Secret name, default
  `shadowob-workspace-mount`.
- `CLOUD_COMPUTER_WORKSPACE_MOUNT_TOKEN_SECRET_KEY`: Secret key containing the scoped workspace
  token, default `SHADOWOB_TOKEN`.
- `CLOUD_COMPUTER_WORKSPACE_MOUNT_ROOT`: allowed mount-path root, default
  `/workspace/server-workspaces`.

The mount runtime receives only the Secret reference, not a user token value in the API response or
manifest source. Future scoped mount tokens can be issued into the same Secret contract without
changing clients.

## Buddies

Cloud Computer Buddy APIs are scoped to the selected cloud computer. They do not return every Buddy
account owned by the user. A listed Buddy is connected to the selected cloud computer through
internal connector metadata managed by the facade.

```http
GET /api/cloud-computers/:id/buddies
```

Response:

```json
{
  "ok": true,
  "cloudComputerId": "cc_stable-environment-id",
  "buddies": [
    {
      "id": "buddy-agent-id",
      "name": "Studio Buddy",
      "status": "running",
      "kernelType": "openclaw"
    }
  ]
}
```

```http
POST /api/cloud-computers/:id/buddies
Content-Type: application/json

{
  "name": "Writing Buddy"
}
```

Input:

- `name`: required Buddy display name, `1..80` characters.
- `description`: optional description, up to 500 characters.
- `runtimeId`: optional advanced override. Defaults to `openclaw`.

The endpoint is a facade over the current cloud computer deployment. It appends a Buddy, the required
internal runner runtime, and the connector binding to the deployment config snapshot, then calls the
validated Cloud SaaS redeploy pipeline for the same namespace. It does not create a second Cloud
Computer.

Response:

```json
{
  "ok": true,
  "cloudComputerId": "cc_stable-environment-id",
  "buddy": {
    "id": "writing-buddy",
    "name": "Writing Buddy",
    "status": "pending",
    "kernelType": "openclaw"
  },
  "redeploy": {
    "id": "next-deployment-id",
    "status": "pending"
  }
}
```

```http
POST /api/cloud-computers/:id/buddies/:buddyId/start
POST /api/cloud-computers/:id/buddies/:buddyId/stop
```

The action endpoints require Buddy ownership and the same cloud-computer binding. They are intended
for the community desktop so users can manage Cloud Buddies without leaving the cloud computer experience.

## Backups And Recovery

Backups and restores are facade routes over the underlying Cloud SaaS deployment backup pipeline.
Clients should use these routes in user-facing Cloud Computer UI and reserve
`/api/cloud-saas/deployments/*` for developer options.

```http
GET /api/cloud-computers/:id/backups?agentId=agent-1
```

Response:

```json
{
  "cloudComputerId": "cc_stable-environment-id",
  "backups": []
}
```

```http
POST /api/cloud-computers/:id/backups
Content-Type: application/json

{
  "agentId": "agent-1",
  "driver": "restic",
  "retentionDays": 7
}
```

If the cloud computer is not in `deployed` or `paused`, the facade returns a recoverable response
instead of exposing the lower-level Cloud SaaS error directly:

```json
{
  "ok": false,
  "code": "cloud_computer_backup_unavailable",
  "error": "Cannot back up cloud computer in status \"failed\"",
  "cloudComputerId": "cc_stable-environment-id",
  "status": "failed",
  "recoverable": true,
  "recoveryActions": ["restore-backup"],
  "restoreEndpoint": "/api/cloud-computers/cc_stable-environment-id/restore"
}
```

```http
POST /api/cloud-computers/:id/restore
Content-Type: application/json

{
  "backupId": "backup-id",
  "agentId": "agent-1"
}
```

Restore delegates to the same Cloud runtime recovery path and is allowed for `deployed`, `paused`,
and `failed` cloud computers when the selected backup is restorable. This is the primary API-level
recovery path for failed cloud computers.
