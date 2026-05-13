# Gemini Runner Research

Research date: 2026-05-14.

## Target role

`gemini` should run through the ShadowOB `cc-connect` fork, not through OpenClaw
gateway or ACPX. The runner process should be:

```text
cc-connect fork -> agent type "gemini" -> gemini CLI
```

Shadow transport should come from the cc-connect ShadowOB platform.

## Current repository state

The current runtime adapter still configures OpenClaw ACPX and an OpenClaw
gateway process. The current runner image should be replaced by a cc-connect
based image for this runtime.

## Native Gemini CLI configuration

Gemini CLI uses JSON settings files with explicit precedence:

| Concern | Native Gemini CLI surface |
| --- | --- |
| System defaults | System-wide defaults file. |
| User settings | `~/.gemini/settings.json`. |
| Project settings | `.gemini/settings.json` in the project root. |
| System overrides | `/etc/gemini-cli/settings.json` on Linux, platform equivalents on Windows/macOS. |
| Context files | `.gemini` project directory and `GEMINI.md` discovery, configurable via context settings. |
| Models/auth | Gemini model config, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, Google auth options. |
| MCP | `mcpServers.<SERVER_NAME>` in settings. |
| Commands | Built-in slash commands and custom commands loaded from `.toml` command files. |
| Hooks | `hooksConfig` plus hook arrays such as `BeforeTool`, `AfterTool`, `BeforeAgent`, `AfterAgent`, `SessionStart`, `SessionEnd`, `BeforeModel`, and `AfterModel`. |
| Extensions | Extension install/load policy and extension settings. |
| Checkpointing | `general.checkpointing.enabled`. |
| Telemetry/logs | `telemetry.enabled`, `telemetry.target`, `telemetry.logPrompts`, `telemetry.outfile`, and debug env/flags. |

The researched Gemini CLI docs do not describe a direct `SKILL.md` skill system
like Codex, Claude Code, OpenCode, or Hermes. Treat skills as Cloud-authored
prompts/context, Gemini extensions, or custom commands until a native Gemini
skill standard exists.

## Schema and type anchors

- Settings schema URL:
  `https://raw.githubusercontent.com/google-gemini/gemini-cli/main/schemas/settings.schema.json`.
- Schema `$id` matches that same raw GitHub URL and uses JSON Schema draft
  2020-12.
- Type surface: JSON `settings.json`, `.gemini` project files, command TOML
  files, context file settings, and extension config.
- cc-connect type anchor: `../cc-connect/agent/gemini/gemini.go`.
- Test rule: generated `.gemini/settings.json` must validate against the schema
  and then survive a Gemini CLI startup smoke test.

## Security, audit, cost, network, and tools

- Approval: `general.defaultApprovalMode` supports `default`, `auto_edit`, and
  `plan`; YOLO can only be enabled via CLI flags, so Cloud must not silently
  encode YOLO in settings.
- Tools: `tools.exclude`, custom tool discovery/call commands, and MCP
  `includeTools`/`excludeTools` define the effective tool surface.
- MCP: `mcpServers.<name>.trust = true` bypasses confirmations for that server;
  do not emit it unless Cloud policy explicitly trusts the server.
- Browser/network: browser agent `allowedDomains`, sensitive action
  confirmation, upload blocking, and max actions per task are the main network
  controls found in the schema.
- Workspace trust: `security.folderTrust.enabled` and
  `GEMINI_CLI_TRUST_THIS_FOLDER` matter for headless containers.
- Secrets: `security.environmentVariableRedaction.*` and
  `advanced.excludedEnvVars` should be generated when audit policy requires
  env filtering.
- Cost/audit: `model.maxSessionTurns`, `model.summarizeToolOutput.*.tokenBudget`,
  telemetry `logPrompts`, telemetry target/outfile, and MCP tool count need
  audit coverage.
- Logs: shell history is under `~/.gemini/tmp/<project_hash>/shell_history`;
  chat/session data is under Gemini's `~/.gemini/tmp/<project_hash>/chats/`.

## cc-connect mapping

The local fork exposes `core.RegisterAgent("gemini", New)`. Important options
from `../cc-connect/agent/gemini/gemini.go`:

- `work_dir`
- `model`
- `mode`: `default`, `auto_edit`, `yolo`, `plan`
- `cmd`
- `timeout_mins`

The fork drives Gemini CLI with prompt mode and stream JSON output. It also knows
how to list sessions from Gemini's native chat storage under
`~/.gemini/tmp/<project_hash>/chats/`.

Example generated project shape:

```toml
[[projects]]
name = "agent-id"

[projects.agent]
type = "gemini"

[projects.agent.options]
work_dir = "/workspace"

[[projects.platforms]]
type = "shadowob"
```

## Capability notes

- Models: map Cloud model preferences to Gemini CLI model selection and
  provider environment variables.
- Skills: no native `SKILL.md` surface was found; use `GEMINI.md`, custom
  commands, and extensions for phase 1.
- MCP: write `mcpServers` in `.gemini/settings.json`.
- Cron/routine: no native CLI cron surface found in the researched config docs;
  Cloud should own scheduling for phase 1.
- Hooks: write `hooksConfig` and `hooks.*` in Gemini settings.
- Subagents: Gemini settings expose agent override and hook points around agent
  execution, but cc-connect currently drives the main Gemini CLI agent only.
- Logs: use Gemini telemetry local output when enabled, Gemini native chat
  storage, and cc-connect daemon logs.

## Migration implications

- Remove OpenClaw, ACPX, and `@shadowob/openclaw-shadowob` from the Gemini
  runner image.
- Embed cc-connect fork plus `@google/gemini-cli`.
- Generate `~/.gemini/settings.json`, project `.gemini/settings.json`,
  `GEMINI.md`, custom command files, and MCP/telemetry settings as native
  artifacts.
- Add a runtime smoke test that verifies Gemini CLI can start in the image,
  authenticate with the mounted provider secret, and emit stream JSON through
  cc-connect.

## Adapter and smoke tests

Unit tests:

- `.gemini/settings.json` validates against the official schema.
- Approval mode, MCP trust/include/exclude, browser domain restrictions, upload
  blocking, telemetry, and env redaction map correctly.
- Skills are not emitted as fake `SKILL.md` Gemini config; they are represented
  as context, command, or extension artifacts.
- cc-connect TOML contains `type = "gemini"` and no OpenClaw artifacts.

Container smoke:

- `cc-connect --version` and `gemini --version` work.
- `.gemini/settings.json`, `GEMINI.md`, command files, and extension files are
  materialized.
- Schema validation runs inside the container or in the package test before
  image build.
- Start cc-connect with `type = "gemini"` and inspect session/log paths.
- Assert headless trust settings are explicit and no provider secret is printed.

## Sources

- Gemini CLI configuration:
  https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md
- Gemini CLI commands:
  https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/commands.md
- Gemini CLI repository: https://github.com/google-gemini/gemini-cli
- cc-connect fork source: https://github.com/buggyblues/cc-connect
