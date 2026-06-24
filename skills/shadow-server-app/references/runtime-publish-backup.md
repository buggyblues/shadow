# Runtime, Publish, And Backup

Use this reference before exposing an agent container service, publishing it to a Shadow-controlled subdomain, or designing App durability.

## Goals

- Agent starts a service that conforms to the App standard.
- Agent uses the `shadowob` CLI for publish, mount, inspect, disable, and backup operations.
- External users reach a stable HTTPS subdomain controlled by Shadow.
- Container ports, private IPs, temporary tunnel tokens, and App secrets never appear in the public manifest.
- App code and state remain recoverable after runtime restart.

## Control Plane Boundary

- Shadow Cloud validates actor, server access, App manifest, expose config, domain, certificate, route policy, backup policy, and audit entries.
- Agent runtime runs the local service and submits desired state.
- Edge and ingress accept only signed routes issued by the control plane.
- The App backend listens on loopback or a controlled runtime service address; public access goes through the assigned HTTPS host.

## Publish Workflow

Target declarative publish contract. Before using it, verify that the runtime CLI exposes this command with `shadowob cloud app --help`; if it is absent, do not invent an external tunnel or publish path.

```bash
shadowob cloud app publish \
  --port <port> \
  --manifest-file ./shadow-app.local.json \
  --source-path "$PWD" \
  --state-paths "$PWD/data" \
  --json
```

Create or keep the App source under `$SHADOW_WORKSPACE`, `/workspace`, `/state`, `/tmp`, or the
standard Cloud runner home `/home/shadow`. `--source-path` and `--state-paths` must be absolute
runtime paths under one of those roots.

Inside an Inbox task or current channel, the CLI infers the target server from the task/channel context. Outside that context, pass `--server <server-id-or-slug>` explicitly. Do not treat `SHADOW_SERVER_IDS` as a publish target; it is only a list of servers the runtime may observe.

Before publishing, keep the App service running without blocking the task shell:

```bash
PORT=<port> pnpm start:background
curl -fsS "http://127.0.0.1:<port>/health"
```

When a scaffold does not provide `start:background`, use an equivalent `nohup ... &` command and write `.shadow-app.pid`. Do not run foreground server commands such as `pnpm start` or `node src/server.js` as the final tool call. A blocked shell prevents `shadowob cloud app publish`, backup creation, Inbox completion, and update tasks from running.

For dynamic expose from inside a runtime, write desired state to the configured sidecar file:

```text
$SHADOW_EXPOSURE_CONFIG
```

Default path:

```text
/run/shadow/exposure/desired.json
```

Recommended shape:

```json
{
  "schemaVersion": "shadow.cloud.exposure/1",
  "desiredRevision": "dev-1",
  "exposures": [
    {
      "id": "<app-key>",
      "port": 4216,
      "kind": "server_app",
      "visibility": "private",
      "appKey": "<app-key>",
      "displayName": "<App name>",
      "manifestPath": "/.well-known/shadow-app.json",
      "healthPath": "/health"
    }
  ]
}
```

The CLI and Cloud control plane must re-read and validate the file. Do not trust public host, manifest URL, or permission fields written by the agent.

## Security Checks

Before publish, the control plane must verify:

- Actor kind is allowed to deploy and has the target server `deploy` capability.
- Scope/capability and resource access both pass.
- `port` maps to the declaring runtime workload only; arbitrary upstream URLs are not accepted.
- Redirects cannot escape SSRF guardrails into private or local networks.
- Manifest passes App policy and Cloud template allowlists.
- JSON config byte, depth, key, and array limits are enforced.
- Public host is assigned or validated by the control plane.
- Routes exclude debug ports, dev hot reload endpoints, metrics, source maps, and directory listings by default.
- Secrets are referenced by id or env key; logs and backups never store plaintext secrets.

## Durability

Publishing creates a release record:

```text
cloud-app-release
  appKey
  serverId
  releaseId
  manifestSnapshot
  sourceSnapshot or buildArtifact
  exposeConfigSnapshot
  stateVolumeRefs
  secretRefs
  routeBindings
  healthStatus
```

Bind routes to releases, not to the current agent process. If the runtime restarts, a supervisor should restore the release artifact and state volume. If the runtime is unavailable, the route should return an explicit unavailable status rather than silently pointing to a dead backend.

Use a managed App runtime for long-lived availability. A normal agent session is acceptable for development and preview, but it should not promise unattended production uptime.

## Backup

Backups are App-level restore points, not ad hoc file copies. Each backup point should include:

- Manifest snapshot.
- Expose config snapshot.
- Release metadata.
- Source snapshot or build artifact digest.
- Consistent snapshots of declared state paths.
- Install and grant metadata.
- Secret references and validation digests, without plaintext secrets.
- Restore or migration hook version metadata.

Trigger backups:

- Before deploy.
- On manual console action.
- On schedule.
- Before command schema, state layout, or expose config changes.

Restore by creating a release candidate, restoring state to a new volume, checking manifest/schema compatibility, passing health checks, switching the route, and retaining the prior release for rollback.

## Agent Operation

- Development preview may run only inside the agent runtime before Cloud App publish succeeds.
- Do not run ad hoc tunnel clients, allocate public domains, or expose arbitrary private URLs from inside the container.
- If `shadowob cloud app publish` returns 401/403 or any other error, mark the Inbox task failed with the exact blocker. Do not report the App as published or completed until the publish command returns success.
