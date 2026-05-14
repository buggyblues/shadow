# Cloud Runner Research Index

Research date: 2026-05-14.

This document is the cross-runner index for the `apps/cloud` runtime refactor.
It separates runner families by their native process and configuration boundary
so OpenClaw remains a first-class adapter without becoming the implicit contract
for every other runner.

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

`apps/cloud/src/runtimes/*` now owns runtime-specific package builders and
container layout. `apps/cloud/src/infra/runtime-package.ts` only orchestrates
plugin extension collection, env/secret splitting, and dispatch to the selected
runtime adapter. The OpenClaw adapter emits `config.json`; Claude Code, Codex,
OpenCode, and Gemini emit `cc-connect-config.toml` plus native CLI config files
through `runtime-files.json`; Hermes emits native Hermes files through the same
runner file materialization contract.

The remaining refactor target is to keep moving plugin APIs away from
OpenClaw-shaped fragments wherever the capability is not OpenClaw-specific. The
runtime package layer already consumes runner-neutral ShadowOB runtime
extensions for cc-connect and Hermes.

## Runtime filesystem baseline

All phase-1 runner images now run as the non-root `shadow` user with
`HOME=/home/shadow`. Runtime state and generated home-scoped config must use
that home:

| Runtime family | Home/state baseline | Compatibility |
| --- | --- | --- |
| OpenClaw | `/home/shadow/.openclaw` | `/home/openclaw` is a compatibility symlink only. |
| cc-connect based | `/home/shadow/.cc-connect` plus the native CLI home config, such as `/home/shadow/.codex` or `/home/shadow/.gemini` | Legacy plugin credential paths should migrate to `/home/shadow`; the symlink exists only for old images/configs. |
| Hermes | `/home/shadow/.hermes` | `/home/openclaw` is not a first-class Hermes path. |

ShadowOB assets are installed in two explicit places:

- CLI and helper binaries: `shadowob` and `shadowob-connector` on `PATH`.
- Runner skills: `/workspace/.agents/skills/shadowob/SKILL.md`, plus native
  homes where the CLI supports a skill directory, such as
  `/home/shadow/.codex/skills/shadowob/SKILL.md`,
  `/home/shadow/.gemini/skills/shadowob/SKILL.md`, and
  `/home/shadow/.hermes/skills/shadowob/SKILL.md`.
- Slash command index: `/etc/shadowob/slash-commands.json` exists for every
  runner. Each runner owns its own command catalog under
  `apps/cloud/src/runtimes/slash-commands/`; common packaging only serializes
  the selected runner's catalog. Runtime/plugin slash command artifacts are
  additive sources. The runner catalog is loaded first, plugin artifacts are
  loaded afterward in runtime-extension order, and duplicate command names use
  first-wins semantics rather than overwriting an earlier command.

## Slash command catalogs

Slash commands are runner-specific. Do not put runtime command lists in shared
package code.

| Runtime | Catalog source | Current Cloud injection |
| --- | --- | --- |
| OpenClaw | https://docs.openclaw.ai/tools/slash-commands | Injects the official OpenClaw command list with `dispatch=passthrough`, so OpenClaw receives the original `/...` message. |
| Claude Code | https://code.claude.com/docs/en/commands | Injects non-conflicting Claude Code command names into cc-connect's ShadowOB `slash_commands_path`; cc-connect-owned names such as `/model`, `/status`, `/help`, `/config`, and `/compact` remain cc-connect management commands. |
| Codex | https://developers.openai.com/codex/cli/slash-commands | Injects non-conflicting Codex command names such as `/permissions`, `/init`, `/review`, `/mcp`, `/agent`, `/apps`, `/plugins`, `/logout`, `/clear`, `/plan`, and `/statusline`; cc-connect owns `/new`, `/model`, `/status`, `/diff`, `/help`, `/stop`, `/ps`, and `/compact`. |
| OpenCode | https://opencode.ai/docs/tui/ | Injects non-conflicting OpenCode commands such as `/connect`, `/details`, `/editor`, `/export`, `/init`, `/models`, `/redo`, `/share`, `/themes`, `/thinking`, `/undo`, and `/unshare`; cc-connect owns session/control names that overlap. |
| Gemini CLI | https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/commands.md | Injects non-conflicting Gemini commands such as `/about`, `/agents`, `/auth`, `/bug`, `/chat`, `/hooks`, `/ide`, `/init`, `/mcp`, `/permissions`, `/plan`, `/settings`, `/stats`, `/tools`, and `/vim`; cc-connect owns overlapping management commands. |
| Hermes | https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/slash-commands.md | Injects Hermes messaging commands such as `/model`, `/goal`, `/queue`, `/steer`, `/background`, `/approve`, `/deny`, and `/commands` through the Hermes ShadowOB plugin path. Hermes documents `/cron` as CLI-only, so Cloud should not expose it in Shadow until the Hermes gateway supports it safely. |

The cc-connect fork also publishes its own universal bot commands from the
engine (`/new`, `/list`, `/switch`, `/model`, `/reasoning`, `/mode`, `/cron`,
`/provider`, `/stop`, `/help`, and related aliases). Native CLI command names
that collide with those are intentionally excluded from the local per-runner
catalog to avoid stealing cc-connect control flow.

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
| Codex | TOML | Generated schema source in the official repo: `https://raw.githubusercontent.com/openai/codex/main/codex-rs/core/config.schema.json`; docs source is the Codex config reference. | Codex config reference key/type table plus generated schema; generated TOML must parse through Codex. |
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

## Provider and authentication matrix

The model/provider adapter must be runner-native. Do not translate every
provider into OpenClaw `models.providers`, and do not assume all CLIs can use a
headless subscription login.

| Runtime | Headless-safe auth | Subscription/OAuth auth | Custom provider/gateway support | Adapter requirement |
| --- | --- | --- | --- | --- |
| OpenClaw | API keys through OpenClaw provider config and env-backed secrets. | Depends on provider/plugin; not the baseline for non-OpenClaw runners. | OpenClaw provider/failover config. | Keep OpenClaw provider config only in the OpenClaw adapter. |
| Claude Code | `ANTHROPIC_API_KEY`, Bedrock/Vertex/Foundry envs, or gateway token envs. | Claude Pro/Max/Team/Enterprise login is interactive/user-account based and should not be assumed in a fresh container. | `ANTHROPIC_BASE_URL` routes requests; gateway model discovery and `ANTHROPIC_CUSTOM_MODEL_OPTION` handle custom model IDs. | Generate Claude `env`/settings and cc-connect options; do not write OpenClaw model config. |
| Codex | API key auth with `OPENAI_API_KEY` plus `preferred_auth_method = "apikey"` when needed. Custom providers use `[model_providers.<id>]`, `base_url`, `env_key`, optional auth command, and Responses API `wire_api`. | ChatGPT Plus/Pro/Business/Edu/Enterprise login can work interactively but is not suitable as the only Kubernetes bootstrap path. | Built-in `openai`, local `ollama`/`lmstudio`, and custom provider tables. | Generate `$CODEX_HOME/config.toml` with provider/profile tables and keep `auth.json` out of ConfigMaps. |
| OpenCode | Provider API keys stored by `/connect` in `~/.local/share/opencode/auth.json`, or `provider.<id>.options.apiKey` only when Cloud intentionally materializes a secret file. | Provider-specific OAuth flows may exist through `/connect`; not a generic headless default. | `provider.<id>` supports custom AI SDK packages, `baseURL`, headers, and model catalogs, including OpenAI-compatible APIs. | Generate `opencode.json` provider blocks and mount credentials separately. |
| Gemini CLI | `GEMINI_API_KEY` for AI Studio, `GOOGLE_API_KEY` for Vertex API-key mode, or Vertex ADC/service-account material. | Google login is recommended for Pro/Ultra subscriptions but needs a browser/localhost callback, so it is not a default container bootstrap. | Vertex AI project/location and API-key/ADC modes; no generic OpenAI-compatible provider in Gemini CLI settings. | Generate `.gemini/settings.json` plus explicit env requirements; unset conflicting API-key vars for ADC. |
| Hermes | `.env` keys such as `OPENROUTER_API_KEY`, `AI_GATEWAY_API_KEY`, provider-specific keys, or configured OpenAI-compatible `model.base_url`. | `hermes model` supports Nous Portal OAuth/subscription, Codex ChatGPT OAuth, GitHub Copilot OAuth, and Claude OAuth paths. | Hermes provider routing/fallback, OpenRouter, AI Gateway, and OpenAI-compatible endpoints. | Generate `~/.hermes/config.yaml` and `~/.hermes/.env` natively; keep gateway/platform auth separate from model auth. |

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

- Runtime adapters now declare a runtime family and the package generator emits
  multiple native config files where needed.
- `buildOpenClawConfig` is used only by the OpenClaw runtime package path.
- The cc-connect runner images build the ShadowOB fork and narrow the exposed
  agent set to `claudecode`, `codex`, `opencode`, and `gemini`.
- Per-runtime native config files are generated instead of translating
  non-OpenClaw runtimes into OpenClaw `agents.defaults`.
- Logs and session paths stay native; Cloud normalizes only collection labels.
- `hermes` is now present in the runtime schema, loader, runner package, and
  image directory.

## Adapter unit tests

The multi-runner adapter tests cover:

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

## Smoke tests

The current smoke tests inspect generated runtime packages, parsed native
configs, secret separation, runtime file materialization inputs, and workspace
writes for every runner. Full Docker image build-and-run smoke should still be
run before publishing new image tags.

Target container smoke assertions:

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
- Claude Code model/env docs:
  https://code.claude.com/docs/en/model-config,
  https://code.claude.com/docs/en/env-vars
- Codex docs: https://developers.openai.com/codex/config-basic
- Codex CLI/config reference:
  https://developers.openai.com/codex/cli,
  https://developers.openai.com/codex/config-reference
- OpenCode docs: https://opencode.ai/docs/config
- OpenCode providers: https://dev.opencode.ai/docs/providers/
- Gemini CLI docs:
  https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md,
  https://google-gemini.github.io/gemini-cli/docs/get-started/authentication.html
- Hermes Agent docs:
  https://hermes-agent.nousresearch.com/docs/user-guide/configuration,
  https://hermes-agent.nousresearch.com/docs/integrations/providers
- cc-connect fork source: https://github.com/buggyblues/cc-connect
