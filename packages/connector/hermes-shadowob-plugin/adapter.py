"""Hermes platform adapter for Shadow/OpenClaw Buddy.

Install this directory as a Hermes plugin, usually at:

    ~/.hermes/plugins/shadowob/

This first version targets the messaging gateway path: channel/direct/thread
messages, media attachments, typing/activity, edit/delete, reactions and cron
standalone sends. Shadow business surfaces such as marketplace, wallet, cloud
sandbox and workspace APIs should be exposed as separate Hermes tools/MCPs.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from collections import deque
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

try:  # Hermes imports
    from gateway.config import Platform, PlatformConfig
    from gateway.platforms.base import (
        BasePlatformAdapter,
        MessageEvent,
        MessageType,
        SendResult,
        cache_audio_from_bytes,
        cache_document_from_bytes,
        cache_image_from_bytes,
        cache_video_from_bytes,
        resolve_channel_prompt,
        resolve_channel_skills,
    )
except Exception:  # pragma: no cover - lets local static checks import this file with stubs if needed.
    Platform = None  # type: ignore
    PlatformConfig = object  # type: ignore
    BasePlatformAdapter = object  # type: ignore
    MessageEvent = object  # type: ignore
    MessageType = object  # type: ignore
    SendResult = object  # type: ignore
    cache_audio_from_bytes = None  # type: ignore
    cache_document_from_bytes = None  # type: ignore
    cache_image_from_bytes = None  # type: ignore
    cache_video_from_bytes = None  # type: ignore

    def resolve_channel_prompt(config_extra: dict, channel_id: str, parent_id: str | None = None):
        return None

    def resolve_channel_skills(config_extra: dict, channel_id: str, parent_id: str | None = None):
        return None

try:
    from .shadow_sdk import ShadowApiError, ShadowAsyncClient, ShadowSocketClient, parse_bool, split_csv
except Exception:  # pragma: no cover - Hermes may load adapter.py as a loose module.
    from shadow_sdk import ShadowApiError, ShadowAsyncClient, ShadowSocketClient, parse_bool, split_csv  # type: ignore

logger = logging.getLogger(__name__)

PLATFORM_NAME = "shadowob"

_IMAGE_CT_PREFIXES = ("image/",)
_AUDIO_CT_PREFIXES = ("audio/",)
_VIDEO_CT_PREFIXES = ("video/",)
_DOCUMENT_CT_PREFIXES = ("application/", "text/")
_SLASH_COMMAND_RE = re.compile(r"^/([a-zA-Z][a-zA-Z0-9._-]{0,63})(?:\s+([\s\S]*))?$")
_TERMINAL_TASK_STATUSES = {"completed", "failed", "canceled", "transferred"}


def _visible_text(text: str) -> str:
    return text.replace("\u200b", "").strip()


def _extra(config: Any) -> dict[str, Any]:
    value = getattr(config, "extra", None)
    return value if isinstance(value, dict) else {}


def _cfg(config: Any, env_name: str, *extra_names: str, default: Any = None) -> Any:
    env_value = os.getenv(env_name)
    if env_value not in (None, ""):
        return env_value
    extra = _extra(config)
    for name in extra_names:
        if name in extra and extra[name] not in (None, ""):
            return extra[name]
    attr = env_name.lower().replace("shadow_", "")
    if hasattr(config, attr):
        value = getattr(config, attr)
        if value not in (None, ""):
            return value
    return default


def _token_from_config(config: Any) -> str:
    return str(
        os.getenv("SHADOW_TOKEN")
        or getattr(config, "token", None)
        or getattr(config, "api_key", None)
        or _extra(config).get("token")
        or _extra(config).get("api_key")
        or ""
    ).strip()


def _base_url_from_config(config: Any) -> str:
    return str(
        os.getenv("SHADOW_BASE_URL")
        or os.getenv("SHADOW_SERVER_URL")
        or _extra(config).get("base_url")
        or _extra(config).get("server_url")
        or _extra(config).get("serverUrl")
        or ""
    ).strip()


def _home_channel_id(config: Any) -> str | None:
    raw = os.getenv("SHADOW_HOME_CHANNEL") or _extra(config).get("home_channel")
    if raw:
        if isinstance(raw, dict):
            return str(raw.get("chat_id") or raw.get("channel_id") or raw.get("id") or "") or None
        return str(raw).strip() or None
    hc = getattr(config, "home_channel", None)
    if hc is not None:
        value = getattr(hc, "chat_id", None)
        if value:
            return str(value)
    return None


def _channel_ids_from_config(config: Any) -> list[str]:
    values: list[str] = []
    values.extend(split_csv(os.getenv("SHADOW_CHANNEL_IDS")))
    values.extend(split_csv(os.getenv("SHADOW_CHANNEL_ID")))
    extra = _extra(config)
    values.extend(split_csv(extra.get("channel_ids")))
    values.extend(split_csv(extra.get("channels")))
    values.extend(split_csv(extra.get("channel_id")))
    home = _home_channel_id(config)
    if home:
        values.append(home)
    seen: set[str] = set()
    result: list[str] = []
    for item in values:
        if item and item not in seen:
            seen.add(item)
            result.append(item)
    return result


def _server_ids_from_config(config: Any) -> list[str]:
    values: list[str] = []
    values.extend(split_csv(os.getenv("SHADOW_SERVER_IDS")))
    extra = _extra(config)
    values.extend(split_csv(extra.get("server_ids")))
    values.extend(split_csv(extra.get("servers")))
    values.extend(split_csv(extra.get("server_id")))
    seen: set[str] = set()
    result: list[str] = []
    for item in values:
        if item and item not in seen:
            seen.add(item)
            result.append(item)
    return result


def _metadata_thread_id(metadata: dict[str, Any] | None) -> str | None:
    if not metadata:
        return None
    for key in ("thread_id", "threadId", "shadow_thread_id"):
        value = metadata.get(key)
        if value not in (None, ""):
            return str(value)
    source = metadata.get("source")
    if source is not None:
        value = getattr(source, "thread_id", None)
        if value:
            return str(value)
    return None


def _metadata_reply_to(metadata: dict[str, Any] | None, fallback: str | None = None) -> str | None:
    if not metadata:
        return fallback
    for key in ("reply_to_message_id", "replyToId", "reply_to", "shadow_reply_to_id"):
        value = metadata.get(key)
        if value not in (None, ""):
            return str(value)
    return fallback


def _metadata_payload(metadata: dict[str, Any] | None) -> dict[str, Any] | None:
    if not metadata:
        return None
    raw = metadata.get("shadow_metadata") or metadata.get("metadata")
    if isinstance(raw, dict):
        return raw
    forwarded: dict[str, Any] = {}
    for key in ("interactive", "commerce", "commerceCard", "commerceCards", "commerceOfferId", "slashCommand"):
        if key in metadata:
            forwarded[key] = metadata[key]
    return forwarded or None


def _parse_json_list(value: Any) -> list[dict[str, Any]]:
    if value in (None, ""):
        return []
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except Exception:
            return []
        if isinstance(parsed, list):
            return [item for item in parsed if isinstance(item, dict)]
        if isinstance(parsed, dict) and isinstance(parsed.get("commands"), list):
            return [item for item in parsed["commands"] if isinstance(item, dict)]
    return []


def _parse_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        parsed = int(float(str(value)))
        return parsed if parsed >= 0 else None
    except Exception:
        return None


def _parse_waveform_peaks(value: Any) -> list[int] | None:
    if value in (None, ""):
        return None
    raw = value
    if isinstance(value, str):
        try:
            raw = json.loads(value)
        except Exception:
            return None
    if not isinstance(raw, list):
        return None
    peaks: list[int] = []
    for item in raw:
        parsed = _parse_int(item)
        if parsed is None or parsed < 0 or parsed > 100:
            return None
        peaks.append(parsed)
    return peaks if 32 <= len(peaks) <= 96 else None


def _normalize_slash_command_name(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    name = value.strip().lstrip("/")
    return name if re.match(r"^[a-zA-Z][a-zA-Z0-9._-]{0,63}$", name) else None


def _slash_command_match(
    content: str,
    commands: list[dict[str, Any]],
) -> tuple[dict[str, Any], str, str] | None:
    match = _SLASH_COMMAND_RE.match(content.strip())
    if not match:
        return None
    invoked = match.group(1)
    args = (match.group(2) or "").strip()
    invoked_key = invoked.lower()
    for command in commands:
        name = _normalize_slash_command_name(command.get("name"))
        aliases = [
            alias
            for alias in (_normalize_slash_command_name(item) for item in command.get("aliases") or [])
            if alias
        ]
        if name and (name.lower() == invoked_key or invoked_key in {alias.lower() for alias in aliases}):
            return command, invoked, args
    return None


def _format_slash_command_prompt(
    original_text: str,
    match: tuple[dict[str, Any], str, str],
) -> str:
    command, _invoked, args = match
    name = _normalize_slash_command_name(command.get("name")) or "unknown"
    chunks = [
        f"Slash command /{name} was invoked.",
        f"Description: {command.get('description')}" if command.get("description") else "",
        f"Pack: {command.get('packId')}" if command.get("packId") else "",
        f"Arguments:\n{args or '(none)'}",
        f"Command definition:\n{command.get('body')}" if command.get("body") else "",
        f"Original message:\n{original_text}",
    ]
    return "\n\n".join(item for item in chunks if item)


def _slash_interactive_block(
    match: tuple[dict[str, Any], str, str],
    message_id: str,
) -> dict[str, Any] | None:
    command, _invoked, _args = match
    interaction = command.get("interaction")
    if not isinstance(interaction, dict):
        return None
    name = _normalize_slash_command_name(command.get("name")) or "command"
    block = dict(interaction)
    block["id"] = (
        f"{block['id']}:{message_id}"
        if str(block.get("id") or "").strip()
        else f"slash:{command.get('packId') or 'pack'}:{name}:{message_id}"
    )
    return block


def _interactive_response_source_id(message: dict[str, Any]) -> str | None:
    metadata = message.get("metadata")
    if not isinstance(metadata, dict):
        return None
    response = metadata.get("interactiveResponse")
    if not isinstance(response, dict):
        return None
    value = response.get("sourceMessageId") or response.get("source_message_id")
    return str(value) if value else None


def _interactive_response_text(
    text: str,
    message: dict[str, Any],
    source_message: dict[str, Any] | None = None,
) -> str:
    metadata = message.get("metadata")
    if not isinstance(metadata, dict):
        return text
    response = metadata.get("interactiveResponse")
    if not isinstance(response, dict):
        return text
    source_metadata = source_message.get("metadata") if isinstance(source_message, dict) else None
    source_interactive = source_metadata.get("interactive") if isinstance(source_metadata, dict) else None
    source_slash = source_metadata.get("slashCommand") if isinstance(source_metadata, dict) else None
    source_prompt = source_interactive.get("prompt") if isinstance(source_interactive, dict) else None
    response_prompt = source_interactive.get("responsePrompt") if isinstance(source_interactive, dict) else None
    values = response.get("values")
    summary_lines = [
        "[Shadow interactive response]",
        f"sourceMessage: {source_message.get('content')}" if isinstance(source_message, dict) else "",
        f"sourcePrompt: {source_prompt}" if isinstance(source_prompt, str) and source_prompt.strip() else "",
        f"followUpInstruction: {response_prompt}" if isinstance(response_prompt, str) and response_prompt.strip() else "",
        (
            "sourceSlashCommand: " + json.dumps(source_slash, ensure_ascii=False, sort_keys=True)
            if isinstance(source_slash, dict)
            else ""
        ),
        f"blockId: {response.get('blockId') or ''}",
        f"actionId: {response.get('actionId') or ''}",
        f"value: {response.get('value') or ''}",
        (
            "fields: " + json.dumps(values, ensure_ascii=False, sort_keys=True)
            if isinstance(values, dict) and values
            else ""
        ),
    ]
    summary = "\n".join(item for item in summary_lines if item)
    return f"{text}\n\n{summary}" if text else summary


def _message_created_at(message: dict[str, Any]) -> datetime | None:
    raw = message.get("createdAt") or message.get("created_at")
    if not raw:
        return None
    if isinstance(raw, datetime):
        return raw if raw.tzinfo else raw.replace(tzinfo=timezone.utc)
    try:
        text = str(raw).replace("Z", "+00:00")
        dt = datetime.fromisoformat(text)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _message_author(message: dict[str, Any]) -> dict[str, Any]:
    author = message.get("author")
    return author if isinstance(author, dict) else {}


def _message_author_name(message: dict[str, Any]) -> str | None:
    author = _message_author(message)
    for key in ("displayName", "display_name", "username", "name"):
        value = author.get(key)
        if value:
            return str(value)
    if message.get("authorId"):
        return str(message.get("authorId"))
    return None


def _message_author_id(message: dict[str, Any]) -> str | None:
    value = message.get("authorId") or message.get("author_id")
    return str(value) if value else None


def _message_id(message: dict[str, Any]) -> str | None:
    value = message.get("id") or message.get("messageId") or message.get("message_id")
    return str(value) if value else None


def _message_channel_id(message: dict[str, Any]) -> str | None:
    value = message.get("channelId") or message.get("channel_id")
    return str(value) if value else None


def _message_thread_id(message: dict[str, Any]) -> str | None:
    value = message.get("threadId") or message.get("thread_id")
    return str(value) if value else None


def _message_reply_to_id(message: dict[str, Any]) -> str | None:
    value = message.get("replyToId") or message.get("reply_to_id") or message.get("replyTo")
    return str(value) if value else None


def _message_cards(message: dict[str, Any]) -> list[dict[str, Any]]:
    metadata = message.get("metadata")
    if not isinstance(metadata, dict):
        return []
    cards = metadata.get("cards")
    if not isinstance(cards, list):
        return []
    return [card for card in cards if isinstance(card, dict)]


def _card_id(card: dict[str, Any]) -> str | None:
    value = card.get("id") or card.get("cardId") or card.get("card_id")
    return str(value) if value else None


def _task_card_by_id(message: dict[str, Any], card_id: str | None) -> dict[str, Any] | None:
    if not card_id:
        return None
    for card in _message_cards(message):
        if str(card.get("id") or "") == card_id:
            return card
    return None


def _task_card_claim_expired(card: dict[str, Any]) -> bool:
    claim = card.get("claim")
    expires_at = claim.get("expiresAt") if isinstance(claim, dict) else None
    if not expires_at:
        return True
    try:
        expires = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        return expires <= datetime.now(timezone.utc)
    except Exception:
        return True


def _task_card_matches_self(card: dict[str, Any], *, bot_user_id: str | None, agent_id: str | None) -> bool:
    if card.get("kind") != "task":
        return False
    status = str(card.get("status") or "").lower()
    if status in _TERMINAL_TASK_STATUSES:
        return False
    assignee = card.get("assignee")
    if not isinstance(assignee, dict):
        return True
    assigned_user = assignee.get("userId") or assignee.get("user_id")
    assigned_agent = assignee.get("agentId") or assignee.get("agent_id")
    if bot_user_id and assigned_user and str(assigned_user) == bot_user_id:
        return True
    if agent_id and assigned_agent and str(assigned_agent) == agent_id:
        return True
    return not assigned_user and not assigned_agent


def _message_task_card_for_self(
    message: dict[str, Any],
    *,
    bot_user_id: str | None,
    agent_id: str | None,
) -> dict[str, Any] | None:
    for card in _message_cards(message):
        if _task_card_matches_self(card, bot_user_id=bot_user_id, agent_id=agent_id):
            return card
    return None


def _format_task_card_prompt(
    text: str,
    card: dict[str, Any],
    *,
    message_id: str | None = None,
) -> str:
    title = str(card.get("title") or "Inbox task").strip()
    body = str(card.get("body") or "").strip()
    priority = str(card.get("priority") or "").strip()
    source = card.get("source") if isinstance(card.get("source"), dict) else {}
    source_label = str(source.get("label") or source.get("command") or "").strip()
    card_id = str(card.get("id") or "").strip()
    claim = card.get("claim") if isinstance(card.get("claim"), dict) else {}
    claim_id = str(claim.get("id") or "").strip()
    data = card.get("data") if isinstance(card.get("data"), dict) else {}
    task_data = data.get("task") if isinstance(data.get("task"), dict) else {}
    workspace_id = str(task_data.get("workspaceId") or "").strip()
    lines = ["[Shadow Inbox task]", f"Title: {title}"]
    if message_id:
        lines.append(f"Task message id: {message_id}")
    if card_id:
        lines.append(f"Task card id: {card_id}")
    if claim_id:
        lines.append(f"Task claim id: {claim_id}")
    if workspace_id:
        lines.append(f"Task workspace id: {workspace_id}")
    if priority:
        lines.append(f"Priority: {priority}")
    if source_label:
        lines.append(f"Source: {source_label}")
    if message_id and card_id and claim_id:
        lines.extend(
            [
                "",
                "Bind Shadow Server App command calls for this task with:",
                f"--task-message-id {message_id} --task-card-id {card_id} --task-claim-id {claim_id}",
            ]
        )
    if body:
        lines.extend(["", body])
    if text and text.strip() and text.strip() not in {title, body}:
        lines.extend(["", "Original message:", text.strip()])
    return "\n".join(lines)


def _text_without_self_mention(text: str, username: str | None) -> str:
    if not username:
        return text
    import re

    escaped = re.escape(username.lstrip("@"))
    return re.sub(rf"@{escaped}(?:\s+|$)", "", text, flags=re.I).strip() or text


def _policy_bool(policy: dict[str, Any] | None, key: str, default: bool) -> bool:
    if not isinstance(policy, dict) or key not in policy:
        return default
    return parse_bool(policy.get(key), default)


def _policy_config(policy: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(policy, dict):
        return {}
    config = policy.get("config")
    return config if isinstance(config, dict) else {}


def _default_policy_from_remote_config(remote_config: dict[str, Any] | None) -> dict[str, Any]:
    active_tenant_ids = []
    owner_id = None
    if isinstance(remote_config, dict):
        active_tenant_ids = remote_config.get("activeTenantIds") or []
        owner_id = remote_config.get("ownerId")
    allowed_trigger_user_ids = []
    if owner_id:
        allowed_trigger_user_ids.append(owner_id)
    allowed_trigger_user_ids.extend(
        item for item in active_tenant_ids if isinstance(item, str) and item not in allowed_trigger_user_ids
    )
    return {
        "listen": True,
        "reply": True,
        "mentionOnly": False,
        "config": {
            "allowedTriggerUserIds": allowed_trigger_user_ids,
            "triggerUserIds": allowed_trigger_user_ids,
            "ownerId": owner_id,
            "activeTenantIds": active_tenant_ids,
            "replyRequiresMention": False,
        },
    }


def _remote_listen_channel_entries(
    remote_config: dict[str, Any] | None,
) -> list[tuple[str, dict[str, Any], dict[str, Any]]]:
    if not isinstance(remote_config, dict):
        return []
    entries: list[tuple[str, dict[str, Any], dict[str, Any]]] = []
    for server in remote_config.get("servers") or []:
        if not isinstance(server, dict):
            continue
        for channel in server.get("channels") or []:
            if not isinstance(channel, dict):
                continue
            channel_id = str(channel.get("id") or "").strip()
            if not channel_id:
                continue
            policy = channel.get("policy") if isinstance(channel.get("policy"), dict) else {}
            if not _policy_bool(policy, "listen", True):
                continue
            cached_channel = {
                **channel,
                "serverId": server.get("id"),
                "serverName": server.get("name"),
                "serverSlug": server.get("slug") or server.get("id"),
                "kind": channel.get("kind") or channel.get("type") or "channel",
            }
            entries.append((channel_id, cached_channel, policy))
    return entries


def _owner_id_from_remote_config(remote_config: dict[str, Any] | None) -> str | None:
    if not isinstance(remote_config, dict):
        return None
    owner_id = str(remote_config.get("ownerId") or remote_config.get("owner_id") or "").strip()
    return owner_id or None


class ShadowOBAdapter(BasePlatformAdapter):
    """Hermes ``BasePlatformAdapter`` implementation for Shadow."""

    def __init__(self, config: PlatformConfig):
        if Platform is None:
            raise RuntimeError("Hermes gateway modules are not importable")
        super().__init__(config, Platform(PLATFORM_NAME))
        self.extra = _extra(config)
        self.base_url = _base_url_from_config(config)
        self.token = _token_from_config(config)
        self.client = ShadowAsyncClient(self.base_url, self.token) if self.base_url and self.token else None
        self.socket: ShadowSocketClient | None = None
        self._poll_task: asyncio.Task | None = None
        self._heartbeat_task: asyncio.Task | None = None
        self._channel_refresh_task: asyncio.Task | None = None
        self._channel_ids: list[str] = _channel_ids_from_config(config)
        self._configured_channel_ids: set[str] = set(self._channel_ids)
        self._remote_channel_ids: set[str] = set()
        self._channel_policies: dict[str, dict[str, Any]] = {}
        self._remote_config: dict[str, Any] | None = None
        self._channel_cache: dict[str, dict[str, Any]] = {}
        self._processed_ids: deque[str] = deque(maxlen=2000)
        self._processed_set: set[str] = set()
        self._last_seen_created_at: dict[str, datetime] = {}
        self._bot_user_id = str(_cfg(config, "SHADOW_BOT_USER_ID", "bot_user_id", default="") or "") or None
        self._bot_username = str(_cfg(config, "SHADOW_BOT_USERNAME", "bot_username", default="") or "") or None
        self._agent_id = str(_cfg(config, "SHADOW_AGENT_ID", "agent_id", default="") or "") or None
        self._heartbeat_interval = float(
            _cfg(config, "SHADOW_HEARTBEAT_INTERVAL_SECONDS", "heartbeat_interval_seconds", default=30) or 30
        )
        self._slash_commands = _parse_json_list(
            _cfg(config, "SHADOW_SLASH_COMMANDS_JSON", "slash_commands", default=[])
        )
        self._download_media = parse_bool(_cfg(config, "SHADOW_DOWNLOAD_MEDIA", "download_media", default=True), True)
        self._mention_only = parse_bool(_cfg(config, "SHADOW_MENTION_ONLY", "mention_only", default=False), False)
        self._reply_to_bots = parse_bool(_cfg(config, "SHADOW_REPLY_TO_BOTS", "reply_to_bots", default=False), False)
        self._rest_only = parse_bool(_cfg(config, "SHADOW_REST_ONLY", "rest_only", default=False), False)
        self._poll_interval = float(_cfg(config, "SHADOW_POLL_INTERVAL_SECONDS", "poll_interval_seconds", default=3) or 3)
        self._catchup_minutes = float(_cfg(config, "SHADOW_CATCHUP_MINUTES", "catchup_minutes", default=0) or 0)
        self._auto_discover = parse_bool(
            _cfg(config, "SHADOW_AUTO_DISCOVER_CHANNELS", "auto_discover_channels", default=False),
            False,
        )
        self._server_ids = _server_ids_from_config(config)
        self._fetch_reply_context = parse_bool(
            _cfg(config, "SHADOW_FETCH_REPLY_CONTEXT", "fetch_reply_context", default=True),
            True,
        )
        self._transports = split_csv(_cfg(config, "SHADOW_SOCKET_TRANSPORTS", "socket_transports", default="websocket")) or ["websocket"]

    @property
    def name(self) -> str:
        return "Shadow"

    async def connect(self) -> bool:
        if not self.base_url:
            self._set_fatal_error("config_missing", "SHADOW_BASE_URL is required", retryable=False)
            return False
        if not self.token:
            self._set_fatal_error("config_missing", "SHADOW_TOKEN or platform token is required", retryable=False)
            return False
        if self.client is None:
            self.client = ShadowAsyncClient(self.base_url, self.token)

        try:
            await self.client.open()
            await self._load_identity()
            await self._register_slash_commands()
            await self._resolve_channels()
            if not self._channel_ids:
                logger.warning(
                    "[Shadow] No channels are available yet for this Buddy token. "
                    "Waiting for the Buddy to be added to a channel or DM.",
                )

            use_polling = self._rest_only
            if not self._rest_only:
                try:
                    await self._start_socket()
                except Exception as exc:
                    logger.warning("[Shadow] Socket.IO connection failed, falling back to REST polling: %s", exc)
                    use_polling = True

            self._mark_connected()
            if use_polling:
                await self._start_polling()
            await self._start_heartbeat()
            await self._start_channel_refresh()
            logger.info("[Shadow] Connected to %s; channels=%s", self.base_url, ",".join(self._channel_ids))
            return True
        except Exception as exc:
            logger.exception("[Shadow] connect failed")
            self._set_fatal_error("connect_failed", str(exc), retryable=True)
            try:
                if self.client:
                    await self.client.close()
            except Exception:
                pass
            return False

    async def disconnect(self) -> None:
        self._mark_disconnected()
        if self._heartbeat_task is not None and not self._heartbeat_task.done():
            self._heartbeat_task.cancel()
            try:
                await self._heartbeat_task
            except asyncio.CancelledError:
                pass
        self._heartbeat_task = None
        if self._channel_refresh_task is not None and not self._channel_refresh_task.done():
            self._channel_refresh_task.cancel()
            try:
                await self._channel_refresh_task
            except asyncio.CancelledError:
                pass
        self._channel_refresh_task = None
        if self._poll_task is not None and not self._poll_task.done():
            self._poll_task.cancel()
            try:
                await self._poll_task
            except asyncio.CancelledError:
                pass
        self._poll_task = None
        if self.socket is not None:
            try:
                try:
                    await self.socket.update_presence("offline")
                except Exception:
                    pass
                for channel_id in self._channel_ids:
                    try:
                        await self.socket.leave_channel(channel_id)
                    except Exception:
                        pass
                await self.socket.disconnect()
            finally:
                self.socket = None
        if self.client is not None:
            await self.client.close()

    async def send(
        self,
        chat_id: str,
        content: str,
        reply_to: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> SendResult:
        if self.client is None:
            return SendResult(success=False, error="Shadow client is not initialized", retryable=True)
        try:
            await self._set_activity(str(chat_id), "working")
            thread_id = _metadata_thread_id(metadata)
            reply_to_id = _metadata_reply_to(metadata, reply_to)
            shadow_metadata = _metadata_payload(metadata)
            if thread_id:
                message = await self.client.send_message(
                    str(chat_id),
                    content,
                    thread_id=thread_id,
                    reply_to_id=reply_to_id,
                    metadata=shadow_metadata,
                )
            else:
                message = await self.client.send_message(
                    str(chat_id),
                    content,
                    reply_to_id=reply_to_id,
                    metadata=shadow_metadata,
                )
            return SendResult(success=True, message_id=str(message.get("id") or ""), raw_response=message)
        except Exception as exc:
            logger.warning("[Shadow] send failed: %s", exc)
            return SendResult(success=False, error=str(exc), retryable=self._is_retryable(exc))
        finally:
            await self._set_activity(str(chat_id), None)

    async def edit_message(
        self,
        chat_id: str,
        message_id: str,
        content: str,
        *,
        finalize: bool = False,
    ) -> SendResult:
        if self.client is None:
            return SendResult(success=False, error="Shadow client is not initialized", retryable=True)
        try:
            message = await self.client.edit_message(message_id, content)
            return SendResult(success=True, message_id=str(message.get("id") or message_id), raw_response=message)
        except Exception as exc:
            return SendResult(success=False, error=str(exc), retryable=self._is_retryable(exc))

    async def delete_message(self, chat_id: str, message_id: str) -> bool:
        if self.client is None:
            return False
        try:
            await self.client.delete_message(message_id)
            return True
        except Exception as exc:
            logger.debug("[Shadow] delete_message failed for %s/%s: %s", chat_id, message_id, exc)
            return False

    async def send_typing(self, chat_id: str, metadata=None) -> None:
        if self.socket is None:
            return None
        try:
            await self.socket.send_typing(str(chat_id), True)
            await self.socket.update_activity(str(chat_id), "thinking")
        except Exception:
            return None

    async def stop_typing(self, chat_id: str) -> None:
        if self.socket is None:
            return None
        try:
            await self.socket.send_typing(str(chat_id), False)
            await self.socket.update_activity(str(chat_id), None)
        except Exception:
            return None

    async def send_image_file(
        self,
        chat_id: str,
        image_path: str,
        caption: Optional[str] = None,
        reply_to: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
        **kwargs,
    ) -> SendResult:
        return await self._send_file(chat_id, image_path, caption=caption, reply_to=reply_to, metadata=metadata)

    async def send_document(
        self,
        chat_id: str,
        file_path: str,
        caption: Optional[str] = None,
        file_name: Optional[str] = None,
        reply_to: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
        **kwargs,
    ) -> SendResult:
        return await self._send_file(chat_id, file_path, caption=caption, reply_to=reply_to, metadata=metadata)

    async def send_video(
        self,
        chat_id: str,
        video_path: str,
        caption: Optional[str] = None,
        reply_to: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
        **kwargs,
    ) -> SendResult:
        return await self._send_file(chat_id, video_path, caption=caption, reply_to=reply_to, metadata=metadata)

    async def send_voice(
        self,
        chat_id: str,
        audio_path: str,
        caption: Optional[str] = None,
        reply_to: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
        **kwargs,
    ) -> SendResult:
        return await self._send_file(
            chat_id,
            audio_path,
            caption=caption,
            reply_to=reply_to,
            metadata=metadata,
            attachment_kind="voice",
            duration_ms=_parse_int(kwargs.get("duration_ms") or kwargs.get("durationMs")),
            waveform_peaks=_parse_waveform_peaks(kwargs.get("waveform_peaks") or kwargs.get("waveformPeaks")),
            transcript_text=kwargs.get("transcript") or kwargs.get("transcript_text"),
            transcript_language=kwargs.get("transcript_language") or kwargs.get("transcriptLanguage"),
            transcript_source="runtime",
        )

    async def send_image(
        self,
        chat_id: str,
        image_url: str,
        caption: Optional[str] = None,
        reply_to: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> SendResult:
        return await self._send_remote_file(chat_id, image_url, caption=caption, reply_to=reply_to, metadata=metadata)

    async def send_interactive(
        self,
        chat_id: str,
        content: str,
        interactive: dict[str, Any],
        reply_to: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> SendResult:
        if self.client is None:
            return SendResult(success=False, error="Shadow client is not initialized", retryable=True)
        shadow_metadata = _metadata_payload(metadata) or {}
        shadow_metadata["interactive"] = interactive
        try:
            await self._set_activity(str(chat_id), "working")
            message = await self.client.send_message(
                str(chat_id),
                content or "[interactive]",
                thread_id=_metadata_thread_id(metadata),
                reply_to_id=_metadata_reply_to(metadata, reply_to),
                metadata=shadow_metadata,
            )
            return SendResult(success=True, message_id=str(message.get("id") or ""), raw_response=message)
        except Exception as exc:
            return SendResult(success=False, error=str(exc), retryable=self._is_retryable(exc))
        finally:
            await self._set_activity(str(chat_id), None)

    async def get_chat_info(self, chat_id: str) -> dict[str, Any]:
        channel = self._channel_cache.get(str(chat_id))
        if channel:
            return {
                "id": chat_id,
                "name": channel.get("name") or channel.get("title") or chat_id,
                "type": channel.get("kind") or channel.get("type") or "channel",
                "raw": channel,
            }
        if self.client is not None:
            try:
                channel = await self.client.get_channel(str(chat_id))
                self._channel_cache[str(chat_id)] = channel
                return {
                    "id": chat_id,
                    "name": channel.get("name") or channel.get("title") or chat_id,
                    "type": channel.get("kind") or channel.get("type") or "channel",
                    "raw": channel,
                }
            except Exception:
                pass
        return {"id": chat_id, "name": str(chat_id), "type": "channel"}

    async def add_reaction(self, message_id: str, emoji: str) -> bool:
        if self.client is None:
            return False
        try:
            await self.client.add_reaction(message_id, emoji)
            return True
        except Exception:
            return False

    async def remove_reaction(self, message_id: str, emoji: str) -> bool:
        if self.client is None:
            return False
        try:
            await self.client.remove_reaction(message_id, emoji)
            return True
        except Exception:
            return False

    async def _send_file(
        self,
        chat_id: str,
        path: str,
        *,
        caption: str | None = None,
        reply_to: str | None = None,
        metadata: dict[str, Any] | None = None,
        attachment_kind: str | None = None,
        duration_ms: int | None = None,
        waveform_peaks: list[int] | None = None,
        transcript_text: str | None = None,
        transcript_language: str | None = None,
        transcript_source: str | None = None,
    ) -> SendResult:
        if self.client is None:
            return SendResult(success=False, error="Shadow client is not initialized", retryable=True)
        try:
            await self._set_activity(str(chat_id), "working")
            msg = await self.client.send_message(
                str(chat_id),
                caption or "\u200B",
                thread_id=_metadata_thread_id(metadata),
                reply_to_id=_metadata_reply_to(metadata, reply_to),
                metadata=_metadata_payload(metadata),
            )
            await self.client.upload_media_from_path(
                path,
                message_id=str(msg.get("id")),
                kind=attachment_kind,
                duration_ms=duration_ms,
                waveform_peaks=waveform_peaks,
                transcript_text=str(transcript_text) if transcript_text else None,
                transcript_language=str(transcript_language) if transcript_language else None,
                transcript_source=transcript_source,
            )
            return SendResult(success=True, message_id=str(msg.get("id") or ""), raw_response=msg)
        except Exception as exc:
            return SendResult(success=False, error=str(exc), retryable=self._is_retryable(exc))
        finally:
            await self._set_activity(str(chat_id), None)

    async def _send_remote_file(
        self,
        chat_id: str,
        url: str,
        *,
        caption: str | None = None,
        reply_to: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> SendResult:
        if self.client is None:
            return SendResult(success=False, error="Shadow client is not initialized", retryable=True)
        try:
            await self._set_activity(str(chat_id), "working")
            msg = await self.client.send_message(
                str(chat_id),
                caption or "\u200B",
                thread_id=_metadata_thread_id(metadata),
                reply_to_id=_metadata_reply_to(metadata, reply_to),
                metadata=_metadata_payload(metadata),
            )
            await self.client.upload_media_from_url(url, message_id=str(msg.get("id")))
            return SendResult(success=True, message_id=str(msg.get("id") or ""), raw_response=msg)
        except Exception as exc:
            return SendResult(success=False, error=str(exc), retryable=self._is_retryable(exc))
        finally:
            await self._set_activity(str(chat_id), None)

    async def _set_activity(self, channel_id: str, activity: str | None) -> None:
        if self.socket is None:
            return
        try:
            await self.socket.update_activity(channel_id, activity)
        except Exception:
            pass

    async def _load_identity(self) -> None:
        if self.client is None:
            return
        me = await self.client.get_me()
        if not self._bot_user_id:
            self._bot_user_id = str(me.get("id") or me.get("userId") or "") or None
        if not self._bot_username:
            self._bot_username = str(me.get("username") or me.get("name") or "") or None
        if not self._agent_id:
            self._agent_id = str(me.get("agentId") or me.get("agent_id") or "") or None
        logger.info("[Shadow] Authenticated as %s (%s)", self._bot_username, self._bot_user_id)

    async def _refresh_remote_config(self, *, sync_socket: bool = False) -> None:
        if self.client is None or not self._agent_id:
            return
        old_channel_ids = set(self._channel_ids)
        old_remote_ids = set(self._remote_channel_ids)
        remote_config = await self.client.get_agent_config(self._agent_id)
        self._remote_config = remote_config

        self._bot_user_id = str(remote_config.get("botUserId") or self._bot_user_id or "") or None
        if not self._slash_commands:
            self._slash_commands = _parse_json_list(remote_config.get("slashCommands"))

        new_remote_ids: set[str] = set()
        for channel_id, channel, policy in _remote_listen_channel_entries(remote_config):
            new_remote_ids.add(channel_id)
            self._channel_cache[channel_id] = channel
            self._channel_policies[channel_id] = policy
            if channel_id not in self._channel_ids:
                self._channel_ids.append(channel_id)

        removed_remote_ids = old_remote_ids - new_remote_ids
        if removed_remote_ids:
            self._channel_ids = [
                channel_id
                for channel_id in self._channel_ids
                if channel_id not in removed_remote_ids or channel_id in self._configured_channel_ids
            ]
            for channel_id in removed_remote_ids:
                self._channel_policies.pop(channel_id, None)
                if channel_id not in self._configured_channel_ids:
                    self._channel_cache.pop(channel_id, None)

        self._remote_channel_ids = new_remote_ids
        logger.info("[Shadow] Refreshed remote config for agent %s; channels=%s", self._agent_id, len(new_remote_ids))

        if sync_socket:
            await self._sync_socket_channels(old_channel_ids)

    async def _sync_socket_channels(self, old_channel_ids: set[str]) -> None:
        if self.socket is None:
            return
        next_channel_ids = set(self._channel_ids)
        for channel_id in old_channel_ids - next_channel_ids:
            try:
                await self.socket.leave_channel(channel_id)
            except Exception:
                pass
        for channel_id in next_channel_ids - old_channel_ids:
            try:
                ack = await self.socket.join_channel(channel_id)
                logger.info("[Shadow] Joined channel %s after config refresh ack=%s", channel_id, ack)
            except Exception as exc:
                logger.warning("[Shadow] Failed to join refreshed channel %s: %s", channel_id, exc)

    async def _ensure_owner_dm_home_channel(self) -> None:
        if self.client is None:
            return
        owner_id = _owner_id_from_remote_config(self._remote_config)
        if not owner_id or owner_id == self._bot_user_id:
            return
        try:
            channel = await self.client.create_direct_channel(owner_id)
        except Exception as exc:
            logger.debug("[Shadow] Owner DM home channel is not available yet: %s", exc)
            return
        channel_id = str(channel.get("id") or "").strip()
        if not channel_id:
            return
        self._channel_cache[channel_id] = {
            **channel,
            "kind": channel.get("kind") or channel.get("type") or "dm",
        }
        self._channel_policies.setdefault(channel_id, _default_policy_from_remote_config(self._remote_config))
        if channel_id not in self._channel_ids:
            self._channel_ids.append(channel_id)
            logger.info("[Shadow] Using owner DM %s as the default home channel", channel_id)

    async def _register_slash_commands(self) -> None:
        if self.client is None or not self._agent_id or not self._slash_commands:
            return
        try:
            payload = await self.client.update_agent_slash_commands(self._agent_id, self._slash_commands)
            count = len(payload.get("commands") or self._slash_commands)
            logger.info("[Shadow] Registered %s slash command(s) for agent %s", count, self._agent_id)
        except Exception as exc:
            logger.warning("[Shadow] Failed to register slash commands for agent %s: %s", self._agent_id, exc)

    async def _start_heartbeat(self) -> None:
        if self.client is None or not self._agent_id:
            return
        await self._send_heartbeat()
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop(), name="shadowob-heartbeat")

    async def _heartbeat_loop(self) -> None:
        while self._running and not self.has_fatal_error:
            await asyncio.sleep(max(5.0, self._heartbeat_interval))
            await self._send_heartbeat()

    async def _send_heartbeat(self) -> None:
        if self.client is None or not self._agent_id:
            return
        try:
            await self.client.heartbeat_agent(self._agent_id)
        except Exception as exc:
            logger.debug("[Shadow] heartbeat failed for agent %s: %s", self._agent_id, exc)

    async def _start_channel_refresh(self) -> None:
        if self._channel_refresh_task is None or self._channel_refresh_task.done():
            self._channel_refresh_task = asyncio.create_task(
                self._channel_refresh_loop(),
                name="shadowob-channel-refresh",
            )

    async def _channel_refresh_loop(self) -> None:
        interval = max(10.0, min(60.0, self._heartbeat_interval))
        while self._running and not self.has_fatal_error:
            await asyncio.sleep(interval)
            try:
                await self._resolve_channels(sync_socket=True)
                if not self._channel_ids:
                    logger.debug("[Shadow] Still waiting for a channel or owner DM")
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.debug("[Shadow] Channel refresh failed: %s", exc)

    async def _send_slash_interactive_prompt(
        self,
        match: tuple[dict[str, Any], str, str],
        *,
        message_id: str,
        channel_id: str,
        thread_id: str | None,
    ) -> bool:
        if self.client is None:
            return False
        block = _slash_interactive_block(match, message_id)
        if not block:
            return False
        command, invoked, args = match
        name = _normalize_slash_command_name(command.get("name")) or invoked
        content = str(block.get("prompt") or f"/{name} needs input before the Buddy can continue.")
        await self.client.send_message(
            channel_id,
            content,
            thread_id=thread_id,
            reply_to_id=message_id,
            metadata={
                "interactive": block,
                "slashCommand": {
                    "name": name,
                    "invokedName": invoked,
                    "args": args,
                    "packId": command.get("packId"),
                },
            },
        )
        logger.info("[Shadow] Sent interactive prompt for slash command /%s", name)
        return True

    async def _resolve_channels(self, *, sync_socket: bool = False) -> None:
        if self.client is None:
            return
        old_channel_ids = set(self._channel_ids)
        if self._agent_id:
            try:
                await self._refresh_remote_config()
            except Exception as exc:
                logger.warning("[Shadow] Failed to load remote agent config for %s: %s", self._agent_id, exc)

        seen = set(self._channel_ids)
        for server_id in self._server_ids:
            try:
                for channel in await self.client.get_server_channels(server_id):
                    channel_id = str(channel.get("id") or "")
                    if not channel_id:
                        continue
                    self._channel_cache[channel_id] = channel
                    if channel_id not in seen:
                        seen.add(channel_id)
                        self._channel_ids.append(channel_id)
            except Exception as exc:
                logger.warning("[Shadow] Failed to discover channels for server %s: %s", server_id, exc)

        if self._auto_discover and not self._server_ids:
            try:
                for server in await self.client.list_servers():
                    server_id = str(server.get("id") or server.get("slug") or "")
                    if not server_id:
                        continue
                    try:
                        for channel in await self.client.get_server_channels(server_id):
                            channel_id = str(channel.get("id") or "")
                            if channel_id:
                                self._channel_cache[channel_id] = channel
                            if channel_id and channel_id not in seen:
                                seen.add(channel_id)
                                self._channel_ids.append(channel_id)
                    except Exception as exc:
                        logger.debug("[Shadow] Failed to discover server channels for %s: %s", server_id, exc)
            except Exception as exc:
                logger.warning("[Shadow] Failed to list servers for auto-discovery: %s", exc)

        if self._auto_discover or self._agent_id:
            try:
                for channel in await self.client.list_direct_channels():
                    channel_id = str(channel.get("id") or "")
                    if channel_id:
                        self._channel_cache[channel_id] = channel
                        self._channel_policies.setdefault(
                            channel_id,
                            _default_policy_from_remote_config(self._remote_config),
                        )
                    if channel_id and channel_id not in seen:
                        seen.add(channel_id)
                        self._channel_ids.append(channel_id)
            except Exception as exc:
                logger.debug("[Shadow] Failed to list direct channels: %s", exc)

        await self._ensure_owner_dm_home_channel()

        # Best-effort metadata cache for explicitly configured channels.
        for channel_id in list(self._channel_ids):
            if channel_id in self._channel_cache:
                continue
            try:
                self._channel_cache[channel_id] = await self.client.get_channel(channel_id)
            except Exception:
                self._channel_cache[channel_id] = {"id": channel_id, "name": channel_id, "kind": "channel"}

        if sync_socket:
            await self._sync_socket_channels(old_channel_ids)

    async def _start_socket(self) -> None:
        self.socket = ShadowSocketClient(self.base_url, self.token, transports=self._transports, logger=logger)
        self.socket.on("connect", self._on_socket_connect)
        self.socket.on("disconnect", self._on_socket_disconnect)
        self.socket.on("connect_error", self._on_socket_error)
        self.socket.on("message:new", self._on_socket_message_new)
        # Shadow shared constants use message:update/delete. Keep the old
        # updated/deleted aliases for compatibility with older deployments.
        self.socket.on("message:update", self._on_socket_message_updated)
        self.socket.on("message:delete", self._on_socket_message_deleted)
        self.socket.on("message:updated", self._on_socket_message_updated)
        self.socket.on("message:deleted", self._on_socket_message_deleted)
        self.socket.on("channel:member-added", self._on_channel_member_added)
        self.socket.on("channel:member-removed", self._on_channel_member_removed)
        self.socket.on("server:joined", self._on_server_joined)
        self.socket.on("agent:policy-changed", self._on_agent_policy_changed)
        await self.socket.connect()
        await self._join_current_socket_channels()
        if self._catchup_minutes > 0:
            await self._catchup_recent_messages()

    async def _join_current_socket_channels(self) -> None:
        if self.socket is None:
            return
        try:
            await self.socket.update_presence("online")
        except Exception as exc:
            logger.debug("[Shadow] Failed to update socket presence: %s", exc)
        if not self._channel_ids:
            logger.info("[Shadow] Socket connected with no channels yet; waiting for channel membership events")
            return
        for channel_id in list(self._channel_ids):
            try:
                ack = await self.socket.join_channel(channel_id)
                logger.info("[Shadow] Joined channel %s ack=%s", channel_id, ack)
            except Exception as exc:
                logger.warning("[Shadow] Failed to join channel %s: %s", channel_id, exc)

    async def _start_polling(self) -> None:
        if self._catchup_minutes > 0:
            await self._catchup_recent_messages()
        else:
            await self._prime_poll_watermarks()
        self._poll_task = asyncio.create_task(self._poll_loop(), name="shadowob-poll")

    async def _prime_poll_watermarks(self) -> None:
        if self.client is None:
            return
        for channel_id in self._channel_ids:
            try:
                payload = await self.client.get_messages(channel_id, limit=1)
                messages = payload.get("messages") or []
                if messages:
                    dt = _message_created_at(messages[0])
                    if dt:
                        self._last_seen_created_at[channel_id] = dt
            except Exception as exc:
                logger.debug("[Shadow] Failed to prime watermark for %s: %s", channel_id, exc)

    async def _catchup_recent_messages(self) -> None:
        for channel_id in list(self._channel_ids):
            try:
                await self._catchup_channel_recent_messages(channel_id)
            except Exception as exc:
                logger.warning("[Shadow] Catch-up failed for %s: %s", channel_id, exc)

    async def _catchup_channel_recent_messages(self, channel_id: str) -> None:
        if self.client is None:
            return
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=self._catchup_minutes)
        payload = await self.client.get_messages(channel_id, limit=50)
        messages = list(payload.get("messages") or [])
        for message in sorted(messages, key=lambda item: _message_created_at(item) or datetime.min.replace(tzinfo=timezone.utc)):
            created = _message_created_at(message)
            if created and created >= cutoff:
                await self._handle_shadow_message(message, source="catchup")
            if created:
                self._last_seen_created_at[channel_id] = max(self._last_seen_created_at.get(channel_id, created), created)

    async def _poll_loop(self) -> None:
        assert self.client is not None
        while self._running and not self.has_fatal_error:
            try:
                for channel_id in self._channel_ids:
                    payload = await self.client.get_messages(channel_id, limit=25)
                    messages = list(payload.get("messages") or [])
                    messages.sort(key=lambda item: _message_created_at(item) or datetime.min.replace(tzinfo=timezone.utc))
                    last_seen = self._last_seen_created_at.get(channel_id)
                    for message in messages:
                        created = _message_created_at(message)
                        if last_seen and created and created <= last_seen:
                            continue
                        if created:
                            self._last_seen_created_at[channel_id] = created
                        await self._handle_shadow_message(message, source="poll")
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("[Shadow] polling failed: %s", exc)
            await asyncio.sleep(max(0.5, self._poll_interval))

    async def _on_socket_connect(self) -> None:
        logger.info("[Shadow] Socket connected")
        await self._join_current_socket_channels()

    async def _on_socket_disconnect(self, reason: str | None = None) -> None:
        logger.info("[Shadow] Socket disconnected: %s", reason)

    async def _on_socket_error(self, error: Any) -> None:
        logger.warning("[Shadow] Socket error: %s", error)

    async def _on_socket_message_new(self, message: dict[str, Any]) -> None:
        await self._handle_shadow_message(message, source="socket")

    async def _on_socket_message_updated(self, message: dict[str, Any]) -> None:
        # Hermes does not currently consume external edits as conversation turns.
        return None

    async def _on_socket_message_deleted(self, payload: dict[str, Any]) -> None:
        return None

    async def _on_channel_member_added(self, payload: dict[str, Any]) -> None:
        channel_id = str(payload.get("channelId") or payload.get("channel_id") or "").strip()
        if not channel_id:
            return
        old_channel_ids = set(self._channel_ids)
        try:
            await self._resolve_channels(sync_socket=False)
        except Exception as exc:
            logger.warning("[Shadow] Failed to refresh config after channel member add: %s", exc)
        if channel_id not in self._channel_ids:
            self._channel_ids.append(channel_id)
        if self.client is not None:
            try:
                self._channel_cache[channel_id] = await self.client.get_channel(channel_id)
            except Exception:
                self._channel_cache[channel_id] = {"id": channel_id, "name": channel_id, "kind": "channel"}
        self._channel_policies.setdefault(
            channel_id,
            _default_policy_from_remote_config(self._remote_config),
        )
        if self.socket is not None:
            try:
                await self._sync_socket_channels(old_channel_ids)
            except Exception as exc:
                logger.warning("[Shadow] Failed to join newly added channel %s: %s", channel_id, exc)
        if self._catchup_minutes > 0:
            try:
                await self._catchup_channel_recent_messages(channel_id)
            except Exception as exc:
                logger.debug("[Shadow] Failed member-added catch-up for %s: %s", channel_id, exc)

    async def _on_channel_member_removed(self, payload: dict[str, Any]) -> None:
        channel_id = str(payload.get("channelId") or payload.get("channel_id") or "").strip()
        if not channel_id:
            return
        self._channel_ids = [item for item in self._channel_ids if item != channel_id]
        self._channel_cache.pop(channel_id, None)
        self._last_seen_created_at.pop(channel_id, None)
        if self.socket is not None:
            try:
                await self.socket.leave_channel(channel_id)
            except Exception:
                pass

    async def _on_server_joined(self, payload: dict[str, Any]) -> None:
        payload_agent_id = str(payload.get("agentId") or payload.get("agent_id") or "").strip()
        if payload_agent_id and self._agent_id and payload_agent_id != self._agent_id:
            return
        try:
            await self._resolve_channels(sync_socket=True)
        except Exception as exc:
            logger.warning("[Shadow] Failed to refresh remote config after server join: %s", exc)

    async def _on_agent_policy_changed(self, payload: dict[str, Any]) -> None:
        payload_agent_id = str(payload.get("agentId") or payload.get("agent_id") or "").strip()
        if payload_agent_id and self._agent_id and payload_agent_id != self._agent_id:
            return
        try:
            await self._resolve_channels(sync_socket=True)
        except Exception as exc:
            logger.warning("[Shadow] Failed to refresh remote config after policy change: %s", exc)

    async def _activate_task_card(
        self,
        message: dict[str, Any],
        card: dict[str, Any] | None,
    ) -> dict[str, Any] | None:
        if self.client is None or not card:
            return card
        message_id = _message_id(message)
        card_id = _card_id(card)
        if not message_id or not card_id:
            return None

        status = str(card.get("status") or "").lower()
        try:
            if status == "queued" or (status in {"claimed", "running"} and _task_card_claim_expired(card)):
                updated = await self.client.claim_task_card(
                    message_id,
                    card_id,
                    ttl_seconds=3600,
                    note="Hermes accepted the Inbox task.",
                )
                message = updated if isinstance(updated, dict) else message
                card = _task_card_by_id(message, card_id) or card
                status = str(card.get("status") or status).lower()

            if status in {"queued", "claimed"}:
                updated = await self.client.update_task_card(
                    message_id,
                    card_id,
                    status="running",
                    note="Hermes started working on the task.",
                )
                message = updated if isinstance(updated, dict) else message
                card = _task_card_by_id(message, card_id) or card
            return card
        except ShadowApiError as exc:
            if exc.status_code == 409:
                logger.info("[Shadow] Inbox task card %s is already claimed; skipping message %s", card_id, message_id)
                return None
            logger.warning("[Shadow] Failed to activate Inbox task card %s/%s: %s", message_id, card_id, exc)
            return None
        except Exception as exc:
            logger.warning("[Shadow] Failed to activate Inbox task card %s/%s: %s", message_id, card_id, exc)
            return None

    async def _complete_task_card(
        self,
        message_id: str | None,
        card_id: str | None,
        *,
        failed: bool = False,
        note: str | None = None,
    ) -> None:
        if self.client is None or not message_id or not card_id:
            return
        try:
            await self.client.update_task_card(
                message_id,
                card_id,
                status="failed" if failed else "completed",
                note=(note or ("Hermes failed while processing this task." if failed else "Hermes finished processing this task."))[:4000],
            )
        except Exception as exc:
            logger.debug("[Shadow] Failed to update Inbox task card %s/%s completion: %s", message_id, card_id, exc)

    async def _handle_shadow_message(self, message: dict[str, Any], *, source: str) -> None:
        message_id = _message_id(message)
        if not message_id:
            return
        if message_id in self._processed_set:
            return
        self._remember_processed(message_id)

        channel_id = _message_channel_id(message)
        if not channel_id:
            return
        if self._channel_ids and channel_id not in self._channel_ids:
            return
        policy = self._channel_policies.get(channel_id)
        policy_config = _policy_config(policy)

        author_id = _message_author_id(message)
        author = _message_author(message)
        if self._bot_user_id and author_id == self._bot_user_id:
            logger.debug("[Shadow] skipping own message %s", message_id)
            return
        reply_to_buddy = parse_bool(policy_config.get("replyToBuddy"), False)
        if author.get("isBot") and not (self._reply_to_bots or reply_to_buddy):
            logger.debug("[Shadow] skipping bot-authored message %s", message_id)
            return
        if policy and not _policy_bool(policy, "listen", True):
            logger.debug("[Shadow] policy listen=false skipped message %s", message_id)
            return
        if policy and not _policy_bool(policy, "reply", True):
            logger.debug("[Shadow] policy reply=false skipped message %s", message_id)
            return
        task_card = _message_task_card_for_self(
            message,
            bot_user_id=self._bot_user_id,
            agent_id=self._agent_id,
        )
        trigger_user_ids = policy_config.get("allowedTriggerUserIds") or policy_config.get("triggerUserIds")
        if isinstance(trigger_user_ids, list):
            allowed = {str(item) for item in trigger_user_ids if item}
            if allowed and not task_card and (not author_id or author_id not in allowed):
                logger.debug("[Shadow] policy trigger users skipped message %s", message_id)
                return

        source_message: dict[str, Any] | None = None
        source_message_id = _interactive_response_source_id(message)
        if source_message_id and self.client is not None:
            try:
                source_message = await self.client.get_message(source_message_id)
            except Exception as exc:
                logger.debug("[Shadow] failed to load interactive source %s: %s", source_message_id, exc)

        text = _interactive_response_text(str(message.get("content") or ""), message, source_message)
        mention_only = self._mention_only or _policy_bool(policy, "mentionOnly", False)
        if mention_only and not self._message_mentions_self(message) and not task_card:
            # DMs are allowed even in mention-only mode.
            channel = self._channel_cache.get(channel_id, {})
            kind = str(channel.get("kind") or channel.get("type") or "").lower()
            if kind not in {"dm", "direct"}:
                logger.debug("[Shadow] mention-only skipped message %s", message_id)
                return
        text = _text_without_self_mention(text, self._bot_username)

        slash_match = _slash_command_match(text, self._slash_commands)
        if slash_match:
            command, invoked, args = slash_match
            logger.info("[Shadow] Matched slash command /%s -> /%s", invoked, command.get("name") or invoked)
            thread_id = _message_thread_id(message)
            if command.get("interaction") and not args.strip():
                sent = await self._send_slash_interactive_prompt(
                    slash_match,
                    message_id=message_id,
                    channel_id=channel_id,
                    thread_id=thread_id,
                )
                if sent:
                    return
            text = _format_slash_command_prompt(text, slash_match)
        elif text.strip().startswith("/"):
            logger.info("[Shadow] Unknown slash command in message %s; treating as text", message_id)

        if task_card:
            task_card = await self._activate_task_card(message, task_card)
            if not task_card:
                return
            text = _format_task_card_prompt(text, task_card, message_id=message_id)

        media_paths, media_types, message_type, media_metadata = await self._resolve_inbound_media(message)
        voice_metadata = media_metadata.get("voice") if isinstance(media_metadata, dict) else None
        voice_transcript = (
            voice_metadata.get("transcript")
            if isinstance(voice_metadata, dict) and voice_metadata.get("transcript_status") == "ready"
            else None
        )
        if voice_transcript and not _visible_text(text):
            text = str(voice_transcript)
        reply_to_id = _message_reply_to_id(message)
        reply_to_text = await self._fetch_reply_text(reply_to_id) if reply_to_id else None

        thread_id = _message_thread_id(message)
        channel = self._channel_cache.get(channel_id, {})
        chat_name = str(channel.get("name") or channel.get("title") or channel_id)
        channel_kind = str(channel.get("kind") or channel.get("type") or "channel").lower()
        chat_type = "thread" if thread_id else ("dm" if channel_kind in {"dm", "direct"} else "group")

        source_obj = self.build_source(
            chat_id=channel_id,
            chat_name=chat_name,
            chat_type=chat_type,
            user_id=author_id,
            user_name=_message_author_name(message),
            thread_id=thread_id,
            parent_chat_id=channel_id if thread_id else None,
            message_id=message_id,
            is_bot=bool(author.get("isBot")),
        )

        parent_for_bindings = channel_id if thread_id else None
        config_extra = _extra(self.config)
        event = MessageEvent(
            text=text or ("[Media attached]" if media_paths else ""),
            message_type=message_type,
            source=source_obj,
            raw_message={"shadow": message, "source": source, "media": media_metadata},
            message_id=message_id,
            media_urls=media_paths,
            media_types=media_types,
            reply_to_message_id=reply_to_id,
            reply_to_text=reply_to_text,
            auto_skill=resolve_channel_skills(config_extra, thread_id or channel_id, parent_for_bindings),
            channel_prompt=resolve_channel_prompt(config_extra, thread_id or channel_id, parent_for_bindings),
        )
        task_card_id = _card_id(task_card) if task_card else None
        try:
            await self.handle_message(event)
        except Exception as exc:
            await self._complete_task_card(message_id, task_card_id, failed=True, note=str(exc))
            raise
        if task_card_id:
            await self._complete_task_card(message_id, task_card_id)

    def _remember_processed(self, message_id: str) -> None:
        if len(self._processed_ids) == self._processed_ids.maxlen:
            old = self._processed_ids.popleft()
            self._processed_set.discard(old)
        self._processed_ids.append(message_id)
        self._processed_set.add(message_id)

    def _message_mentions_self(self, message: dict[str, Any]) -> bool:
        if not self._bot_user_id and not self._bot_username:
            return False
        text = str(message.get("content") or "")
        if self._bot_username and f"@{self._bot_username}".lower() in text.lower():
            return True
        metadata = message.get("metadata")
        mentions = []
        if isinstance(metadata, dict):
            raw_mentions = metadata.get("mentions") or []
            if isinstance(raw_mentions, list):
                mentions = raw_mentions
        for mention in mentions:
            if not isinstance(mention, dict):
                continue
            target_id = mention.get("id") or mention.get("userId") or mention.get("targetId")
            username = mention.get("username") or mention.get("name")
            if self._bot_user_id and target_id and str(target_id) == self._bot_user_id:
                return True
            if self._bot_username and username and str(username).lower() == self._bot_username.lower():
                return True
        return False

    async def _fetch_reply_text(self, message_id: str | None) -> str | None:
        if not message_id or not self._fetch_reply_context or self.client is None:
            return None
        try:
            msg = await self.client.get_message(message_id)
            return str(msg.get("content") or "") or None
        except Exception:
            return None

    def _voice_attachment_metadata(self, attachment: dict[str, Any], path: str | None = None) -> dict[str, Any]:
        transcript = attachment.get("transcript")
        return {
            "voice": True,
            "attachment_id": attachment.get("id") or attachment.get("attachmentId") or attachment.get("attachment_id"),
            "path": path,
            "duration_ms": attachment.get("durationMs") or attachment.get("duration_ms"),
            "waveform_peaks": attachment.get("waveformPeaks") or attachment.get("waveform_peaks"),
            "transcript": transcript.get("text") if isinstance(transcript, dict) else None,
            "transcript_status": transcript.get("status") if isinstance(transcript, dict) else None,
        }

    async def _resolve_inbound_media(self, message: dict[str, Any]) -> tuple[list[str], list[str], Any, dict[str, Any]]:
        attachments = message.get("attachments") or []
        if not isinstance(attachments, list) or not attachments:
            return [], [], MessageType.TEXT, {}
        if not self._download_media or self.client is None:
            urls = [str(a.get("url")) for a in attachments if isinstance(a, dict) and a.get("url")]
            types = [str(a.get("contentType") or a.get("content_type") or "application/octet-stream") for a in attachments if isinstance(a, dict)]
            voice_attachment = next(
                (
                    a
                    for a in attachments
                    if isinstance(a, dict)
                    and (a.get("kind") == "voice" or str(a.get("contentType") or a.get("content_type") or "").startswith("audio/"))
                ),
                None,
            )
            metadata = {"voice": self._voice_attachment_metadata(voice_attachment)} if voice_attachment else {}
            return urls, types, MessageType.DOCUMENT, metadata

        paths: list[str] = []
        types: list[str] = []
        voice_metadata: dict[str, Any] | None = None
        dominant = MessageType.DOCUMENT
        for attachment in attachments:
            if not isinstance(attachment, dict):
                continue
            url = attachment.get("url")
            if not url:
                continue
            content_type = str(attachment.get("contentType") or attachment.get("content_type") or "application/octet-stream")
            filename = str(attachment.get("filename") or Path(str(url)).name or "file")
            try:
                download_url = str(url)
                attachment_id = attachment.get("id") or attachment.get("attachmentId") or attachment.get("attachment_id")
                if download_url.startswith("/shadow/uploads/") and attachment_id:
                    resolved = await self.client.resolve_attachment_media_url(str(attachment_id), disposition="inline")
                    download_url = str(resolved.get("url") or resolved.get("signedUrl") or download_url)
                downloaded = await self.client.download_file(download_url)
                content_type = downloaded.content_type or content_type
                filename = downloaded.filename or filename
                local_path = self._cache_downloaded_media(downloaded.data, filename, content_type)
                paths.append(local_path)
                types.append(content_type)
                dominant = self._message_type_for_content_type(content_type, filename)
                if attachment.get("kind") == "voice" or content_type.startswith(_AUDIO_CT_PREFIXES):
                    voice_metadata = self._voice_attachment_metadata(attachment, local_path)
            except Exception as exc:
                logger.warning("[Shadow] failed to cache inbound attachment %s: %s", url, exc)
                paths.append(str(url))
                types.append(content_type)
                if attachment.get("kind") == "voice" or content_type.startswith(_AUDIO_CT_PREFIXES):
                    voice_metadata = self._voice_attachment_metadata(attachment, str(url))
        return paths, types, dominant, {"voice": voice_metadata} if voice_metadata else {}

    def _cache_downloaded_media(self, data: bytes, filename: str, content_type: str) -> str:
        suffix = Path(filename).suffix or self._extension_for_content_type(content_type)
        if content_type.startswith(_IMAGE_CT_PREFIXES) and cache_image_from_bytes:
            return cache_image_from_bytes(data, suffix or ".jpg")
        if content_type.startswith(_AUDIO_CT_PREFIXES) and cache_audio_from_bytes:
            return cache_audio_from_bytes(data, suffix or ".ogg")
        if content_type.startswith(_VIDEO_CT_PREFIXES) and cache_video_from_bytes:
            return cache_video_from_bytes(data, suffix or ".mp4")
        if cache_document_from_bytes:
            return cache_document_from_bytes(data, filename or f"document{suffix or '.bin'}")
        # Fallback outside Hermes runtime.
        cache_dir = Path.home() / ".hermes" / "cache" / "documents"
        cache_dir.mkdir(parents=True, exist_ok=True)
        path = cache_dir / filename
        path.write_bytes(data)
        return str(path)

    def _message_type_for_content_type(self, content_type: str, filename: str = "") -> Any:
        ct = content_type.lower()
        if ct.startswith("image/"):
            return MessageType.PHOTO
        if ct.startswith("video/"):
            return MessageType.VIDEO
        if ct.startswith("audio/"):
            return MessageType.AUDIO
        return MessageType.DOCUMENT

    def _extension_for_content_type(self, content_type: str) -> str:
        import mimetypes

        return mimetypes.guess_extension(content_type.split(";", 1)[0].strip()) or ".bin"

    def _is_retryable(self, exc: Exception) -> bool:
        text = str(exc).lower()
        return any(token in text for token in ("connection", "connect", "network", "temporar", "timeout", "503", "502", "504"))


# ── Plugin registry entrypoint ───────────────────────────────────────────────


def _env_has_minimum_config() -> bool:
    return bool(
        (os.getenv("SHADOW_BASE_URL") or os.getenv("SHADOW_SERVER_URL"))
        and os.getenv("SHADOW_TOKEN")
    )


def check_requirements() -> bool:
    try:
        import httpx  # noqa: F401
    except Exception:
        return False
    # Hermes uses check_fn for env-only auto-enablement. Config.yaml users can
    # still enable the platform explicitly and validate_config() will judge that.
    return _env_has_minimum_config()


def validate_config(config: PlatformConfig) -> bool:
    return bool(_base_url_from_config(config) and _token_from_config(config))


def _is_connected(config: PlatformConfig) -> bool:
    return validate_config(config)


def _env_enablement() -> dict[str, Any] | None:
    base_url = os.getenv("SHADOW_BASE_URL") or os.getenv("SHADOW_SERVER_URL")
    token = os.getenv("SHADOW_TOKEN")
    if not base_url or not token:
        return None

    channel_ids = split_csv(os.getenv("SHADOW_CHANNEL_IDS") or os.getenv("SHADOW_CHANNEL_ID"))
    home = os.getenv("SHADOW_HOME_CHANNEL")
    if home and home not in channel_ids:
        channel_ids.append(home)

    seed: dict[str, Any] = {
        "base_url": base_url,
        "token": token,
        "mention_only": parse_bool(os.getenv("SHADOW_MENTION_ONLY"), False),
        "reply_to_bots": parse_bool(os.getenv("SHADOW_REPLY_TO_BOTS"), False),
        "rest_only": parse_bool(os.getenv("SHADOW_REST_ONLY"), False),
        "download_media": parse_bool(os.getenv("SHADOW_DOWNLOAD_MEDIA"), True),
    }
    if channel_ids:
        seed["channel_ids"] = channel_ids
    agent_id = os.getenv("SHADOW_AGENT_ID")
    if agent_id:
        seed["agent_id"] = agent_id
    server_ids = split_csv(os.getenv("SHADOW_SERVER_IDS"))
    if server_ids:
        seed["server_ids"] = server_ids
    auto_discover = parse_bool(os.getenv("SHADOW_AUTO_DISCOVER_CHANNELS"), False)
    if auto_discover:
        seed["auto_discover_channels"] = auto_discover
    heartbeat_interval = os.getenv("SHADOW_HEARTBEAT_INTERVAL_SECONDS")
    if heartbeat_interval:
        seed["heartbeat_interval_seconds"] = heartbeat_interval
    slash_commands = _parse_json_list(os.getenv("SHADOW_SLASH_COMMANDS_JSON"))
    if slash_commands:
        seed["slash_commands"] = slash_commands
    poll_interval = os.getenv("SHADOW_POLL_INTERVAL_SECONDS")
    if poll_interval:
        seed["poll_interval_seconds"] = poll_interval
    catchup_minutes = os.getenv("SHADOW_CATCHUP_MINUTES")
    if catchup_minutes:
        seed["catchup_minutes"] = catchup_minutes
    bot_user_id = os.getenv("SHADOW_BOT_USER_ID")
    if bot_user_id:
        seed["bot_user_id"] = bot_user_id
    bot_username = os.getenv("SHADOW_BOT_USERNAME")
    if bot_username:
        seed["bot_username"] = bot_username
    if home:
        seed["home_channel"] = {"chat_id": home, "name": "Shadow Home"}
    return seed


async def _standalone_send(
    pconfig: PlatformConfig,
    chat_id: str,
    message: str,
    *,
    thread_id: str | None = None,
    media_files: list[str] | None = None,
    force_document: bool = False,
) -> dict[str, Any]:
    base_url = _base_url_from_config(pconfig)
    token = _token_from_config(pconfig)
    if not base_url or not token:
        return {"success": False, "error": "SHADOW_BASE_URL and SHADOW_TOKEN are required"}
    async with ShadowAsyncClient(base_url, token) as client:
        try:
            msg = await client.send_message(chat_id, message, thread_id=thread_id)
            uploaded: list[dict[str, Any]] = []
            for path in media_files or []:
                uploaded.append(await client.upload_media_from_url(path, message_id=str(msg.get("id"))))
            return {"success": True, "message_id": str(msg.get("id") or ""), "raw_response": msg, "uploaded": uploaded}
        except Exception as exc:
            return {"success": False, "error": str(exc)}


def register(ctx) -> None:
    ctx.register_platform(
        name=PLATFORM_NAME,
        label="Shadow",
        adapter_factory=lambda cfg: ShadowOBAdapter(cfg),
        check_fn=check_requirements,
        validate_config=validate_config,
        is_connected=_is_connected,
        required_env=["SHADOW_BASE_URL", "SHADOW_TOKEN"],
        install_hint="pip install -r ~/.hermes/plugins/shadowob/requirements.txt",
        env_enablement_fn=_env_enablement,
        cron_deliver_env_var="SHADOW_HOME_CHANNEL",
        standalone_sender_fn=_standalone_send,
        allowed_users_env="SHADOW_ALLOWED_USERS",
        allow_all_env="SHADOW_ALLOW_ALL_USERS",
        max_message_length=8000,
        emoji="🌑",
        pii_safe=False,
        allow_update_command=True,
        platform_hint=(
            "You are chatting through Shadow/OpenClaw Buddy. "
            "Treat channel/thread context as persistent collaborative chat. "
            "Keep replies concise unless the user asks for implementation detail."
        ),
    )
