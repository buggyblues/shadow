# Claude Code Runner Research

Research date: 2026-05-14.

## Target role

`claude-code` should run through the ShadowOB `cc-connect` fork, not through
OpenClaw gateway or ACPX. The runner process should be:

```text
cc-connect fork -> agent type "claudecode" -> claude CLI
```

Shadow messaging, DMs, slash commands, attachments, and typing/progress should
come from the cc-connect ShadowOB platform.

## Current repository state

The previous `apps/cloud` adapter declared:

```text
openclaw gateway -> ACPX plugin -> claude CLI process
```

The current adapter and Dockerfile now use the cc-connect fork path. The runner
package emits `cc-connect-config.toml`, Claude settings, MCP config, and
ShadowOB skill files through `runtime-files.json`.

## Native Claude Code configuration

Claude Code has its own hierarchy and should not be flattened into OpenClaw
agent defaults:

| Concern | Native Claude Code surface |
| --- | --- |
| Settings | `~/.claude/settings.json`, project `.claude/settings.json`, local `.claude/settings.local.json`, managed settings. |
| Models | `model`, `availableModels`, `modelOverrides`, `effortLevel`, `ANTHROPIC_MODEL`, provider envs. |
| Permissions | `permissions.allow`, `permissions.ask`, `permissions.deny`, permission modes, managed restrictions. |
| Memory/context | `CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md`, managed `claudeMd`. |
| MCP | User/local state in `~/.claude.json`; project MCP servers in `.mcp.json`; managed MCP policy. |
| Skills and slash commands | `.claude/skills/<name>/SKILL.md`; legacy `.claude/commands/*.md` still works and is treated like skills. |
| Hooks | `hooks` in settings, plus hooks from skills, subagents, and plugins. |
| Subagents | `~/.claude/agents/` and `.claude/agents/`; settings can run the main thread as a named subagent. |
| Logs and telemetry | Claude Code monitoring/usage and OpenTelemetry settings; session retention via `cleanupPeriodDays`, `CLAUDE_CODE_SKIP_PROMPT_HISTORY`, and non-interactive session persistence flags. |

## Schema and type anchors

- Settings schema URL:
  `https://json.schemastore.org/claude-code-settings.json`.
- Claude Code docs call this the official JSON schema, but warn that it can lag
  the newest CLI settings. Treat docs and CLI behavior as authoritative when the
  schema is behind.
- Global config `~/.claude.json` is not the same schema as
  `settings.json`; docs say adding those keys to `settings.json` is invalid.
- MCP project config uses `.mcp.json`; subagents use Markdown files under
  `.claude/agents/` with YAML frontmatter.
- cc-connect type anchor: `../cc-connect/agent/claudecode/claudecode.go`.

## Provider and authentication notes

- Headless Cloud runners should prefer API/provider secrets over subscription
  login. `ANTHROPIC_API_KEY` forces API-key usage in non-interactive mode and
  overrides Claude subscription auth when present.
- Claude subscription login can be useful locally, but a clean Kubernetes
  container should not depend on a browser-backed Claude Pro/Max/Team session.
- Custom gateway routing is not the same as model selection:
  `ANTHROPIC_BASE_URL` changes the request destination, while `model`,
  `ANTHROPIC_DEFAULT_*_MODEL`, `CLAUDE_CODE_SUBAGENT_MODEL`, or
  `ANTHROPIC_CUSTOM_MODEL_OPTION` determine model IDs.
- For LLM gateways, enable model discovery with
  `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1` when the gateway exposes
  `/v1/models`; otherwise emit `ANTHROPIC_CUSTOM_MODEL_OPTION` and companion
  display metadata for the selected Cloud model.
- Bedrock, Vertex AI, Foundry, and Claude Platform on AWS have provider-specific
  envs and model identifiers. The adapter must keep those as Claude-native env
  or settings values, never as OpenClaw `models.providers`.

## Security, audit, cost, network, and tools

- Permissions: `permissions.allow`, `permissions.ask`, `permissions.deny`,
  `permissions.defaultMode`, and managed `allowManagedPermissionRulesOnly`.
  Deny rules are evaluated before ask/allow.
- Bypass control: `disableBypassPermissionsMode = "disable"` should be the
  default for managed Cloud runners unless the deployment explicitly enables
  bypass.
- Sandbox: `sandbox.enabled`, `failIfUnavailable`, filesystem allow/deny read
  and write lists, and network allow/deny domains.
- Hooks: `allowManagedHooksOnly`, `allowedHttpHookUrls`, and
  `httpHookAllowedEnvVars` are required when HTTP hooks are generated.
- MCP: managed allow/deny MCP settings must be represented separately from
  `.mcp.json`.
- Tool surface: Claude permission rules cover tool names such as `Bash`,
  `Read`, `Edit`, `WebFetch`, MCP tools, and Agent rules.
- Cost/audit: model, `maxContextTokens`, skill listing budgets, cleanup period,
  and OpenTelemetry env/settings should be generated when Cloud audit is
  enabled.
- Logs: collect cc-connect daemon logs plus Claude Code monitoring/usage output
  and transcript retention state.

## cc-connect mapping

The local fork exposes `core.RegisterAgent("claudecode", New)`. Important
options from `../cc-connect/agent/claudecode/claudecode.go`:

- `work_dir`
- `cli_path`
- `model`
- `reasoning_effort`
- `mode`: `default`, `acceptEdits`, `plan`, `auto`, `bypassPermissions`
- `allowed_tools` and `disallowed_tools`
- `max_context_tokens`
- `router_url` and `router_api_key`
- `system_prompt`
- `env`
- `run_as_user` and `run_as_env`

The Cloud runner package should generate a `cc-connect` project like:

```toml
[[projects]]
name = "agent-id"

[projects.agent]
type = "claudecode"

[projects.agent.options]
work_dir = "/workspace"

[[projects.platforms]]
type = "shadowob"
```

Provider secrets should be passed through provider refs or environment files,
not through OpenClaw `models.providers`.

## Capability notes

- Models: map Cloud model preferences to Claude `model` and optional
  `availableModels`/provider envs.
- Skills/slash commands: materialize `.claude/skills` and optionally legacy
  `.claude/commands` only for compatibility.
- MCP: write `.mcp.json` for project-scoped MCP and avoid relying on
  `~/.claude.json` in immutable images.
- Cron/routine: Claude Code has scheduled prompt support in its automation
  docs, but Cloud phase 1 should treat scheduling as a Cloud/Shadow concern
  unless explicitly mounting a Claude-native schedule store.
- Hooks: write Claude settings `hooks`, not OpenClaw `hooks`.
- Subagents: materialize `.claude/agents` and any preloaded skill references.
- Logs: collect both cc-connect daemon logs and Claude Code native telemetry or
  transcript artifacts when enabled.

## Migration implications

- OpenClaw and ACPX have been removed from the Claude runner image path.
- The image builds the cc-connect fork binary and installs the Claude CLI.
- Generate Claude config files in the workspace/home directory before starting
  cc-connect.
- Keep `run_as_user` available for OS-user isolation; the fork currently
  supports it for Claude Code.

## Adapter and smoke tests

Unit tests:

- `settings.json` validates against the schema URL when only schema-known fields
  are emitted.
- Managed-only settings are not written into project settings.
- Permission deny/ask/allow, sandbox filesystem, sandbox network, HTTP hook URL
  allowlists, MCP restrictions, and `disableBypassPermissionsMode` are mapped.
- cc-connect TOML contains `type = "claudecode"` and no OpenClaw artifacts.
- Secret env vars are kept in secret data or per-runtime secret files.

Container smoke:

- `cc-connect --version` and `claude --version` work.
- Generated `.claude/settings.json` and `.mcp.json` exist in the expected
  workspace/home paths.
- Container starts cc-connect with the ShadowOB platform block.
- A denied read target such as `.env` remains denied in generated config.
- Logs include cc-connect startup but no raw Shadow token or provider key.

## Sources

- Settings: https://code.claude.com/docs/en/settings
- Model configuration: https://code.claude.com/docs/en/model-config
- Environment variables: https://code.claude.com/docs/en/env-vars
- Permissions: https://code.claude.com/docs/en/permissions
- Sandboxing: https://code.claude.com/docs/en/sandboxing
- Skills and custom commands:
  https://code.claude.com/docs/en/skills
- MCP: https://code.claude.com/docs/en/mcp
- Hooks: https://code.claude.com/docs/en/hooks
- Subagents: https://code.claude.com/docs/en/sub-agents
- Monitoring: https://code.claude.com/docs/en/monitoring-usage
- cc-connect fork source: https://github.com/buggyblues/cc-connect
