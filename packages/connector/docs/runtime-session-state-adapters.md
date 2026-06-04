# Runtime Session State Adapters

Research date: 2026-06-04

This document defines the connector's runtime-session state contract. It is
focused on completion notifications and follow-up message delivery, not runtime
installation detection.

## State Contract

The connector must not notify only because a transcript file changed. A session
notification means one turn reached a terminal or quiet state after the desktop
watcher started.

Normalized states:

| State | Meaning | Notify as completed? |
| --- | --- | --- |
| `running` | A user turn, tool call, tool result, or task is still in progress. | No |
| `streaming` | The assistant is producing output or reasoning, but no terminal marker was observed. | No |
| `waiting_for_approval` | Runtime is blocked on user permission. | No |
| `blocked` | Runtime stopped because it needs intervention, such as max tokens. | No by default |
| `completed` | Runtime emitted a terminal success marker for the turn. | Yes after settle/dedupe |
| `failed` | Runtime emitted a terminal failure marker. | Separate failure notification later |
| `stopped` | Runtime was aborted, rolled back, or removed. | No by default |
| `unknown` | Inventory exists but no reliable live state exists. | Only after quiet settle |

Each session snapshot and runtime-watch event also includes `petReaction` and
may include `petActivity`. These are connector-owned desktop-pet signals defined
in `@shadowob/shared/types`, so the desktop app can render reactions and short
activity bubbles without parsing runtime-native transcript shapes.

Desktop notification logic should treat `running`, `streaming`,
`waiting_for_approval`, and `blocked` as active. It should baseline sessions
older than the watch start time, dedupe by `runtimeId:instanceId:sessionId`,
and settle recent terminal/unknown updates before notifying.

## OpenCode

Primary source: `opencode serve`.

Inventory and live state:

- `GET /session` lists sessions.
- `GET /session/status` reports per-session live status.
- `POST /session/:id/prompt_async` sends a non-blocking prompt.
- Local fallback reads `~/.local/share/opencode/opencode.db`, then
  `storage/session_diff/*.json` if the server is unavailable.

Adapter rules:

- Prefer server status over file/database timestamps.
- Use database/storage only as inventory fallback; those sources should usually
  be `unknown`.
- Basic auth headers must be honored when `OPENCODE_SERVER_PASSWORD` is set.

References:

- `https://opencode.ai/docs/server/`
- `https://opencode.ai/docs/cli/`

## Claude Code

Primary source: transcript JSONL under `~/.claude/projects/<project>/*.jsonl`.
Claude Code has no documented local daemon API for third-party message injection
into an arbitrary user TUI session.

Useful official lifecycle semantics:

- `SessionStart` fires when a session starts or resumes.
- `UserPromptSubmit` fires before a turn starts.
- `Stop` fires when a turn ends successfully.
- `StopFailure` fires instead of `Stop` when the turn ends due to an API error.
- The hook input includes `session_id`, `transcript_path`, `cwd`, and event
  fields. This is the best semantic model for "done".

Transcript state rules:

- `type=user` starts or continues a running turn. Tool-result user entries also
  mean Claude is still in the agent loop.
- `type=assistant` with `message.stop_reason=tool_use` or a `tool_use` content
  block is `running`, not done.
- `type=assistant` with another non-empty `stop_reason` is `completed`.
- `stop_reason=max_tokens` is `blocked`.
- Metadata rows such as `last-prompt`, `ai-title`, `permission-mode`, and
  `file-history-snapshot` must not overwrite the last semantic state.
- `ps` output is only a supplemental running hint. Interactive Claude processes
  do not reliably expose the current session id in argv.

Push path:

- Use `claude -p --resume <session-id> --output-format stream-json --verbose`
  for connector-owned follow-up messages.
- A future connector-owned live session can use headless
  `--input-format stream-json` and keep child-process events as the live state
  source.

Reference projects and docs:

- Official hooks reference: `https://code.claude.com/docs/en/hooks`
- claude-devtools transcript reader: `https://www.claude-dev.tools/docs/transcripts`
- Hitch `pkg/sessions`: `https://pkg.go.dev/github.com/BrenanL/hitch/pkg/sessions`
- simonw transcript publisher: `https://github.com/simonw/claude-code-transcripts`

## Codex CLI

Primary source: rollout JSONL under
`~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<thread-id>.jsonl`.

Codex rollout files are not shaped like Claude transcripts. They use top-level
records such as:

- `session_meta`
- `turn_context`
- `response_item`
- `event_msg`
- `compacted`

Adapter rules:

- Read both head and tail. `session_meta` is normally at the head and is often
  absent from long-session tails.
- If metadata cannot be read, recover the session id from the rollout filename
  UUID suffix.
- `event_msg.payload.type=task_complete` is `completed`.
- `event_msg.payload.type=turn_aborted` or `thread_rolled_back` is `stopped`.
- `event_msg.payload.type` containing `error` or `failed` is `failed`.
- `response_item` tool calls, tool outputs, reasoning, web search calls, and
  image generation calls are active states (`running` or `streaming`).
- `response_item.payload.type=message` with `phase=final_answer` is still
  `streaming` until the later `task_complete` event appears.

Push path:

- Use `codex exec resume --json <session-id> <prompt>` for current CLI versions.
- Keep parsing JSONL stdout for future richer state, but do not rely on stdout
  alone for inventory because historical sessions live in rollout files.

Reference projects and docs:

- Codex rollout list source:
  `https://raw.githubusercontent.com/openai/codex/main/codex-rs/rollout/src/list.rs`
- Codex rollout recorder source:
  `https://raw.githubusercontent.com/openai/codex/main/codex-rs/rollout/src/recorder.rs`
- Codex issue documenting rollout JSONL shapes:
  `https://github.com/openai/codex/issues/24425`
- Codex CLI resume issue history:
  `https://github.com/openai/codex/issues/3817`

## Hermes Agent

Hermes is not yet part of `runtime-scan --sessions`, but its native state model
should be implemented before adding notifications.

Recommended sources:

- Read-only session inventory from `~/.hermes/state.db`.
- API server runs for connector-owned work.
- ACP session updates only when connector owns the ACP process.
- Shadow platform plugin heartbeat for Shadow messaging reachability.

Adapter rules:

- Do not infer completion from `hermes gateway` process liveness.
- Do not mutate `state.db` directly.
- Prefer native run/session status APIs over transcript timestamps.

References:

- `https://hermes-agent.nousresearch.com/docs/user-guide/sessions/`
- `https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server/`
- `https://hermes-agent.nousresearch.com/docs/user-guide/features/acp/`

## OpenClaw

OpenClaw is not currently scanned as a transcript runtime. Its Gateway is the
right source of truth when session notifications are added.

Recommended sources:

- Gateway WebSocket events for live session activity.
- Gateway RPC/session tools for history and push.
- `openclaw gateway status --json --require-rpc` for readiness.

Adapter rules:

- Do not use stored session rows as socket health.
- Separate gateway/channel health from agent-turn completion.
- Use the documented session tools instead of file scraping.

References:

- `https://docs.openclaw.ai/cli/gateway`
- `https://docs.openclaw.ai/concepts/session-tool`
- `https://docs.openclaw.ai/cli/channels`
