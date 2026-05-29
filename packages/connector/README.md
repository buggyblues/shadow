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

The daemon connects this computer once, scans supported runtimes, sends heartbeats to Shadow, claims Buddy setup jobs, and configures the selected runtime. Supported runtime detection currently includes OpenClaw, Claude Code, Codex CLI, OpenCode, Gemini CLI, Cursor CLI, Kimi CLI, Copilot CLI, and Antigravity CLI.

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
npx @shadowob/connector@latest status --target cc-connect
npx @shadowob/connector@latest doctor --target hermes
npx @shadowob/connector@latest fix --target openclaw --server-url https://shadowob.com --token buddy-token
npx @shadowob/connector@latest update --target cc-connect --server-url https://shadowob.com --token buddy-token
```

- `scan` probes local OpenClaw, Hermes Agent, and cc-connect installs/config files, then prints connection instructions for each target.
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

## cc-connect

The connector uses the ShadowOB-capable fork
`buggyblues/cc-connect@63b5d59`. It does not install the official npm
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
`~/.shadowob/connector/cc-connect/63b5d59/bin/`, and starts that binary when
`--start` is present.

Equivalent TOML:

```toml
language = "zh"

[[projects]]
name = "shadow-buddy"

[projects.agent]
type = "codex"

[projects.agent.options]
work_dir = "."

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

- OpenClaw: channel messages, DMs, threads, mentions, attachments/images, interactive components, slash commands, online status, typing/activity, reactions, edits/deletes, status checks, usage/cost telemetry, multi-Agent Buddy binding, Shadow CLI login/notifications, official skills, cron tasks.
- Hermes Agent: channel messages, DMs, threads, attachments/images, interactive components, slash commands, online status, typing/activity, cron delivery, status checks, usage/cost telemetry, Shadow CLI login/notifications, official skills.
- cc-connect: channel messages, DMs, attachments/images, interactive components, slash commands, typing, streaming previews, forms, status checks, usage/cost telemetry, multi-Agent Buddy binding, Shadow CLI login/notifications.
