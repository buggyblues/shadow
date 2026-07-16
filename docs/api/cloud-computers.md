# Cloud Computer API

Cloud Computer is the product-layer API over existing Cloud SaaS deployment infrastructure. The
underlying runtime is still a Cloud deployment; this API gives Web, Mobile, the community desktop, SDKs, and future
Cloud Computer apps one stable surface.

A Cloud Computer represents one deployed container environment. It is not a Buddy list item. Buddy
accounts are Shadow IM/bot accounts; when a Buddy is added to a Cloud Computer, the facade wires the
required internal runner runtime and connector binding for that container.

Cloud Computer and Buddy names are display metadata, never identifiers. Each newly created Cloud
Computer receives an opaque persisted instance identity, and each Buddy declaration receives its
own opaque identity. Reusing a display name must not merge instances, workspaces, lifecycle state,
or Buddy accounts. Clients must retain the returned `id` and must not derive identity from a name or
runtime namespace.

Cloud Computer is a facade over Cloud SaaS deployment infrastructure. Creating a Cloud Computer
creates an underlying deployment; existing deployments are projected back as Cloud Computers by
their persisted instance identity. Legacy deployments without that field retain their historical
environment-derived identity for compatibility.

## Security Model

Every route requires Shadow authentication and resolves an explicit Actor through the standard auth
middleware.

| Route | Actor | Resource | Action | Scope/capability | Data class |
| --- | --- | --- | --- | --- | --- |
| `GET /api/cloud-computers` | user/pat/oauth | `cloud_computer:*` | `read` | cloud deployment owner access | server-private |
| `POST /api/cloud-computers` | user/pat/oauth | `cloud_computer:*` | `deploy` | `cloud:deploy` membership capability | cloud-secret |
| `GET /api/cloud-computers/:id` | user/pat/oauth | `cloud_computer:{id}` | `read` | cloud deployment owner access | server-private |
| `GET /api/cloud-computers/runtimes` | user/pat/oauth | `cloud_computer:runtimes` | `read` | authenticated user | public |
| `GET /api/cloud-computers/:id/runtimes` | user/pat/oauth | `cloud_computer:{id}/runtimes` | `read` | cloud deployment owner access | server-private |
| `POST /api/cloud-computers/:id/runtimes/:runtimeId/install` | user/pat/oauth | `cloud_computer:{id}/runtimes` | `manage` | cloud deployment owner access + redeploy capability | cloud-secret |
| `GET /api/cloud-computers/resource-profiles` | user/pat/oauth | `cloud_computer:pricing` | `read` | authenticated user | public |
| `POST /api/cloud-computers/:id/configuration/quote` | user/pat/oauth | `cloud_computer:{id}/configuration` | `read` | cloud deployment owner access | server-private |
| `PATCH /api/cloud-computers/:id/configuration` | user/pat/oauth | `cloud_computer:{id}/configuration` | `manage` | cloud deployment owner access + valid quote | cloud-secret |
| `GET /api/cloud-computers/:id/apps` | user/pat/oauth | `cloud_computer:{id}/apps` | `read` | cloud deployment owner access + app instance ownership | server-private |
| `PATCH /api/cloud-computers/:id` | user/pat/oauth | `cloud_computer:{id}` | `manage` | cloud deployment owner access | server-private |
| `/api/cloud-computers/:id/files/*` | user/pat/oauth | `cloud_computer:{id}/files` | `read/write` | cloud deployment owner access + root path policy | secret |
| Socket.IO `cloud-computer:terminal:*` | user session | `cloud_computer:{id}/pod:{pod}` | `manage` | cloud deployment owner access | cloud-secret |
| `POST /api/cloud-computers/:id/browser/session` | user session | `cloud_computer:{id}/browser` | `manage` | cloud deployment owner access | cloud-secret |
| `POST /api/cloud-computers/:id/browser/repair` | user session | `cloud_computer:{id}/browser` | `manage` | cloud deployment owner access | cloud-secret |
| `POST /api/cloud-computers/:id/runtime/rebuild` | user session | `cloud_computer:{id}/runtime` | `manage` | cloud deployment owner access | cloud-secret |
| `POST /api/cloud-computers/:id/desktop/session` | user session | `cloud_computer:{id}/desktop` | `manage` | cloud deployment owner access | cloud-secret |
| `POST /api/cloud-computers/:id/desktop/repair` | user session | `cloud_computer:{id}/desktop` | `manage` | cloud deployment owner access | cloud-secret |
| WebSocket `/api/cloud-computers/:id/desktop/ws` | signed desktop session | `cloud_computer:{id}/desktop` | `manage` | short-lived session token | cloud-secret |
| `POST /api/cloud-computers/:id/workspace-mounts` | user session | `cloud_computer:{id}/workspace-mounts` | `manage` | cloud deployment owner access + server membership | cloud-secret |
| `GET /api/cloud-computers/:id/buddies` | user/pat/oauth | `cloud_computer:{id}/buddies` | `read` | cloud deployment owner access | server-private |
| `POST /api/cloud-computers/:id/buddies` | user/pat/oauth | `cloud_computer:{id}/buddies` | `deploy` | cloud deployment owner access + Cloud redeploy capability | cloud-secret |
| `DELETE /api/cloud-computers/:id/buddies/:buddyId` | user/pat/oauth | `cloud_computer:{id}/buddies:{buddyId}` | `deploy` | cloud deployment owner access + Buddy ownership + Cloud redeploy capability | cloud-secret |
| `POST /api/cloud-computers/:id/buddies/:buddyId/:action` | user/pat/oauth | `cloud_computer:{id}/buddies:{buddyId}` | `manage` | cloud deployment owner access + Buddy ownership + cloud binding | server-private |
| `GET /api/cloud-computers/:id/connectors` | user/pat/oauth | `cloud_computer:{id}/connectors` | `read` | cloud deployment owner access | server-private |
| `POST /api/cloud-computers/:id/connectors/:pluginId/oauth/start` | user/pat/oauth | `cloud_computer:{id}/connectors:{pluginId}` | `manage` | cloud deployment owner access + interactive user | server-private |
| `GET /api/cloud-computers/oauth/flows/:flowId` | user/pat/oauth | `cloud_connector_oauth:{flowId}` | `read` | OAuth flow owner | server-private |
| `GET /api/cloud-computers/oauth/callback` | public OAuth callback | `cloud_connector_oauth:{state}` | `complete` | one-time hashed state + expiry | server-private |
| `PUT /api/cloud-computers/:id/connectors/:pluginId` | user/pat/oauth | `cloud_computer:{id}/connectors:{pluginId}` | `manage` | cloud deployment owner access + Cloud redeploy capability | cloud-secret |
| `POST /api/cloud-computers/:id/connectors/:pluginId/verify` | user/pat/oauth | `cloud_computer:{id}/connectors:{pluginId}` | `manage` | cloud deployment owner access + account ownership | cloud-secret |
| `DELETE /api/cloud-computers/:id/connectors/:pluginId` | user/pat/oauth | `cloud_computer:{id}/connectors:{pluginId}` | `manage` | cloud deployment owner access + Cloud redeploy capability | cloud-secret |
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
    "agentCount": 1,
    "buddyCount": 1,
    "createdAt": "2026-06-27T00:00:00.000Z",
    "updatedAt": "2026-06-27T00:00:00.000Z",
    "lastActiveAt": "2026-06-27T00:00:00.000Z",
    "operation": null,
    "capabilities": {
      "files": true,
      "terminal": true,
      "browser": true,
      "desktop": true,
      "buddies": true,
      "backups": true,
      "connectors": true,
      "workspaceMounts": true
    },
    "appearance": { "shellColor": "aqua" }
  }
]
```

`agentCount` is the number of deployment execution units. A clean Cloud Computer keeps one reusable
base Agent: with no Buddies it hosts Files and Terminal, and the first Buddy reuses that same unit
instead of adding a parallel host. Additional Buddies add execution units, so the normal count is
`max(1, buddyCount)`.
`buddyCount` is the number of user-visible Buddy accounts. Product interfaces should use
`buddyCount` whenever they label or price Buddies.

## Create Cloud Computer

```http
POST /api/cloud-computers
Content-Type: application/json

{
  "name": "Studio Computer",
  "shellColor": "grape",
  "resourceTier": "standard",
  "buddy": {
    "name": "Studio Buddy",
    "description": "Helps plan and ship studio work.",
    "avatarUrl": "/api/media/avatar/studio-buddy.png",
    "runtimeId": "openclaw",
    "serverId": "00000000-0000-4000-8000-000000000001"
  }
}
```

While deletion is in progress, `operation.kind` is `delete`. Its `stage` advances through
`delete_queued`, `stopping_buddies`, `removing_resources`, `cleaning_state`, and
`finalizing_delete`. Billing stops when deletion is queued. Deletion continues in the background;
if cleanup fails, the Cloud Computer remains visible in a recoverable failed state instead of being
silently removed.

A failed deletion returns `health.reason: "delete_failed"` and `nextActions: ["retry-delete"]`.
Retry by sending `DELETE /api/cloud-computers/:id` again; completed and in-progress deletion requests
remain idempotent.

Input:

- `name`: optional display name. Defaults to `My Cloud Computer`.
- `shellColor`: optional Mac G3 shell color. One of `aqua`, `grape`, `tangerine`, `lime`,
  `strawberry`, `blueberry`, or `graphite`.
- `resourceTier`: optional initial configuration. One of `lightweight`, `standard`, or `pro`;
  defaults to `lightweight`.
- `buddy`: optional first Buddy definition. It accepts the same name, description, avatar, Runtime,
  and Space binding fields as `POST /api/cloud-computers/:id/buddies`.

The endpoint uses the dedicated `cloud-computer-base` template and delegates to the same validated
Cloud SaaS deployment pipeline used by developer options. It never selects an arbitrary approved
Buddy or Space template. Appearance, resource configuration, the first
Buddy, and its Runtime are written into the initial snapshot. The first Buddy takes over the base
Agent's identity and Runtime, so it neither requires a second deployment nor creates a duplicate
host Agent. The response is the newly created Cloud Computer object and its stable `id`. When
`buddy` is requested, it also includes `initialBuddy` with the stable public Buddy `id`; clients use
these response IDs for navigation and readiness polling instead of matching a refreshed list by
name.

Clients can display the creation quote from `GET /api/cloud-computers/resource-profiles`. The clean
base template contains one reusable headless Agent for Files and Terminal. The optional first Buddy
reuses that execution unit but still adds the profile's `additionalBuddyCredits` to
`baseHourlyCredits` for the managed Buddy account and message service. The API persists the same
effective hourly and monthly prices on creation.

Every Cloud Computer snapshot includes the `model-provider` plugin in `official` mode. Buddy
runtimes receive only the platform model-proxy endpoint and a short-lived deployment token. The
platform currently resolves that public model to `deepseek-v4-flash`; Cloud Computers must not copy
vendor API keys or select a legacy provider/model directly.

Cloud Computers are metered at the `cost.hourlyCredits` returned by the API. If hourly settlement
finds an insufficient balance, the worker scales the sandbox agents to zero and changes the Cloud
Computer to `paused`. It must retain the deployment row, namespace, PVCs, configuration snapshot,
connectors, and workspace, and send a `cloud_computer.billing_paused` notification. It must never
queue destruction for a Cloud Computer solely because of billing. After adding funds, the user can
resume the same Cloud Computer; billing time is reset at resume so paused time is not charged.
Pause and resume are idempotent lifecycle operations. Repeating pause keeps the runtime at zero
replicas. Repeating resume after the runtime is already ready still reconciles Buddy processes that
were marked for restart before the pause; this makes client retries safe after a timeout, network
disconnect, or server restart.

## Runtime plugins

Agent Runtimes are contributed by the Cloud plugin registry. A Runtime descriptor contains its
plugin/version identity, adapter id, minimum resource tier, multi-Buddy capability, and persistent
state contract. Product clients must read the catalog instead of maintaining a server-side Runtime
enum.

```http
GET /api/cloud-computers/runtimes
GET /api/cloud-computers/:id/runtimes
POST /api/cloud-computers/:id/runtimes/:runtimeId/install
```

Installing a Runtime writes its desired state into the Cloud Computer deployment snapshot and
redeploys that snapshot. It does not install a package into an ephemeral Pod. Pod replacement and
server restart therefore restore the Runtime from the same plugin and version declaration. The
per-computer response reports installation state only. Buddy membership is defined by the
`shadowob` declarations and bindings, while Provision State maps stable public Buddy IDs to internal
Agent UUIDs. One installed Runtime can serve multiple Buddies while each Buddy keeps an isolated
logical profile.

Creating a Buddy automatically ensures the selected Runtime declaration is installed. The create
response reports `runtime.reused` so clients can distinguish a reused Runtime from the first
installation.

## Configuration quotes and dynamic pricing

```http
GET /api/cloud-computers/resource-profiles
POST /api/cloud-computers/:id/configuration/quote
PATCH /api/cloud-computers/:id/configuration
```

Request a five-minute signed quote with `{ "resourceTier": "standard" }`, then apply the returned
`quoteToken`. The quote is bound to the user, Cloud Computer, pricing version, current declarative
deployment revision, Buddy count, and retained storage size. If the deployment changes, the server
rejects the stale quote and the client must request another one.

Applying a quote creates an operational redeployment with updated CPU/memory requests and limits.
Persistent storage can grow but is never reduced when moving to a smaller compute tier. The old
billing window closes at the successful change time and subsequent complete 15-minute intervals use
the new hourly rate. Adding another Buddy recalculates the rate for the current profile.

`nextActions` is intentionally ordered and narrow. Product clients render only the first supported
action while the Cloud Computer is not ready. They must not present repair, restore, and recreation
as a row of competing buttons. Internal action names such as `rebuild-runtime` may appear in the API
but should be labeled as “Set up again” in user interfaces.

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
  "name": "Studio Computer",
  "shellColor": "grape"
}
```

Input:

- `name`: optional display name, `1..80` characters after trimming.
- `shellColor`: optional visual identity for the Cloud Computer. One of `aqua`, `grape`,
  `tangerine`, `lime`, `strawberry`, `blueberry`, or `graphite`.

This is a facade update over the underlying Cloud deployment row. It does not create a separate
Cloud Computer record, and the response is the updated Cloud Computer object. The chosen shell color
is stored in the deployment configuration snapshot, survives repair/redeploy, and is returned as
`appearance.shellColor` by list and detail endpoints.

## Space Apps

```http
GET /api/cloud-computers/:id/apps
```

Returns the signed-in user's published Space App instances from every historical deployment that
belongs to the same Cloud Computer environment. This lets Buddy Cover keep showing recent results
after a redeploy creates a new underlying deployment row; it does not introduce a separate Project
or app-management resource.

Each item includes the app instance id, name, slug, status, current version, public URL when one is
available, and timestamps. Source and credential values are not returned.

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
- The Space workspace mount root (`CLOUD_COMPUTER_WORKSPACE_MOUNT_ROOT`, default
  `/workspace/server-workspaces`) is excluded from file listings and rejected by every Cloud
  Computer file operation. Space workspace data is available only through an explicitly configured
  workspace mount and is never treated as part of the Cloud Computer's own file workspace.
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

## Safe Runtime Rebuild

When retrying the same runtime would repeat an image, optional component, workspace mount, or
connector failure, clients can request a safe rebuild:

```http
POST /api/cloud-computers/:id/runtime/rebuild
```

The rebuild creates a new deployment history entry in the same namespace and preserves the shared
`/workspace` persistent volume. It detaches optional Browser/Desktop components, server workspace
mounts, and connectors that were added at runtime. Connector accounts remain encrypted at the
account layer and can be enabled again after the core runtime is healthy. Connectors declared by the
base template are not removed.

```json
{
  "ok": true,
  "cloudComputerId": "cc_stable-environment-id",
  "component": "runtime",
  "recoveryAction": "safe-rebuild",
  "status": "pending",
  "detachedConnectors": 2,
  "preservedWorkspace": true
}
```

Every entry in the Cloud Computer `readiness` object includes `state`, `reason`, and `action`.
Clients should keep unavailable tools navigable and use these fields to explain the blocking state
and present the matching recovery action instead of showing an unexplained disabled control.

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

If Browser was previously enabled in the persisted cloud computer snapshot but its Deployment or
Service is missing after an application or Kubernetes restart, the session endpoint reapplies the
persisted runtime before issuing a new token. Connected clients should request a new session and
reconnect when the raw WebSocket closes; web and mobile clients do this with capped exponential
backoff.

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

If Desktop was previously enabled in the persisted cloud computer snapshot but its Deployment or
Service is missing, the session endpoint reapplies the stored desktop runtime before issuing a new
token. The deployment processor also reconciles persisted Browser, Desktop, and workspace-mount
overlays after server startup and periodically thereafter. The default overlay reconciliation
interval is five minutes and can be changed with
`CLOUD_COMPUTER_OVERLAY_RECONCILE_INTERVAL_MS`.

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

The mount namespace is a reserved integration boundary. It is not returned by the Cloud Computer
Files API, cannot be addressed with Cloud Computer file ids, and must not share client-side workspace
state or query keys with the server workspace UI.

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
      "id": "studio-buddy",
      "agentId": "4c749d8d-b284-4bb1-9dc2-60767db9ae5f",
      "name": "Studio Buddy",
      "status": "running",
      "kernelType": "openclaw"
    }
  ]
}
```

`id` is the cloud computer's declarative Buddy ID and remains stable across redeployments.
`agentId` is the provisioned Shadow Agent ID used to open the Buddy's profile and configuration;
it is `null` while provisioning has not created the account yet.

```http
POST /api/cloud-computers/:id/buddies
Content-Type: application/json

{
  "name": "Writing Buddy",
  "description": "Helps the team plan and improve long-form writing.",
  "avatarUrl": "/api/media/avatar/writing-buddy.png"
}
```

Input:

- `name`: required Buddy display name, `1..80` characters.
- `description`: optional description, up to 500 characters.
- `avatarUrl`: optional uploaded avatar URL. It is stored with the Buddy account and reused by
  channel messages, profiles, and Cloud Computer surfaces.
- `serverId`: optional existing Space UUID. When provided, deployment adds the Buddy to the Space
  and its current channels with mention-only replies, so channel messages are handled by the
  configured Agent Runtime instead of a manual response path.
- `runtimeId`: optional advanced override. Defaults to `openclaw`.

The `buddy.id` is the stable public ID from the declarative configuration. Platform Agent and user
UUIDs are internal Provision State and are never accepted as replacements for `:buddyId`.

The endpoint is a facade over the current cloud computer deployment. For the first Buddy, it reuses
the base Agent and updates that unit's identity and selected Runtime; the Buddy's community identity
remains a separate binding target. Starting with the second Buddy, it appends a new execution unit.
It then calls the validated Cloud SaaS redeploy pipeline for the same namespace. It does not create a
second Cloud Computer.

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
    "status": "pending"
  }
}
```

```http
POST /api/cloud-computers/:id/buddies/:buddyId/start
POST /api/cloud-computers/:id/buddies/:buddyId/stop
```

The action endpoints resolve the internal Agent UUID from the owned Cloud Computer's Provision
State. They are intended for the community desktop so users can manage Cloud Buddies without
leaving the cloud computer experience.

```http
DELETE /api/cloud-computers/:id/buddies/:buddyId
```

Removal updates the current Cloud Computer configuration and returns `202` while the same namespace
is reconciled. The Buddy identity is deleted only after the replacement runtime configuration is
ready. A persisted cleanup marker makes the operation idempotent and lets the worker retry identity
cleanup after a server restart. Repeating the request while removal is in progress also returns
`202`; it does not queue a second deployment. Removing the last Buddy restores the reusable base
Agent in place so Files and Terminal continue to have a host runtime.

## Connectors

The connector catalog is generated from the same plugin manifests used by Cloud deployment. The API
does not maintain a second provider registry and does not depend on OpenConnector at runtime.

```http
GET /api/cloud-computers/:id/connectors?locale=zh-CN
```

Each catalog item includes its manifest metadata, auth fields, safe configuration fields, current
Cloud Computer status, and an optional account summary. Credential values and encrypted database
payloads are never returned. `locale` accepts `en`, `zh-CN`, `zh-TW`, `ja`, or `ko` (including
regional variants such as `ja-JP`) and defaults to `Accept-Language`, then English. The localized
`name` and `description` come from the generated plugin catalog, so Web, mobile, and SDK clients
receive the same copy.

Every user-visible connector also includes a local PNG data URL and its recorded provenance:

```json
{
  "id": "github",
  "name": "GitHub",
  "description": "连接 GitHub，让 Buddy 处理代码仓库、代码和变更。",
  "iconDataUrl": "data:image/png;base64,...",
  "iconSource": {
    "website": "https://github.com",
    "sourceUrl": "https://github.githubassets.com/favicons/favicon.png",
    "sourceType": "official-site",
    "sha256": "...",
    "visualBounds": { "width": 116, "height": 116, "x": 6, "y": 6 }
  }
}
```

Icon files are checked into the Cloud package and embedded when the plugin library is generated;
catalog requests therefore never depend on a provider website being online. Maintainers refresh the
assets with `pnpm --filter @shadowob/cloud sync:connector-icons`. `sources.json` records the official
website, resolved icon URL, source type, and file hash for audit and completeness tests.

```http
PUT /api/cloud-computers/:id/connectors/github
Content-Type: application/json

{
  "credentials": {
    "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_..."
  },
  "options": {
    "toolsets": "repos,issues,pull_requests",
    "readOnly": true
  }
}
```

The first version supports one saved account per user and plugin. Omitting `credentials` reuses that
saved account, so users can connect it to another Cloud Computer without exposing or re-entering the
secret. Provider-specific verification currently covers GitHub, Notion, and Stripe. Other manifests
receive structural validation; Google Workspace credentials JSON is parsed locally.

### OAuth connections

OAuth remains part of the plugin manifest instead of introducing a second provider registry. A
manifest may declare authorization and token endpoints, scopes, token endpoint authentication,
optional PKCE, token-response mappings, and the existing auth field that receives the access token.

```http
POST /api/cloud-computers/:id/connectors/github/oauth/start
```

```json
{
  "ok": true,
  "flowId": "8aa4f03f-...",
  "authorizationUrl": "https://github.com/login/oauth/authorize?...",
  "expiresAt": "2026-07-11T02:15:00.000Z"
}
```

Clients open `authorizationUrl`, then poll the owner-bound status endpoint:

```http
GET /api/cloud-computers/oauth/flows/:flowId
```

The provider redirects to `GET /api/cloud-computers/oauth/callback`. The callback consumes a
single-use, 15-minute state value; only its SHA-256 hash is stored. Providers that support PKCE use
S256, with the encrypted verifier retained only for the pending flow. The server exchanges the code,
stores access and refresh tokens in the existing encrypted connection record, and refreshes expiring
tokens before runtime secret references are resolved. The callback never returns token values to the
browser.

After the flow reaches `completed`, the client calls the normal connector `PUT` route without a
`credentials` object. This reuses the OAuth account and applies the same runtime overlay/redeploy path
as a manually entered token.

The initial OAuth-enabled manifests are Canva, Figma, GitHub, HubSpot, Hugging Face, Linear, Notion,
PostHog, Salesforce, Sentry, Supabase, and Tencent Docs. Google Workspace and Google Analytics are
intentionally not broker-enabled yet: their current runtimes consume exported credentials JSON
documents rather than standalone access tokens.

Each enabled plugin uses a platform-owned OAuth application configured through environment variables:

```text
CLOUD_CONNECTOR_OAUTH_ORIGIN=https://shadow.example
CLOUD_CONNECTOR_OAUTH_GITHUB_CLIENT_ID=...
CLOUD_CONNECTOR_OAUTH_GITHUB_CLIENT_SECRET=...
```

The callback URL registered with the provider is
`${CLOUD_CONNECTOR_OAUTH_ORIGIN}/api/cloud-computers/oauth/callback`. Replace `GITHUB` with the
uppercase plugin id, converting punctuation to underscores. A catalog item reports OAuth as
`available` but not `configured` until the required client environment is present.

GitHub can reuse the platform login OAuth application. When connector-specific GitHub variables are
absent, the broker falls back to `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` and uses the already
registered `/api/auth/oauth/github/callback`. Connector-specific variables remain an override when
the platform wants separate login and repository authorization applications.

Applying a connector creates a runtime overlay on the Cloud config:

1. Add or update the plugin in the top-level `use` array.
2. Map manifest auth fields to `${env:FIELD}` options.
3. Persist opaque connector references in deployment runtime metadata.
4. Resolve those references from KMS-encrypted account credentials only inside the deployment
   processor, immediately before runtime construction.
5. Redeploy the same namespace and expose `configured`, `applying`, `ready`, or `error` through the
   Cloud Computer API.

This keeps declaration and runtime configuration compatible: the manifest remains the source of
plugin capabilities, while the runtime overlay selects an account and user-editable options. If a
plugin already exists in the declarative base, disconnecting removes the account overlay but keeps
the declared plugin entry.

```http
POST /api/cloud-computers/:id/connectors/github/verify
DELETE /api/cloud-computers/:id/connectors/github
```

Verification rechecks the stored credential without returning it. Disconnecting removes the plugin
overlay from that Cloud Computer but intentionally retains the user-level encrypted credential for
later reuse.

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
