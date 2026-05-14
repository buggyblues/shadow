# Codex Runner Research

Research date: 2026-05-14.

## Target role

`codex` should run through the ShadowOB `cc-connect` fork, not through OpenClaw
gateway or ACPX. The runner process should be:

```text
cc-connect fork -> agent type "codex" -> codex CLI
```

Shadow messaging should come from the cc-connect ShadowOB platform. Codex should
use its own config, skills, MCP, hooks, subagents, sessions, and logs.

## Current repository state

The Codex adapter and image now use the cc-connect fork path. The runtime
package emits `cc-connect-config.toml`, `$CODEX_HOME/config.toml`, project
`.codex/config.toml`, workspace bootstrap files, and ShadowOB skill files
through `runtime-files.json`.

## Native Codex configuration

Codex reads layered TOML configuration:

| Concern | Native Codex surface |
| --- | --- |
| User config | `$CODEX_HOME/config.toml`, defaulting to `~/.codex/config.toml`. |
| Project config | `.codex/config.toml` in trusted projects. |
| System config | `/etc/codex/config.toml` on Unix. |
| Model | `model`, profiles, `model_provider`, model catalogs. |
| Reasoning | `model_reasoning_effort`, model-specific settings. |
| Approvals and sandbox | `approval_policy`, `sandbox_mode`, permission profiles. |
| MCP | `[mcp_servers.<name>]` with stdio or HTTP settings, enabled/disabled tools, timeouts. |
| Skills | `.agents/skills` in repo/user/admin/system locations. |
| Instructions | `AGENTS.md` hierarchy and optional config instructions. |
| Hooks | Codex hooks config, loaded from trusted config layers. |
| Subagents | Codex subagent roles in config with agent instruction files. |
| Slash commands | Built-in CLI slash commands such as `/model`, `/mcp`, `/permissions`, `/agent`, `/review`, and `/status`. |
| Automation | Codex app automations exist, but they are app-level background jobs rather than a simple CLI runner cron store. |
| Logs and sessions | `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl`, `history.jsonl`, `auth.json`, local state/cache files. |

## Shadow slash command bridge

The runner package always materializes `/etc/shadowob/slash-commands.json` so
Shadow can load a stable command index. The Codex runner owns its catalog in
`apps/cloud/src/runtimes/slash-commands/codex.ts`; this is intentionally not a
common runtime artifact.

Official Codex CLI commands researched from the Codex docs include
`/permissions`, `/sandbox-add-read-dir`, `/agent`, `/apps`, `/plugins`,
`/clear`, `/compact`, `/copy`, `/diff`, `/exit`, `/experimental`, `/feedback`,
`/init`, `/logout`, `/mcp`, `/mention`, `/model`, `/fast`, `/plan`, `/goal`,
`/personality`, `/ps`, `/stop`, `/fork`, `/side`, `/resume`, `/new`, `/quit`,
`/review`, `/status`, `/debug-config`, `/statusline`, `/title`, and `/keymap`.

Current Cloud injection registers only names that do not collide with
cc-connect's own universal control commands:

- Injected local Codex catalog: `/permissions`, `/sandbox-add-read-dir`,
  `/agent`, `/apps`, `/plugins`, `/clear`, `/copy`, `/exit`, `/experimental`,
  `/feedback`, `/init`, `/logout`, `/mcp`, `/mention`, `/fast`, `/plan`,
  `/goal`, `/personality`, `/fork`, `/side`, `/resume`, `/review`,
  `/debug-config`, `/statusline`, `/title`, and `/keymap`.
- Left to cc-connect control flow: `/new`, `/compact`, `/status`, `/diff`,
  `/model`, `/ps`, `/stop`, and overlapping management/help commands.

cc-connect local commands are prompt-backed, not full Codex TUI passthrough.
Adding true native passthrough/discovery belongs in the cc-connect Codex agent,
where it can distinguish cc-connect management commands from Codex CLI commands.

## Schema and type anchors

- Generated JSON Schema source:
  `https://raw.githubusercontent.com/openai/codex/main/codex-rs/core/config.schema.json`.
  Codex config is TOML on disk, but this schema is the official repo-generated
  shape for config keys.
- Official type source: Codex Config Reference key/type table at
  `https://developers.openai.com/codex/config-reference`.
- Config layers: `$CODEX_HOME/config.toml`, trusted project `.codex/config.toml`,
  and `/etc/codex/config.toml`.
- Test rule: generated TOML must parse as TOML and must be accepted by the Codex
  CLI in a container smoke test; do not use a handwritten JSON schema as source
  of truth.
- cc-connect type anchor: `../cc-connect/agent/codex/codex.go`.

## Provider and authentication notes

- Codex CLI supports first-run authentication with either a ChatGPT account or
  an API key. In Cloud, the reliable headless path is API-key or custom-provider
  auth, not an interactive ChatGPT subscription login.
- For OpenAI API-key mode, set `OPENAI_API_KEY` through Secret data and use
  `preferred_auth_method = "apikey"` when the runner profile could otherwise
  prefer stored ChatGPT auth.
- Custom providers belong in `[model_providers.<id>]`. The official config
  reference defines `base_url`, `env_key`, `query_params`, static/env headers,
  command-backed bearer-token auth, `requires_openai_auth`, retry/timeouts, and
  `wire_api`.
- Current Codex config reference lists `responses` as the supported
  `wire_api`, so custom OpenAI-compatible gateways must support the Responses
  API or be fronted by a gateway that translates correctly.
- Built-in local providers such as `ollama`/`lmstudio` are provider IDs, but
  remote Cloud runners must not silently point them at localhost unless the
  container actually runs that model service.

## Security, audit, cost, network, and tools

- Permissions: `approval_policy`, granular approval policy, `sandbox_mode`,
  `default_permissions`, and named `[permissions.<name>]` tables.
- Filesystem: named permission profiles can grant `read`, `write`, or `none` to
  special roots such as `:project_roots` and explicit paths/globs.
- Network: `sandbox_workspace_write.network_access`, permission profile network
  tables, web search mode (`cached`, `live`, `disabled`), and MCP remote servers.
- Secrets: `shell_environment_policy` must default to a restrictive inheritance
  mode and keep KEY/SECRET/TOKEN filtering unless intentionally overridden.
- Tools: `features.shell_tool`, MCP server tool include/deny config, skills
  config, subagent config, and rules should be emitted as native Codex config.
- Cost/audit: `model`, `model_reasoning_effort`, `service_tier`, web search
  mode, and tool-output/token-related telemetry must be tracked.
- Observability: `[otel]` supports logs, metrics, traces, redacted prompts by
  default, and event metadata for API requests, SSE events, tool decisions, and
  tool results.

## cc-connect mapping

The local fork exposes `core.RegisterAgent("codex", New)`. Important options
from `../cc-connect/agent/codex/codex.go`:

- `work_dir`
- `model`
- `reasoning_effort`: `low`, `medium`, `high`, `xhigh`
- `mode`: `suggest`, `auto-edit`, `full-auto`, `yolo`
- `backend`: `exec` or `app_server`
- `app_server_url`
- `codex_home`
- `cli_path`

The default path drives `codex exec --json`. The app-server backend can be kept
as an advanced option, but the phase-1 runner should start with the simpler
`exec` path unless a deployment explicitly requests app-server mode.

Example generated project shape:

```toml
[[projects]]
name = "agent-id"

[projects.agent]
type = "codex"

[projects.agent.options]
work_dir = "/workspace"
codex_home = "/home/shadow/.codex"

[[projects.platforms]]
type = "shadowob"
```

## Capability notes

- Models: map Cloud model preferences to Codex `model`, profile, and optional
  provider config. Avoid writing OpenClaw `agents.defaults.model`.
- Skills: materialize `.agents/skills` for repo-scoped workflows and
  `$CODEX_HOME/skills` only if the runner owns the whole home directory.
- MCP: generate `[mcp_servers.*]` TOML tables.
- Cron/routine: Codex app automations are not the same as CLI-local cron; Cloud
  should own phase-1 schedules unless later integrating the Codex app
  automation APIs.
- Hooks: write Codex hook config in trusted project or user config.
- Subagents: generate Codex agent roles and instruction files under `.codex`
  only when `features.multi_agent` or equivalent config is enabled.
- Logs: preserve Codex rollout JSONL paths and collect cc-connect daemon logs
  separately.

## Migration implications

- OpenClaw, ACPX, and `@shadowob/openclaw-shadowob` have been removed from the
  Codex runner image path.
- The image builds the cc-connect fork binary and installs the Codex CLI.
- Generate `$CODEX_HOME/config.toml`, project `.codex/config.toml`,
  `AGENTS.md`, `.agents/skills`, and MCP config as native artifacts.
- Keep current redaction patterns for container logs, but do not assume
  `/var/log/openclaw` for the Codex runner.

## Adapter and smoke tests

Unit tests:

- Generated TOML parses and contains expected scalar/table types for
  `approval_policy`, `sandbox_mode`, `default_permissions`, `[permissions.*]`,
  `[mcp_servers.*]`, `[features]`, and `[otel]`.
- cc-connect TOML contains `type = "codex"` and no OpenClaw artifacts.
- Permission mapping keeps network disabled by default in workspace-write mode.
- `shell_environment_policy` excludes secrets unless Cloud explicitly opts in.
- OTel config never exports raw prompts unless audit policy asks for it.

Container smoke:

- `cc-connect --version` and `codex --version` work.
- `$CODEX_HOME/config.toml`, project `.codex/config.toml`, `AGENTS.md`, and
  `.agents/skills` are materialized.
- Start cc-connect with `type = "codex"` and inspect logs/session paths.
- Assert no `/etc/openclaw/config.json` exists for this runner.
- Run a no-network or read-only parse/start mode to confirm config loads before
  any provider call.

## Sources

- CLI auth/setup: https://developers.openai.com/codex/cli
- Config basics: https://developers.openai.com/codex/config-basic
- Advanced config: https://developers.openai.com/codex/config-advanced
- Config reference: https://developers.openai.com/codex/config-reference
- Generated config schema:
  https://raw.githubusercontent.com/openai/codex/main/codex-rs/core/config.schema.json
- Agent approvals and security:
  https://developers.openai.com/codex/agent-approvals-security
- MCP: https://developers.openai.com/codex/mcp
- Skills: https://developers.openai.com/codex/skills
- Hooks: https://developers.openai.com/codex/hooks
- Subagents: https://developers.openai.com/codex/subagents
- CLI slash commands: https://developers.openai.com/codex/cli/slash-commands
- App automations: https://developers.openai.com/codex/app/automations
- Codex CLI repository: https://github.com/openai/codex
- cc-connect fork source: https://github.com/buggyblues/cc-connect
