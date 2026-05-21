# Hermes Runner Research

Research date: 2026-05-14.

## Target role

`hermes` is a new Cloud runner. It should run Hermes Agent's native gateway with
the bundled ShadowOB Hermes platform plugin, not OpenClaw and not cc-connect:

```text
hermes gateway -> shadowob Hermes platform plugin
```

This directory now contains the Hermes runner Dockerfile and entrypoint. The
runtime loader and package generator emit Hermes-native files through
`runtime-files.json` and keep ShadowOB token material in Kubernetes Secret data.

## Native Hermes configuration

Hermes stores its runtime state under `~/.hermes/`:

| Concern | Native Hermes surface |
| --- | --- |
| Main config | `~/.hermes/config.yaml`. |
| Secrets | `~/.hermes/.env`. |
| Auth | `~/.hermes/auth.json`. |
| Personality | `~/.hermes/SOUL.md`. |
| Memory | `~/.hermes/memories/`. |
| Skills | `~/.hermes/skills/`, managed by Hermes skill tools. |
| Cron | `~/.hermes/cron/jobs.json` and outputs under `~/.hermes/cron/output/<job_id>/<timestamp>.md`. |
| Sessions | `~/.hermes/sessions/`. |
| Logs | `~/.hermes/logs/`, including gateway/error logs with secret redaction. |
| Plugins | `~/.hermes/plugins/` and `plugins.enabled` in config. |

Hermes supports local, Docker, SSH, Modal, Daytona, Vercel Sandbox, and
Singularity/Apptainer terminal backends. The Cloud runner should start with a
container-local backend and explicitly decide later whether to expose remote
backends.

## Schema and type anchors

- Static JSON Schema URL: none found in the official docs.
- Runtime schema source: Hermes web dashboard docs say all config fields are
  auto-discovered from `DEFAULT_CONFIG` and exposed through `GET
  /api/config/schema`.
- Config type: YAML `config.yaml` plus `.env` and profile directories.
- Plugin type anchor: `packages/connector/hermes-shadowob-plugin/plugin.yaml`
  and its adapter code.
- Test rule: generated `config.yaml` must parse as YAML, load through Hermes,
  and, when the dashboard/API is enabled, match the runtime schema endpoint.

## Provider and authentication notes

- Hermes requires at least one inference provider. The interactive
  `hermes model` flow can configure providers, but Cloud should generate
  `~/.hermes/config.yaml` and `~/.hermes/.env` directly from deployment
  provider refs.
- Official provider paths include Nous Portal OAuth/subscription, Codex ChatGPT
  OAuth, GitHub Copilot OAuth or tokens, Anthropic OAuth/API key/manual token,
  OpenRouter, AI Gateway, z.ai/GLM, Kimi/Moonshot, and other provider-specific
  API keys.
- API-key providers belong in `~/.hermes/.env`, for example
  `OPENROUTER_API_KEY`, `AI_GATEWAY_API_KEY`, or provider-specific keys. The
  adapter must not place raw model keys in ConfigMaps.
- Custom provider/base-url routing belongs in Hermes `model.default`,
  `model.provider`, and `model.base_url` fields, plus routing/fallback config
  when enabled.
- Hermes model auth and ShadowOB platform auth are separate. `SHADOW_TOKEN`
  enables the messaging platform plugin; model provider keys enable inference.

## Models, tools, and extensions

| Concern | Hermes feature |
| --- | --- |
| Models | Primary model slots plus auxiliary models for side jobs. Providers include Nous Portal, OpenRouter, OpenAI, Anthropic, Google, and OpenAI-compatible endpoints. |
| Skills | Built-in and user-created skills with progressive disclosure, skill management, and curator maintenance. |
| MCP | Hermes MCP feature with server and tool filtering. |
| Cron/routine | Native cron jobs via `/cron`, `hermes cron`, and the `cronjob` tool; jobs can attach one or more skills. |
| Hooks | Plugin lifecycle hooks such as session start/end and tool/agent lifecycle callbacks. |
| Subagents | `delegate_task`, child agents, Kanban multi-agent board, and profile/worktree patterns. |
| Logs | Native logs in `~/.hermes/logs`; cron outputs are separate durable markdown artifacts. |

## Security, audit, cost, network, and tools

- User authorization: gateway access is deny-by-default unless allowlists,
  pairing, or explicit allow-all are configured.
- Command approvals: `approvals.mode` supports `manual`, `smart`, and `off`;
  `off` is equivalent to yolo and should be blocked by Cloud policy unless
  explicitly requested.
- Hardline blocklist: catastrophic commands are denied even in yolo/off modes.
- Containers: Docker backend drops capabilities, sets no-new-privileges, caps
  PIDs, and uses tmpfs for temp dirs; Cloud should start here for production
  gateway deployments.
- Resources: container CPU, memory, disk, and persistence flags belong in
  `terminal.*` config and must be auditable.
- Secrets: terminal/docker env passthrough is explicit allowlist only; credential
  files are mounted read-only when declared by skills.
- MCP: Hermes filters MCP environment separately from terminal passthrough; use
  MCP `env` config for MCP secrets.
- Cost/audit: native cron jobs, tool gateway use, delegate/subagent work,
  auxiliary models, container resources, and logs under `~/.hermes/logs` need
  Cloud audit labels.
- Network: provider endpoints, tool gateway, MCP remote endpoints, messaging
  platform endpoints, and Docker/remote backend egress should be captured in the
  runner package.

## Shadow integration

The repository already includes a Hermes ShadowOB platform plugin at
`packages/connector/hermes-shadowob-plugin`. It currently supports:

- channel, direct, and thread inbound messages
- outbound text and media replies
- Socket.IO receive with REST polling fallback
- startup catch-up window
- typing/activity and heartbeat status
- dynamic channel and policy discovery through Shadow APIs
- optional slash command registration through `SHADOW_SLASH_COMMANDS_JSON`
- the runner package materializes `/etc/shadowob/slash-commands.json` from the
  Hermes-owned catalog in `apps/cloud/src/runtimes/slash-commands/hermes.ts`
- interactive component metadata forwarding
- cron/send_message delivery through `SHADOW_HOME_CHANNEL`

Hermes publishes both CLI and messaging slash command surfaces. Researched CLI
commands include session commands such as `/new`, `/clear`, `/history`,
`/save`, `/retry`, `/undo`, `/compress`, `/rollback`, `/queue`, `/steer`,
`/goal`, `/resume`, `/sessions`, `/agents`, `/background`, and `/branch`;
configuration commands such as `/model`, `/codex-runtime`, `/personality`,
`/verbose`, `/fast`, `/reasoning`, `/skin`, `/statusbar`, `/voice`, `/yolo`,
`/footer`, and `/busy`; tool commands such as `/tools`, `/toolsets`,
`/browser`, `/skills`, `/cron`, `/curator`, `/kanban`, `/reload-mcp`,
`/reload-skills`, and `/plugins`; and info/exit commands such as `/usage`,
`/platforms`, `/paste`, `/copy`, `/image`, `/debug`, `/profile`, `/gquota`,
and `/quit`.

Current Cloud injection exposes the messaging-safe subset documented by Hermes:
`/new`, `/reset`, `/status`, `/stop`, `/model`, `/codex-runtime`,
`/personality`, `/fast`, `/retry`, `/undo`, `/sethome`, `/compress`, `/title`,
`/resume`, `/usage`, `/insights`, `/reasoning`, `/voice`, `/rollback`,
`/background`, `/queue`, `/steer`, `/goal`, `/footer`, `/curator`, `/kanban`,
`/reload-mcp`, `/yolo`, `/commands`, `/approve`, `/deny`, `/update`,
`/restart`, `/debug`, and `/help`. Hermes documents `/cron` as CLI-only, so it
is not registered into Shadow until the gateway supports messaging cron safely.

Example generated config:

```yaml
plugins:
  enabled:
    - shadowob

platforms:
  shadowob:
    enabled: true
    token: "${SHADOW_TOKEN}"
    extra:
      base_url: "${SHADOW_BASE_URL}"
      mention_only: false
      rest_only: false
      catchup_minutes: 0
      download_media: true
      slash_commands: []
```

Required environment:

```bash
SHADOW_BASE_URL=<shadow-api-url>
SHADOW_TOKEN=...
```

## Capability notes

- Models: generate Hermes provider/model config natively in `config.yaml`.
- Skills: materialize Hermes skills under `~/.hermes/skills` when Cloud owns the
  runner profile.
- MCP: write Hermes MCP config rather than OpenClaw or Codex MCP formats.
- Cron/routine: Hermes has the strongest native cron surface among the target
  runners. Cloud template routines are seeded from
  `/etc/shadowob/template-routines.json` into `~/.hermes/cron/jobs.json`, using
  Hermes native `deliver`/`origin` ShadowOB delivery. Managed jobs use
  deterministic ids and a spec hash so user-edited schedules are preserved.
- Hooks: expose plugin hooks through `plugins.enabled` and plugin files, not a
  central OpenClaw hook adapter.
- Subagents: support Hermes delegation later as native Hermes multi-agent
  features, not as OpenClaw `agents.list`.
- Logs: collect `~/.hermes/logs` and cron output directories separately.

## Migration implications

- `hermes` is included in the `AgentRuntime` schema and runtime loader.
- `hermes-runner` installs Hermes Agent, ShadowOB CLI/connector packages, and
  copies/enables the ShadowOB Hermes plugin.
- Generate `~/.hermes/config.yaml`, `.env`, `SOUL.md`, skills, MCP config, and
  cron config as native artifacts.
- Keep this runner out of the cc-connect narrowed binary. Hermes already has a
  native gateway/platform plugin boundary.
- Runtime package smoke tests verify Hermes config/file generation; an
  end-to-end Docker smoke should still start `hermes gateway`, resolve the Buddy
  id through Shadow, register slash commands, and send a DM response before
  publishing an image tag.

## Adapter and smoke tests

Unit tests:

- `config.yaml` parses and contains expected provider/model, terminal,
  approvals, gateway, plugin, MCP, cron, and skill fields.
- ShadowOB plugin env/config is generated from Cloud fields without leaking
  `SHADOW_TOKEN` into non-secret config.
- `approvals.mode: off`, allow-all gateway access, unrestricted env passthrough,
  and persistent containers require explicit Cloud policy opt-in.
- Cron jobs use sanitized IDs and cannot write outside the Hermes cron store.

Container smoke:

- `hermes --version` works and plugin dependencies are installed.
- `hermes gateway` starts with `plugins.enabled: ["shadowob"]`.
- `~/.hermes/config.yaml`, `.env`, `SOUL.md`, `skills`, `cron`, `sessions`, and
  `logs` directories are created.
- Dashboard/API schema endpoint is checked when enabled.
- Logs show plugin startup and deny/allow policy without raw Shadow token.

## Sources

- Hermes docs index: https://hermes-agent.nousresearch.com/docs/llms.txt
- Configuration:
  https://hermes-agent.nousresearch.com/docs/user-guide/configuration
- Security: https://hermes-agent.nousresearch.com/docs/user-guide/security
- Tool gateway:
  https://hermes-agent.nousresearch.com/docs/user-guide/features/tool-gateway
- Configuring models:
  https://hermes-agent.nousresearch.com/docs/user-guide/configuring-models
- AI providers:
  https://hermes-agent.nousresearch.com/docs/integrations/providers
- Skills:
  https://hermes-agent.nousresearch.com/docs/user-guide/features/skills
- MCP: https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp
- Cron: https://hermes-agent.nousresearch.com/docs/user-guide/features/cron
- Hooks: https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks
- Delegation:
  https://hermes-agent.nousresearch.com/docs/user-guide/features/delegation
- Sessions: https://hermes-agent.nousresearch.com/docs/user-guide/sessions
- Slash commands:
  https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/slash-commands.md
