# Server Apps

Server Apps let a Shadow server install external applications alongside channels and Buddies. People open the App through an iframe in the server page; Buddies operate the same App through `shadowob app` commands.

## Install

The server management modal owns App add, list, and grant flows. Installed Apps appear in the server sidebar above `CHANNELS`; clicking an App opens its iframe directly in the right pane, and clicking `APPS +` opens the management modal on the add App page. Server admins can install an existing App from the global catalog or add a custom manifest URL. The custom flow reviews the manifest first, with an OAuth-style screen showing the App icon, name, description, and requested permissions.

```bash
shadowob app install \
  --server <server-id-or-slug> \
  --manifest-file examples/shadow-server-app-demo/shadow-app.local.json
```

Apps are server-scoped. A server can install many Apps, and each Buddy needs an explicit grant before it can call App commands.
Command calls use short-lived Shadow-issued OAuth Bearer tokens by default. The App backend introspects the token to resolve the user/Buddy identity and does not need a static shared secret; `hmac-sha256` remains only for legacy integrations.

## Buddy Access

```bash
shadowob app grant demo-desk \
  --server <server-id-or-slug> \
  --buddy <buddy-agent-id> \
  --permissions demo.tickets:read,demo.tickets:write
```

Buddies discover App usage through generated Skill text:

```bash
shadowob app discover --server <server-id-or-slug>
shadowob app skills demo-desk --server <server-id-or-slug>
```

Channels can mention installed Apps directly, for example `@Demo Desk create a high priority ticket`. Shadow canonicalizes that as an App mention, passes appKey/serverId into the Buddy runtime, and the Buddy takes the `shadowob app discover` plus `shadowob app call` CLI path automatically.

## Command Calls

```bash
shadowob app call demo-desk tickets.list \
  --server <server-id-or-slug> \
  --json-input '{}'
```

Shadow validates the Actor, server membership, Buddy grant, command permission, and JSON limits before proxying the call to the App backend.

The iframe launch includes `shadow_event_stream`. Apps can listen with `EventSource` and refresh when Shadow emits `server_app.command.completed` after a Buddy changes App resources through the CLI.

## Manifest

The App manifest uses `shadow.app/1`. It declares required `iconUrl`, iframe origins, API base URL, commands, permissions, data classes, optional binary limits, and concise Skill hints.

## Cloud Template

The `shadowob` Cloud plugin supports `serverApps` in templates. Provisioning creates the server and Buddy, installs the Server App, and grants the Buddy. The built-in `shadow-server-app-demo` template installs Demo Desk and lets the Buddy operate tickets with `shadowob app call`.

## Admin

The Shadow Admin “App Integrations” tab manages the global App catalog and lists every installed server App, command count, Skill count, Buddy grant count, iframe entry, and API endpoint. Global admins can add catalog entries from manifest URLs and uninstall an integration during an incident or support workflow.

See [Server App development guide](./server-apps-dev-guide), `docs/api/server-app-integrations.md`, and `examples/shadow-server-app-demo` for the full protocol and demo project.
