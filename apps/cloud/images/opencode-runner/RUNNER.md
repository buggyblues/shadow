# OpenCode Runner Research

Research date: 2026-05-14.

## Target role

`opencode` should run through the ShadowOB `cc-connect` fork, not through
OpenClaw gateway or ACPX. The runner process should be:

```text
cc-connect fork -> agent type "opencode" -> opencode CLI
```

Shadow transport should come from the cc-connect ShadowOB platform.

## Current repository state

The OpenCode adapter and image now use the cc-connect fork path. The runtime
package emits `cc-connect-config.toml`, `opencode.json`, `.opencode` runtime
files, workspace bootstrap files, and ShadowOB skill files through
`runtime-files.json`.

## Native OpenCode configuration

OpenCode uses JSON/JSONC config and keeps several extensibility surfaces native:

| Concern | Native OpenCode surface |
| --- | --- |
| Global config | `~/.config/opencode/opencode.json`. |
| Project config | `opencode.json` or `opencode.jsonc` at the project root. |
| Custom config | `OPENCODE_CONFIG`. |
| Models/providers | `model`, `provider`, `enabled_providers`, `disabled_providers`. |
| Agents | `agent` object and Markdown agents under `.opencode/agents` or global config locations. |
| Default agent | `default_agent`, which must be a primary agent. |
| Subagents | Agent config can mark subtask behavior; commands can force `subtask`. |
| Commands | `command` config entries or Markdown files under `.opencode/commands` and global command directories. |
| Skills | `.opencode/skills/<name>/SKILL.md`, plus compatible `.claude/skills` and `.agents/skills` discovery. |
| MCP | `mcp` config object for local and remote MCP servers. |
| Hooks/plugins | OpenCode plugins under `.opencode/plugins` or `~/.config/opencode/plugins`, plus npm-loaded plugins. |
| Logs and sessions | OpenCode native session data plus cc-connect session state; exact collection should be verified during implementation. |

## Shadow slash command bridge

The runner package always materializes `/etc/shadowob/slash-commands.json` so
Shadow can load a stable command index. The OpenCode runner owns its catalog in
`apps/cloud/src/runtimes/slash-commands/opencode.ts`; this is intentionally not
a common runtime artifact.

Official OpenCode TUI commands researched from the docs include `/connect`,
`/compact`, `/details`, `/editor`, `/exit`, `/export`, `/help`, `/init`,
`/models`, `/new`, `/redo`, `/sessions`, `/share`, `/themes`, `/thinking`,
`/undo`, and `/unshare`.

Current Cloud injection registers only names that do not collide with
cc-connect's universal bot commands: `/connect`, `/details`, `/editor`,
`/exit`, `/export`, `/init`, `/models`, `/redo`, `/share`, `/themes`,
`/thinking`, `/undo`, and `/unshare`. Overlapping control commands such as
`/new`, `/compact`, `/help`, and `/sessions` remain cc-connect-managed.

cc-connect local commands are prompt-backed. Direct OpenCode TUI passthrough
should be added in the cc-connect OpenCode agent only after the collision policy
is explicit and tested.

## Schema and type anchors

- Main schema URL: `https://opencode.ai/config.json`.
- TUI schema URL: `https://opencode.ai/tui.json`.
- Config type: JSON or JSONC, with merged global and project config layers.
- cc-connect type anchor: `../cc-connect/agent/opencode/opencode.go`.
- Test rule: generated `opencode.json` must validate against the schema URL and
  then survive an OpenCode startup smoke test.

## Provider and authentication notes

- OpenCode uses `/connect` to store provider credentials under
  `~/.local/share/opencode/auth.json`. Cloud should materialize that credential
  file from Secret data or pass provider env only through a controlled adapter.
- `opencode.json` owns the provider catalog. Custom OpenAI-compatible providers
  use `provider.<id>.npm = "@ai-sdk/openai-compatible"`, `options.baseURL`,
  optional headers/API key, and a `models` map.
- If a provider/model uses `/v1/responses`, OpenCode docs direct users to the
  AI SDK OpenAI package rather than the OpenAI-compatible chat-completions
  package. The adapter must record this distinction in provider metadata.
- Subscription or OAuth flows are provider-specific and interactive through
  `/connect`; they are not a universal bootstrap method for disposable runner
  containers.
- Keep provider config and provider credentials separate: `opencode.json`
  describes available providers/models, while raw keys belong in Secret data or
  a generated auth file with `0600` mode.

## Security, audit, cost, network, and tools

- Permissions: `permission` can be a global action or per-tool object. Actions
  are `allow`, `ask`, and `deny`; last matching granular rule wins.
- Defaults: OpenCode is permissive by default; Cloud should generate an explicit
  fail-closed baseline instead of relying on defaults.
- Tool keys: `read`, `edit`, `glob`, `grep`, `bash`, `task`, `skill`, `lsp`,
  `question`, `webfetch`, `websearch`, `external_directory`, and `doom_loop`.
- Secret files: `.env` and `.env.*` are denied by default while `.env.example`
  remains allowed; keep that behavior in generated config.
- Network: control `webfetch`, `websearch`, remote MCP URLs, provider base URLs,
  and remote organization defaults through local override config.
- MCP: enable only named servers; remote MCP adds context and cost, so use
  explicit `enabled` and tool allow/deny config.
- Cost/audit: `small_model`, provider `timeout`/`chunkTimeout`, MCP tool count,
  compaction, snapshot disk usage, and context-heavy MCP servers must be
  auditable.
- Logs: collect cc-connect daemon logs, OpenCode session state, model cache
  files, and schema validation output.

## cc-connect mapping

The local fork exposes `core.RegisterAgent("opencode", New)`. Important options
from `../cc-connect/agent/opencode/opencode.go`:

- `work_dir`
- `model`
- `mode`: `default` or `yolo`
- `cmd`
- cc-connect model cache under `data_dir/projects/*.opencode-models.json`

The fork drives OpenCode with `opencode run --format json` and keeps the
session id for follow-up turns.

Example generated project shape:

```toml
[[projects]]
name = "agent-id"

[projects.agent]
type = "opencode"

[projects.agent.options]
work_dir = "/workspace"

[[projects.platforms]]
type = "shadowob"
```

## Capability notes

- Models: write `model` and provider config in `opencode.json`, or use provider
  refs in cc-connect when the model list is managed centrally.
- Skills: materialize `.opencode/skills` first; optionally also emit
  `.agents/skills` if a workflow must be shared with Codex.
- MCP: write the OpenCode `mcp` object, not OpenClaw `mcp`.
- Cron/routine: OpenCode does not provide the same native cron surface as
  OpenClaw or Hermes in the researched docs; Cloud should own scheduling for
  phase 1.
- Hooks: prefer OpenCode plugins for deterministic lifecycle behavior.
- Subagents: use OpenCode `agent` and command `subtask` config instead of
  OpenClaw multi-agent routing.
- Logs: collect cc-connect logs and OpenCode native session/log locations
  separately. Implementation should run a container smoke test to pin the exact
  current OpenCode log directory.

## Migration implications

- OpenClaw, ACPX, and `@shadowob/openclaw-shadowob` are not used by the
  OpenCode runner image.
- The image embeds the cc-connect fork plus the OpenCode CLI.
- Generate `opencode.json`, `.opencode/agents`, `.opencode/commands`,
  `.opencode/skills`, and `.opencode/plugins` as native artifacts.
- Keep OpenCode model/provider config separate from cc-connect provider refs so
  both CLI-native auth and Cloud-managed provider secrets can work.

## Adapter and smoke tests

Unit tests:

- `opencode.json` validates against `https://opencode.ai/config.json`.
- Generated permissions include explicit bash/edit/read/webfetch/websearch,
  skill, task, external directory, and doom-loop behavior.
- `.env` read denies and external directory restrictions are preserved.
- cc-connect TOML contains `type = "opencode"` and no OpenClaw artifacts.
- MCP entries use local/remote type-specific fields and do not enable all remote
  organization defaults implicitly.

Container smoke:

- `cc-connect --version` and `opencode --version` work.
- `opencode.json`, `.opencode/agents`, `.opencode/commands`, and
  `.opencode/skills` exist and validate.
- Start cc-connect with `type = "opencode"` and inspect daemon logs.
- Assert no `/etc/openclaw/config.json` exists.
- Check that the generated config blocks `git push` or another representative
  denied command when Cloud policy says so.

## Sources

- Config: https://opencode.ai/docs/config
- Providers: https://dev.opencode.ai/docs/providers/
- Permissions: https://opencode.ai/docs/permissions
- TUI slash commands: https://opencode.ai/docs/tui/
- Agents: https://opencode.ai/docs/agents
- Commands: https://opencode.ai/docs/commands
- MCP servers: https://opencode.ai/docs/mcp-servers
- Skills: https://opencode.ai/docs/skills
- Plugins: https://opencode.ai/docs/plugins
- OpenCode repository: https://github.com/opencode-ai/opencode
- cc-connect fork source: https://github.com/buggyblues/cc-connect
