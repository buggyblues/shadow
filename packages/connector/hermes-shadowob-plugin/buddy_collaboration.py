"""Buddy collaboration claim adapter for the ShadowOB Hermes runtime."""

from __future__ import annotations

from typing import Any


def message_buddy_collaboration(message: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(message, dict):
        return None
    metadata = message.get("metadata")
    if not isinstance(metadata, dict):
        return None
    collaboration = metadata.get("collaboration")
    if isinstance(collaboration, dict):
        return collaboration
    custom = metadata.get("custom")
    if isinstance(custom, dict) and isinstance(custom.get("collaboration"), dict):
        return custom["collaboration"]
    return None


def _claim_context(claim: dict[str, Any], *, root_message_id: str, buddy_id: str) -> dict[str, Any]:
    metadata = claim.get("metadata")
    collaboration = metadata.get("collaboration") if isinstance(metadata, dict) else None
    if not isinstance(collaboration, dict):
        collaboration = {
            "id": claim.get("collaborationId"),
            "rootMessageId": root_message_id,
            "buddyId": buddy_id,
            "turn": claim.get("turn"),
            "target": claim.get("target"),
        }
        if claim.get("threadId"):
            collaboration["threadId"] = claim.get("threadId")
    return {
        "ok": True,
        "claimed": True,
        "collaboration": collaboration,
        "reply_to_id": claim.get("replyToId"),
        "target": claim.get("target"),
        "thread_id": claim.get("threadId"),
    }


async def claim_buddy_collaboration_for_runtime(
    *,
    client: Any,
    message: dict[str, Any],
    channel_id: str,
    agent_id: str | None,
    max_turns: int,
    is_processing_buddy_message: bool,
    has_task_card: bool,
) -> dict[str, Any]:
    message_id = str(message.get("id") or "")
    if not agent_id or has_task_card:
        return {"ok": True, "claimed": False}

    if not is_processing_buddy_message:
        try:
            claim = await client.claim_buddy_reply(
                channel_id=channel_id,
                root_message_id=message_id,
                buddy_id=agent_id,
                reply_to_message_id=message_id,
                max_turns=max_turns,
                mode="initial",
            )
        except Exception as exc:  # pragma: no cover - exercised through adapter logs.
            return {"ok": False, "mode": "initial", "reason": "failed", "error": exc}
        if not isinstance(claim, dict) or not claim.get("ok"):
            reason = claim.get("reason") if isinstance(claim, dict) else "failed"
            return {"ok": False, "mode": "initial", "reason": reason}
        return {**_claim_context(claim, root_message_id=message_id, buddy_id=agent_id), "mode": "initial"}

    collaboration = message_buddy_collaboration(message)
    if not isinstance(collaboration, dict) or not collaboration.get("rootMessageId"):
        return {"ok": False, "mode": "conversation", "reason": "missing_collaboration"}

    root_message_id = str(collaboration.get("rootMessageId"))
    try:
        claim = await client.claim_buddy_reply(
            channel_id=channel_id,
            root_message_id=root_message_id,
            buddy_id=agent_id,
            reply_to_message_id=message_id,
            max_turns=max_turns,
            mode="conversation",
        )
    except Exception as exc:  # pragma: no cover - exercised through adapter logs.
        return {"ok": False, "mode": "conversation", "reason": "failed", "error": exc}
    if not isinstance(claim, dict) or not claim.get("ok"):
        reason = claim.get("reason") if isinstance(claim, dict) else "failed"
        return {"ok": False, "mode": "conversation", "reason": reason}
    return {**_claim_context(claim, root_message_id=root_message_id, buddy_id=agent_id), "mode": "conversation"}
