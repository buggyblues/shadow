# Connector Daemon API

Connector daemon endpoints let a user's local computer register available runtimes and receive
Buddy configuration jobs.

## Configure an Existing Buddy

`POST /api/connector/computers/:computerId/buddies/:agentId/configure`

Requires the signed-in Buddy owner. The target computer must belong to the user, be online, and
report the selected runtime as available.

Request:

```json
{
  "runtimeId": "codex",
  "serverUrl": "https://shadowob.com"
}
```

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
fresh Buddy token plus the selected runtime id.
