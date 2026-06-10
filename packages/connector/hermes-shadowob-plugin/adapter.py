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
import contextvars
import json
import logging
import os
import re
from collections import deque
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

try:  # Hermes imports
    from gateway.config import HomeChannel, Platform, PlatformConfig
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
    HomeChannel = None  # type: ignore
    PlatformConfig = object  # type: ignore
    BasePlatformAdapter = object  # type: ignore
    MessageEvent = object  # type: ignore
    MessageType = object  # type: ignore

    class SendResult:  # type: ignore
        def __init__(self, **kwargs: Any):
            self.__dict__.update(kwargs)

    cache_audio_from_bytes = None  # type: ignore
    cache_document_from_bytes = None  # type: ignore
    cache_image_from_bytes = None  # type: ignore
    cache_video_from_bytes = None  # type: ignore

    def resolve_channel_prompt(config_extra: dict, channel_id: str, parent_id: str | None = None):
        return None

    def resolve_channel_skills(config_extra: dict, channel_id: str, parent_id: str | None = None):
        return None

try:
    from .buddy_collaboration import claim_buddy_collaboration_for_runtime, message_buddy_collaboration
    from .shadow_sdk import ShadowApiError, ShadowAsyncClient, ShadowSocketClient, parse_bool, split_csv
except Exception:  # pragma: no cover - Hermes may load adapter.py as a loose module.
    from buddy_collaboration import claim_buddy_collaboration_for_runtime, message_buddy_collaboration  # type: ignore
    from shadow_sdk import ShadowApiError, ShadowAsyncClient, ShadowSocketClient, parse_bool, split_csv  # type: ignore

logger = logging.getLogger(__name__)

PLATFORM_NAME = "shadowob"
CURRENT_INBOUND_SHADOW_MESSAGE: contextvars.ContextVar[dict[str, Any] | None] = contextvars.ContextVar(
    "shadowob_current_inbound_message",
    default=None,
)
CURRENT_BUDDY_COLLABORATION: contextvars.ContextVar[dict[str, Any] | None] = contextvars.ContextVar(
    "shadowob_current_buddy_collaboration",
    default=None,
)
CURRENT_BUDDY_COLLABORATION_REPLY_TO_ID: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "shadowob_current_buddy_collaboration_reply_to_id",
    default=None,
)
CURRENT_SHADOW_TOOL_EFFECTS: contextvars.ContextVar[dict[str, Any] | None] = contextvars.ContextVar(
    "shadowob_current_tool_effects",
    default=None,
)

_IMAGE_CT_PREFIXES = ("image/",)
_AUDIO_CT_PREFIXES = ("audio/",)
_VIDEO_CT_PREFIXES = ("video/",)
_DOCUMENT_CT_PREFIXES = ("application/", "text/")
_SLASH_COMMAND_RE = re.compile(r"^/([a-zA-Z][a-zA-Z0-9._-]{0,63})(?:\s+([\s\S]*))?$")
_PRIVATE_CONTENT_REF_RE = re.compile(r"^/[^/]+/(?:uploads|voice)/.+")
_TERMINAL_TASK_STATUSES = {"completed", "failed", "canceled", "transferred"}
_DEFAULT_SHADOW_AUTO_SKILLS = ("shadowob", "shadow-server-app")
_CHANNEL_CONTEXT_CACHE_TTL_SECONDS = 60
_CHANNEL_CONTEXT_LIST_LIMIT = 24


def _visible_text(text: str) -> str:
    return text.replace("\u200b", "").strip()


def _is_gateway_shutdown_notice(text: Any) -> bool:
    value = str(text or "")
    return "Gateway shutting down" in value and "interrupted" in value


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


def _current_channel_payload(config: Any) -> dict[str, Any]:
    raw = _extra(config).get("current_channel")
    return raw if isinstance(raw, dict) else {}


def _current_channel_id(config: Any) -> str | None:
    raw = (
        os.getenv("SHADOW_CURRENT_CHANNEL")
        or os.getenv("SHADOW_CURRENT_CHANNEL_ID")
        or os.getenv("SHADOWOB_CHANNEL_ID")
        or _current_channel_payload(config).get("chat_id")
        or _current_channel_payload(config).get("channel_id")
        or _current_channel_payload(config).get("id")
    )
    return str(raw).strip() if raw else None


def _current_thread_id(config: Any) -> str | None:
    raw = (
        os.getenv("SHADOW_CURRENT_THREAD_ID")
        or os.getenv("SHADOWOB_THREAD_ID")
        or _current_channel_payload(config).get("thread_id")
        or _current_channel_payload(config).get("threadId")
    )
    return str(raw).strip() if raw else None


def _current_server_id(config: Any) -> str | None:
    raw = (
        os.getenv("SHADOWOB_SERVER_ID")
        or os.getenv("SHADOW_CURRENT_SERVER_ID")
        or _current_channel_payload(config).get("server_id")
        or _current_channel_payload(config).get("serverId")
    )
    return str(raw).strip() if raw else None


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


def _metadata_channel_id(metadata: dict[str, Any] | None) -> str | None:
    if not metadata:
        return None
    for key in ("channel_id", "channelId", "shadow_channel_id", "chat_id", "chatId"):
        value = metadata.get(key)
        if value not in (None, ""):
            return str(value)
    source = metadata.get("source")
    if source is not None:
        for attr in ("chat_id", "channel_id", "parent_chat_id"):
            value = getattr(source, attr, None)
            if value:
                return str(value)
    return None


def _metadata_reply_to(metadata: dict[str, Any] | None, fallback: str | None = None) -> str | None:
    fallback = fallback or CURRENT_BUDDY_COLLABORATION_REPLY_TO_ID.get()
    if not metadata:
        return fallback
    for key in ("reply_to_message_id", "replyToId", "reply_to", "shadow_reply_to_id"):
        value = metadata.get(key)
        if value not in (None, ""):
            return str(value)
    return fallback


def _shadow_metadata_fields(metadata: dict[str, Any]) -> dict[str, Any]:
    forwarded: dict[str, Any] = {}
    custom = metadata.get("custom")
    if isinstance(custom, dict):
        for key in (
            "collaboration",
            "interactive",
            "commerce",
            "commerceCard",
            "commerceCards",
            "commerceOfferId",
            "slashCommand",
        ):
            if key in custom:
                forwarded[key] = custom[key]
    for key in (
        "collaboration",
        "interactive",
        "commerce",
        "commerceCard",
        "commerceCards",
        "commerceOfferId",
        "slashCommand",
    ):
        if key in metadata:
            forwarded[key] = metadata[key]
    return forwarded


def _metadata_payload(metadata: dict[str, Any] | None) -> dict[str, Any] | None:
    if not metadata:
        return None
    raw = metadata.get("shadow_metadata") or metadata.get("metadata")
    if isinstance(raw, dict):
        forwarded = _shadow_metadata_fields(raw)
        return {**raw, **forwarded} if forwarded else raw
    forwarded = _shadow_metadata_fields(metadata)
    return forwarded or None


def _message_buddy_collaboration(message: dict[str, Any] | None) -> dict[str, Any] | None:
    return message_buddy_collaboration(message)


def _message_buddy_mention_ids(message: dict[str, Any] | None) -> set[str]:
    if not isinstance(message, dict):
        return set()
    metadata = message.get("metadata")
    if not isinstance(metadata, dict):
        return set()
    raw_mentions = metadata.get("mentions")
    if not isinstance(raw_mentions, list):
        return set()
    ids: set[str] = set()
    for mention in raw_mentions:
        if not isinstance(mention, dict):
            continue
        kind = mention.get("kind")
        if kind != "buddy" and not (kind == "user" and mention.get("isBot") is True):
            continue
        target_id = mention.get("userId") or mention.get("targetId")
        if target_id:
            ids.add(str(target_id))
    return ids


def _message_has_multiple_buddy_mentions(message: dict[str, Any] | None) -> bool:
    return len(_message_buddy_mention_ids(message)) >= 2


def _message_mentions_any_buddy(message: dict[str, Any] | None) -> bool:
    return bool(_message_buddy_mention_ids(message))


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


def _merge_auto_skills(value: Any) -> Any:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        skills: list[Any] = [value] if value.strip() else []
    elif isinstance(value, (list, tuple, set)):
        skills = [item for item in value if item not in (None, "")]
    else:
        skills = []

    seen = {str(item) for item in skills}
    for skill in _DEFAULT_SHADOW_AUTO_SKILLS:
        if skill not in seen:
            skills.append(skill)
            seen.add(skill)
    return skills


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


def _slash_command_is_passthrough(command: dict[str, Any]) -> bool:
    dispatch = str(command.get("dispatch") or "").strip().lower()
    if dispatch == "passthrough":
        return True
    # Cloud-generated Hermes command catalogs are runtime-native commands.
    # Older images did not mark them with dispatch=passthrough, so keep this
    # compatibility path to avoid turning /approve, /status, etc. into LLM text.
    pack_id = str(command.get("packId") or command.get("pack_id") or "").strip().lower()
    return pack_id == "hermes" and not str(command.get("body") or "").strip()


def _public_slash_commands(commands: list[dict[str, Any]]) -> list[dict[str, Any]]:
    public: list[dict[str, Any]] = []
    for command in commands:
        item = {
            key: value
            for key, value in command.items()
            if key in {"name", "description", "aliases", "packId", "sourcePath", "interaction"}
        }
        if item.get("name"):
            public.append(item)
    return public


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


def _bounded_metadata_text(value: Any, max_length: int, *, required: bool = False) -> str | None:
    if value in (None, ""):
        return None if not required else None
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text or len(text) > max_length:
        return None
    return text


def _message_copilot_context(message: dict[str, Any]) -> dict[str, Any] | None:
    metadata = message.get("metadata")
    if not isinstance(metadata, dict):
        return None
    raw = metadata.get("copilotContext")
    if not isinstance(raw, dict) or raw.get("kind") != "server_app_copilot":
        return None
    app_key = _bounded_metadata_text(raw.get("appKey"), 120, required=True)
    if not app_key:
        return None
    context: dict[str, Any] = {"kind": "server_app_copilot", "appKey": app_key}
    for key, max_length in (
        ("serverAppId", 160),
        ("appId", 160),
        ("appName", 160),
        ("serverId", 160),
        ("serverSlug", 160),
        ("channelId", 160),
        ("channelKind", 40),
    ):
        value = _bounded_metadata_text(raw.get(key), max_length)
        if value:
            context[key] = value
    return context


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


def _task_card_matches_self(card: dict[str, Any], *, buddy_user_id: str | None, agent_id: str | None) -> bool:
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
    if buddy_user_id and assigned_user and str(assigned_user) == buddy_user_id:
        return True
    if agent_id and assigned_agent and str(assigned_agent) == agent_id:
        return True
    return not assigned_user and not assigned_agent


def _message_task_card_for_self(
    message: dict[str, Any],
    *,
    buddy_user_id: str | None,
    agent_id: str | None,
) -> dict[str, Any] | None:
    for card in _message_cards(message):
        if _task_card_matches_self(card, buddy_user_id=buddy_user_id, agent_id=agent_id):
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


def _policy_int(config: dict[str, Any], key: str, default: int) -> int:
    try:
        value = int(config.get(key, default))
    except Exception:
        return default
    return value if value >= 0 else default


def _policy_string_set(config: dict[str, Any], key: str) -> set[str]:
    value = config.get(key)
    if not isinstance(value, list):
        return set()
    return {str(item) for item in value if item}


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


def _string_field(record: dict[str, Any] | None, *keys: str) -> str | None:
    if not isinstance(record, dict):
        return None
    for key in keys:
        value = record.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _compact_record(record: dict[str, Any] | None, keys: tuple[str, ...]) -> dict[str, Any]:
    if not isinstance(record, dict):
        return {}
    return {key: record[key] for key in keys if record.get(key) not in (None, "", [])}


def _compact_member(entry: Any) -> dict[str, Any]:
    if not isinstance(entry, dict):
        return {}
    user = entry.get("user") if isinstance(entry.get("user"), dict) else entry
    compact = _compact_record(
        user,
        ("id", "username", "displayName", "isBot", "status"),
    )
    for key in ("role", "userId"):
        if entry.get(key) not in (None, ""):
            compact[key] = entry[key]
    return compact


def _compact_buddy(entry: Any) -> dict[str, Any]:
    if not isinstance(entry, dict):
        return {}
    bot_user = entry.get("botUser") if isinstance(entry.get("botUser"), dict) else {}
    compact = _compact_record(
        entry,
        ("id", "agentId", "agentName", "name", "displayName", "status", "ownerId"),
    )
    if bot_user:
        compact["botUser"] = _compact_record(bot_user, ("id", "username", "displayName", "status"))
    return compact


def _compact_app(entry: Any) -> dict[str, Any]:
    if not isinstance(entry, dict):
        return {}
    compact = _compact_record(
        entry,
        ("id", "appKey", "name", "title", "description", "summary", "status"),
    )
    commands = entry.get("commands")
    if isinstance(commands, list) and commands:
        compact["commands"] = [
            _compact_record(command, ("name", "title", "description"))
            for command in commands[:8]
            if isinstance(command, dict)
        ]
    return compact


def _compact_slash_command(entry: Any) -> dict[str, Any]:
    if not isinstance(entry, dict):
        return {}
    return _compact_record(entry, ("name", "description", "source", "appKey", "packId"))


def _limited_compact_list(values: Any, compact_fn) -> list[dict[str, Any]]:
    if not isinstance(values, list):
        return []
    compacted = [compact_fn(item) for item in values[:_CHANNEL_CONTEXT_LIST_LIMIT]]
    return [item for item in compacted if item]


def _shadow_context_from_bootstrap(
    bootstrap: dict[str, Any] | None,
    *,
    channel_id: str,
    thread_id: str | None,
    fallback_channel: dict[str, Any] | None = None,
    agent_id: str | None = None,
    buddy_user_id: str | None = None,
    buddy_username: str | None = None,
) -> dict[str, Any]:
    bootstrap = bootstrap if isinstance(bootstrap, dict) else {}
    channel = bootstrap.get("channel") if isinstance(bootstrap.get("channel"), dict) else fallback_channel or {}
    server = bootstrap.get("server") if isinstance(bootstrap.get("server"), dict) else None
    slash_commands = bootstrap.get("slashCommands")
    commands = slash_commands.get("commands") if isinstance(slash_commands, dict) else []
    return {
        "current": {
            "channelId": channel_id,
            **({"threadId": thread_id} if thread_id else {}),
            **_compact_record(channel, ("id", "name", "title", "kind", "type", "topic", "serverId")),
        },
        **({"server": _compact_record(server, ("id", "name", "slug", "description", "visibility"))} if server else {}),
        "channels": _limited_compact_list(
            bootstrap.get("channels"),
            lambda item: _compact_record(item, ("id", "name", "title", "kind", "type", "topic")),
        ),
        "members": _limited_compact_list(bootstrap.get("members"), _compact_member),
        "buddies": _limited_compact_list(bootstrap.get("buddyInboxes"), _compact_buddy),
        "serverApps": _limited_compact_list(bootstrap.get("appSummaries"), _compact_app),
        "slashCommands": _limited_compact_list(commands, _compact_slash_command),
        "currentBuddy": {
            **({"agentId": agent_id} if agent_id else {}),
            **({"buddyUserId": buddy_user_id} if buddy_user_id else {}),
            **({"buddyUsername": buddy_username} if buddy_username else {}),
        },
    }


def _brief_name(record: dict[str, Any]) -> str:
    return (
        _string_field(record, "displayName", "name", "title", "username", "appKey", "id")
        or "unknown"
    )


def _format_shadow_context_prompt(context: dict[str, Any] | None) -> str | None:
    if not isinstance(context, dict) or not context:
        return None
    current = context.get("current") if isinstance(context.get("current"), dict) else {}
    lines = ["Shadow context snapshot:", "- Use this as the current channel/server/app/member context for the message."]
    lines.extend(
        [
            "- For ordinary channel chat and Buddy-to-Buddy replies, answer directly in one concise message.",
            "- Do not call shadowob_send_message for ordinary text replies to the current channel; the platform adapter already handles delivery.",
            "- Never use terminal commands or Shadow CLI for Shadow messaging actions. Use shadowob_send_message for native actions such as reactions, thread creation, file delivery, edits, or deletes.",
            "- Do not recap or summarize the exchange unless the user explicitly asks for a recap.",
            "- Use tools only when the user asks for work that truly requires a tool, server app, file, code, or external operation.",
        ]
    )
    if current:
        lines.append(
            "- Current channel: "
            + json.dumps(
                _compact_record(current, ("channelId", "threadId", "id", "name", "title", "kind", "type", "topic", "serverId")),
                ensure_ascii=False,
                sort_keys=True,
            )
        )
    server = context.get("server")
    if isinstance(server, dict) and server:
        lines.append("- Server: " + json.dumps(server, ensure_ascii=False, sort_keys=True))
    buddy = context.get("currentBuddy")
    if isinstance(buddy, dict) and buddy:
        lines.append("- Current Buddy identity: " + json.dumps(buddy, ensure_ascii=False, sort_keys=True))
    copilot = context.get("copilotContext")
    if isinstance(copilot, dict) and copilot:
        lines.append("- Copilot app context: " + json.dumps(copilot, ensure_ascii=False, sort_keys=True))
        app_key = _string_field(copilot, "appKey")
        if app_key:
            lines.append(
                "- Treat this app as the active collaboration surface for the user message; use matching Shadow app commands through the normal Shadow command flow."
            )

    for label, key in (
        ("Channels", "channels"),
        ("Members", "members"),
        ("Buddies", "buddies"),
        ("Server apps", "serverApps"),
        ("Slash commands", "slashCommands"),
    ):
        values = context.get(key)
        if isinstance(values, list) and values:
            names = []
            for item in values[:_CHANNEL_CONTEXT_LIST_LIMIT]:
                if isinstance(item, dict):
                    names.append(_brief_name(item))
            if names:
                lines.append(f"- {label}: " + ", ".join(names))
    return "\n".join(lines)


def _format_buddy_collaboration_prompt(collaboration: dict[str, Any] | None) -> str | None:
    if not isinstance(collaboration, dict) or not collaboration:
        return None
    collab_id = str(collaboration.get("id") or "").strip()
    root_message_id = str(collaboration.get("rootMessageId") or "").strip()
    turn = str(collaboration.get("turn") or "").strip()
    target = str(collaboration.get("target") or "").strip()
    thread_id = str(collaboration.get("threadId") or "").strip()
    reply_density = str(collaboration.get("replyDensity") or "").strip()
    suggested_text_limit = str(collaboration.get("suggestedTextLimit") or "").strip()
    lines = ["Shadow Buddy collaboration context:"]
    if collab_id:
        lines.append(f"- Collaboration id: {collab_id}")
    if root_message_id:
        lines.append(f"- Root message id: {root_message_id}")
    if turn:
        lines.append(f"- This Buddy turn: {turn}")
    if target:
        lines.append(f"- Platform delivery target: {target}")
    if thread_id:
        lines.append(f"- Platform thread id: {thread_id}")
    if reply_density:
        lines.append(f"- Suggested reply density: {reply_density}")
    if suggested_text_limit:
        lines.append(
            f"- Suggested text budget: about {suggested_text_limit} characters; treat this as guidance, not a hard cutoff."
        )
    lines.extend(
        [
            "- Treat the collaboration claim as permission to speak once, not permission to run tools.",
            "- The platform may route later collaboration turns into a thread. Do not announce that routing yourself.",
            "- If the human explicitly asks to discuss in a Thread and no platform thread id is present, call shadowob_send_message with action='ensure-thread' for the root message before sending thread discussion.",
            "- If you only agree, prefer a structured Shadow reaction action when the runtime exposes one; otherwise stay silent instead of posting acknowledgement text.",
            "- Keep the public channel IM-friendly: one concise message, no recap unless the user asks.",
            "- Default reply budget is soft: prefer at most 120 Chinese characters or 2 short bullets, but answer fully when the user explicitly asks for depth.",
            "- For turn 2 or later, add at most one missing point in one short sentence; if you only agree, do not send a text reply.",
            "- Match the density of the triggering message. Short chat gets a short reply or no extra reply.",
            "- Add a distinct point only. If another Buddy already covered it, acknowledge briefly and stop.",
            "- Do not create memories, skills, files, demos, task cards, or tool runs unless a human explicitly asks for current action.",
            "- Runtime logs, memory updates, skill views, tool progress, and self-improvement reviews are private implementation events. Never post them as channel messages.",
            "- If the user says to stop, stay quiet, not implement, or just discuss, comply immediately and do not continue the action chain.",
        ]
    )
    return "\n".join(lines)


def _merge_channel_prompt(*parts: str | None) -> str | None:
    merged = "\n\n".join(part.strip() for part in parts if isinstance(part, str) and part.strip())
    return merged or None


def _collaboration_thread_id(collaboration: dict[str, Any] | None) -> str | None:
    if not isinstance(collaboration, dict):
        return None
    if str(collaboration.get("target") or "").strip() != "thread":
        return None
    thread_id = str(collaboration.get("threadId") or "").strip()
    return thread_id or None


def _set_current_collaboration_thread(thread_id: str | None) -> None:
    thread_id = str(thread_id or "").strip()
    if not thread_id:
        return
    collaboration = CURRENT_BUDDY_COLLABORATION.get()
    if not isinstance(collaboration, dict):
        return
    collaboration["target"] = "thread"
    collaboration["threadId"] = thread_id


def _record_shadow_tool_effect(action: str, *, reply_fulfilled: bool = False) -> None:
    effects = CURRENT_SHADOW_TOOL_EFFECTS.get()
    if not isinstance(effects, dict):
        effects = {}
        CURRENT_SHADOW_TOOL_EFFECTS.set(effects)
    actions = effects.get("actions")
    if not isinstance(actions, list):
        actions = []
        effects["actions"] = actions
    actions.append(str(action))
    if reply_fulfilled:
        effects["replyFulfilled"] = True


def _shadow_tool_effects_reply_fulfilled() -> bool:
    effects = CURRENT_SHADOW_TOOL_EFFECTS.get()
    return isinstance(effects, dict) and effects.get("replyFulfilled") is True


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
        self._channel_context_cache: dict[str, tuple[datetime, dict[str, Any]]] = {}
        self._activity_clear_tasks: dict[str, asyncio.Task] = {}
        self._processed_ids: deque[str] = deque(maxlen=2000)
        self._processed_set: set[str] = set()
        self._last_seen_created_at: dict[str, datetime] = {}
        self._buddy_user_id = str(_cfg(config, "SHADOW_BUDDY_USER_ID", "buddy_user_id", default="") or "") or None
        self._buddy_username = str(_cfg(config, "SHADOW_BUDDY_USERNAME", "buddy_username", default="") or "") or None
        self._agent_id = str(_cfg(config, "SHADOW_AGENT_ID", "agent_id", default="") or "") or None
        self._heartbeat_interval = float(
            _cfg(config, "SHADOW_HEARTBEAT_INTERVAL_SECONDS", "heartbeat_interval_seconds", default=30) or 30
        )
        self._slash_commands = _parse_json_list(
            _cfg(config, "SHADOW_SLASH_COMMANDS_JSON", "slash_commands", default=[])
        )
        self._slash_commands_registered_fingerprint: str | None = None
        self._download_media = parse_bool(_cfg(config, "SHADOW_DOWNLOAD_MEDIA", "download_media", default=True), True)
        self._mention_only = parse_bool(_cfg(config, "SHADOW_MENTION_ONLY", "mention_only", default=False), False)
        self._reply_to_buddies = parse_bool(_cfg(config, "SHADOW_REPLY_TO_BUDDIES", "reply_to_buddies", default=False), False)
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
        self._ready_file = str(_cfg(config, "SHADOW_READY_FILE", "ready_file", default="") or "") or None

    @property
    def name(self) -> str:
        return "Shadow"

    async def connect(self) -> bool:
        self._clear_runner_ready()
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
            self._mark_runner_ready()
            await self._start_heartbeat()
            await self._start_channel_refresh()
            logger.info("[Shadow] Connected to %s; channels=%s", self.base_url, ",".join(self._channel_ids))
            return True
        except Exception as exc:
            logger.exception("[Shadow] connect failed")
            self._set_fatal_error("connect_failed", str(exc), retryable=True)
            self._clear_runner_ready()
            try:
                if self.client:
                    await self.client.close()
            except Exception:
                pass
            return False

    async def disconnect(self) -> None:
        self._clear_runner_ready()
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
        for task in list(self._activity_clear_tasks.values()):
            if not task.done():
                task.cancel()
        self._activity_clear_tasks.clear()
        if self.socket is not None:
            try:
                for channel_id in self._channel_ids:
                    try:
                        await self.socket.update_activity(channel_id, None)
                    except Exception:
                        pass
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

    def _mark_runner_ready(self) -> None:
        if not self._ready_file:
            return
        path = Path(self._ready_file)
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp_path = path.with_name(f"{path.name}.tmp")
            tmp_path.write_text(
                json.dumps(
                    {
                        "platform": PLATFORM_NAME,
                        "agent_id": self._agent_id,
                        "channels": self._channel_ids,
                        "socket": self.socket.connected if self.socket is not None else False,
                        "rest_only": self._rest_only,
                        "ready_at": datetime.now(timezone.utc).isoformat(),
                    },
                    separators=(",", ":"),
                ),
                encoding="utf-8",
            )
            tmp_path.replace(path)
        except Exception as exc:
            logger.warning("[Shadow] Failed to write readiness file %s: %s", self._ready_file, exc)

    def _clear_runner_ready(self) -> None:
        if not self._ready_file:
            return
        try:
            Path(self._ready_file).unlink(missing_ok=True)
        except Exception as exc:
            logger.debug("[Shadow] Failed to remove readiness file %s: %s", self._ready_file, exc)

    def _metadata_with_collaboration(
        self,
        metadata: dict[str, Any] | None,
        *,
        reply_to_id: str | None,
    ) -> dict[str, Any] | None:
        collaboration = CURRENT_BUDDY_COLLABORATION.get()
        merged = dict(metadata or {})
        if collaboration:
            merged["collaboration"] = collaboration
        if not merged:
            return metadata
        return merged

    async def send(
        self,
        chat_id: str,
        content: str,
        reply_to: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> SendResult:
        if _is_gateway_shutdown_notice(content):
            logger.debug("[Shadow] suppressed gateway shutdown notice")
            return SendResult(success=True, message_id="", raw_response={"suppressed": True})
        if CURRENT_INBOUND_SHADOW_MESSAGE.get() is not None and _shadow_tool_effects_reply_fulfilled():
            logger.debug("[Shadow] suppressed final text after fulfilled Shadow tool action")
            return SendResult(
                success=True,
                message_id="",
                raw_response={"suppressed": True, "reason": "shadow_tool_action_fulfilled"},
            )
        if self.client is None:
            return SendResult(success=False, error="Shadow client is not initialized", retryable=True)
        channel_id, thread_id = self._resolve_outbound_channel(chat_id, metadata)
        try:
            await self._set_activity(channel_id, "working")
            reply_to_id = _metadata_reply_to(metadata, reply_to)
            collaboration = CURRENT_BUDDY_COLLABORATION.get()
            collaboration_thread_id = _collaboration_thread_id(collaboration)
            if collaboration_thread_id:
                thread_id = collaboration_thread_id
            shadow_metadata = self._metadata_with_collaboration(
                _metadata_payload(metadata),
                reply_to_id=reply_to_id,
            )
            if thread_id:
                message = await self.client.send_to_thread(
                    thread_id,
                    content,
                    reply_to_id=reply_to_id,
                    metadata=shadow_metadata,
                )
            else:
                message = await self.client.send_message(
                    channel_id,
                    content,
                    reply_to_id=reply_to_id,
                    metadata=shadow_metadata,
                )
            return SendResult(success=True, message_id=str(message.get("id") or ""), raw_response=message)
        except Exception as exc:
            logger.warning("[Shadow] send failed: %s", exc)
            return SendResult(success=False, error=str(exc), retryable=self._is_retryable(exc))
        finally:
            await self._set_activity(channel_id, None)

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

    def _resolve_outbound_channel(
        self,
        chat_id: str | None,
        metadata: dict[str, Any] | None,
    ) -> tuple[str, str | None]:
        config = getattr(self, "config", None)
        requested = str(chat_id or "").strip()
        metadata_channel = _metadata_channel_id(metadata)
        current_channel = _current_channel_id(config)
        home_channel = _home_channel_id(config)

        should_use_current = bool(
            current_channel
            and (
                not requested
                or requested.lower() == PLATFORM_NAME
                or (home_channel and requested == home_channel)
            )
        )
        channel_id = metadata_channel or (current_channel if should_use_current else requested)
        if not channel_id:
            channel_id = current_channel or home_channel or requested

        thread_id = _metadata_thread_id(metadata)
        if not thread_id and current_channel and channel_id == current_channel:
            thread_id = _current_thread_id(config)
        return str(channel_id), thread_id

    async def send_typing(self, chat_id: str, metadata=None) -> None:
        if self.socket is None:
            return None
        channel_id, _thread_id = self._resolve_outbound_channel(chat_id, metadata)
        try:
            await self.socket.send_typing(channel_id, True)
            await self._set_activity(channel_id, "thinking")
        except Exception:
            return None

    async def stop_typing(self, chat_id: str) -> None:
        if self.socket is None:
            return None
        channel_id, _thread_id = self._resolve_outbound_channel(chat_id, None)
        try:
            await self.socket.send_typing(channel_id, False)
            await self._set_activity(channel_id, None)
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
        channel_id, thread_id = self._resolve_outbound_channel(chat_id, metadata)
        is_approval = str(interactive.get("kind") or "").lower() == "approval"
        try:
            await self._set_activity(channel_id, "approval" if is_approval else "working")
            reply_to_id = _metadata_reply_to(metadata, reply_to)
            message = await self.client.send_message(
                channel_id,
                content or "[interactive]",
                thread_id=thread_id,
                reply_to_id=reply_to_id,
                metadata=self._metadata_with_collaboration(shadow_metadata, reply_to_id=reply_to_id),
            )
            return SendResult(success=True, message_id=str(message.get("id") or ""), raw_response=message)
        except Exception as exc:
            return SendResult(success=False, error=str(exc), retryable=self._is_retryable(exc))
        finally:
            if not is_approval:
                await self._set_activity(channel_id, None)

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

    async def list_chats(self) -> list[dict[str, Any]]:
        chats: list[dict[str, Any]] = []
        seen: set[str] = set()
        channel_ids = list(getattr(self, "_channel_ids", []) or [])
        current_id = _current_channel_id(getattr(self, "config", None))
        if current_id and current_id not in channel_ids:
            channel_ids.insert(0, current_id)
        home_id = _home_channel_id(getattr(self, "config", None))
        if home_id and home_id not in channel_ids:
            channel_ids.append(home_id)
        for channel_id in channel_ids:
            if not channel_id or channel_id in seen:
                continue
            seen.add(channel_id)
            channel = self._channel_cache.get(channel_id, {})
            kind = str(channel.get("kind") or channel.get("type") or "channel").lower()
            chats.append(
                {
                    "id": channel_id,
                    "name": str(channel.get("name") or channel.get("title") or channel_id),
                    "type": "dm" if kind in {"dm", "direct"} else kind,
                    **({"thread_id": str(channel.get("threadId") or channel.get("thread_id"))} if channel.get("threadId") or channel.get("thread_id") else {}),
                }
            )
        return chats

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
        channel_id, thread_id = self._resolve_outbound_channel(chat_id, metadata)
        try:
            await self._set_activity(channel_id, "working")
            reply_to_id = _metadata_reply_to(metadata, reply_to)
            msg = await self.client.send_message(
                channel_id,
                caption or "\u200B",
                thread_id=thread_id,
                reply_to_id=reply_to_id,
                metadata=self._metadata_with_collaboration(
                    _metadata_payload(metadata),
                    reply_to_id=reply_to_id,
                ),
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
            await self._set_activity(channel_id, None)

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
        channel_id, thread_id = self._resolve_outbound_channel(chat_id, metadata)
        try:
            await self._set_activity(channel_id, "working")
            reply_to_id = _metadata_reply_to(metadata, reply_to)
            msg = await self.client.send_message(
                channel_id,
                caption or "\u200B",
                thread_id=thread_id,
                reply_to_id=reply_to_id,
                metadata=self._metadata_with_collaboration(
                    _metadata_payload(metadata),
                    reply_to_id=reply_to_id,
                ),
            )
            await self.client.upload_media_from_url(url, message_id=str(msg.get("id")))
            return SendResult(success=True, message_id=str(msg.get("id") or ""), raw_response=msg)
        except Exception as exc:
            return SendResult(success=False, error=str(exc), retryable=self._is_retryable(exc))
        finally:
            await self._set_activity(channel_id, None)

    async def _set_activity(self, channel_id: str, activity: str | None) -> None:
        if self.socket is None:
            return
        try:
            await self.socket.update_activity(channel_id, activity)
            self._schedule_activity_clear(channel_id, activity)
        except Exception:
            pass

    def _schedule_activity_clear(self, channel_id: str, activity: str | None) -> None:
        previous = self._activity_clear_tasks.pop(channel_id, None)
        if previous is not None and not previous.done():
            previous.cancel()
        if not activity:
            return
        self._activity_clear_tasks[channel_id] = asyncio.create_task(
            self._clear_activity_later(channel_id),
            name=f"shadowob-activity-clear-{channel_id}",
        )

    async def _clear_activity_later(self, channel_id: str, delay_seconds: float = 120.0) -> None:
        try:
            await asyncio.sleep(delay_seconds)
            if self.socket is not None:
                await self.socket.update_activity(channel_id, None)
        except asyncio.CancelledError:
            raise
        except Exception:
            pass
        finally:
            current = self._activity_clear_tasks.get(channel_id)
            if current is asyncio.current_task():
                self._activity_clear_tasks.pop(channel_id, None)

    async def _load_identity(self) -> None:
        if self.client is None:
            return
        me = await self.client.get_me()
        if not self._buddy_user_id:
            self._buddy_user_id = str(me.get("id") or me.get("userId") or "") or None
        if not self._buddy_username:
            self._buddy_username = str(me.get("username") or me.get("name") or "") or None
        if not self._agent_id:
            self._agent_id = str(me.get("agentId") or me.get("agent_id") or "") or None
        logger.info("[Shadow] Authenticated as %s (%s)", self._buddy_username, self._buddy_user_id)

    async def _refresh_remote_config(self, *, sync_socket: bool = False) -> None:
        if self.client is None or not self._agent_id:
            return
        old_channel_ids = set(self._channel_ids)
        old_remote_ids = set(self._remote_channel_ids)
        remote_config = await self.client.get_agent_config(self._agent_id)
        self._remote_config = remote_config

        self._buddy_user_id = str(remote_config.get("buddyUserId") or self._buddy_user_id or "") or None
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

    async def _shadow_channel_context(self, channel_id: str, thread_id: str | None) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        cached = self._channel_context_cache.get(channel_id)
        if cached and (now - cached[0]).total_seconds() < _CHANNEL_CONTEXT_CACHE_TTL_SECONDS:
            context = dict(cached[1])
            current = dict(context.get("current") or {})
            if thread_id:
                current["threadId"] = thread_id
            context["current"] = current
            return context

        fallback_channel = self._channel_cache.get(channel_id, {})
        bootstrap: dict[str, Any] | None = None
        if self.client is not None:
            try:
                bootstrap = await self.client.get_channel_bootstrap(channel_id, messages_limit=1)
            except Exception as exc:
                logger.debug("[Shadow] failed to load channel bootstrap context for %s: %s", channel_id, exc)
        context = _shadow_context_from_bootstrap(
            bootstrap,
            channel_id=channel_id,
            thread_id=thread_id,
            fallback_channel=fallback_channel,
            agent_id=self._agent_id,
            buddy_user_id=self._buddy_user_id,
            buddy_username=self._buddy_username,
        )
        self._channel_context_cache[channel_id] = (now, context)
        return context

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
        if not owner_id or owner_id == self._buddy_user_id:
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
        self._set_runtime_home_channel(channel_id, None, name="Shadow Owner DM", force=False)

    def _set_runtime_home_channel(
        self,
        channel_id: str,
        thread_id: str | None = None,
        *,
        name: str = "Shadow Home",
        force: bool = False,
    ) -> bool:
        if not channel_id:
            return False
        config = getattr(self, "config", None)
        if not force and _home_channel_id(config):
            return False

        os.environ["SHADOW_HOME_CHANNEL"] = channel_id
        if thread_id:
            os.environ["SHADOW_HOME_THREAD_ID"] = thread_id
        else:
            os.environ.pop("SHADOW_HOME_THREAD_ID", None)

        home_channel = {"chat_id": channel_id, "name": name}
        if thread_id:
            home_channel["thread_id"] = thread_id
        extra = getattr(self, "extra", None)
        if isinstance(extra, dict):
            extra["home_channel"] = home_channel
        config_extra = _extra(config)
        if isinstance(config_extra, dict):
            config_extra["home_channel"] = home_channel
        if channel_id not in (getattr(self, "_channel_ids", []) or []):
            try:
                self._channel_ids.append(channel_id)
            except Exception:
                pass
        if isinstance(getattr(self, "_channel_cache", None), dict):
            self._channel_cache.setdefault(channel_id, {"id": channel_id, "name": name, "kind": "channel"})
        platform = getattr(self, "platform", None)
        if HomeChannel is not None and platform is not None and config is not None:
            try:
                config.home_channel = HomeChannel(
                    platform=platform,
                    chat_id=channel_id,
                    name=name,
                    thread_id=thread_id,
                )
            except Exception:
                pass
        logger.info("[Shadow] Set runtime home channel to %s", channel_id)
        return True

    def _set_runtime_current_channel(
        self,
        channel_id: str,
        thread_id: str | None,
        channel: dict[str, Any] | None = None,
    ) -> None:
        if not channel_id:
            return
        channel = channel if isinstance(channel, dict) else {}
        name = str(channel.get("name") or channel.get("title") or channel_id)
        kind = str(channel.get("kind") or channel.get("type") or "channel")
        server_id = str(channel.get("serverId") or channel.get("server_id") or "").strip()
        server_slug = str(channel.get("serverSlug") or channel.get("server_slug") or "").strip()

        os.environ["SHADOW_CURRENT_CHANNEL"] = channel_id
        os.environ["SHADOW_CURRENT_CHANNEL_ID"] = channel_id
        os.environ["SHADOWOB_CHANNEL_ID"] = channel_id
        if thread_id:
            os.environ["SHADOW_CURRENT_THREAD_ID"] = thread_id
            os.environ["SHADOWOB_THREAD_ID"] = thread_id
        else:
            os.environ.pop("SHADOW_CURRENT_THREAD_ID", None)
            os.environ.pop("SHADOWOB_THREAD_ID", None)
        if server_id:
            os.environ["SHADOW_CURRENT_SERVER_ID"] = server_id
            os.environ["SHADOWOB_SERVER_ID"] = server_id
            os.environ["SHADOW_SERVER_ID"] = server_id
        else:
            os.environ.pop("SHADOW_CURRENT_SERVER_ID", None)
            os.environ.pop("SHADOWOB_SERVER_ID", None)
            os.environ.pop("SHADOW_SERVER_ID", None)
        if server_slug:
            os.environ["SHADOWOB_SERVER_SLUG"] = server_slug
        else:
            os.environ.pop("SHADOWOB_SERVER_SLUG", None)

        current_channel: dict[str, Any] = {"chat_id": channel_id, "name": name, "type": kind}
        if thread_id:
            current_channel["thread_id"] = thread_id
        if server_id:
            current_channel["server_id"] = server_id
        if server_slug:
            current_channel["server_slug"] = server_slug

        extra = getattr(self, "extra", None)
        if isinstance(extra, dict):
            extra["current_channel"] = current_channel
        config_extra = _extra(getattr(self, "config", None))
        if isinstance(config_extra, dict):
            config_extra["current_channel"] = current_channel

    async def _register_slash_commands(self) -> None:
        if self.client is None or not self._agent_id or not self._slash_commands:
            return
        fingerprint = json.dumps(self._slash_commands, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        if fingerprint == self._slash_commands_registered_fingerprint:
            return
        try:
            public_commands = _public_slash_commands(self._slash_commands)
            payload = await self.client.update_agent_slash_commands(self._agent_id, public_commands)
            count = len(payload.get("commands") or public_commands)
            self._slash_commands_registered_fingerprint = fingerprint
            logger.info("[Shadow] Registered %s slash command(s) for agent %s", count, self._agent_id)
        except Exception as exc:
            self._slash_commands_registered_fingerprint = None
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
                await self._register_slash_commands()
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
            metadata=self._metadata_with_collaboration(
                {
                    "interactive": block,
                    "slashCommand": {
                        "name": name,
                        "invokedName": invoked,
                        "args": args,
                        "packId": command.get("packId"),
                    },
                },
                reply_to_id=message_id,
            ),
        )
        logger.info("[Shadow] Sent interactive prompt for slash command /%s", name)
        return True

    async def _handle_shadow_control_command(
        self,
        text: str,
        *,
        channel_id: str,
        thread_id: str | None,
        message_id: str,
    ) -> bool:
        if text.strip().lower() != "/sethome":
            return False
        if self.client is None:
            return False

        self._set_runtime_home_channel(channel_id, thread_id, force=True)

        await self.client.send_message(
            channel_id,
            "Home channel locked — this is now the Shadowob relay point.",
            thread_id=thread_id,
            reply_to_id=message_id,
        )
        logger.info("[Shadow] Set home channel to %s", channel_id)
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
        status = "failed" if failed else "running"
        default_note = (
            "Hermes failed while processing this task."
            if failed
            else "Hermes delivered a reply; awaiting explicit task completion."
        )
        try:
            await self.client.update_task_card(
                message_id,
                card_id,
                status=status,
                note=(note or default_note)[:4000],
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
        thread_id = _message_thread_id(message)
        channel = self._channel_cache.get(channel_id, {})
        self._set_runtime_current_channel(channel_id, thread_id, channel)
        self._set_runtime_home_channel(
            channel_id,
            thread_id,
            name=str(channel.get("name") or "Shadow Home"),
            force=False,
        )
        policy = self._channel_policies.get(channel_id)
        policy_config = _policy_config(policy)

        author_id = _message_author_id(message)
        author = _message_author(message)
        task_card = _message_task_card_for_self(
            message,
            buddy_user_id=self._buddy_user_id,
            agent_id=self._agent_id,
        )
        is_author_buddy = bool(author.get("isBot"))
        mentions_self = self._message_mentions_self(message)
        human_mention_override = mentions_self and not is_author_buddy
        is_processing_buddy_message = False
        if (
            not is_author_buddy
            and _message_mentions_any_buddy(message)
            and not mentions_self
            and not task_card
        ):
            logger.debug("[Shadow] explicit Buddy mention skipped non-target message %s", message_id)
            return
        if self._buddy_user_id and author_id == self._buddy_user_id:
            logger.debug("[Shadow] skipping own message %s", message_id)
            return
        reply_to_buddy = parse_bool(policy_config.get("replyToBuddy"), True)
        if is_author_buddy:
            if not (reply_to_buddy or task_card):
                logger.debug("[Shadow] skipping Buddy-authored message %s", message_id)
                return
            sender_ids = {str(item) for item in (author_id, author.get("id")) if item}
            buddy_blacklist = _policy_string_set(policy_config, "buddyBlacklist")
            if buddy_blacklist and sender_ids.intersection(buddy_blacklist):
                logger.debug("[Shadow] policy buddy blacklist skipped message %s", message_id)
                return
            buddy_whitelist = _policy_string_set(policy_config, "buddyWhitelist")
            if buddy_whitelist and not sender_ids.intersection(buddy_whitelist):
                logger.debug("[Shadow] policy buddy whitelist skipped message %s", message_id)
                return
            is_processing_buddy_message = True
        if policy and not _policy_bool(policy, "listen", True):
            logger.debug("[Shadow] policy listen=false skipped message %s", message_id)
            return
        if policy and not _policy_bool(policy, "reply", True) and not human_mention_override:
            logger.debug("[Shadow] policy reply=false skipped message %s", message_id)
            return
        trigger_user_ids = policy_config.get("allowedTriggerUserIds") or policy_config.get("triggerUserIds")
        if isinstance(trigger_user_ids, list):
            allowed = {str(item) for item in trigger_user_ids if item}
            if (
                allowed
                and not task_card
                and not human_mention_override
                and not is_processing_buddy_message
                and (not author_id or author_id not in allowed)
            ):
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
        if is_author_buddy and _is_gateway_shutdown_notice(text):
            logger.debug("[Shadow] runtime status notice skipped message %s", message_id)
            return
        mention_only = self._mention_only or _policy_bool(policy, "mentionOnly", False)
        if mention_only and not mentions_self and not task_card and not is_processing_buddy_message:
            # DMs are allowed even in mention-only mode.
            channel = self._channel_cache.get(channel_id, {})
            kind = str(channel.get("kind") or channel.get("type") or "").lower()
            if kind not in {"dm", "direct"}:
                logger.debug("[Shadow] mention-only skipped message %s", message_id)
                return
        buddy_collaboration: dict[str, Any] | None = None
        buddy_collaboration_reply_to_id: str | None = None
        if self.client is not None:
            collaboration_claim = await claim_buddy_collaboration_for_runtime(
                client=self.client,
                message=message,
                channel_id=channel_id,
                agent_id=self._agent_id,
                max_turns=_policy_int(policy_config, "maxBuddyTurns", 4),
                is_processing_buddy_message=is_processing_buddy_message,
                has_task_card=bool(task_card),
            )
            if not collaboration_claim.get("ok"):
                mode = str(collaboration_claim.get("mode") or "")
                reason = str(collaboration_claim.get("reason") or "failed")
                error = collaboration_claim.get("error")
                if error is not None:
                    if mode == "initial":
                        logger.debug(
                            "[Shadow] initial collaboration claim failed for message %s: %s",
                            message_id,
                            error,
                        )
                    else:
                        logger.debug("[Shadow] collaboration claim failed for message %s: %s", message_id, error)
                elif reason == "missing_collaboration":
                    logger.debug(
                        "[Shadow] collaboration skipped for Buddy message %s: missing collaboration claim",
                        message_id,
                    )
                elif mode == "initial":
                    logger.debug("[Shadow] initial collaboration claim skipped message %s: %s", message_id, reason)
                else:
                    logger.debug("[Shadow] collaboration claim skipped message %s: %s", message_id, reason)
                return
            if collaboration_claim.get("claimed"):
                collaboration = collaboration_claim.get("collaboration")
                if isinstance(collaboration, dict):
                    buddy_collaboration = collaboration
                reply_to_id = collaboration_claim.get("reply_to_id")
                if reply_to_id:
                    buddy_collaboration_reply_to_id = str(reply_to_id)
        text = _text_without_self_mention(text, self._buddy_username)
        if await self._handle_shadow_control_command(
            text,
            channel_id=channel_id,
            thread_id=_message_thread_id(message),
            message_id=message_id,
        ):
            return

        slash_match = _slash_command_match(text, self._slash_commands)
        if slash_match:
            command, invoked, args = slash_match
            logger.info("[Shadow] Matched slash command /%s -> /%s", invoked, command.get("name") or invoked)
            passthrough = _slash_command_is_passthrough(command)
            if command.get("interaction") and not args.strip() and not passthrough:
                token = CURRENT_INBOUND_SHADOW_MESSAGE.set(message)
                collaboration_token = CURRENT_BUDDY_COLLABORATION.set(buddy_collaboration)
                collaboration_reply_to_token = CURRENT_BUDDY_COLLABORATION_REPLY_TO_ID.set(
                    buddy_collaboration_reply_to_id
                )
                try:
                    sent = await self._send_slash_interactive_prompt(
                        slash_match,
                        message_id=message_id,
                        channel_id=channel_id,
                        thread_id=thread_id,
                    )
                finally:
                    CURRENT_BUDDY_COLLABORATION_REPLY_TO_ID.reset(collaboration_reply_to_token)
                    CURRENT_BUDDY_COLLABORATION.reset(collaboration_token)
                    CURRENT_INBOUND_SHADOW_MESSAGE.reset(token)
                if sent:
                    return
            if not passthrough:
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

        chat_name = str(channel.get("name") or channel.get("title") or channel_id)
        channel_kind = str(channel.get("kind") or channel.get("type") or "channel").lower()
        chat_type = "thread" if thread_id else ("dm" if channel_kind in {"dm", "direct"} else "group")
        shadow_context = await self._shadow_channel_context(channel_id, thread_id)
        copilot_context = _message_copilot_context(message)
        if copilot_context:
            shadow_context = {**shadow_context, "copilotContext": copilot_context}

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
        channel_prompt = _merge_channel_prompt(
            _format_shadow_context_prompt(shadow_context),
            _format_buddy_collaboration_prompt(buddy_collaboration),
            resolve_channel_prompt(config_extra, thread_id or channel_id, parent_for_bindings),
        )
        event = MessageEvent(
            text=text or ("[Media attached]" if media_paths else ""),
            message_type=message_type,
            source=source_obj,
            raw_message={
                "shadow": message,
                "source": source,
                "media": media_metadata,
                "shadow_context": shadow_context,
                "buddy_collaboration": buddy_collaboration,
            },
            message_id=message_id,
            media_urls=media_paths,
            media_types=media_types,
            reply_to_message_id=reply_to_id,
            reply_to_text=reply_to_text,
            auto_skill=_merge_auto_skills(
                resolve_channel_skills(config_extra, thread_id or channel_id, parent_for_bindings)
            ),
            channel_prompt=channel_prompt,
        )
        task_card_id = _card_id(task_card) if task_card else None
        token = CURRENT_INBOUND_SHADOW_MESSAGE.set(message)
        collaboration_token = CURRENT_BUDDY_COLLABORATION.set(buddy_collaboration)
        collaboration_reply_to_token = CURRENT_BUDDY_COLLABORATION_REPLY_TO_ID.set(
            buddy_collaboration_reply_to_id
        )
        tool_effects_token = CURRENT_SHADOW_TOOL_EFFECTS.set({})
        try:
            try:
                await self.handle_message(event)
            except Exception as exc:
                await self._complete_task_card(message_id, task_card_id, failed=True, note=str(exc))
                raise
            if task_card_id:
                await self._complete_task_card(message_id, task_card_id)
        finally:
            CURRENT_SHADOW_TOOL_EFFECTS.reset(tool_effects_token)
            CURRENT_BUDDY_COLLABORATION_REPLY_TO_ID.reset(collaboration_reply_to_token)
            CURRENT_BUDDY_COLLABORATION.reset(collaboration_token)
            CURRENT_INBOUND_SHADOW_MESSAGE.reset(token)

    def _remember_processed(self, message_id: str) -> None:
        if len(self._processed_ids) == self._processed_ids.maxlen:
            old = self._processed_ids.popleft()
            self._processed_set.discard(old)
        self._processed_ids.append(message_id)
        self._processed_set.add(message_id)

    def _message_mentions_self(self, message: dict[str, Any]) -> bool:
        if not self._buddy_user_id and not self._buddy_username:
            return False
        text = str(message.get("content") or "")
        if self._buddy_username and f"@{self._buddy_username}".lower() in text.lower():
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
            if self._buddy_user_id and target_id and str(target_id) == self._buddy_user_id:
                return True
            if self._buddy_username and username and str(username).lower() == self._buddy_username.lower():
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
                if _PRIVATE_CONTENT_REF_RE.match(download_url) and attachment_id:
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
    home_thread = os.getenv("SHADOW_HOME_THREAD_ID")
    current = os.getenv("SHADOW_CURRENT_CHANNEL") or os.getenv("SHADOW_CURRENT_CHANNEL_ID")
    current_thread = os.getenv("SHADOW_CURRENT_THREAD_ID")
    if home and home not in channel_ids:
        channel_ids.append(home)
    if current and current not in channel_ids:
        channel_ids.insert(0, current)

    seed: dict[str, Any] = {
        "base_url": base_url,
        "token": token,
        "mention_only": parse_bool(os.getenv("SHADOW_MENTION_ONLY"), False),
        "reply_to_buddies": parse_bool(os.getenv("SHADOW_REPLY_TO_BUDDIES"), False),
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
    buddy_user_id = os.getenv("SHADOW_BUDDY_USER_ID")
    if buddy_user_id:
        seed["buddy_user_id"] = buddy_user_id
    buddy_username = os.getenv("SHADOW_BUDDY_USERNAME")
    if buddy_username:
        seed["buddy_username"] = buddy_username
    if home:
        seed["home_channel"] = {
            "chat_id": home,
            "name": "Shadow Home",
            **({"thread_id": home_thread} if home_thread else {}),
        }
    if current:
        seed["current_channel"] = {
            "chat_id": current,
            "name": "Shadow Current",
            **({"thread_id": current_thread} if current_thread else {}),
            **({"server_id": os.getenv("SHADOWOB_SERVER_ID")} if os.getenv("SHADOWOB_SERVER_ID") else {}),
            **({"server_slug": os.getenv("SHADOWOB_SERVER_SLUG")} if os.getenv("SHADOWOB_SERVER_SLUG") else {}),
        }
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
            for item in media_files or []:
                path = item[0] if isinstance(item, (list, tuple)) and item else item
                uploaded.append(await client.upload_media_from_url(str(path), message_id=str(msg.get("id"))))
            return {"success": True, "message_id": str(msg.get("id") or ""), "raw_response": msg, "uploaded": uploaded}
        except Exception as exc:
            return {"success": False, "error": str(exc)}


SHADOWOB_SEND_MESSAGE_SCHEMA = {
    "name": "shadowob_send_message",
    "description": (
        "Send, edit, delete, react to, ensure threads for, or list Shadow/OpenClaw channel messages through "
        "Shadow/OpenClaw Buddy with native Shadow attachment support. Do not use this "
        "tool for ordinary plain-text replies to the current channel; return final text "
        "instead so the platform reply pipeline can deliver it once. Use action='list' "
        "to see known Shadow targets. Use action='send', action='upload-file', or "
        "action='send-voice' with target='shadowob' for the current/home chat, "
        "target='shadowob:<channel_id>' for a specific channel, or attachments/MEDIA:/path "
        "for files such as HTML reports."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": [
                    "send",
                    "upload-file",
                    "send-voice",
                    "list",
                    "react",
                    "edit",
                    "delete",
                    "ensure-thread",
                ],
                "description": (
                    "Use 'send' to deliver a message, 'upload-file'/'send-voice' to send media, "
                    "'react' to add a reaction, 'edit' to update a message, 'delete' to remove one, "
                    "'ensure-thread' to create or reuse a thread for a parent message, or 'list' to list known Shadow chats."
                ),
            },
            "target": {
                "type": "string",
                "description": "Target chat. Examples: 'shadowob', 'shadowob:<channel_id>', '<channel_id>', or a listed chat name.",
            },
            "message": {
                "type": "string",
                "description": "Message text for send/edit. May include MEDIA:/local/path.ext tags; attachments can also be supplied separately.",
            },
            "message_id": {
                "type": "string",
                "description": "Shadow message ID for react, edit, or delete actions.",
            },
            "emoji": {
                "type": "string",
                "description": "Emoji to add when action='react'.",
            },
            "thread_id": {
                "type": "string",
                "description": "Optional Shadow thread ID to send into.",
            },
            "parent_message_id": {
                "type": "string",
                "description": "Parent Shadow message ID when action='ensure-thread'. Defaults to the current inbound Shadow message.",
            },
            "name": {
                "type": "string",
                "description": "Optional thread name when action='ensure-thread'.",
            },
            "attachments": {
                "type": "array",
                "description": "Optional local file paths or objects like {'path':'/tmp/report.html','kind':'document'}.",
                "items": {
                    "anyOf": [
                        {"type": "string"},
                        {
                            "type": "object",
                            "properties": {
                                "path": {"type": "string"},
                                "url": {"type": "string"},
                                "kind": {"type": "string"},
                                "is_voice": {"type": "boolean"},
                            },
                        },
                    ],
                },
            },
        },
        "required": [],
    },
}


def _tool_error(message: str, **extra: Any) -> str:
    try:
        from tools.registry import tool_error

        return tool_error(message, **extra)
    except Exception:
        payload = {"error": str(message), **extra}
        return json.dumps(payload, ensure_ascii=False)


def _tool_result(data: Any = None, **kwargs: Any) -> str:
    try:
        from tools.registry import tool_result

        if data is not None:
            return tool_result(data)
        return tool_result(**kwargs)
    except Exception:
        return json.dumps(data if data is not None else kwargs, ensure_ascii=False)


def _shadowob_live_adapter() -> Any | None:
    try:
        from gateway.run import _gateway_runner_ref

        runner = _gateway_runner_ref()
    except Exception:
        runner = None
    adapters = getattr(runner, "adapters", None)
    if not isinstance(adapters, dict):
        return None
    for platform, adapter in adapters.items():
        if str(getattr(platform, "value", platform)).lower() == PLATFORM_NAME:
            return adapter
    return None


def _shadowob_tool_platform_config() -> tuple[Any, str | None]:
    pconfig = None
    home_channel_id = os.getenv("SHADOW_HOME_CHANNEL")
    try:
        from gateway.config import load_gateway_config

        config = load_gateway_config()
        platform = Platform(PLATFORM_NAME) if Platform is not None else PLATFORM_NAME
        pconfig = config.platforms.get(platform)
        home = config.get_home_channel(platform)
        if home is not None:
            home_channel_id = str(getattr(home, "chat_id", None) or home_channel_id or "") or None
    except Exception:
        pass
    if pconfig is None:
        pconfig = type(
            "ShadowOBToolConfig",
            (),
            {
                "token": os.getenv("SHADOW_TOKEN"),
                "extra": _env_enablement() or {},
            },
        )()
    return pconfig, home_channel_id or _home_channel_id(pconfig)


async def _shadowob_known_chats(pconfig: Any, home_channel_id: str | None = None) -> list[dict[str, Any]]:
    chats: list[dict[str, Any]] = []
    seen: set[str] = set()
    adapter = _shadowob_live_adapter()
    if adapter is not None and hasattr(adapter, "list_chats"):
        try:
            listed = await adapter.list_chats()
            for chat in listed or []:
                chat_id = str(chat.get("id") or chat.get("chat_id") or "").strip() if isinstance(chat, dict) else ""
                if not chat_id or chat_id in seen:
                    continue
                seen.add(chat_id)
                chats.append(
                    {
                        "id": chat_id,
                        "name": str(chat.get("name") or chat.get("title") or chat_id),
                        "type": str(chat.get("type") or chat.get("kind") or "channel"),
                        **({"thread_id": str(chat.get("thread_id") or chat.get("threadId"))} if chat.get("thread_id") or chat.get("threadId") else {}),
                    }
                )
        except Exception as exc:
            logger.debug("[Shadow] shadowob_send_message list_chats failed: %s", exc)

    current = _current_channel_id(pconfig)
    if current and current not in seen:
        chats.insert(
            0,
            {
                "id": current,
                "name": "Shadow Current",
                "type": "channel",
                **({"thread_id": _current_thread_id(pconfig)} if _current_thread_id(pconfig) else {}),
            },
        )
        seen.add(current)

    home = home_channel_id or _home_channel_id(pconfig)
    if home and home not in seen:
        chats.append({"id": home, "name": "Shadow Home", "type": "channel"})
    return chats


def _normalize_shadowob_tool_target(target: Any) -> str:
    value = str(target or "").strip()
    if value.lower() == PLATFORM_NAME:
        return ""
    if value.lower().startswith(f"{PLATFORM_NAME}:"):
        value = value.split(":", 1)[1].strip()
    return value.lstrip("#").strip()


async def _resolve_shadowob_tool_target(
    target: Any,
    *,
    pconfig: Any,
    home_channel_id: str | None,
    explicit_thread_id: str | None = None,
) -> tuple[str | None, str | None, list[dict[str, Any]]]:
    chats = await _shadowob_known_chats(pconfig, home_channel_id)
    value = _normalize_shadowob_tool_target(target)
    if not value:
        current_channel = _current_channel_id(pconfig)
        return (
            current_channel or home_channel_id or _home_channel_id(pconfig),
            explicit_thread_id or (_current_thread_id(pconfig) if current_channel else None),
            chats,
        )

    target_channel = value
    target_thread = explicit_thread_id
    if ":" in value:
        target_channel, maybe_thread = value.split(":", 1)
        if maybe_thread and not target_thread:
            target_thread = maybe_thread

    query = target_channel.lstrip("#").strip().lower()
    for chat in chats:
        chat_id = str(chat.get("id") or "")
        chat_name = str(chat.get("name") or "")
        if chat_id == target_channel or chat_name.lower() == query or chat_name.lstrip("#").lower() == query:
            return chat_id, target_thread or (str(chat.get("thread_id")) if chat.get("thread_id") else None), chats
    return target_channel or None, target_thread, chats


def _shadowob_tool_media(args: dict[str, Any], message: str) -> tuple[list[dict[str, Any]], str]:
    media_items: list[dict[str, Any]] = []
    cleaned_message = message
    try:
        media_files, cleaned = BasePlatformAdapter.extract_media(message)
        media_files = BasePlatformAdapter.filter_media_delivery_paths(media_files)
        cleaned_message = cleaned
        for path, is_voice in media_files:
            media_items.append({"path": str(path), "is_voice": bool(is_voice)})
    except Exception:
        cleaned_message = re.sub(r"\bMEDIA:([^\s]+)", "", message).strip()
        for match in re.finditer(r"\bMEDIA:([^\s]+)", message):
            media_items.append({"path": match.group(1).strip(), "is_voice": False})

    attachments = args.get("attachments") or args.get("files") or args.get("media") or []
    if isinstance(attachments, (str, dict)):
        attachments = [attachments]
    if isinstance(attachments, list):
        for item in attachments:
            if isinstance(item, str):
                path = item
                kind = None
                is_voice = False
            elif isinstance(item, dict):
                path = str(item.get("path") or item.get("url") or item.get("media") or "").strip()
                kind = str(item.get("kind") or "").strip() or None
                is_voice = bool(item.get("is_voice") or item.get("isVoice") or kind == "voice")
            else:
                continue
            if path:
                media_items.append({"path": path, "kind": kind, "is_voice": is_voice})
    return media_items, cleaned_message


def _shadowob_tool_collaboration_metadata() -> dict[str, Any] | None:
    collaboration = CURRENT_BUDDY_COLLABORATION.get()
    return {"collaboration": collaboration} if isinstance(collaboration, dict) else None


def _message_channel_id(message: dict[str, Any] | None) -> str | None:
    if not isinstance(message, dict):
        return None
    for key in ("channelId", "channel_id", "chatId", "chat_id"):
        value = message.get(key)
        if value:
            return str(value)
    channel = message.get("channel")
    if isinstance(channel, dict):
        value = channel.get("id") or channel.get("channelId")
        if value:
            return str(value)
    return None


def _message_thread_id_from_payload(message: dict[str, Any] | None) -> str | None:
    if not isinstance(message, dict):
        return None
    for key in ("threadId", "thread_id"):
        value = message.get(key)
        if value:
            return str(value)
    thread = message.get("thread")
    if isinstance(thread, dict):
        value = thread.get("id") or thread.get("threadId")
        if value:
            return str(value)
    return None


def _shadowob_tool_has_rich_payload(args: dict[str, Any], media_items: list[dict[str, Any]]) -> bool:
    if media_items:
        return True
    rich_keys = {
        "attachments",
        "files",
        "media",
        "path",
        "filePath",
        "buffer",
        "commerceOfferId",
        "commerceOfferIds",
        "kind",
        "prompt",
        "buttons",
        "options",
        "fields",
        "interactive",
    }
    return any(args.get(key) not in (None, "", [], {}) for key in rich_keys)


def _shadowob_tool_is_plain_current_channel_send(
    args: dict[str, Any],
    *,
    pconfig: Any,
    channel_id: str,
    thread_id: str | None,
    media_items: list[dict[str, Any]],
) -> bool:
    inbound = CURRENT_INBOUND_SHADOW_MESSAGE.get()
    if not isinstance(inbound, dict):
        return False
    if _shadowob_tool_has_rich_payload(args, media_items):
        return False
    inbound_channel_id = _message_channel_id(inbound) or _current_channel_id(pconfig)
    if not inbound_channel_id or str(channel_id) != str(inbound_channel_id):
        return False
    explicit_target = str(args.get("target") or "").strip()
    if explicit_target and _normalize_shadowob_tool_target(explicit_target) not in {"", inbound_channel_id}:
        return False
    inbound_thread_id = _message_thread_id_from_payload(inbound) or _current_thread_id(pconfig)
    return (thread_id or None) == (inbound_thread_id or None)


async def _shadowob_send_message_tool(args: dict[str, Any], **kwargs: Any) -> str:
    action = str(args.get("action") or "send").strip().lower()
    pconfig, home_channel_id = _shadowob_tool_platform_config()
    if action == "list":
        chats = await _shadowob_known_chats(pconfig, home_channel_id)
        return _tool_result(
            {
                "success": True,
                "targets": [
                    {
                        "target": f"{PLATFORM_NAME}:{chat['id']}",
                        "id": chat["id"],
                        "name": chat.get("name"),
                        "type": chat.get("type"),
                        **({"thread_id": chat["thread_id"]} if chat.get("thread_id") else {}),
                    }
                    for chat in chats
                ],
                "home_channel": home_channel_id,
                "current_channel": _current_channel_id(pconfig),
            }
        )
    send_actions = {"send", "upload-file", "send-voice"}
    message_actions = {"react", "edit", "delete"}
    thread_actions = {"ensure-thread"}
    if action not in send_actions | message_actions | thread_actions:
        return _tool_error(
            "action must be one of 'send', 'upload-file', 'send-voice', 'list', 'react', 'edit', 'delete', or 'ensure-thread'"
        )

    base_url = _base_url_from_config(pconfig)
    token = _token_from_config(pconfig)
    if not base_url or not token:
        return _tool_error("SHADOW_BASE_URL and SHADOW_TOKEN are required")

    if action in thread_actions:
        parent_message_id = str(
            args.get("parent_message_id")
            or args.get("parentMessageId")
            or args.get("message_id")
            or args.get("messageId")
            or ""
        ).strip()
        if not parent_message_id:
            parent_message_id = _message_id(CURRENT_INBOUND_SHADOW_MESSAGE.get() or {}) or ""
        if not parent_message_id:
            return _tool_error("parent_message_id is required")
        name = str(args.get("name") or args.get("thread_name") or args.get("threadName") or "").strip()
        try:
            async with ShadowAsyncClient(base_url, token) as client:
                thread = await client.ensure_thread(parent_message_id, name=name or None)
                thread_id = str(thread.get("id") or thread.get("threadId") or "").strip()
                if thread_id:
                    _set_current_collaboration_thread(thread_id)
                return _tool_result(
                    {
                        "success": True,
                        "platform": PLATFORM_NAME,
                        "action": "ensure-thread",
                        "parent_message_id": parent_message_id,
                        "thread_id": thread_id,
                        "channel_id": str(thread.get("channelId") or thread.get("channel_id") or ""),
                        "raw_response": thread,
                    }
                )
        except Exception as exc:
            return _tool_error(str(exc))

    if action in message_actions:
        message_id = str(args.get("message_id") or args.get("messageId") or "").strip()
        if not message_id:
            return _tool_error("message_id is required")

        try:
            async with ShadowAsyncClient(base_url, token) as client:
                if action == "react":
                    emoji = str(args.get("emoji") or args.get("reaction") or "").strip()
                    if not emoji:
                        return _tool_error("emoji is required")
                    await client.add_reaction(message_id, emoji)
                    _record_shadow_tool_effect("react", reply_fulfilled=True)
                    return _tool_result(
                        {
                            "success": True,
                            "platform": PLATFORM_NAME,
                            "action": "react",
                            "message_id": message_id,
                            "emoji": emoji,
                        }
                    )
                if action == "edit":
                    message = str(args.get("message") or args.get("content") or "")
                    if not _visible_text(message):
                        return _tool_error("message is required")
                    updated = await client.edit_message(message_id, message)
                    return _tool_result(
                        {
                            "success": True,
                            "platform": PLATFORM_NAME,
                            "action": "edit",
                            "message_id": message_id,
                            "raw_response": updated,
                        }
                    )

                await client.delete_message(message_id)
                return _tool_result(
                    {
                        "success": True,
                        "platform": PLATFORM_NAME,
                        "action": "delete",
                        "message_id": message_id,
                    }
                )
        except Exception as exc:
            return _tool_error(str(exc))

    message = str(args.get("message") or "")
    media_items, cleaned_message = _shadowob_tool_media(args, message)
    if action == "send-voice":
        for media in media_items:
            media["is_voice"] = True
            media["kind"] = media.get("kind") or "voice"
    if not _visible_text(cleaned_message) and not media_items:
        return _tool_error("message or attachments are required")

    channel_id, thread_id, chats = await _resolve_shadowob_tool_target(
        args.get("target"),
        pconfig=pconfig,
        home_channel_id=home_channel_id,
        explicit_thread_id=str(args.get("thread_id") or "").strip() or None,
    )
    if not channel_id:
        return _tool_error(
            "No Shadow target resolved. Run shadowob_send_message(action='list') or set SHADOW_CURRENT_CHANNEL/SHADOW_HOME_CHANNEL."
        )

    collaboration = CURRENT_BUDDY_COLLABORATION.get()
    collaboration_thread_id = _collaboration_thread_id(collaboration)
    if collaboration_thread_id and not thread_id and not str(args.get("target") or "").strip():
        thread_id = collaboration_thread_id

    if action == "send" and _shadowob_tool_is_plain_current_channel_send(
        args,
        pconfig=pconfig,
        channel_id=channel_id,
        thread_id=thread_id,
        media_items=media_items,
    ):
        return _tool_error(
            "Plain text replies to the current Shadow channel are delivered automatically. "
            "Do not call shadowob_send_message for ordinary chat; return the reply as final text instead.",
            code="PLAIN_CURRENT_CHANNEL_SEND_BLOCKED",
        )

    try:
        async with ShadowAsyncClient(base_url, token) as client:
            reply_to_id = _metadata_reply_to(args)
            send_kwargs: dict[str, Any] = {}
            if thread_id:
                send_kwargs["thread_id"] = thread_id
            if reply_to_id:
                send_kwargs["reply_to_id"] = reply_to_id
            metadata = _shadowob_tool_collaboration_metadata()
            if metadata:
                send_kwargs["metadata"] = metadata
            content_to_send = cleaned_message if _visible_text(cleaned_message) else "\u200B"
            if thread_id:
                thread_kwargs = {k: v for k, v in send_kwargs.items() if k != "thread_id"}
                msg = await client.send_to_thread(thread_id, content_to_send, **thread_kwargs)
            else:
                msg = await client.send_message(channel_id, content_to_send, **send_kwargs)
            uploaded: list[dict[str, Any]] = []
            for media in media_items:
                path = str(media.get("path") or "").strip()
                if not path:
                    continue
                uploaded.append(
                    await client.upload_media_from_url(
                        path,
                        message_id=str(msg.get("id") or ""),
                        kind=str(media.get("kind") or "voice") if media.get("is_voice") or media.get("kind") else None,
                    )
                )
            if thread_id:
                _set_current_collaboration_thread(thread_id)
            _record_shadow_tool_effect(action, reply_fulfilled=True)
            return _tool_result(
                {
                    "success": True,
                    "platform": PLATFORM_NAME,
                    "action": action,
                    "target": f"{PLATFORM_NAME}:{channel_id}",
                    "channel_id": channel_id,
                    "thread_id": thread_id,
                    "message_id": str(msg.get("id") or ""),
                    "attachments": uploaded,
                    "known_targets": len(chats),
                }
            )
    except Exception as exc:
        return _tool_error(str(exc))


def register(ctx) -> None:
    ctx.register_tool(
        name="shadowob_send_message",
        toolset="shadowob",
        schema=SHADOWOB_SEND_MESSAGE_SCHEMA,
        handler=_shadowob_send_message_tool,
        check_fn=check_requirements,
        requires_env=["SHADOW_BASE_URL", "SHADOW_TOKEN"],
        is_async=True,
        description=SHADOWOB_SEND_MESSAGE_SCHEMA["description"],
        emoji="🌑",
    )
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
            "Do not use shadowob_send_message for ordinary plain-text replies to the current channel; "
            "the platform delivers final text automatically. Use shadowob_send_message only for "
            "Shadow-native actions such as files, HTML reports, images, audio, video, reactions, "
            "thread creation, edits, deletes, or other attachments. "
            "Use action='ensure-thread' before Thread-only discussion when no thread id is present. "
            "Do not use terminal commands or Shadow CLI for Shadow messaging actions. "
            "Keep replies concise unless the user asks for implementation detail."
        ),
    )
