# Computers API

The Computers API is the product-level read and management surface shared by local Connector
computers and Cloud Computers. It gives clients one domain model without merging the two lifecycle
implementations underneath it.

- Local lifecycle remains owned by Connector daemon APIs.
- Cloud lifecycle and interactive tools remain owned by Cloud Computer APIs.
- Unified IDs are namespaced as `local:{connectorComputerId}` and `cloud:{cloudComputerId}`.
- `sourceId` is retained so clients can enter the existing lifecycle-specific API when needed.
- Local computers remain visible while offline. They disappear only after the owner removes them.

All routes require the signed-in owner.

## List Computers

```http
GET /api/computers
GET /api/computers?kind=local
GET /api/computers?kind=cloud
```

Response:

```json
{
  "computers": [
    {
      "id": "local:connector-computer-id",
      "sourceId": "connector-computer-id",
      "kind": "local",
      "name": "Alex's MacBook",
      "status": "online",
      "device": {
        "class": "macbook",
        "vendor": "Apple",
        "model": "MacBookPro18,3",
        "hostname": "alex-macbook.local",
        "os": "darwin",
        "osVersion": "26.0",
        "arch": "arm64"
      },
      "capabilities": {
        "buddies": true,
        "runtimes": true,
        "tasks": true,
        "diagnostics": true,
        "files": true,
        "terminal": true,
        "browser": false,
        "desktop": false,
        "backups": false,
        "connectors": true,
        "power": false
      },
      "runtimes": [
        { "id": "codex", "label": "Codex CLI", "kind": "cli", "status": "available" }
      ],
      "buddies": [
        {
          "agentId": "agent-id",
          "buddyId": "agent-id",
          "name": "Coding Buddy",
          "status": "running",
          "runtimeId": "codex",
          "runtimeLabel": "Codex CLI",
          "workDir": "/Users/alex/Projects/example"
        }
      ],
      "buddyCount": 1,
      "lastSeenAt": "2026-07-14T01:00:00.000Z",
      "local": {
        "installationId": "desktop-installation-id",
        "deviceFingerprint": "device_5b33c89c-...",
        "daemonVersion": "1.1.65"
      }
    }
  ]
}
```

`device.class` is one of `cloud`, `macbook`, `imac`, `mac-mini`, `mac-studio`, `laptop`,
`desktop`, `workstation`, `server`, or `unknown`. Device detection sends model identity only and
must not collect hardware serial numbers.

`local.deviceFingerprint` is the random identity stored in `~/.shadowob/device-identity.json` and
shared by Desktop and CLI. It identifies the physical computer in the product domain;
`local.installationId` identifies a particular client installation and is retained for compatibility.

A local Buddy's `status` is effective placement status: when its host computer is offline, the
Buddy is reported as `offline` even if the last Agent heartbeat still says `running`. This prevents
clients from presenting a Buddy as reachable when its Connector cannot receive work.

## Get, Rename, and Remove

```http
GET /api/computers/:computerId
PATCH /api/computers/:computerId
DELETE /api/computers/:computerId
```

Rename body:

```json
{ "name": "Studio Mac" }
```

`DELETE` currently supports local computers only. It revokes the Connector machine token and hides
the computer from the owner. It does not delete Buddy accounts. Cloud Computer deletion continues
to use `DELETE /api/cloud-computers/:id` because it has billing, backup, and resource-destruction
semantics.

## Buddy Placement

Owner responses from `GET /api/agents` and `GET /api/agents/:id` include a nullable `placement`:

```json
{
  "computerId": "local:connector-computer-id",
  "computerKind": "local",
  "computerName": "Alex's MacBook",
  "computerStatus": "online",
  "deviceClass": "macbook",
  "deviceModel": "MacBookPro18,3",
  "runtimeId": "codex",
  "runtimeLabel": "Codex CLI"
}
```

Rental tenants do not receive the owner's computer placement metadata.
