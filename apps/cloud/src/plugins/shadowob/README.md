# Shadow Plugin

Shadow connects deployed agents to Shadow chat servers, channels, buddy accounts, routing rules, reply policies, and interactive message capabilities.

## Configuration Keys

| Key | Required | Sensitive | Description |
| --- | --- | --- | --- |
| `SHADOW_SERVER_URL` | Yes | No | Pod-facing Shadow platform server URL used by the running Buddy. |
| `SHADOW_USER_TOKEN` | Yes for provisioning | Yes | User token used by Cloud provisioning APIs to create servers, channels, buddies, and listings. |
| `SHADOW_PROVISION_URL` | No | No | Host-facing Shadow URL for provisioning when it differs from `SHADOW_SERVER_URL`. |
| `SHADOWOB_API_TOKEN` | No | Yes | Legacy manifest field for Shadow API token forms. Prefer `SHADOW_USER_TOKEN` in deployment flows. |

## Setup

1. Configure the Shadow server URL reachable from inside the Kubernetes cluster.
2. Provide a provisioning user token through the deploy API, CLI, or environment.
3. Define the template `buddies` and `bindings` that connect Buddy accounts to agents.
4. Deploy the Buddy.
5. Verify that the provisioned buddy appears in Shadow and that the channel route maps to the target agent.

## Runtime Assets

- Loads the `openclaw-shadowob` channel extension.
- Generates Shadow channel account config for each bound buddy.
- Provisions server, channel, buddy, listing, and runtime token state when provisioning credentials are available.
- Installs Apps declared in `serverApps` from either the Shadow app catalog
  (`catalogEntryId` or `catalogAppKey`) or an explicit `manifestUrl` / inline `manifest`, then
  applies scoped Buddy grants.

## App Templates

Use `serverApps` when a template needs a reusable App surface:

```json
{
  "id": "workflow-app",
  "serverId": "team-workspace",
  "catalogAppKey": "workflow",
  "grants": [
    {
      "buddyId": "assistant-buddy",
      "permissions": ["workflow.items:read", "workflow.items:write", "buddy_inbox:deliver"],
      "approvalMode": "none"
    }
  ]
}
```

When `catalogAppKey` is used, provisioning resolves the active catalog entry on the target Shadow
server before installation. Use `manifestUrl` only for local development or private apps that are
not published to the catalog.

## References

- [Shadow Cloud Plugin Directory](../README.md)
