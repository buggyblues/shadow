# Cloud Runner Research Index

Research date: 2026-05-14.

This document is the cross-runner index for the next `apps/cloud` runtime
refactor. It intentionally separates the current implementation from the target
runner contract, because the current code still treats OpenClaw as the implicit
configuration and process boundary for every non-OpenClaw runtime.

## Target runner set

Phase 1 keeps only these runners:

| Runtime | Target process boundary | Shadow bridge | Per-runner notes |
| --- | --- | --- | --- |
| `openclaw` | Native OpenClaw gateway | `@shadowob/openclaw-shadowob` plugin | Remains a first-class OpenClaw adapter. |
| `claude-code` | `cc-connect` fork -> Claude Code CLI | `cc-connect` ShadowOB platform | No OpenClaw gateway or ACPX in this path. |
| `codex` | `cc-connect` fork -> Codex CLI | `cc-connect` ShadowOB platform | No OpenClaw gateway or ACPX in this path. |
| `opencode` | `cc-connect` fork -> OpenCode CLI | `cc-connect` ShadowOB platform | No OpenClaw gateway or ACPX in this path. |
| `gemini` | `cc-connect` fork -> Gemini CLI | `cc-connect` ShadowOB platform | No OpenClaw gateway or ACPX in this path. |
| `hermes` | Native Hermes gateway | ShadowOB Hermes platform plugin | New runner; not a `cc-connect` target in phase 1. |

Everything else should be removed from Cloud's first-phase runtime surface. The
`cc-connect` fork still contains more agents, but the Cloud build should produce
a narrowed binary/image that excludes non-phase-1 agents where build tags allow
it.

## Current state in this repository

The current `apps/cloud/src/runtimes/*` adapters still document and generate an
`openclaw gateway -> ACPX plugin -> CLI harness process` topology for
`claude-code`, `codex`, `opencode`, and `gemini`. The shared config builder is
`apps/cloud/src/config/openclaw-builder.ts`, and
`apps/cloud/src/infra/runtime-package.ts` always emits `/etc/openclaw/config.json`.

That design is the main refactor target. OpenClaw should become one runtime
adapter among several, not the only config output format.

## Adapter boundary required by the refactor

The runtime adapter should emit native runner artifacts instead of mutating one
OpenClaw config tree for every runtime:

| Runtime family | Primary generated config | Native config surfaces to preserve |
| --- | --- | --- |
| OpenClaw | OpenClaw config JSON/JSON5/YAML | `agents`, `models`, `skills`, `mcp`, `cron`, `hooks`, `channels`, `plugins`, `gateway`. |
| cc-connect based | `cc-connect` `config.toml` plus native CLI config files | `[[projects]]`, `[projects.agent]`, provider refs, ShadowOB platform config, and runtime-specific files such as `.claude/settings.json`, `.codex/config.toml`, `opencode.json`, or `.gemini/settings.json`. |
| Hermes | Hermes `config.yaml`, `.env`, plugin files | `platforms.shadowob`, `plugins.enabled`, providers/models, skills, MCP, cron, hooks, sessions, logs. |

The schema should follow that split. `AgentDeployment.configuration.openclaw`
can remain for the OpenClaw runner, but it should not be the only exit path. Add
runtime-specific configuration sections for at least `claude`, `codex`,
`opencode`, `gemini`, `ccConnect`, and `hermes`, then have each adapter decide
which files and environment variables belong in the runtime package.

## Schema and type anchors

Use these anchors in implementation and tests. Do not invent hand-maintained
schemas when a runtime publishes one.

| Runtime | Config format | Schema URL or source | Type anchor |
| --- | --- | --- | --- |
| OpenClaw | JSON5/YAML-compatible config object | No fixed public schema URL found; official source is `openclaw config schema` and gateway `config.schema.lookup`. | OpenClaw CLI live schema plus Cloud `OpenClawConfig` types. |
| Claude Code | JSON settings | `https://json.schemastore.org/claude-code-settings.json` is documented by Claude Code as its official settings schema, with a lag warning. | Settings docs table, `~/.claude.json` global config, `.mcp.json`, `.claude/agents/*.md`. |
| Codex | TOML | No official JSON Schema URL found; official source is the Codex config reference. | Codex config reference key/type table; generated TOML must parse through Codex. |
| OpenCode | JSON/JSONC | `https://opencode.ai/config.json`; TUI config also uses `https://opencode.ai/tui.json`. | OpenCode config schema and docs for permissions, MCP, agents, commands, skills. |
| Gemini CLI | JSON settings | `https://raw.githubusercontent.com/google-gemini/gemini-cli/main/schemas/settings.schema.json`. | Gemini CLI settings schema plus docs reference. |
| Hermes | YAML | No fixed public JSON Schema URL found; web dashboard exposes `GET /api/config/schema` from `DEFAULT_CONFIG`. | Hermes config docs and runtime-discovered schema endpoint. |
| cc-connect | TOML | No public schema URL found; source of truth is Go config structs in the fork. | `../cc-connect/config/config.go`, agent option structs, and `config.example.toml`. |

Validation expectation:

- JSON/JSONC configs must be validated with the published schema where one
  exists.
- TOML/YAML configs must be parsed and type-checked through the owning runtime
  or source type, not by ad hoc string assertions.
- Runtime adapters must snapshot the generated files in tests so schema drift is
  visible in code review.

## Security and audit dimensions

Every runner adapter must explicitly map these dimensions:

| Dimension | Required adapter output |
| --- | --- |
| Permission mode | Native allow/ask/deny, approval, sandbox, or yolo/bypass settings. |
| Tool surface | Explicit enabled/disabled tools, MCP tool allowlists, skill loading policy, and subagent delegation policy. |
| Filesystem | Workspace root, external directory access, secret path denies, sandbox/bind mount policy, and generated config file permissions. |
| Network | Web fetch/search controls, MCP remote URLs, provider base URLs, domain allow/deny lists where supported. |
| Cost controls | Model selection, small/auxiliary model routing, max turns, context/tool-output summarization, cron frequency, and provider allowlist. |
| Audit and logs | Native runtime logs, cc-connect logs, OpenTelemetry or telemetry toggles, token/event metadata, and log redaction behavior. |
| Secrets | Secret env separation, file credential materialization, allowlisted env passthrough, and proof that generated logs/config maps do not contain raw tokens. |

## Runner documentation

- [OpenClaw runner](./openclaw-runner/RUNNER.md)
- [Claude Code runner](./claude-runner/RUNNER.md)
- [Codex runner](./codex-runner/RUNNER.md)
- [OpenCode runner](./opencode-runner/RUNNER.md)
- [Gemini runner](./gemini-runner/RUNNER.md)
- [Hermes runner](./hermes-runner/RUNNER.md)

## cc-connect fork notes

The Shadow connector package currently pins the fork in
`packages/connector/src/cc-connect-fork.ts`:

- repository: `buggyblues/cc-connect`
- package version: `1.3.3-beta.5`
- pinned ref: `63b5d59`

Local fork research used `../cc-connect`. Important implementation facts:

- The fork has first-class agents named `claudecode`, `codex`, `gemini`, and
  `opencode`.
- Project config uses `[[projects]]`, `[projects.agent] type = "..."`, and
  `[projects.agent.options] work_dir = "..."`.
- Global providers can be restricted by `agent_types`.
- The daemon uses `data_dir` for session state and `CC_LOG_FILE` for rotating
  daemon logs when run as a daemon.
- The fork contains other agents (`cursor`, `devin`, `iflow`, `kimi`, `qoder`,
  etc.); Cloud phase 1 should not expose them.

## Shared migration checklist

- Replace the current `RuntimeAdapter.applyConfig(... OpenClawConfig)` contract
  with a runner package contract that can emit multiple native config files.
- Keep `buildOpenClawConfig` only inside the OpenClaw adapter path.
- Add a cc-connect image/binary build that embeds the ShadowOB platform and only
  exposes `claudecode`, `codex`, `opencode`, and `gemini`.
- Generate per-runtime native config files instead of translating everything into
  OpenClaw `agents.defaults`.
- Keep logs and session paths native; normalize only the Cloud collection labels.
- Add `hermes` to the runtime schema and loader after the Hermes runner package
  contract is implemented.

## Adapter unit tests required

When the multi-runner adapter contract is implemented, add unit tests that cover:

- Each adapter emits the expected config files, env vars, secret refs, workspace
  files, and plugin/runtime resources.
- Non-OpenClaw adapters do not emit `/etc/openclaw/config.json`, OpenClaw ACPX
  config, or OpenClaw plugin fragments.
- OpenClaw emits only native OpenClaw artifacts and still supports existing
  plugin runtime extensions.
- Published JSON schemas validate generated OpenCode, Gemini, and Claude
  settings where applicable.
- TOML/YAML outputs parse successfully and preserve expected scalar/list/table
  types.
- Permission mappings are fail-closed: deny beats allow, yolo/bypass is disabled
  unless explicitly requested, external directory and network access remain
  restricted by default.
- Secrets are split into secret data and never appear in config maps, logs, or
  snapshot fixtures.
- Cost/audit settings are present for model, small/auxiliary model, telemetry,
  context/tool-output budget, cron frequency, and log paths where supported.

## Container smoke tests required

Add smoke tests per runner image after implementation:

| Runner | Smoke assertions |
| --- | --- |
| OpenClaw | Container starts, `openclaw config schema` works, `/etc/openclaw/config.json` is valid, ShadowOB plugin loads, workspace writes behave as configured, logs are redacted. |
| Claude Code | cc-connect starts with `type = "claudecode"`, Claude CLI is on PATH, `.claude/settings.json` validates against the settings schema, no OpenClaw files exist, workspace write and deny rules are honored. |
| Codex | cc-connect starts with `type = "codex"`, Codex CLI is on PATH, `$CODEX_HOME/config.toml` parses, `.codex` and `.agents/skills` are written correctly, logs land outside `/var/log/openclaw`. |
| OpenCode | cc-connect starts with `type = "opencode"`, OpenCode CLI is on PATH, `opencode.json` validates against `https://opencode.ai/config.json`, permission and MCP objects survive startup. |
| Gemini | cc-connect starts with `type = "gemini"`, Gemini CLI is on PATH, `.gemini/settings.json` validates against the official schema, telemetry/log settings resolve, workspace trust can be supplied headlessly. |
| Hermes | `hermes gateway` starts, ShadowOB plugin is enabled, `config.yaml` loads, `GET /api/config/schema` or equivalent schema endpoint is reachable when dashboard/API is enabled, logs and cron dirs are created. |

Smoke tests should inspect the container filesystem and process logs, not only
assert that the process exits successfully.

## Primary sources

- OpenClaw docs index and gateway configuration:
  https://docs.openclaw.ai/llms.txt,
  https://docs.openclaw.ai/gateway/configuration
- Claude Code docs: https://code.claude.com/docs/en/settings
- Codex docs: https://developers.openai.com/codex/config-basic
- OpenCode docs: https://opencode.ai/docs/config
- Gemini CLI docs:
  https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md
- Hermes Agent docs:
  https://hermes-agent.nousresearch.com/docs/user-guide/configuration
- cc-connect fork source: https://github.com/buggyblues/cc-connect
