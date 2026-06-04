# Agent Runtime Session Monitoring Research

Research date: 2026-06-01

State adapter follow-up: see
[`runtime-session-state-adapters.md`](./runtime-session-state-adapters.md) for
the per-runtime completion semantics used by desktop notifications. That file
defines when transcript or native events become `running`, `streaming`,
`completed`, `failed`, or `stopped`.

## Scope

This note covers the local agent runtimes in the current connector catalog:
OpenClaw, Hermes Agent, Claude Code, Codex CLI, OpenCode, Cursor Agent CLI,
Kimi Code, GitHub Copilot CLI, and Antigravity CLI. It also
covers cc-connect because Shadow currently uses it as the multiplexing bridge
for several CLI runtimes.

The connector today has two separate concepts:

- Connector targets: `openclaw`, `hermes`, and `cc-connect`, which receive
  Shadow Buddy configuration.
- Runtime catalog entries: local commands such as `claude`, `codex`,
  `opencode`, `cursor-agent`, `kimi`, `copilot`, and `agy`, which
  `runtime-scan` detects by running version commands.

The missing layer is not "runtime installed" detection. It is an operational
control plane for runtime instances and their sessions.

## Connector-Owned Bridge Multiplexing

Desktop-created Buddies must not map one click to one unmanaged bridge process.
The connector has to own both the config namespace and the bridge lifecycle, or
multi-Buddy setups will overwrite tokens, steal sockets, or report setup
success before the Buddy is actually online.

Current bridge policy:

| Bridge | Multiplexing model | Process model | Config isolation |
| --- | --- | --- | --- |
| `cc-connect` | One config file with multiple `[[projects]]` | One connector-managed process | Project name equals Buddy username |
| OpenClaw | One gateway with multiple `channels.shadowob.accounts` | One OpenClaw gateway restart per daemon batch | Account ID equals Buddy username |
| Hermes Agent | One Hermes profile per Buddy | One connector-managed `hermes gateway` per profile | `HERMES_HOME=~/.shadowob/connector/hermes/<buddy>` |

`cc-connect` also supports `--config <path>`, but the desktop connector should
prefer one config and one process. The default cc-connect socket and lock live
under `~/.cc-connect`, so multiple detached processes using the default config
are unsafe. The daemon therefore terminates stale connector-managed cc-connect
processes, rewrites the combined config, keeps stdin open, and waits for each
configured project to emit `platform ready ... platform=shadowob` before
marking jobs complete.

OpenClaw already has a multi-account channel plugin shape. The connector should
write each Buddy token under `channels.shadowob.accounts.<buddyUsername>` and
leave existing accounts in place. It should restart the OpenClaw gateway once
after applying a daemon batch instead of once per Buddy.

Hermes Shadow plugin config is single-platform/single-token today. To avoid
global `~/.hermes/config.yaml` and `.env` overwrites, desktop daemon jobs should
use connector-managed profile homes and start the gateway with an explicit
`HERMES_HOME`. Manual `connect --target hermes` may still target the user's
default `~/.hermes` for compatibility.

## Terms

- Runtime installation: the CLI/server binary and its static config exist.
- Runtime instance: a running gateway, local server, ACP server, or
  connector-owned child process for one runtime.
- Runtime session: the native conversation/task identity in that runtime.
- Session state: a normalized state derived from native events, server status,
  child-process state, or durable session metadata.
- Push: sending a user message, command, approval, abort, or resume request to a
  specific runtime session through a documented API or structured CLI mode.

Do not treat `ps` output as session state. Process state only says whether a
binary exists or a child is alive; it does not say which session is idle, busy,
waiting for approval, or blocked.

## Research Summary

| Runtime | Session inventory | Live state source | Push path | Connector fit |
| --- | --- | --- | --- | --- |
| OpenClaw | Gateway RPC/session tools | Gateway WebSocket events and `gateway status` | Gateway RPC/session tools | Native adapter |
| Hermes Agent | SQLite `~/.hermes/state.db`, JSONL transcripts, API server runs, ACP sessions | API server run status, ACP updates, gateway/web dashboard status | API server runs, ACP prompt, or Shadow platform plugin | Native plus process adapter |
| cc-connect | Bridge REST sessions API | Bridge WebSocket events | Bridge WebSocket/REST | Native adapter |
| OpenCode | `opencode serve` `/session` API | `/session/status`, session/message APIs | `/session/:id/message` or `prompt_async` | Native adapter |
| Claude Code | Local JSONL transcripts and `--resume` | `--output-format stream-json` child process events | `claude -p --resume ...` or long-lived `--input-format stream-json` | Process adapter |
| Codex CLI | CLI `resume`, `exec resume`, local sessions; app-server is experimental | `codex exec --json` child events; experimental app-server/remote-control | `codex exec resume --json` first; app-server later | Process adapter, then native |
| Cursor Agent CLI | `--resume`, `resume`, `ls` | `--print --output-format stream-json` child events | `cursor-agent --resume ... --print ...` | Process adapter |
| Kimi Code | `--continue`, `--session`/`--resume`; Web UI and ACP/Wire modes | Web UI activity, ACP/Wire if enabled, child process events | `kimi -p` with resume, or ACP/Wire | Process adapter, ACP later |
| GitHub Copilot CLI | `~/.copilot/session-state`, SQLite store, `--resume`/`--continue` | First-party remote access, logs, child process | `copilot -p`/`--resume`; ACP server if used | Process adapter, ACP later |
| Antigravity CLI | Workspace-scoped conversations, `agy --conversation` | Statusline JSON hook; child process state | `agy --conversation ...` as a new turn/process | Statusline plus process adapter |

## Runtime Findings

### OpenClaw

Relevant docs:

- `https://docs.openclaw.ai/cli/gateway`
- `https://docs.openclaw.ai/gateway`
- `https://docs.openclaw.ai/concepts/session-tool`
- `https://docs.openclaw.ai/cli/channels`

OpenClaw is the best native control-plane fit. The Gateway is a WebSocket
server for channels, nodes, sessions, and hooks. Its documented protocol emits
events such as `session.message`, `session.operation`, `session.tool`,
`sessions.changed`, `presence`, `health`, and `heartbeat`. Gateway runs are
two-stage: an immediate accepted acknowledgement and a final completion
response, with streamed agent events in between.

OpenClaw also documents `session_status` as a lightweight `/status` equivalent
for current or visible sessions, and session orchestration tools such as
`sessions_list`, `sessions_history`, `sessions_send`, `sessions_spawn`, and
`sessions_yield`. The channels documentation explicitly warns not to use
session rows as channel socket-health signals, which is important: connector
must distinguish gateway/channel health from stored conversation history.

Recommendation:

- Implement a native `OpenClawRuntimeAdapter`.
- Use `openclaw gateway status --json --require-rpc` for readiness.
- Use Gateway WebSocket for watching sessions and state changes.
- Use Gateway RPC/session tools for message push, abort, and status.
- Do not scan session files for live health except as a fallback.

### Hermes Agent

Relevant docs:

- `https://hermes-agent.nousresearch.com/docs/user-guide/sessions/`
- `https://hermes-agent.nousresearch.com/docs/user-guide/cli/`
- `https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server/`
- `https://hermes-agent.nousresearch.com/docs/user-guide/features/acp/`
- `https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard`

Hermes stores sessions in `~/.hermes/state.db` and gateway transcripts under
`~/.hermes/sessions/`. The session database includes IDs, source platform,
user ID, model/config, title, full message history, token counts, timestamps,
and parent session IDs. Session sources include `cli`, messaging platforms,
`api-server`, `acp`, `cron`, and `batch`.

Hermes has multiple useful integration paths:

- CLI resume: `hermes --continue`, `hermes --resume <session_id>`, and
  `hermes sessions list`.
- API server: OpenAI-compatible chat/responses plus a runs API with `run_id`,
  run status polling, and progress events.
- ACP: a stdio JSON-RPC server with live sessions, list/load/resume/fork/cancel,
  prompts, file diffs, terminal commands, approval prompts, and streamed
  updates.
- Existing Shadow plugin: already receives Shadow messages and publishes
  heartbeat/online state after resolving the Buddy identity.

Recommendation:

- Keep the existing Shadow platform plugin for Shadow chat delivery.
- Add a Hermes adapter that can read session inventory from SQLite read-only.
- For direct connector-managed sessions, prefer API server runs when enabled.
- Use ACP only when the connector owns the ACP server process; ACP session state
  is scoped to that running server.
- Do not mutate `state.db` directly. Push through API server, ACP, or the
  Shadow platform plugin.

### cc-connect

Relevant docs:

- `https://github.com/chenhg5/cc-connect/blob/main/docs/usage.md`
- `https://github.com/chenhg5/cc-connect/blob/main/docs/usage.zh-CN.md`
- `https://github.com/chenhg5/cc-connect/blob/main/INSTALL.md`
- `https://github.com/chenhg5/cc-connect/blob/main/README.md`

cc-connect is already a bridge over multiple coding CLIs. Its Bridge beta
exposes a WebSocket plus REST server for external adapters. The documented REST
surface includes session list, create, detail/history, delete, and active
session switch. The WebSocket is bidirectional: external clients can send user
messages and receive agent events, including text, tool calls, and permission
requests.

cc-connect also has in-chat slash commands for `/new`, `/list`, `/switch`,
`/current`, `/history`, `/stop`, `/provider`, `/model`, `/mode`, `/reasoning`,
and related session controls. Its daemon mode has service start/stop/restart
status commands. This makes it a strong near-term solution for runtimes that do
not expose their own native server API.

Recommendation:

- Enable Bridge automatically for connector-managed cc-connect installs.
- Generate a random bridge token and store it under `~/.shadowob/connector/`.
- Add Bridge endpoint and token metadata to the daemon heartbeat, redacted.
- Use Bridge WS as the primary live event stream.
- Use Bridge REST for initial reconciliation and history fetch.

### OpenCode

Relevant docs:

- `https://opencode.ai/docs/cli/`
- `https://opencode.ai/docs/server/`

OpenCode exposes the cleanest documented HTTP session API among standalone CLI
runtimes. `opencode serve` provides endpoints to list, create, inspect, update,
fork, abort, share, summarize, revert, and inspect sessions. It also exposes
`GET /session/status` for all sessions, `GET /session/:id/message` for
history, `POST /session/:id/message` to send a message and wait for a response,
and `POST /session/:id/prompt_async` for async prompt delivery.

The CLI can run one-off prompts with `opencode run`, continue the latest
session with `--continue`, resume a specific session with `--session`, and
attach to a running `opencode serve` instance with `--attach`.

Recommendation:

- Implement a native `OpenCodeRuntimeAdapter` over `opencode serve`.
- Let connector start a loopback OpenCode server on demand when the user opts
  into monitoring/push.
- Use `/session/status` for state scan, `/session/:id/message` for history, and
  `/session/:id/prompt_async` for push.
- Prefer Basic auth/password if configured; never expose the server beyond
  loopback through connector.

### Claude Code

Relevant docs:

- `https://code.claude.com/docs/en/sessions`
- `https://code.claude.com/docs/en/headless`
- `https://code.claude.com/docs/en/cli-reference`

Claude Code has a mature session model, but no documented local daemon API for
third-party push into an already-running TUI. Sessions are saved continuously
under `~/.claude/projects/<project>/<session-id>.jsonl`, and can be resumed by
`--continue`, `--resume <name|id>`, `/resume`, or PR-linked session commands.

Headless mode supports `claude -p`, JSON output, `stream-json` output,
`--resume`, and `--input-format stream-json`. Streaming JSON input allows
multiple user turns without relaunching the binary, but this only applies to the
connector-owned headless process. It is not a documented way to inject into a
separate user's active TUI session.

Recommendation:

- Implement a process adapter.
- For existing sessions, scan transcripts as read-only inventory and use
  `claude -p --resume <session-id> --output-format stream-json` to append a
  message through a fresh headless run.
- For connector-owned live sessions, keep a long-lived `claude -p
  --input-format stream-json --output-format stream-json` child process and map
  its emitted `session_id` to the Shadow session binding.
- Normalize live state from child process events, terminal exit code, and
  missing-final-event timeouts.
- Avoid PTY scraping of the interactive TUI.

### Codex CLI

Relevant docs and local help:

- `https://help.openai.com/en/articles/11096431`
- `https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan`
- `https://help.openai.com/en/articles/10128477-chatgpt-enterprise-edu-release-notes`
- Local CLI help on this machine: `codex`, `codex exec`, `codex resume`,
  `codex app-server`, and `codex remote-control`.

Codex CLI has session commands in the installed version: `codex resume
[SESSION_ID] [PROMPT]`, `codex resume --last`, `codex exec resume`, and
`codex exec --json`. It also has experimental `app-server` and
`remote-control` commands. Current OpenAI Help Center material describes Codex
Local, Codex app workflows, and remote control/live state surfaces, but the
stable public integration contract for third-party local push should still be
treated as the CLI surface unless the app-server protocol is intentionally
adopted.

Recommendation:

- Implement a process adapter first: `codex exec resume <session-id> --json`
  where possible, or `codex resume <session-id> <prompt>` for interactive-style
  resume.
- Parse JSONL events from `codex exec --json` for connector-owned sessions.
- Treat `app-server`/`remote-control` as an experimental native adapter path
  behind a feature flag.
- Do not rely on undocumented session file layout as the only inventory source;
  if used, mark it as best-effort.

### Cursor Agent CLI

Relevant docs:

- `https://docs.cursor.com/en/cli/overview`
- `https://docs.cursor.com/en/cli/reference/parameters`
- `https://docs.cursor.com/en/cli/reference/output-format`

Cursor Agent CLI supports `--resume [chatId]`, `resume`, `ls`, `--print`, and
`--output-format text|json|stream-json`. The stream JSON format emits a stable
`session_id` throughout one agent execution, plus system, assistant, tool, and
result events.

Recommendation:

- Implement a process adapter.
- Use `cursor-agent --resume <session-id> --print --output-format stream-json`
  for push into a previous chat.
- Use emitted `session_id` for new connector-owned session bindings.
- Use `cursor-agent status` only for auth health, not runtime session state.

### Kimi Code

Relevant docs:

- `https://www.kimi.com/help/kimi-code/cli-sessions`
- `https://www.kimi.com/code/docs/en/kimi-code-cli/core-operations.html`
- `https://www.kimi.com/code/docs/en/kimi-code-cli/getting-started.html`
- `https://www.kimi.com/code/docs/en/kimi-code-cli/reference/kimi-command.html`
- `https://www.kimi.com/code/docs/en/kimi-code-cli/reference/kimi-web.html`

Kimi Code supports automatic session persistence, `--continue`, `--session` /
`--resume`, `/sessions` / `/resume`, startup replay, and persisted runtime
state such as approvals, plan mode, subagent instances, and added directories.
The command reference also documents prompt mode, print mode, ACP mode, and an
experimental Wire mode. The Web UI has a session list, session search,
session switching, forking, archive/delete operations, context usage, activity
status, and queued follow-up messages.

Recommendation:

- Implement a process adapter first using `kimi -p` plus resume flags.
- Add ACP/Wire native adapters only after their protocol stability and auth
  model are verified in the runtime version connector manages.
- For monitoring, prefer Web/ACP/Wire state when connector started it; otherwise
  session inventory is durable but live state is best-effort.

### GitHub Copilot CLI

Relevant docs:

- `https://docs.github.com/en/copilot/concepts/agents/about-copilot-cli`
- `https://docs.github.com/en/copilot/how-tos/use-copilot-agents/use-copilot-cli`
- `https://docs.github.com/copilot/reference/cli-command-reference`
- `https://docs.github.com/en/copilot/concepts/agents/copilot-cli/chronicle`
- `https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference`
- `https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/steer-remotely`

Copilot CLI records sessions locally under `~/.copilot/session-state/` and
uses `session-store.db` for indexing/search. It supports `--resume`,
`--continue`, `--prompt`, `--share`, and a command reference with remote
session options such as `--connect`. GitHub's remote access feature lets users
monitor progress, respond to prompts, and continue from GitHub.com or mobile,
but this is a first-party remote surface rather than a general local REST API.

Recommendation:

- Implement a process adapter for `copilot -p` and `--resume` first.
- Treat local `session-state`/SQLite as read-only inventory and indexing.
- Investigate ACP only if the user has enabled Copilot CLI ACP and the connector
  owns the ACP server process.
- Do not attempt to inject into first-party remote sessions outside documented
  CLI options.

### Antigravity CLI

Relevant docs:

- `https://www.antigravity.google/docs/cli-getting-started`
- `https://www.antigravity.google/docs/cli-conversations`
- `https://www.antigravity.google/docs/cli-statusline`
- `https://www.antigravity.google/docs/cli-using`
- `https://www.antigravity.google/docs/cli-subagents`

Antigravity CLI scopes conversation histories to the current working directory,
supports `/resume`, `agy --continue`, and `agy --conversation <uuid>`, and has
conversation branching with `/fork` or `/branch`. Its strongest monitoring hook
is the documented statusline script: whenever agent state changes, Antigravity
executes the configured command and passes a detailed JSON payload on stdin.
That payload includes `agent_state`, context-window usage, VCS state,
subagents, artifacts, queued user messages, background tasks, and whether a
tool confirmation is pending.

There is no documented public API for pushing into a separately running
Antigravity TUI session.

Recommendation:

- Implement a statusline observer adapter that chains any existing user
  statusline command and writes sanitized state snapshots to
  `~/.shadowob/connector/antigravity-status.jsonl`.
- Implement push by spawning `agy --conversation <uuid> <message>` or an
  equivalent connector-owned process, not by TUI key injection.
- Keep the adapter best-effort until Antigravity exposes a documented local
  control protocol.

## Proposed Connector Architecture

### 1. Add a Runtime Adapter Layer

The connector needs a small internal adapter interface. It should be separate
from `ConnectorRuntimeCatalogEntry`, because catalog entries describe install
detection while adapters describe running session control.

```ts
export type RuntimeSessionState =
  | 'idle'
  | 'running'
  | 'streaming'
  | 'waiting_for_approval'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'stopped'
  | 'unknown'

export interface RuntimeSessionInfo {
  runtimeId: ConnectorRuntimeId
  instanceId: string
  sessionId: string
  title?: string | null
  workDir?: string | null
  state: RuntimeSessionState
  model?: string | null
  contextUsage?: { usedTokens?: number; maxTokens?: number; usedPercent?: number }
  lastActivityAt?: string | null
  startedAt?: string | null
  source?: 'gateway' | 'server' | 'cli' | 'acp' | 'transcript' | 'statusline'
  native?: Record<string, unknown>
}

export interface RuntimeAdapter {
  readonly id: ConnectorRuntimeId
  scanInstall(): Promise<DaemonRuntime>
  scanInstances(): Promise<RuntimeInstanceInfo[]>
  listSessions(instance: RuntimeInstanceInfo): Promise<RuntimeSessionInfo[]>
  watch?(
    instance: RuntimeInstanceInfo,
    emit: (event: RuntimeSessionEvent) => void,
  ): Promise<RuntimeWatchHandle>
  sendMessage(input: RuntimeSendMessageInput): Promise<RuntimeSendResult>
  abortSession?(input: RuntimeSessionTarget): Promise<void>
  approve?(input: RuntimeApprovalInput): Promise<void>
}
```

Adapters should advertise capabilities:

- `sessionList`
- `sessionHistory`
- `liveWatch`
- `sendMessage`
- `sendAsync`
- `abort`
- `approval`
- `attachments`
- `nativeStatus`
- `connectorOwnedOnly`

### 2. Split Runtime Inventory From Runtime Sessions

Extend daemon heartbeat from only:

```json
{ "runtimes": [] }
```

to:

```json
{
  "runtimes": [],
  "runtimeInstances": [],
  "runtimeSessions": [],
  "sessionScanCursor": "opaque"
}
```

Keep the heartbeat compact. High-volume message/tool deltas should use a
separate batched endpoint:

- `POST /api/connector/daemon/session-events`
- or a daemon WebSocket/SSE stream if the server already has an outbound
  connector channel.

The connector should send only normalized state plus small event summaries by
default. Full transcripts should be fetched on demand and size-limited.

### 3. Add Push Jobs

Current daemon jobs are centered on `configure-buddy`. Add job types:

- `runtime.session.create`
- `runtime.session.send`
- `runtime.session.abort`
- `runtime.session.approve`
- `runtime.session.refresh`

`runtime.session.send` should include:

```json
{
  "computerId": "computer_id",
  "runtimeId": "opencode",
  "instanceId": "loopback:4096",
  "sessionId": "native_session_id",
  "message": {
    "text": "Implement the requested change",
    "attachments": []
  },
  "shadowContext": {
    "conversationId": "channel_or_dm_or_thread_id",
    "messageId": "shadow_message_id",
    "actorUserId": "user_id"
  },
  "delivery": {
    "mode": "async",
    "timeoutMs": 300000
  }
}
```

The daemon should complete the job only after the runtime accepted the message.
Long-running results should stream back through session events.

### 4. Normalize State Conservatively

Use this mapping:

- `idle`: runtime says the session is not executing and no approval is pending.
- `running`: a run has been accepted but no stream state is available.
- `streaming`: output/tool events are actively arriving.
- `waiting_for_approval`: native event or statusline says a tool/user
  confirmation is pending.
- `blocked`: runtime is waiting for user input that is not a tool approval, or
  a known missing credential/auth condition.
- `completed`: last connector-owned run finished successfully.
- `failed`: last connector-owned run exited with a runtime error.
- `stopped`: instance/process has stopped.
- `unknown`: durable session exists but no live signal is available.

Do not mark a durable transcript as `idle` unless a native live API confirms it.
For transcript-only scans, report `unknown`.

### 5. Adapter Priority

Build in this order:

1. `cc-connect` Bridge adapter, because it already multiplexes multiple CLI
   agents and exposes bidirectional WebSocket events.
2. OpenCode server adapter, because its `/session` API directly matches the
   desired model.
3. OpenClaw Gateway adapter, because Shadow already treats OpenClaw as a primary
   runtime and its Gateway protocol has the right event model.
4. Shared process adapter for Claude Code, Cursor, Codex, Kimi, Copilot, and
   Antigravity.
5. Hermes API-server/ACP adapter, while keeping the Shadow Hermes platform
   plugin as the product messaging path.
6. Experimental native adapters for Codex app-server, Kimi Wire/ACP, Copilot
   ACP, and Antigravity if/when those interfaces become stable enough.

### 6. Process Adapter Rules

For CLIs without a native push API:

- Connector-created sessions should run as child processes with structured
  output enabled.
- Existing sessions can be resumed by spawning a new process with native resume
  flags.
- The connector may scan durable session metadata for inventory, but live state
  is process-scoped.
- The connector must not write native transcript databases/files.
- The connector must not type into an interactive TUI through simulated
  keystrokes.
- If a runtime supports a long-lived streaming input mode, the connector can use
  it only for sessions it owns.

### 7. Security Requirements

- Keep runtime servers bound to loopback by default.
- Generate per-runtime endpoint tokens and store them under
  `~/.shadowob/connector/`, never in Shadow-visible plaintext.
- Redact endpoint tokens, API keys, provider tokens, prompts, tool outputs, and
  local absolute paths unless the user explicitly opens a session detail view.
- Enforce server-side authorization for every push job:
  user -> connector computer -> runtime session -> Shadow conversation.
- Do not let a normal Shadow message automatically approve local tool use. Tool
  approvals should be a distinct action and should preserve native runtime
  semantics such as "allow once" vs "allow for session".
- Apply byte limits to message text, event payloads, attachments, and transcript
  fetches.
- Keep the connector daemon outbound-only to Shadow. Local runtime servers are
  contacted from the daemon over loopback; Shadow should never connect directly
  to them.

### 8. Data Model

Add server-side tables or equivalent durable records:

- `connector_runtime_instances`
  - `id`, `computer_id`, `runtime_id`, `endpoint_kind`, `status`,
    `version`, `pid`, `capabilities`, `last_seen_at`, `metadata`
- `connector_runtime_sessions`
  - `id`, `computer_id`, `runtime_id`, `instance_id`, `native_session_id`,
    `title`, `work_dir_hash`, `state`, `model`, `last_activity_at`,
    `context_usage`, `metadata`
- `connector_runtime_session_events`
  - short-retention append log for state transitions, message summaries, tool
    summaries, approval prompts, and errors
- `connector_session_bindings`
  - maps Shadow conversations/messages/Buddies to runtime sessions

`work_dir` should be hashed by default. Reveal the clear path only to the
computer owner in trusted UI surfaces.

### 9. CLI Additions

Add these commands:

```bash
shadowob-connector runtime-scan --sessions --json
shadowob-connector runtime-watch --runtime opencode --json
shadowob-connector session-list --runtime opencode --json
shadowob-connector session-send --runtime opencode --session <id> --message -
shadowob-connector session-abort --runtime opencode --session <id>
```

`daemon` should use the same adapter code rather than having separate scan and
daemon implementations.

### 10. Acceptance Criteria

Phase 1:

- `runtime-scan --sessions --json` returns install, instance, and session
  inventory for cc-connect, OpenCode, and transcript-backed Claude Code.
- Heartbeat stores normalized runtime sessions without breaking existing
  runtime-only clients.
- No full transcript or secret values are sent in heartbeat.

Phase 2:

- A Shadow user can choose a connector computer, runtime, and existing session,
  then send a message to it.
- cc-connect and OpenCode stream state changes back to Shadow.
- Claude/Cursor/Codex process adapters expose connector-owned run state
  through JSONL events.

Phase 3:

- Approval prompts are surfaced as explicit Shadow actions.
- Abort works for native adapters and connector-owned child processes.
- Session binding lets a Shadow thread continue the same runtime session.

Phase 4:

- Add Hermes API/ACP support and experimental adapters behind feature flags.
- Add transcript/detail fetch with strict byte limits and redaction.

## Implemented Phase 1 Slice

Implemented on 2026-06-01 in `packages/connector`:

- `runtime-scan --sessions` now includes normalized runtime session snapshots
  for OpenCode and Claude Code.
- `runtime-watch` renders a lightweight terminal monitor panel; `--json` emits
  newline-delimited event JSON with `snapshot`, `session_added`,
  `session_changed`, and `session_removed` events.
- `session-list` prints normalized session inventory.
- `session-send` pushes messages to OpenCode through `prompt_async` and to
  Claude Code through `claude -p --resume`.
- OpenCode timestamps are normalized from millisecond values, model objects are
  normalized to `provider/model`, and missing `/session/status` entries are
  treated as `idle` only when a live OpenCode server confirms the session list.
- Claude Code transcript-only sessions remain `unknown`; connector-owned resume
  processes are detected with a lightweight process scan and reported as
  `running` while the process is alive.
- Event JSON intentionally avoids full native session payloads, transcripts,
  token/cost details, and transcript paths. Current payloads keep only compact
  adapter metadata such as OpenCode slug/agent/version or Claude transcript
  filename.

Field test results from this machine:

| Runtime | Version | Test | Result |
| --- | --- | --- | --- |
| OpenCode | 1.15.6 | `opencode serve --hostname 127.0.0.1 --port 4096` plus connector `session-list`, `runtime-watch --json`, and `session-send` | `/global/health` returned healthy, `/session` listed sessions, `session-send` accepted a probe message, and watch observed `idle -> running -> idle` with native `{ type: "busy" }` while the response completed. |
| OpenCode | 1.15.6 | Terminal panel | `runtime-watch --runtime opencode --once` rendered the instance and the newest sessions with normalized states and timestamps. |
| Claude Code | 2.1.143 | Transcript scan | `session-list --runtime claude-code --json` found local JSONL sessions and marked transcript-only state as `unknown`. |
| Claude Code | 2.1.143 | Headless resume push | A probe session was created with `claude -p --output-format stream-json --verbose`; connector `session-send --runtime claude-code --session <id>` resumed it successfully and returned stream JSON result text. |
| Claude Code | 2.1.143 | Process watch | `runtime-watch --runtime claude-code --json` observed the connector-owned resume process as `unknown -> running -> unknown`. |

Confirmed limitations:

- OpenCode monitoring requires a reachable loopback `opencode serve` instance.
  Without it, the adapter falls back to best-effort CLI inventory and cannot
  report live state.
- Claude Code still has no documented local API for injecting into another
  already-running interactive TUI. The supported push path is a new headless
  resume process; only connector-owned resume processes have live `running`
  state.
- There is no `session-abort` command yet, though OpenCode has a native abort
  API and Claude connector-owned child processes can be terminated in a later
  phase.

### Exploratory Performance Findings

Measured on 2026-06-01 on a macOS arm64 machine with these catalog runtimes
installed: Claude Code, Codex CLI, OpenCode, Cursor CLI, Kimi Code,
GitHub Copilot CLI, and Antigravity CLI. OpenClaw and Hermes Agent were missing.

Commands were run through the built connector CLI, so these numbers include
Node process startup cost. A desktop integration should do better by keeping
the connector monitor alive and by caching scan results.

| Scenario | Result size | Wall time | User+sys CPU | Peak RSS | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| `runtime-scan --json` | 5 KB | 3.08s | 3.58s | 205 MB | Catalog version scan over all 10 runtimes. |
| `runtime-scan --sessions --json`, no OpenCode server | 59 KB | 4.35s | 4.71s | 254 MB | Adds OpenCode CLI fallback plus Claude transcript scan. |
| `runtime-watch --json --once`, no OpenCode server | 39 KB | 2.29s | 1.32s | 259 MB | OpenCode fallback returns CLI sessions with `unknown` state. |
| `session-list --runtime claude-code --json` | 42 KB | 0.39s | 0.26s | 88 MB | Transcript scan found 78 sessions. |
| `session-list --runtime opencode --json`, no OpenCode server | 9 KB | 1.14s | 0.98s | 254 MB | Heavy because it spawns OpenCode CLI fallback. |
| `session-list --runtime opencode --json`, OpenCode server running | 30 KB | 0.73s | 0.14s | 76 MB | Native HTTP API, 50 sessions. |
| `session-list --runtime all --json`, OpenCode server running | 72 KB | 0.76s | 0.33s | 116 MB | Native OpenCode plus Claude transcript scan, 128 sessions. |
| `runtime-watch --json --once`, OpenCode server running | 55 KB | 0.74s | 0.32s | 99 MB | First event is a full snapshot. |
| Five fresh `runtime-watch --json --once` processes, OpenCode server running | output discarded | 2.08s | 1.79s | 103 MB | Process startup dominates repeated one-shot scans. |
| One `runtime-watch --json` process for 6s at 1s poll, OpenCode server running | 55 KB | 6.02s | 0.99s | 148 MB | Only first snapshot emitted; later polls still scanned. |
| One `runtime-watch --json` process for 6s at 1s poll, no OpenCode server | 39 KB | 7.40s | 3.33s | 254 MB | Bad path: repeated CLI fallback is too expensive for desktop polling. |

Boundary behavior found during the run:

- Unsupported session runtimes currently return an empty successful snapshot.
  Example: `session-list --runtime codex --json` returns `runtimeIds: []`
  instead of a clear "session monitoring is not supported yet" result. Desktop
  should not depend on this behavior; the CLI should be changed to return an
  explicit unsupported-capability diagnostic.
- OpenCode without a loopback server reports the instance as `available` with
  only `sessionList` capability and `error: "fetch failed"`. This is accurate
  enough for inventory, but it is not monitor-ready and should be displayed as
  `Installed / Monitoring not enabled`.
- OpenCode CLI fallback sessions have `unknown` state and no normalized
  timestamps. Desktop should not poll this path continuously.
- The catalog version scan currently uses synchronous version commands without
  per-command timeouts. A hanging `--version` command can block the whole scan.

Performance guardrails before desktop integration:

- Do not run `runtime-scan` on every settings render. Cache catalog install
  status for at least 30-60 seconds and refresh on explicit `Scan runtimes`.
- Add per-command timeouts to runtime version detection. A stuck runtime should
  become `scanError`, not block the full page.
- Split `fast install scan` from `capability/session scan`. Opening the
  Connector tab should render cached install state immediately, then fill in
  capabilities asynchronously.
- For OpenCode, prefer enabling a managed loopback server over polling CLI
  fallback. If no server is running, scan the CLI fallback only on manual
  refresh or at a slow interval such as 60 seconds.
- Use a single long-lived monitor process or in-process adapter in Electron
  main. Avoid spawning a new connector CLI process every poll.
- Emit a compact first snapshot for desktop, or page/limit sessions. The current
  full snapshot is 40-70 KB on this machine; that is fine occasionally but too
  large for frequent IPC if more runtimes add session inventory.
- Poll intervals below 5 seconds should be reserved for native watch APIs or
  connector-owned active sessions. Durable transcript/CLI fallback scans should
  use slower intervals and change detection.

## Desktop Product Model

The desktop connector UI must not collapse every local runtime into a generic
"Coding Agent" label. User-facing labels should use either the specific runtime
name, such as `Claude Code`, `OpenCode`, or `Codex CLI`, or the specific Buddy
name, such as `Buddy "Release Helper"`.

The desktop app should model three separate things:

1. Connector computer
   - The Shadow desktop connector process and its authenticated relationship to
     Shadow.
   - Example status copy: `Connector running`, `Signed in`, `Last heartbeat 12s
     ago`.
   - This is not a runtime. If the connector is online but no runtime is ready,
     no runtime should be shown as ready.

2. Local runtimes
   - The installed binaries, managed services, local servers, and session
     adapters on this computer.
   - Example cards: `Claude Code`, `OpenCode`, `Codex CLI`, `Hermes Agent`.
   - Runtime cards can be installed but not monitor-ready. For example,
     OpenCode can be installed while no `opencode serve` instance is reachable.

3. Buddy bindings and local sessions
   - A Buddy binding maps a Shadow Buddy to a connector computer, runtime, and
     working directory.
   - A local runtime session is a native session inside a runtime. It can be:
     - `buddy`: created by or explicitly bound to a Shadow Buddy.
     - `connectorOwned`: created by the connector for a direct runtime action.
     - `unboundLocal`: discovered locally but not connected to Shadow.

Avoid the word "wild" in the product UI. Use `Unbound local session` for
sessions discovered on the computer but not bound to a Shadow Buddy.

### Desktop Connector Page Layout

The Connector settings tab should be split into four sections.

1. Connector
   - Shows daemon status, server URL, account/owner status, auto-start, and last
     heartbeat.
   - Primary actions: start/stop connector, sign in, copy daemon command, open
     logs.

2. Local runtimes
   - Shows every runtime from `CONNECTOR_RUNTIME_CATALOG`, not only runtimes
     with session adapters.
   - Each row should show:
     - Runtime display name and version.
     - Install state.
     - Integration readiness.
     - Monitoring capability.
     - Push capability.
     - Primary action: install, configure, enable monitoring, retry scan, or
       help.

3. Connected Buddies
   - Shows Shadow Buddies already bound to this computer.
   - Each row should show:
     - Buddy name.
     - Runtime name, not a generic agent label.
     - Work directory label.
     - Binding status.
     - Last accepted runtime/session event if available.
   - Primary actions: change directory, switch runtime, reconnect, disconnect.

4. Local sessions
   - Default collapsed because local sessions can reveal sensitive project or
     prompt context.
   - Shows a sanitized local-only summary by default:
     - Runtime name.
     - Session age/activity.
     - Normalized state.
     - Binding status: `Bound to Buddy`, `Connector-owned`, or `Unbound local`.
   - Primary actions: bind to a Buddy, ignore, or view locally.
   - Full title, clear work directory, and transcript preview require an
     explicit owner action and should not be uploaded by default.

### Runtime Readiness Model

Runtime readiness must be computed from multiple dimensions. A runtime is not
`ready` just because its binary exists.

```ts
type DesktopRuntimeInstallState =
  | 'missing'
  | 'installing'
  | 'installed'
  | 'upgradeAvailable'
  | 'installError'

type DesktopRuntimeIntegrationState =
  | 'unconfigured'
  | 'configuring'
  | 'ready'
  | 'degraded'
  | 'unsupported'
  | 'error'

type DesktopRuntimeMonitorState =
  | 'none'
  | 'available'
  | 'watching'
  | 'connectorOwnedOnly'
  | 'unavailable'
  | 'error'

type DesktopRuntimePushState =
  | 'none'
  | 'available'
  | 'connectorOwnedOnly'
  | 'requiresResumeProcess'
  | 'unavailable'
  | 'error'
```

Display readiness should follow this rule:

- `Not installed`: install state is `missing`.
- `Installed`: binary exists, but no Shadow integration or session adapter is
  ready.
- `Needs setup`: runtime exists but auth, server, plugin, bridge, or working
  directory setup is incomplete.
- `Ready`: runtime exists and the adapter can do its advertised product action.
  For a native runtime this means its local server/gateway/bridge is reachable.
  For a process runtime this means connector can start a structured child
  process.
- `Limited`: runtime exists but only install detection or transcript inventory
  is available.
- `Error`: last scan/install/configuration failed with actionable detail.

### Buddy Binding State

Buddy connection should be represented separately from runtime readiness:

```ts
type DesktopBuddyRuntimeBindingState =
  | 'unbound'
  | 'pendingConfigure'
  | 'connected'
  | 'runtimeUnavailable'
  | 'needsReconnect'
  | 'disconnected'
  | 'error'
```

Rules:

- A Buddy can be `connected` only when the connector computer is online and the
  target runtime is at least `Ready` for that Buddy's delivery mode.
- A Buddy whose runtime is installed but whose monitor adapter is not available
  can still be connected for chat delivery if the runtime plugin/bridge accepts
  Shadow messages.
- A Buddy should not be auto-bound to an `unboundLocal` session. Binding must be
  explicit because local sessions may include private prompts, repository
  paths, and tool output.
- Reconnect jobs should target Buddy bindings, not arbitrary local sessions.

### Local Session Visibility

Local sessions should have a visibility class:

```ts
type RuntimeSessionOrigin = 'buddy' | 'connectorOwned' | 'unboundLocal'

type RuntimeSessionVisibility =
  | 'localSummaryOnly'
  | 'ownerVisible'
  | 'buddyBound'
  | 'serverVisible'
```

Default handling:

- `unboundLocal` sessions stay `localSummaryOnly`.
- `connectorOwned` sessions can be `ownerVisible` and may stream state through
  the connector because the connector created them.
- `buddy` sessions can be `buddyBound` and may sync compact state to Shadow.
- `serverVisible` requires explicit product approval and should be avoided for
  full transcripts in the first release.

## Runtime Coverage Matrix

This matrix covers every runtime in `CONNECTOR_RUNTIME_CATALOG` plus
`cc-connect`, which is not a catalog runtime but is a connector target and
bridge.

| Runtime | Product label | Install scan | Install/config action | Monitoring path | Push path | Desktop readiness rule |
| --- | --- | --- | --- | --- | --- | --- |
| OpenClaw | `OpenClaw` | `openclaw --version` or catalog detection | Install script, then configure Shadow plugin/channel and gateway | Native Gateway WebSocket and Gateway RPC/session tools | Gateway RPC/session tools | `Ready` only when gateway RPC is reachable; otherwise `Installed` or `Needs setup`. |
| Hermes Agent | `Hermes Agent` | `hermes --version` or catalog detection | Install script/pipx, then configure Shadow plugin or API/ACP mode | Plugin heartbeat for Buddy delivery; SQLite/session files for inventory; API server or ACP for connector-owned runs | Shadow plugin for Buddy chat; API server/ACP for direct runtime sessions | `Ready` for Buddy chat when Shadow plugin is configured; `Limited` for session monitoring unless API server or ACP is owned by connector. |
| cc-connect | `cc-connect Bridge` | Target config/binary detection, not catalog runtime detection | Install pinned Shadow-capable fork, configure bridge token and platform | Bridge REST for inventory and WebSocket for events | Bridge REST/WebSocket | `Ready` when daemon/bridge is running and authenticated; expose as bridge capability, not as a standalone agent runtime row unless product needs it. |
| Claude Code | `Claude Code` | `claude --version` | npm install and optional settings validation | Transcript inventory plus connector-owned process watch | `claude -p --resume <session>`; long-lived streaming input only for connector-owned sessions | `Ready` for resume push when CLI is installed and auth works; `Limited` for arbitrary TUI sessions because there is no documented injection API. |
| Codex CLI | `Codex CLI` | `codex --version` | npm install and auth/status validation | Process adapter using `codex exec --json`; experimental app-server/remote-control behind a feature flag | `codex exec resume` or `codex resume` through structured process | `Ready` for process-owned jobs after auth validation; `Limited` until stable session inventory is implemented. |
| OpenCode | `OpenCode` | `opencode --version` | npm install; optionally start managed loopback `opencode serve` with password | Native `/session` and `/session/status` from loopback server; CLI list fallback | `/session/:id/prompt_async` or `/session/:id/message` | `Ready` for monitoring only when loopback server is reachable; `Installed` when only the CLI exists. |
| Cursor CLI | `Cursor CLI` | `cursor-agent --version`, fallback `cursor` | Cursor install script and `cursor-agent status`/auth validation | Process adapter with `--print --output-format stream-json`; `ls` for inventory where available | `cursor-agent --resume <chatId> --print --output-format stream-json` | `Ready` when `cursor-agent` is authenticated and structured output works; `Limited` if only the editor CLI exists. |
| Kimi Code | `Kimi Code` | `kimi --version` | Kimi installer and auth validation | Process adapter first; ACP/Wire only when connector owns the server/process | `kimi -p` plus `--continue`/`--session`/`--resume`; ACP/Wire later | `Ready` for connector-owned process runs; `Limited` for Web UI/TUI sessions unless ACP/Wire is explicitly enabled and owned. |
| GitHub Copilot CLI | `GitHub Copilot CLI` | `copilot --version` | brew/script/winget install and GitHub auth validation | Read-only local session index for inventory; process adapter for connector-owned runs; first-party remote access is not a connector API | `copilot --prompt`/`--resume` process path; ACP only if explicitly enabled and owned | `Ready` for process-owned jobs after auth validation; `Limited` for first-party remote sessions. |
| Antigravity CLI | `Antigravity CLI` | `agy --version`, fallback `antigravity` | Open installer/help page and auth validation | Statusline observer when configured; process adapter for connector-owned conversations | `agy --conversation <uuid>` or connector-owned process | `Ready` for connector-owned process jobs; `Limited` for existing TUI sessions unless statusline observer is configured. |

### Install And Scan Flow

The desktop app should use one flow for every runtime:

1. Fast scan
   - Run catalog command/version checks.
   - Read existing connector target config where applicable.
   - Do not start heavy services.

2. Capability scan
   - Determine whether monitoring and push are available.
   - For native adapters, test loopback gateway/server/bridge health.
   - For process adapters, run a cheap auth/status probe where the runtime
     offers one. Do not send a model prompt for a scan.

3. Install
   - Run the catalog install command for the current platform.
   - Re-run fast scan and capability scan.
   - If a runtime needs a managed local service, ask before starting it unless
     the user enabled auto-start.

4. Configure
   - Configure Buddy delivery separately from runtime installation.
   - Store per-runtime service secrets under `~/.shadowob/connector/`.
   - Do not overwrite unrelated user runtime configuration.

5. Reconcile
   - Refresh connected Buddy bindings.
   - Enqueue reconnect jobs only for Buddies whose selected runtime became
     ready.
   - Keep unbound local sessions local until the owner explicitly binds them.

## Desktop Pet Runtime Notifications

The desktop pet should subscribe to normalized connector events from the main
process. It should not run scans directly in the renderer.

Suggested event names:

- `connector.runtime.ready`
- `connector.runtime.degraded`
- `connector.runtime.error`
- `connector.buddy.connected`
- `connector.buddy.runtimeUnavailable`
- `connector.session.waitingForApproval`
- `connector.session.completed`
- `connector.session.failed`

Notification copy must use concrete names:

- `Claude Code is ready.`
- `OpenCode is ready. 3 local sessions found.`
- `Buddy "Release Helper" is connected to Claude Code.`
- `OpenCode session is waiting for confirmation.`
- `Buddy "Release Helper" cannot reach OpenCode.`

Do not use:

- `Coding Agent is ready.`
- `Agent Runtime is online.`

Notification rules:

- Notify only on state transitions, not every scan.
- Dedupe by `(computerId, runtimeId, buddyId?, sessionId?, fromState,
  toState)` with a short time window.
- Do not notify for `unboundLocal` sessions by default. Show a quiet summary in
  the Connector tab instead: `7 unbound local sessions found`.
- Use `waiting_for_approval` notifications only when the current Shadow user is
  authorized to act on that runtime/Buddy binding.
- If a runtime becomes ready and multiple Buddies depend on it, group the
  notification: `Claude Code is ready. 2 Buddies can reconnect.`

## Logic Review

The current direction is sound if these constraints are preserved:

1. Runtime readiness and Buddy connection must stay separate.
   - A connector can be online while every runtime is missing.
   - A runtime can be installed while no Buddy is connected.
   - A Buddy can be connected for Shadow chat while session monitoring for that
     runtime is only limited.

2. Binary detection is not readiness.
   - `runtime-scan` can show `installed`, but product `ready` requires an
     adapter-specific capability check.
   - OpenCode needs a reachable loopback server for monitoring.
   - Claude Code can resume through a new headless process but cannot inject
     into another active TUI.

3. Local sessions are not automatically Shadow sessions.
   - Discovered runtime sessions start as `unboundLocal`.
   - Binding a local session to a Buddy is an explicit owner action.
   - Reconnect automation should use Buddy bindings, not arbitrary discovered
     sessions.

4. Product copy must be name-specific.
   - Runtime cards use runtime names from `CONNECTOR_RUNTIME_CATALOG`.
   - Buddy cards use Buddy display names.
   - The desktop pet should never show generic `Coding Agent` copy for runtime
     state.

5. Privacy defaults must be local-first.
   - Full prompt text, transcript content, clear local paths, tokens, costs, and
     tool output are not heartbeat data.
   - The server can store compact state for bound Buddy sessions.
   - Unbound local session summaries remain on the owner computer unless the
     user explicitly binds or opens a detail view.

6. Installation and configuration must be idempotent.
   - Installer commands may add binaries, but configure actions must merge
     existing runtime config.
   - Managed loopback services need generated credentials and loopback-only
     binding.
   - The app should provide `Retry scan` and `Open help` for every runtime, even
     when no adapter exists yet.

7. The UI must represent unsupported capability honestly.
   - A runtime with install detection but no monitor adapter should be shown as
     `Installed` plus `Monitoring not available yet`, not hidden.
   - `Ready` should be scoped, for example `Ready for Buddy chat`, `Ready for
     monitoring`, or `Ready for resume push`.

## Open Questions

- Should Shadow expose runtime sessions only to the computer owner, or also to
  server admins when the Buddy is installed in a server?
- Should a Shadow thread map one-to-one to a runtime session by default, or
  should the user explicitly bind a thread to a runtime session?
- Do we want connector-managed loopback servers to be auto-started, or should
  the UI require an explicit "enable monitoring for this runtime" action?
- How much native session history should be visible in Shadow, given local repo
  path and prompt sensitivity?
- Which runtimes should be allowed to receive attachments in the first release?

## Recommended First Implementation

Start with a minimal but real control plane:

1. Add the adapter interface and normalized session types in
   `packages/connector/src`.
2. Implement cc-connect Bridge and OpenCode server adapters.
3. Extend daemon heartbeat with compact session snapshots.
4. Add `runtime.session.send` daemon jobs.
5. Add a process adapter for Claude Code as the first non-native CLI runtime.

This gives Shadow one native bridge, one native standalone runtime, and one
process-only runtime. The differences between those three paths will validate
the abstraction before expanding to every CLI in the catalog.
