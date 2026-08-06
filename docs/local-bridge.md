# Local Bridge

Local Bridge connects Shadow Clipper with a local folder and MCP clients such as Codex. It runs only
on this computer:

```text
Shadow Clipper ── local HTTP ──► Shadow CLI Local Bridge ◄── MCP ── Codex
                                      │
                                      ▼
                               ~/ClipperLibrary
```

The extension stays responsible for browser capture. Local Bridge stores the exported library,
publishes managed text files as MCP resources, and carries bounded plugin tasks between Codex and
the extension.

## 1. Install the Shadow CLI

Use Node.js 22.14 or newer:

```bash
npm install --global @shadowob/cli
shadowob --version
```

When developing from this repository instead:

```bash
pnpm --filter @shadowob/cli build
node packages/cli/dist/index.js local-bridge --help
```

## 2. Start Local Bridge

```bash
shadowob local-bridge start --detach --root ~/ClipperLibrary
```

The first run creates the library directory and a private connection token. The command prints the
address and token needed by the extension. The background service keeps running after the terminal
closes.

Defaults:

- Address: `http://127.0.0.1:32145`
- Library: `~/ClipperLibrary`
- Token file: `~/ClipperLibrary/.clipper/bridge-token`

Use a different port or directory when needed:

```bash
shadowob local-bridge start --detach --port 43145 --root ~/Documents/ShadowClipper
```

Omit `--detach` when you want a foreground process that stops with the terminal.

## 3. Connect Shadow Clipper

1. Open **Shadow Clipper → Settings → Sync → Local Bridge**.
2. Paste the address and token printed by the CLI.
3. Choose **Test connection**.
4. The first sync runs automatically after the test passes. Leave automatic sync enabled if later
   library changes should appear locally.

Local Bridge updates only files recorded in its managed-file manifest. Unrelated files already in
the selected directory are not removed. Each sync compares file hashes, writes only changes, and
keeps the latest 100 sync records.

## 4. Connect Codex

Keep Local Bridge running, then register the stdio proxy printed by `start` or `guide`:

```bash
codex mcp add shadow-clipper -- \
  shadowob local-bridge mcp \
  --root ~/ClipperLibrary
```

Restart Codex after adding the connection. The proxy reads the token from the library directory, so
the token is not stored in the Codex MCP configuration. It also discovers the address recorded by
the running service, including a custom port.

Codex receives these capabilities:

- Read a library overview with file types, source platforms, date range, tags, favorites, and reading state.
- Page through managed Markdown, text, and JSON resources and read selected line ranges.
- Search the local Clipper library by relevance and continue through paginated results.
- Request a fresh browser export with `clipper_sync_library` and inspect sync records with
  `clipper_list_library_syncs`; the extension also refreshes the snapshot shortly after library
  changes when automatic sync is enabled.
- Inspect every connected browser plugin together with its capability tags, callable interfaces,
  task parameters, and choices.
- Invoke a callable plugin interface or send one of its declared tasks to the extension.
- List and run automations already saved in Shadow Clipper.
- Publish declarative custom plugins and manage plugin settings, Pets, themes, wallpapers, and Skills.
- Wait for a task result or cancel a queued task before the browser claims it.
- Discover configured local MCP servers and call their tools, resources, or prompts.
- When explicitly enabled, list local runtimes and execute JavaScript or Python.

The extension must remain enabled in Chrome to claim browser tasks. Local file reading continues to
work when Chrome is closed.

## Capability coverage

Local Bridge exposes the same functional surface through CLI, authenticated HTTP, and MCP:

| Capability | CLI | HTTP | MCP |
| --- | --- | --- | --- |
| Library overview, files, line reads, search, live sync, and sync history | `library` | `/v1/library/*`, `/v1/resources/library/sync` | `clipper_*library*`, `clipper_sync_library`, `clipper_list_library_syncs` |
| Plugin discovery, task catalog, and callable interfaces | `plugins`, `tasks list` | `/v1/plugins*`, `/v1/plugin-tasks`, `/v1/tasks` | `clipper_list_plugins`, `clipper_list_tasks`, `clipper_enqueue_task`, `clipper_invoke_plugin` |
| Saved automations | `automations` | `/v1/resources/automations/*` | `clipper_list_automations`, `clipper_run_automation`, `clipper_manage_resource` |
| Custom plugins, settings, plugin Agents, Pets, themes, wallpapers, and Skills | `custom-plugins`, `plugin-settings`, `plugin-agents`, `pets`, `themes`, `wallpapers`, `skills` | `/v1/resources/*`, `/v1/artifacts*` | `clipper_list_resource_capabilities`, `clipper_manage_resource` |
| Task run result, wait, and cancellation | `tasks runs`, `tasks get/wait/cancel` | `/v1/tasks*` | `clipper_*task*` |
| Configured local MCP servers | `mcp-servers` | `/v1/mcp-servers*` | `clipper_list_mcp_servers`, `clipper_call_mcp_server` |
| JavaScript and Python runtimes | `runtimes` | `/v1/runtimes*` | `clipper_list_runtimes`, `clipper_execute_runtime` |

Runtime execution is present only when the bridge starts with `--enable-runtime`. Plugin capability
tags describe what a plugin supports. Callable interfaces and declared tasks are the executable
boundary; Local Bridge never invents an action for a descriptive tag.

## Connection commands

Print the connection steps again without starting another server:

```bash
shadowob local-bridge guide --root ~/ClipperLibrary
```

Check a running bridge:

```bash
shadowob local-bridge status --root ~/ClipperLibrary
shadowob local-bridge status --root ~/ClipperLibrary --json
```

View its background log or stop it safely:

```bash
shadowob local-bridge logs --root ~/ClipperLibrary
shadowob local-bridge stop --root ~/ClipperLibrary
```

Show a forgotten token, or rotate it while the bridge is running to invalidate the previous token:

```bash
shadowob local-bridge token show --root ~/ClipperLibrary
shadowob local-bridge token rotate --root ~/ClipperLibrary
```

After rotation, paste the new token into **Shadow Clipper → Settings → Shadow CLI**. The sync page
remembers it across browser restarts.

Inspect the last sync time and recent incremental counts:

```bash
shadowob local-bridge library overview --root ~/ClipperLibrary
shadowob local-bridge library history --root ~/ClipperLibrary
```

`status`, `inspect`, `doctor`, `stop`, and `mcp` use the address recorded for that library directory.
Pass `--url` only when connecting to an older or separately managed instance.

Inspect the library through the same MCP interface used by Codex, optionally including a search:

```bash
shadowob local-bridge inspect --root ~/ClipperLibrary
shadowob local-bridge inspect --root ~/ClipperLibrary --query "semiconductor market" --json
```

Check the token, service, first sync, and Chrome connection in one command:

```bash
shadowob local-bridge doctor --root ~/ClipperLibrary
```

The browser check means Shadow Clipper sent a heartbeat, task renewal, or result during the last six minutes.
Chrome's background task refreshes it regularly.

## Use plugin capabilities directly from the CLI

MCP is optional. The CLI can discover every plugin, its capability tags, callable interfaces, and
tasks currently declared by the connected extension:

```bash
shadowob local-bridge plugins list --root ~/ClipperLibrary
```

Run one of the listed tasks with typed options:

```bash
shadowob local-bridge plugins run zhihu hot-questions \
  --root ~/ClipperLibrary \
  --option questionLimit=20
```

Invoke the plugin-owned interface when the caller cares about a capability instead of its backing
task ID:

```bash
shadowob local-bridge plugins invoke zhihu search \
  --root ~/ClipperLibrary \
  --option query="local AI" \
  --wait
```

Automations can add `--idempotency-key <key>` to either `run` or `invoke`; retrying the same key
returns the original task instead of creating a duplicate.

Use `--wait` to wait up to 30 seconds for the browser result, or set a timeout up to 60 seconds:

```bash
shadowob local-bridge plugins run zhihu hot-questions \
  --root ~/ClipperLibrary \
  --options-json '{"questionLimit":20}' \
  --wait --timeout 60 --json
```

Inspect or manage tasks without an MCP client:

```bash
shadowob local-bridge tasks list --root ~/ClipperLibrary
shadowob local-bridge tasks runs --root ~/ClipperLibrary
shadowob local-bridge tasks get <task-id> --root ~/ClipperLibrary
shadowob local-bridge tasks wait <task-id> --root ~/ClipperLibrary --timeout 60
shadowob local-bridge tasks cancel <task-id> --root ~/ClipperLibrary
```

`tasks list` shows task definitions currently advertised by connected plugins and recent execution
runs. `tasks runs` shows only execution history. Saved automations are separate browser data:

```bash
shadowob local-bridge automations list --root ~/ClipperLibrary --timeout 60
shadowob local-bridge automations run <automation-id> --root ~/ClipperLibrary --timeout 60
```

Request the freshest library snapshot at any time:

```bash
shadowob local-bridge library sync --root ~/ClipperLibrary --timeout 60
```

This command asks the connected browser extension to export immediately. Normal CLI and MCP reads
use the latest local snapshot, so they remain fast and continue to work when Chrome is closed.

The CLI uses the authenticated Local Bridge HTTP interface directly. Both HTTP and MCP accept only
tasks and options declared by a recently connected Shadow Clipper plugin.

## Manage extension resources from CLI or MCP

First confirm which operations the connected extension declares:

```bash
shadowob local-bridge resources capabilities --root ~/ClipperLibrary
```

The dedicated CLI groups are convenience wrappers over the same resource protocol:

A minimal `plugin.json` looks like this:

```json
{
  "schemaVersion": 1,
  "id": "example-articles",
  "name": "Example Articles",
  "site": "example.com",
  "version": "1.0.0",
  "match": "^https://(?:www\\.)?example\\.com/articles/",
  "pageType": "Article",
  "itemName": "Article",
  "capture": {
    "rootSelectors": ["article"],
    "bodySelectors": ["article .body"],
    "titleSelectors": ["h1"],
    "authorSelectors": ["[rel=author]"]
  }
}
```

```bash
# Safe declarative plugins: JSON selectors and URL matching, never uploaded JavaScript
shadowob local-bridge custom-plugins validate ./plugin.json --root ~/ClipperLibrary
shadowob local-bridge custom-plugins publish ./plugin.json --root ~/ClipperLibrary
shadowob local-bridge custom-plugins publish ./plugin.json --replace --root ~/ClipperLibrary
shadowob local-bridge custom-plugins list --root ~/ClipperLibrary

# Settings and plugin-owned Agent tasks
shadowob local-bridge plugin-settings get zhihu --root ~/ClipperLibrary
shadowob local-bridge plugin-settings set zhihu --payload-json '{"enabled":true,"options":{"saveImages":true}}' --root ~/ClipperLibrary
shadowob local-bridge plugin-agents get zhihu --root ~/ClipperLibrary
shadowob local-bridge plugins invoke zhihu search --option query="local AI" --wait --root ~/ClipperLibrary

# Codex Pet, theme, and workspace wallpaper
shadowob local-bridge pets install ./fox.codex-pet.zip --root ~/ClipperLibrary
shadowob local-bridge pets select fox --root ~/ClipperLibrary
shadowob local-bridge themes apply --payload-json '{"theme":"dark","appearance":{"palette":"plum"}}' --root ~/ClipperLibrary
shadowob local-bridge wallpapers install ./workspace.webp --root ~/ClipperLibrary
shadowob local-bridge wallpapers select custom --root ~/ClipperLibrary

# Agent Skills: zip root must contain SKILL.md; a single SKILL.md also works
shadowob local-bridge skills install ./research-helper.zip --root ~/ClipperLibrary
shadowob local-bridge skills list --root ~/ClipperLibrary
shadowob local-bridge skills disable research-helper --root ~/ClipperLibrary
```

Resource commands wait for the browser result by default. Add `--no-wait` to return the task ID
immediately, or `--json` for stable structured output. Installation updates require `--replace`.
Removal requires `--yes`. The generic equivalent is `resources run <resource> <action>`.

MCP clients call `clipper_list_resource_capabilities`, then `clipper_manage_resource` with
`resource`, `action`, optional `id`/`payload`, and an optional local `path`. File uploads are staged
inside the Bridge and capped at 32 MB; individual formats apply smaller limits.

Custom plugins are intentionally declarative. Their manifest provides an HTTPS match expression and
observed DOM selectors; uploaded JavaScript is not executed. A newly published site may still need
Chrome host access approved by the user. Imported Skills are mounted read-only for new Agent sessions;
their scripts are not run automatically. Pet packages continue to use the existing `.codex-pet.zip`
format, and wallpaper uploads accept image files.

## Use the library directly from the CLI

The same library operations available to MCP clients also work without an MCP client:

```bash
shadowob local-bridge library overview --root ~/ClipperLibrary
shadowob local-bridge library files --root ~/ClipperLibrary --limit 50
shadowob local-bridge library read sources/zhihu/example.md --root ~/ClipperLibrary --start-line 1 --end-line 80
shadowob local-bridge library search "local AI" --root ~/ClipperLibrary --limit 20
```

Add `--json` to any command for the structured result used by scripts.

## Recommended MCP exploration flow

Start with `clipper_library_overview`, then call `clipper_search_library`. Every search term must match, and results
are ranked by title, path, and body relevance. Use `clipper_read_library_file` to read only the needed line range,
and follow `nextCursor` when more results are available.

The built-in `explore-library` MCP prompt follows the same flow. Tools return both text and structured content so
MCP clients can present results to people while consuming fields reliably.

Remove the Codex connection:

```bash
codex mcp remove shadow-clipper
```

## Optional local runtimes

JavaScript and Python execution is off by default. Enable it only when the extension workflow
explicitly needs local code execution:

```bash
shadowob local-bridge start --detach --root ~/ClipperLibrary --enable-runtime
```

This option runs code with the permissions of the current operating-system account. It should not be
enabled on a shared or untrusted computer.

Once enabled, both CLI and MCP can discover and use the same runtimes:

```bash
shadowob local-bridge runtimes list --root ~/ClipperLibrary
shadowob local-bridge runtimes run javascript --root ~/ClipperLibrary --code 'console.log(6 * 7)'
shadowob local-bridge runtimes run python --root ~/ClipperLibrary --file ./analysis.py --stdin-file ./input.json
```

The corresponding MCP tools are `clipper_list_runtimes` and `clipper_execute_runtime`. They are not
advertised while runtime execution is disabled.

## Call configured local MCP servers

The bridge can also expose MCP servers configured for it. List them and send any MCP method through
the generic request command:

```bash
shadowob local-bridge mcp-servers list --root ~/ClipperLibrary
shadowob local-bridge mcp-servers request bear tools/list --root ~/ClipperLibrary
shadowob local-bridge mcp-servers request bear tools/call \
  --root ~/ClipperLibrary \
  --params-json '{"name":"search_notes","arguments":{"query":"local AI"}}'
```

MCP clients use `clipper_list_mcp_servers` and `clipper_call_mcp_server`. The generic method and
parameters preserve the server's full MCP tool, resource, and prompt surface instead of maintaining
a partial list of wrappers.

## Troubleshooting

### The extension cannot connect

- Run `shadowob local-bridge status` to confirm that the service is running.
- Read startup errors with `shadowob local-bridge logs`.
- Run `shadowob local-bridge status`.
- Copy the address and token again with `shadowob local-bridge guide`.
- Keep the address on `127.0.0.1` or `localhost`; remote HTTP addresses are rejected.
- If the port is already used, start with another `--port` and update the extension address.

### Codex cannot see the MCP server

- Confirm `codex mcp list` includes `shadow-clipper`.
- Verify the directory passed to `local-bridge mcp` is the same directory passed to `start`.
- Restart Codex after changing MCP configuration.
- Run `shadowob local-bridge status` before reconnecting Codex.

### A task remains queued

Open Chrome and confirm Shadow Clipper is enabled and connected. A task is claimed only by an active
extension that declares the matching plugin task. Run `shadowob local-bridge doctor` to check the browser
connection and use `clipper_wait_for_task` for the latest result. A task that has not been claimed can be cancelled
with `clipper_cancel_task`.

## Security model

- The HTTP server binds only to `127.0.0.1`.
- Data and task endpoints require a random token stored with owner-only file permissions.
- The stop endpoint requires the same token and verifies the recorded service instance.
- Browser CORS access is limited to Chrome extension origins and explicitly added origins.
- MCP can enqueue only tasks declared by a recently connected extension.
- Resource operations require the exact resource and action declared by a recently connected extension.
- Uploaded artifacts are token-protected, size-limited, and stored outside the synced library tree.
- Dynamic plugins use only the built-in declarative extractor; uploaded code is never evaluated.
- Local Bridge validates task parameter types, ranges, and choices and rejects undeclared options.
- Archive paths are confined to the selected library root.
- ZIP files are fully validated and staged before managed library files are replaced.
- Local runtime execution is disabled unless `--enable-runtime` is passed.
