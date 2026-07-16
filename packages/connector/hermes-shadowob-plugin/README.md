# Hermes Shadow/OpenClaw Buddy Platform Plugin

This is a first-pass Hermes gateway platform adapter for Shadow/OpenClaw Buddy. It is packaged as a user plugin directory named `shadowob`.

It focuses on the messaging path:

- Shadow channel/direct/thread inbound messages to Hermes `MessageEvent`
- Hermes outbound text replies to Shadow messages
- `threadId` and `replyToId` routing via Hermes metadata
- Socket.IO realtime receive with REST polling fallback
- Optional REST-only polling mode
- Startup catch-up window
- Typing/activity emit over Socket.IO
- Inbound attachment download into Hermes media/document cache
- Outbound image/document/video/audio upload through Shadow media API
- Message edit/delete support for Hermes streaming/fresh-final cleanup
- Reaction helpers exposed on the adapter class
- Agent heartbeat/online status after resolving the Buddy agent id from `/api/auth/me`
- Dynamic channel and policy discovery through `/api/agents/:id/config`
- Optional slash command registration and slash-command prompt handling through `SHADOWOB_SLASH_COMMANDS_JSON`
- Interactive component sends via Shadow message metadata and interactive response forwarding to Hermes
- Cron/send_message standalone delivery through `SHADOWOB_HOME_CHANNEL`

It deliberately does not implement the whole Shadow product surface. Workspace, commerce, wallet, cloud sandbox, marketplace, OAuth and dashboard stats should be added as Hermes tools or an MCP server, not as platform-adapter logic.

## Install

Unzip this package into your Hermes plugins directory:

```bash
mkdir -p ~/.hermes/plugins
unzip hermes-shadowob-plugin.zip -d ~/.hermes/plugins
```

You should end up with:

```text
~/.hermes/plugins/shadowob/
  __init__.py
  adapter.py
  shadow_sdk.py
  plugin.yaml
  requirements.txt
```

Install plugin dependencies in the Python environment where Hermes runs:

```bash
pip install -r ~/.hermes/plugins/shadowob/requirements.txt
```

Enable the plugin if your Hermes build gates user plugins through `plugins.enabled`:

```bash
hermes plugins enable shadowob
```

Then configure environment variables or put equivalent values in `~/.hermes/config.yaml`.

## Environment variables

Required:

```bash
export SHADOWOB_SERVER_URL="https://your-shadow.example.com"
export SHADOWOB_TOKEN="shadow_access_token"
```

The plugin resolves the Buddy agent id and channel policy dynamically from Shadow. Static channel ids are not required.

```bash
export SHADOWOB_HEARTBEAT_INTERVAL_SECONDS=30

# Optional slash commands registered at startup
export SHADOWOB_SLASH_COMMANDS_JSON='[{"name":"audit","description":"Run an audit"}]'
```

Common optional settings:

```bash
export SHADOWOB_ALLOWED_USERS="user_id_or_username_1,user_id_or_username_2"
export SHADOWOB_ALLOW_ALL_USERS=false
export SHADOWOB_BUDDY_USER_ID="bot_user_id"      # optional; otherwise /api/auth/me is called
export SHADOWOB_BUDDY_USERNAME="bot_username"    # optional; used by mention-only filter
export SHADOWOB_MENTION_ONLY=false             # group/channel messages require @bot when true
export SHADOWOB_REPLY_TO_BUDDIES=false            # loop guard
export SHADOWOB_REST_ONLY=false                # true disables Socket.IO and uses polling
export SHADOWOB_POLL_INTERVAL_SECONDS=3
export SHADOWOB_CATCHUP_MINUTES=0              # set >0 to process recent messages on startup
export SHADOWOB_DOWNLOAD_MEDIA=true

# Advanced compatibility overrides; normally leave these unset so Shadow policy drives routing.
export SHADOWOB_CHANNEL_IDS="channel_id_1,channel_id_2"
export SHADOWOB_HOME_CHANNEL="channel_id_1"
export SHADOWOB_AGENT_ID="agent_id_1"
export SHADOWOB_SERVER_IDS="server_id_or_slug_1,server_id_or_slug_2"
export SHADOWOB_AUTO_DISCOVER_CHANNELS=true
```

## Example Hermes config.yaml fragment

```yaml
plugins:
  enabled:
    - shadowob

platforms:
  shadowob:
    enabled: true
    token: "${SHADOWOB_TOKEN}"
    extra:
      base_url: "${SHADOWOB_SERVER_URL}"
      slash_commands:
        - name: "audit"
          description: "Run an audit"
      mention_only: false
      rest_only: false
      catchup_minutes: 0
      download_media: true
```

## Metadata routing for outbound sends

The adapter accepts these Hermes send metadata keys:

```python
metadata={
    "thread_id": "shadow_thread_id",        # or threadId / shadow_thread_id
    "reply_to_message_id": "message_id",   # or replyToId / reply_to / shadow_reply_to_id
    "shadow_metadata": {...},               # supported card/interaction fields only
}
```

For thread replies, Hermes generally supplies `source.thread_id` through its normal gateway dispatch path. For custom tool calls, pass the keys above.

## Files

- `adapter.py`: Hermes `BasePlatformAdapter` implementation and plugin `register(ctx)` entrypoint.
- `shadow_sdk.py`: small async REST + Socket.IO client matching the subset of Shadow TS SDK used by the adapter.
- `plugin.yaml` / `PLUGIN.yaml`: plugin manifest and configuration prompts.
- `requirements.txt`: runtime dependencies.
- `tests/`: offline unit tests for small parsing helpers.

## v0.2.0 checks and fixes

This iteration fixes issues found during static review against the uploaded Shadow project and the current Hermes plugin contract:

- Corrected `pytest` import path handling so offline tests run from the plugin directory and from an extracted zip.
- Registered both Shadow event naming variants: current server broadcasts `message:updated` / `message:deleted`, while shared constants also define `message:update` / `message:delete`.
- Fixed REST polling shutdown condition so the polling loop stops when the adapter is disconnected.
- Fixed `env_enablement_fn` to return a flat seed dict, because Hermes merges all non-`home_channel` keys directly into `PlatformConfig.extra`.
- Changed env auto-enable and connector setup to require only Shadow endpoint/token; Buddy id and channel policy are now resolved dynamically from Shadow.
- Added OpenClaw-aligned dynamic handling for `channel:member-added`, `channel:member-removed`, `server:joined`, and `agent:policy-changed` events.
- Changed empty-channel startup from fatal to tolerant waiting. The adapter stays online, refreshes channel policy periodically, and uses the owner DM as the default home channel when available.
- Updated standalone media delivery to support local paths, `MEDIA:` refs, relative paths, Shadow private URLs and remote URLs through the SDK helper.

## Known limits in this first version

- Shadow interactive cards and commerce cards can be forwarded as `shadow_metadata` in outbound messages, but there is no LLM-facing Hermes tool schema in this package yet.
- Slash commands can be registered from JSON and routed into Hermes context; automatic discovery from Hermes skills/packs is not implemented yet.
- Buddy-chain rules are still simplified compared with `packages/openclaw-shadowob/src/monitor/preflight.ts`.
- REST polling uses recent message timestamps and an in-memory de-duplication set. It is not a persistent watermark store.
- External edits/deletes from Shadow are observed but not converted into Hermes conversation turns.

## Suggested next step

Add a separate Shadow tools plugin or MCP server for:

- `shadow_send_interactive`
- `shadow_send_commerce_card`
- `shadow_react_message`
- `shadow_edit_message`
- `shadow_delete_message`
- workspace/cloud/wallet/marketplace operations

Keeping these as tools avoids turning the platform adapter into business logic.
