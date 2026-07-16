# Connector Daemon API

Connector daemon endpoints let a user's local computer register available runtimes and receive
Buddy configuration jobs.

## Stable Computer Identity

Desktop bootstrap includes both a client installation ID and the random physical-computer
fingerprint shared with the CLI:

```json
{
  "serverUrl": "https://shadowob.com",
  "name": "Alex's MacBook",
  "installationId": "desktop-installation-id",
  "deviceFingerprint": "device_5b33c89c-..."
}
```

Desktop and CLI atomically create `~/.shadowob/device-identity.json` with mode `0600`. The random
fingerprint is never derived from a serial number, MAC address, platform UUID, or hostname. The
server reuses the physical computer record by fingerprint even when the Desktop app is reinstalled
or the connector is launched from a different client. `installationId` remains client-instance
metadata for backward compatibility.

Only one connector daemon per Shadow server may run on a computer. A server-scoped lock under
`~/.shadowob/connector/` prevents Desktop and CLI from racing to claim the same jobs; stale locks are
recovered after the owning process exits.

Computers are retained and reported as `offline` after heartbeat expiry; they are revoked only by
`DELETE /api/connector/computers/:computerId` or the unified Computers API.

Heartbeats can include device identity and capabilities in addition to runtimes:

```json
{
  "deviceFingerprint": "device_5b33c89c-...",
  "hostname": "alex-macbook.local",
  "os": "darwin",
  "osVersion": "26.0",
  "arch": "arm64",
  "deviceClass": "macbook",
  "deviceVendor": "Apple",
  "deviceModel": "MacBook Pro · MacBookPro18,3",
  "daemonVersion": "1.1.65",
  "capabilities": ["tasks", "diagnostics", "files", "terminal"]
}
```

## Configure an Existing Buddy

`POST /api/connector/computers/:computerId/buddies/:agentId/configure`

Requires the signed-in Buddy owner. The target computer must belong to the user, be online, and
report the selected runtime as available.

Request:

```json
{
  "runtimeId": "codex",
  "serverUrl": "https://shadowob.com",
  "workDir": "/Users/alex/Projects/example"
}
```

`workDir` is optional. When omitted, the current Buddy working directory is preserved; a Buddy
without an existing placement defaults to `.`.

Response:

```json
{
  "agent": {
    "id": "agent-id",
    "userId": "bot-user-id",
    "status": "stopped"
  },
  "job": {
    "id": "job-id",
    "status": "pending",
    "type": "configure-buddy"
  }
}
```

The queued job is returned by `GET /api/connector/daemon/jobs` to the matching daemon and carries a
fresh Buddy token, the selected runtime id and working directory, and the official Shadow
OpenAI-compatible model provider when the server has the model proxy configured.

Daemon heartbeats should include runtime metadata when available:

```json
{
  "id": "codex",
  "label": "Codex CLI",
  "kind": "cli",
  "status": "available",
  "iconId": "codex",
  "installCommands": ["npm install -g @openai/codex"],
  "helpUrl": "https://help.openai.com/en/articles/11096431-openai-codex-cli-getting-started",
  "detectedAt": "2026-05-31T00:00:00.000Z"
}
```
