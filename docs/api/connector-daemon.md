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
fresh Buddy token, the selected runtime id, and the official Shadow OpenAI-compatible model provider
when the server has the model proxy configured.

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
