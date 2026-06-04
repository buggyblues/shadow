# Shadow Connector

Connection helpers for attaching Shadow Buddies to local OpenClaw and CLI runtimes.

The package exports pure plan builders for legacy app UIs and a `shadowob-connector` CLI for terminal setup.

## CLI

Run the daemon flow used by the Buddy creation panel:

```bash
npx @shadowob/connector@latest --daemon \
  --server-url https://shadowob.com \
  --api-key sk_machine_...
```

The daemon connects this computer once, scans supported runtimes, sends heartbeats to Shadow, claims Buddy setup jobs, and configures the selected runtime. Supported runtime detection currently includes OpenClaw, Hermes Agent, Claude Code, Codex CLI, OpenCode, Cursor CLI, Kimi CLI, Copilot CLI, and Antigravity CLI.

Research and design notes for runtime session scanning, monitoring, and direct
message push are in [`docs/agent-runtime-session-monitoring.md`](docs/agent-runtime-session-monitoring.md).

Desktop builds run the connector through Electron's Node runtime. If the user's
machine does not have Node/npm, the connector downloads a verified official
Node.js runtime under `~/.shadowob/connector/node/`, installs Shadow CLI tools
under `~/.shadowob/connector/node-global/`, and adds that toolchain plus nvm,
login-shell, and common user bin directories to the runtime `PATH`.

Use `--once` to run one heartbeat/job pass for debugging, and `--poll-interval-ms` to tune the loop interval.

Print a plan:

```bash
npx @shadowob/connector@latest plan \
  --target openclaw \
  --server-url https://shadowob.com \
  --token buddy-token
```

Apply a connector setup:

```bash
npx @shadowob/connector@latest connect \
  --target hermes \
  --server-url https://shadowob.com \
  --token buddy-token
```

`--server-url` defaults to `https://shadowob.com`. Use `--dry-run` to preview writes and commands. Use `--json` with `plan`, `scan`, `status`, or `doctor` when embedding output in another tool.

Operational commands:

```bash
npx @shadowob/connector@latest scan
npx @shadowob/connector@latest runtime-scan --sessions --json
npx @shadowob/connector@latest runtime-watch --runtime opencode
npx @shadowob/connector@latest runtime-watch --runtime claude-code --json
npx @shadowob/connector@latest session-list --runtime opencode --json
npx @shadowob/connector@latest session-send --runtime opencode --session <session-id> --message "continue"
npx @shadowob/connector@latest status --target cc-connect
npx @shadowob/connector@latest doctor --target hermes
npx @shadowob/connector@latest fix --target openclaw --server-url https://shadowob.com --token buddy-token
npx @shadowob/connector@latest update --target cc-connect --server-url https://shadowob.com --token buddy-token
```

- `scan` probes local OpenClaw, Hermes Agent, and cc-connect installs/config files, then prints connection instructions for each target.
- `runtime-scan --sessions` adds a compact runtime session snapshot for supported
  monitor adapters. Initial support covers OpenCode's loopback server and
  Claude Code transcript inventory.
- `runtime-watch` shows a lightweight terminal monitor panel. With `--json`, it
  emits newline-delimited event JSON for automation.
- `session-list` prints normalized runtime session inventory, and
  `session-send` pushes a message to a supported runtime session. OpenCode uses
  the documented server API; Claude Code uses a structured `claude -p --resume`
  process adapter.
- `status` checks local connector health and exits successfully.
- `doctor` prints the same checks with fix guidance and exits non-zero when required config is broken.
- `fix` reinstalls common Shadow CLI/skill assets and repairs the target connector config.
- `update` refreshes the same assets/config and installs target runtime dependencies by default.

`connect`, `fix`, and `update` merge existing configuration instead of replacing it:

- Shadow CLI access is installed/configured for the Buddy: if `shadowob` is not
  on `PATH`, the connector writes a `~/.local/bin/shadowob` shim; it installs
  the official Shadow skill files into common agent skill directories; and it
  writes a Buddy profile to `~/.shadowob/shadowob.config.json`.
- OpenClaw JSON defaults to `~/.openclaw/openclaw.json` or `--openclaw-config`.
- Hermes updates `~/.hermes/.env` and merges `~/.hermes/config.yaml`.
- cc-connect merges the ShadowOB platform into `~/.cc-connect/config.toml`.

Existing model providers, plugins, projects, platforms, and unrelated keys are preserved.

When Shadow's official model proxy is enabled on the server, daemon-created
Buddy setup jobs also include an OpenAI-compatible provider. The connector
writes it into OpenClaw/Hermes/cc-connect config so a newly installed desktop
Buddy has a usable default LLM provider without asking the user for an API key.
Manual runs can pass the same values explicitly:

```bash
npx @shadowob/connector@latest connect \
  --target cc-connect \
  --server-url https://shadowob.com \
  --token buddy-token \
  --model-provider-base-url https://shadowob.com/api/ai/v1 \
  --model-provider-api-key model-proxy-token \
  --model-provider-model deepseek-v4-flash
```

## OpenClaw

```bash
npx @shadowob/connector@latest connect \
  --target openclaw \
  --server-url https://shadowob.com \
  --token buddy-token
```

Equivalent manual steps:

```bash
openclaw plugins install @shadowob/openclaw-shadowob
openclaw config set channels.shadowob.token 'buddy-token'
openclaw config set channels.shadowob.serverUrl 'https://shadowob.com'
openclaw gateway restart
```

OpenClaw resolves the Buddy identity from the token and pulls channel policy dynamically from Shadow.

Reference: OpenClaw's plugin documentation covers `openclaw plugins install`,
managed plugin roots, and repair/update behavior:
https://docs.openclaw.ai/plugins

## Hermes Agent

```bash
npx @shadowob/connector@latest connect \
  --target hermes \
  --server-url https://shadowob.com \
  --token buddy-token
```

The Hermes plugin is bundled in `hermes-shadowob-plugin/`. The connector copies it to `~/.hermes/plugins/shadowob`, writes the Shadow token/base URL, and enables the plugin.

Hermes does not need `agentId` or `channelId` in the setup command. The plugin calls `/api/auth/me` to resolve the Buddy agent id, then `/api/agents/:id/config` to receive channel access policy dynamically, matching the OpenClaw plugin behavior. If no channel is available yet, Hermes stays online and waits for a DM, server join, channel membership, or policy update. By default it creates/uses the DM with the Buddy owner as the home channel.

Manual config shape:

```yaml
plugins:
  enabled:
    - shadowob

platforms:
  shadowob:
    enabled: true
    token: "buddy-token"
    extra:
      base_url: "https://shadowob.com"
      mention_only: false
      rest_only: false
      catchup_minutes: 0
      download_media: true
      slash_commands: []
```

Optional environment variables:

```bash
export SHADOW_BASE_URL="https://shadowob.com"
export SHADOW_TOKEN="buddy-token"
export SHADOW_HEARTBEAT_INTERVAL_SECONDS=30
export SHADOW_SLASH_COMMANDS_JSON='[]'
```

For the official model proxy, Hermes receives `model.provider: custom`,
`model.base_url`, and `model.default` in `~/.hermes/config.yaml`. This follows
Hermes' documented custom OpenAI-compatible endpoint shape:
https://hermes-agent.nousresearch.com/docs/integrations/providers

## cc-connect

The connector uses the ShadowOB-capable fork
`buggyblues/cc-connect@f382563`. It does not install the official npm
`cc-connect` package, because the npm package currently points to the upstream
`chenhg5/cc-connect` release line.

```bash
npx @shadowob/connector@latest connect \
  --target cc-connect \
  --server-url https://shadowob.com \
  --token buddy-token \
  --work-dir . \
  --project-name shadow-buddy \
  --agent-type codex \
  --install \
  --start
```

With `--install`, the CLI first tries the fork's GitHub release asset matching
the local OS/CPU and verifies its pinned SHA-256. If the fork release asset is
missing or does not match, it pulls the pinned source archive, builds a `no_web`
Go binary, caches it under
`~/.shadowob/connector/cc-connect/f382563/bin/`, and starts that binary when
`--start` is present.

The fork is published as GitHub release
https://github.com/buggyblues/cc-connect/releases/tag/v1.3.3-beta.7. It is
merged from upstream `chenhg5/cc-connect` and preserves the ShadowOB platform.
Upstream usage docs cover supported agents, providers, `/model`, `/dir`, voice,
attachments, cron, daemon mode, and web management:
https://github.com/chenhg5/cc-connect/blob/main/docs/usage.zh-CN.md

Equivalent TOML:

```toml
language = "zh"

[[projects]]
name = "shadow-buddy"

[projects.agent]
type = "codex"

[projects.agent.options]
work_dir = "."
provider = "shadow-official"
model = "deepseek-v4-flash"

[[projects.agent.providers]]
name = "shadow-official"
api_key = "model-proxy-token"
base_url = "https://shadowob.com/api/ai/v1"
model = "deepseek-v4-flash"

[[projects.agent.providers.models]]
model = "deepseek-v4-flash"

[[projects.platforms]]
type = "shadowob"

[projects.platforms.options]
token = "buddy-token"
server_url = "https://shadowob.com"
allow_from = "*"
listen_dms = true
share_session_in_channel = false
progress_style = "compact"
```

## TypeScript API

```ts
import { createConnectorPlan, createConnectorPlans } from '@shadowob/connector'

const hermes = createConnectorPlan({
  target: 'hermes',
  serverUrl: 'https://shadowob.com',
  token: 'buddy-token',
})

const allPlans = createConnectorPlans({
  serverUrl: 'https://shadowob.com',
  token: 'buddy-token',
})
```

## Tests

```bash
pnpm --filter @shadowob/connector test
pnpm -C packages/connector typecheck
pnpm -C packages/connector build
uv run --project .tmp/hermes-agent --with pytest python -m pytest packages/connector/hermes-shadowob-plugin/tests
```

The tests cover plan generation, config merging for OpenClaw/Hermes/cc-connect, and Hermes dynamic channel behavior without static `agentId` or `channelId` arguments.

## Capability Coverage

- OpenClaw: channel messages, DMs, threads, mentions, attachments/images/voice messages, voice playback/transcript metadata, interactive components, slash commands, online status, typing/activity, reactions, edits/deletes, status checks, usage/cost telemetry, multi-Agent Buddy binding, Shadow CLI login/notifications, official skills, cron tasks.
- Hermes Agent: channel messages, DMs, threads, attachments/images/voice messages, voice playback/transcript metadata, interactive components, slash commands, online status, typing/activity, cron delivery, status checks, usage/cost telemetry, Shadow CLI login/notifications, official skills.
- cc-connect: channel messages, DMs, attachments/images, interactive components, slash commands, typing, streaming previews, forms, status checks, usage/cost telemetry, multi-Agent Buddy binding, Shadow CLI login/notifications.
