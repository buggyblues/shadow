"""Shadow REST API client — Python edition.

Mirrors the TypeScript ``ShadowClient`` 1-to-1 so that every JS SDK method
has a Python equivalent with the same semantics.
"""

from __future__ import annotations

import json
from dataclasses import asdict, is_dataclass
from typing import Any, Iterator

import httpx

from .types import (
    ShadowAddAgentsToServerResult,
    ShadowAgentUsageSnapshotInput,
    ShadowEntitlement,
)


_USAGE_SNAPSHOT_FIELD_ALIASES = {
    "total_usd": "totalUsd",
    "input_tokens": "inputTokens",
    "output_tokens": "outputTokens",
    "cache_read_tokens": "cacheReadTokens",
    "cache_write_tokens": "cacheWriteTokens",
    "total_tokens": "totalTokens",
    "generated_at": "generatedAt",
}

_USAGE_PROVIDER_FIELD_ALIASES = {
    "amount_usd": "amountUsd",
    "usage_label": "usageLabel",
    "input_tokens": "inputTokens",
    "output_tokens": "outputTokens",
    "total_tokens": "totalTokens",
}


def _as_plain_value(value: Any) -> Any:
    if is_dataclass(value) and not isinstance(value, type):
        return asdict(value)
    return value


def _compact_json(value: Any) -> Any:
    value = _as_plain_value(value)
    if isinstance(value, dict):
        return {
            key: _compact_json(nested)
            for key, nested in value.items()
            if nested is not None
        }
    if isinstance(value, list):
        return [_compact_json(item) for item in value]
    return value


def _usage_provider_to_json(provider: Any) -> Any:
    data = _as_plain_value(provider)
    if not isinstance(data, dict):
        return data
    return {
        _USAGE_PROVIDER_FIELD_ALIASES.get(key, key): _compact_json(value)
        for key, value in data.items()
        if value is not None
    }


def _usage_snapshot_to_json(
    snapshot: dict[str, Any] | ShadowAgentUsageSnapshotInput,
) -> dict[str, Any]:
    data = _as_plain_value(snapshot)
    if not isinstance(data, dict):
        raise TypeError("snapshot must be a dict or ShadowAgentUsageSnapshotInput")

    payload: dict[str, Any] = {}
    for key, value in data.items():
        if value is None:
            continue
        api_key = _USAGE_SNAPSHOT_FIELD_ALIASES.get(key, key)
        if api_key == "providers" and isinstance(value, list):
            payload[api_key] = [_usage_provider_to_json(provider) for provider in value]
        else:
            payload[api_key] = _compact_json(value)
    return payload


class ShadowClient:
    """Typed HTTP client for the Shadow server REST API."""

    def __init__(self, base_url: str, token: str, *, timeout: float = 60.0) -> None:
        # Strip trailing /api or /api/
        base_url = base_url.rstrip("/")
        if base_url.endswith("/api"):
            base_url = base_url[:-4]
        self._base_url = base_url
        self._token = token
        self._http = httpx.Client(
            base_url=base_url,
            timeout=timeout,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
        )

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> "ShadowClient":
        return self

    def __exit__(self, *args: object) -> None:
        self.close()

    # ── internal helpers ─────────────────────────────────────────────────

    def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        resp = self._http.request(method, path, **kwargs)
        resp.raise_for_status()
        if resp.status_code == 204 or not resp.content:
            return None
        return resp.json()

    def _get(self, path: str, *, params: dict[str, Any] | None = None) -> Any:
        return self._request("GET", path, params=params)

    def _post(self, path: str, json: Any = None) -> Any:
        return self._request("POST", path, json=json)

    def _patch(self, path: str, json: Any = None) -> Any:
        return self._request("PATCH", path, json=json)

    def _put(self, path: str, json: Any = None) -> Any:
        return self._request("PUT", path, json=json)

    def _delete(self, path: str, json: Any = None) -> Any:
        return self._request("DELETE", path, json=json)

    # ── Auth ─────────────────────────────────────────────────────────────

    def register(
        self,
        *,
        email: str,
        password: str,
        username: str | None = None,
        invite_code: str | None = None,
        display_name: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "email": email,
            "password": password,
        }
        if username:
            payload["username"] = username
        if invite_code:
            payload["inviteCode"] = invite_code
        if display_name:
            payload["displayName"] = display_name
        return self._post("/api/auth/register", json=payload)

    def login(self, *, email: str, password: str) -> dict[str, Any]:
        return self._post("/api/auth/login", json={"email": email, "password": password})

    def start_email_login(self, *, email: str, locale: str | None = None) -> dict[str, Any]:
        payload: dict[str, Any] = {"email": email}
        if locale:
            payload["locale"] = locale
        return self._post("/api/auth/email/start", json=payload)

    def verify_email_login(
        self,
        *,
        email: str,
        code: str,
        display_name: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"email": email, "code": code}
        if display_name:
            payload["displayName"] = display_name
        return self._post("/api/auth/email/verify", json=payload)

    def refresh_token(self, refresh_token: str) -> dict[str, Any]:
        return self._post("/api/auth/refresh", json={"refreshToken": refresh_token})

    def get_me(self) -> dict[str, Any]:
        return self._get("/api/auth/me")

    def update_profile(
        self,
        *,
        display_name: str | None = None,
        avatar_url: str | None = None,
    ) -> dict[str, Any]:
        data: dict[str, Any] = {}
        if display_name is not None:
            data["displayName"] = display_name
        if avatar_url is not None:
            data["avatarUrl"] = avatar_url
        return self._patch("/api/auth/me", json=data)

    def disconnect(self) -> dict[str, Any]:
        return self._post("/api/auth/disconnect")

    def get_membership(self) -> dict[str, Any]:
        return self._get("/api/membership/me")

    def redeem_invite_code(self, code: str) -> dict[str, Any]:
        return self._post("/api/membership/redeem-invite", json={"code": code})

    def launch_play(
        self,
        *,
        play_id: str | None = None,
        launch_session_id: str | None = None,
        invite_code: str | None = None,
        locale: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {}
        if play_id:
            payload["playId"] = play_id
        if launch_session_id:
            payload["launchSessionId"] = launch_session_id
        if invite_code:
            payload["inviteCode"] = invite_code
        if locale:
            payload["locale"] = locale
        return self._post("/api/play/launch", json=payload)

    def get_play_catalog(self) -> list[dict[str, Any]]:
        return self._get("/api/play/catalog")["plays"]

    def list_official_model_proxy_models(self) -> dict[str, Any]:
        return self._get("/api/ai/v1/models")

    def get_official_model_proxy_billing(self) -> dict[str, Any]:
        return self._get("/api/ai/v1/billing")

    def create_official_chat_completion(self, **kwargs: Any) -> dict[str, Any]:
        return self._post("/api/ai/v1/chat/completions", json=kwargs)

    def get_user_profile(self, user_id: str) -> dict[str, Any]:
        return self._get(f"/api/auth/users/{user_id}")

    def list_oauth_accounts(self) -> list[dict[str, Any]]:
        return self._get("/api/auth/oauth/accounts")

    def unlink_oauth_account(self, account_id: str) -> dict[str, Any]:
        return self._delete(f"/api/auth/oauth/accounts/{account_id}")

    # ── Agents ───────────────────────────────────────────────────────────

    def list_agents(self, *, include_rentals: bool = False) -> list[dict[str, Any]]:
        path = "/api/agents"
        if include_rentals:
            path = f"{path}?includeRentals=true"
        return self._get(path)

    def create_agent(
        self,
        *,
        name: str,
        username: str,
        description: str | None = None,
        display_name: str | None = None,
        avatar_url: str | None = None,
        kernel_type: str = "openclaw",
        config: dict[str, Any] | None = None,
        buddy_mode: str = "private",
        allowed_server_ids: list[str] | None = None,
    ) -> dict[str, Any]:
        data: dict[str, Any] = {
            "name": name,
            "username": username,
            "kernelType": kernel_type,
            "config": config or {},
            "buddyMode": buddy_mode,
            "allowedServerIds": allowed_server_ids or [],
        }
        if description:
            data["description"] = description
        if display_name:
            data["displayName"] = display_name
        if avatar_url is not None:
            data["avatarUrl"] = avatar_url
        return self._post("/api/agents", json=data)

    def get_agent(self, agent_id: str) -> dict[str, Any]:
        return self._get(f"/api/agents/{agent_id}")

    def update_agent(self, agent_id: str, **kwargs: Any) -> dict[str, Any]:
        return self._patch(f"/api/agents/{agent_id}", json=kwargs)

    def delete_agent(self, agent_id: str) -> dict[str, Any]:
        return self._delete(f"/api/agents/{agent_id}")

    def generate_agent_token(self, agent_id: str) -> dict[str, Any]:
        return self._post(f"/api/agents/{agent_id}/token")

    def start_agent(self, agent_id: str) -> dict[str, Any]:
        return self._post(f"/api/agents/{agent_id}/start")

    def stop_agent(self, agent_id: str) -> dict[str, Any]:
        return self._post(f"/api/agents/{agent_id}/stop")

    def send_heartbeat(self, agent_id: str) -> dict[str, Any]:
        return self._post(f"/api/agents/{agent_id}/heartbeat", json={})

    def report_agent_usage_snapshot(
        self, agent_id: str, snapshot: dict[str, Any] | ShadowAgentUsageSnapshotInput
    ) -> dict[str, Any]:
        return self._post(
            f"/api/agents/{agent_id}/usage-snapshot",
            json=_usage_snapshot_to_json(snapshot),
        )

    def get_agent_config(self, agent_id: str) -> dict[str, Any]:
        return self._get(f"/api/agents/{agent_id}/config")

    def update_agent_slash_commands(
        self, agent_id: str, commands: list[dict[str, Any]]
    ) -> dict[str, Any]:
        return self._put(
            f"/api/agents/{agent_id}/slash-commands", json={"commands": commands}
        )

    def get_agent_slash_commands(self, agent_id: str) -> dict[str, Any]:
        return self._get(f"/api/agents/{agent_id}/slash-commands")

    def list_channel_slash_commands(self, channel_id: str) -> dict[str, Any]:
        return self._get(f"/api/channels/{channel_id}/slash-commands")

    # ── Agent Policies ───────────────────────────────────────────────────

    def list_policies(
        self, agent_id: str, server_id: str | None = None
    ) -> list[dict[str, Any]]:
        policies = self._get(f"/api/agents/{agent_id}/policies")
        if server_id is None:
            return policies
        return [policy for policy in policies if policy.get("serverId") == server_id]

    def upsert_policy(
        self, agent_id: str, server_id: str, **kwargs: Any
    ) -> dict[str, Any]:
        policy: dict[str, Any] = {"serverId": server_id, **kwargs}
        results = self._put(
            f"/api/agents/{agent_id}/policies", json={"policies": [policy]}
        )
        if isinstance(results, list):
            if not results:
                raise ValueError(f"No policy result returned for agent {agent_id}")
            return results[0]
        return results

    def delete_policy(
        self, agent_id: str, server_id: str, channel_id: str
    ) -> dict[str, Any]:
        policies = self.list_policies(agent_id, server_id)
        policy = next(
            (entry for entry in policies if entry.get("channelId") == channel_id),
            None,
        )
        if not policy or not policy.get("id"):
            raise ValueError(
                f"Policy not found for agent {agent_id} in server {server_id} channel {channel_id}"
            )
        return self._delete(f"/api/agents/{agent_id}/policies/{policy['id']}")

    # ── Servers ──────────────────────────────────────────────────────────

    def discover_servers(self) -> list[dict[str, Any]]:
        return self._get("/api/servers/discover")

    def get_server_by_invite(self, invite_code: str) -> dict[str, Any]:
        return self._get(f"/api/servers/invite/{invite_code}")

    def create_server(
        self,
        *,
        name: str,
        slug: str | None = None,
        description: str | None = None,
        is_public: bool | None = None,
    ) -> dict[str, Any]:
        data: dict[str, Any] = {"name": name}
        if slug:
            data["slug"] = slug
        if description:
            data["description"] = description
        if is_public is not None:
            data["isPublic"] = is_public
        return self._post("/api/servers", json=data)

    def list_servers(self) -> list[dict[str, Any]]:
        return self._get("/api/servers")

    def get_server(self, server_id_or_slug: str) -> dict[str, Any]:
        return self._get(f"/api/servers/{server_id_or_slug}")

    def get_server_access(self, server_id_or_slug: str) -> dict[str, Any]:
        return self._get(f"/api/servers/{server_id_or_slug}/access")

    def list_server_apps(self, server_id_or_slug: str) -> list[dict[str, Any]]:
        return self._get(f"/api/servers/{server_id_or_slug}/apps")

    def list_server_app_catalog(self, server_id_or_slug: str) -> list[dict[str, Any]]:
        return self._get(f"/api/servers/{server_id_or_slug}/apps/catalog")

    def discover_server_app(
        self,
        server_id_or_slug: str,
        *,
        manifest_url: str | None = None,
        manifest: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {}
        if manifest_url:
            payload["manifestUrl"] = manifest_url
        if manifest is not None:
            payload["manifest"] = manifest
        return self._post(f"/api/servers/{server_id_or_slug}/apps/discover", json=payload)

    def install_server_app(
        self,
        server_id_or_slug: str,
        *,
        manifest_url: str | None = None,
        manifest: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {}
        if manifest_url:
            payload["manifestUrl"] = manifest_url
        if manifest is not None:
            payload["manifest"] = manifest
        return self._post(f"/api/servers/{server_id_or_slug}/apps", json=payload)

    def install_server_app_from_catalog(
        self,
        server_id_or_slug: str,
        catalog_entry_id: str,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {}
        return self._post(
            f"/api/servers/{server_id_or_slug}/apps/catalog/{catalog_entry_id}/install",
            json=payload,
        )

    def get_server_app(self, server_id_or_slug: str, app_key: str) -> dict[str, Any]:
        return self._get(f"/api/servers/{server_id_or_slug}/apps/{app_key}")

    def delete_server_app(self, server_id_or_slug: str, app_key: str) -> dict[str, Any]:
        return self._delete(f"/api/servers/{server_id_or_slug}/apps/{app_key}")

    def grant_server_app_to_buddy(
        self,
        server_id_or_slug: str,
        app_key: str,
        *,
        buddy_agent_id: str,
        permissions: list[str],
        resource_rules: dict[str, Any] | None = None,
        approval_mode: str = "none",
        expires_at: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "buddyAgentId": buddy_agent_id,
            "permissions": permissions,
            "approvalMode": approval_mode,
        }
        if resource_rules is not None:
            payload["resourceRules"] = resource_rules
        if expires_at:
            payload["expiresAt"] = expires_at
        return self._post(
            f"/api/servers/{server_id_or_slug}/apps/{app_key}/grants",
            json=payload,
        )

    def get_server_app_skills(
        self, server_id_or_slug: str, app_key: str
    ) -> dict[str, Any]:
        return self._get(f"/api/servers/{server_id_or_slug}/apps/{app_key}/skills")

    def create_server_app_launch(
        self, server_id_or_slug: str, app_key: str
    ) -> dict[str, Any]:
        return self._post(f"/api/servers/{server_id_or_slug}/apps/{app_key}/launch")

    def introspect_server_app_token(
        self, server_id_or_slug: str, app_key: str, token: str
    ) -> dict[str, Any]:
        response = self._http.post(
            f"/api/servers/{server_id_or_slug}/apps/{app_key}/oauth/introspect",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json={"token": token},
        )
        response.raise_for_status()
        return response.json()

    def call_server_app_command(
        self,
        server_id_or_slug: str,
        app_key: str,
        command_name: str,
        *,
        input: Any | None = None,
        channel_id: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"input": input if input is not None else {}}
        if channel_id:
            payload["channelId"] = channel_id
        return self._post(
            f"/api/servers/{server_id_or_slug}/apps/{app_key}/commands/{command_name}",
            json=payload,
        )

    def update_server(self, server_id: str, **kwargs: Any) -> dict[str, Any]:
        return self._patch(f"/api/servers/{server_id}", json=kwargs)

    def delete_server(self, server_id: str) -> dict[str, Any]:
        return self._delete(f"/api/servers/{server_id}")

    def join_server(
        self, server_id: str, invite_code: str | None = None
    ) -> dict[str, Any]:
        payload = {"inviteCode": invite_code} if invite_code else {}
        return self._post(f"/api/servers/{server_id}/join", json=payload)

    def request_server_access(self, server_id_or_slug: str) -> dict[str, Any]:
        return self._post(f"/api/servers/{server_id_or_slug}/join-requests")

    def review_server_join_request(
        self, request_id: str, status: str
    ) -> dict[str, Any]:
        return self._patch(
            f"/api/servers/join-requests/{request_id}", json={"status": status}
        )

    def leave_server(self, server_id: str) -> dict[str, Any]:
        return self._post(f"/api/servers/{server_id}/leave")

    def get_members(self, server_id: str) -> list[dict[str, Any]]:
        return self._get(f"/api/servers/{server_id}/members")

    def update_member(
        self, server_id: str, user_id: str, **kwargs: Any
    ) -> dict[str, Any]:
        return self._patch(f"/api/servers/{server_id}/members/{user_id}", json=kwargs)

    def kick_member(self, server_id: str, user_id: str) -> dict[str, Any]:
        return self._delete(f"/api/servers/{server_id}/members/{user_id}")

    def regenerate_invite_code(self, server_id: str) -> dict[str, Any]:
        return self._post(f"/api/servers/{server_id}/invite/regenerate")

    def add_agents_to_server(
        self, server_id: str, agent_ids: list[str]
    ) -> ShadowAddAgentsToServerResult | dict[str, Any]:
        return self._post(
            f"/api/servers/{server_id}/agents", json={"agentIds": agent_ids}
        )

    # ── Channels ─────────────────────────────────────────────────────────

    def get_server_channels(self, server_id: str) -> list[dict[str, Any]]:
        return self._get(f"/api/servers/{server_id}/channels")

    def create_channel(
        self,
        server_id: str,
        *,
        name: str,
        type: str = "text",
        description: str | None = None,
        is_private: bool | None = None,
    ) -> dict[str, Any]:
        data: dict[str, Any] = {"name": name, "type": type}
        if description:
            data["description"] = description
        if is_private is not None:
            data["isPrivate"] = is_private
        return self._post(f"/api/servers/{server_id}/channels", json=data)

    def get_channel(self, channel_id: str) -> dict[str, Any]:
        return self._get(f"/api/channels/{channel_id}")

    def get_channel_bootstrap(
        self,
        channel_id: str,
        *,
        messages_limit: int | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {}
        if messages_limit is not None:
            params["messagesLimit"] = messages_limit
        return self._get(f"/api/channels/{channel_id}/bootstrap", params=params or None)

    def get_channel_access(self, channel_id: str) -> dict[str, Any]:
        return self._get(f"/api/channels/{channel_id}/access")

    def get_channel_members(self, channel_id: str) -> list[dict[str, Any]]:
        return self._get(f"/api/channels/{channel_id}/members")

    def update_channel(self, channel_id: str, **kwargs: Any) -> dict[str, Any]:
        return self._patch(f"/api/channels/{channel_id}", json=kwargs)

    def delete_channel(self, channel_id: str) -> dict[str, Any]:
        return self._delete(f"/api/channels/{channel_id}")

    def reorder_channels(
        self, server_id: str, channel_ids: list[str]
    ) -> dict[str, Any]:
        return self._patch(
            f"/api/servers/{server_id}/channels/positions",
            json={"channelIds": channel_ids},
        )

    def add_channel_member(
        self, channel_id: str, user_id: str
    ) -> dict[str, Any]:
        return self._post(
            f"/api/channels/{channel_id}/members", json={"userId": user_id}
        )

    def request_channel_access(self, channel_id: str) -> dict[str, Any]:
        return self._post(f"/api/channels/{channel_id}/join-requests")

    def review_channel_join_request(
        self, request_id: str, status: str
    ) -> dict[str, Any]:
        return self._patch(
            f"/api/channel-join-requests/{request_id}", json={"status": status}
        )

    def remove_channel_member(
        self, channel_id: str, user_id: str
    ) -> dict[str, Any]:
        return self._delete(f"/api/channels/{channel_id}/members/{user_id}")

    def set_buddy_policy(
        self, channel_id: str, agent_id: str, **kwargs: Any
    ) -> dict[str, Any]:
        return self._put(f"/api/channels/{channel_id}/agents/{agent_id}/policy", json=kwargs)

    def get_buddy_policy(
        self, channel_id: str, agent_id: str
    ) -> dict[str, Any]:
        return self._get(f"/api/channels/{channel_id}/agents/{agent_id}/policy")

    # ── Messages ─────────────────────────────────────────────────────────

    def send_message(
        self,
        channel_id: str,
        content: str,
        *,
        thread_id: str | None = None,
        reply_to_id: str | None = None,
        mentions: list[dict[str, Any]] | None = None,
        metadata: dict[str, Any] | None = None,
        attachments: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        data: dict[str, Any] = {"content": content}
        if thread_id:
            data["threadId"] = thread_id
        if reply_to_id:
            data["replyToId"] = reply_to_id
        if mentions is not None:
            data["mentions"] = mentions
        if metadata is not None:
            data["metadata"] = metadata
        if attachments is not None:
            data["attachments"] = attachments
        return self._post(f"/api/channels/{channel_id}/messages", json=data)

    def suggest_mentions(
        self,
        channel_id: str,
        trigger: str,
        *,
        query: str | None = None,
        limit: int | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"channelId": channel_id, "trigger": trigger}
        if query:
            params["q"] = query
        if limit:
            params["limit"] = limit
        return self._get("/api/mentions/suggest", params=params)

    def resolve_mentions(
        self,
        channel_id: str,
        content: str,
        *,
        mentions: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        data: dict[str, Any] = {"channelId": channel_id, "content": content}
        if mentions is not None:
            data["mentions"] = mentions
        return self._post("/api/mentions/resolve", json=data)

    def get_messages(
        self,
        channel_id: str,
        limit: int = 50,
        cursor: str | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"limit": limit}
        if cursor:
            params["cursor"] = cursor
        return self._get(f"/api/channels/{channel_id}/messages", params=params)

    def get_message(self, message_id: str) -> dict[str, Any]:
        return self._get(f"/api/messages/{message_id}")

    def submit_interactive_action(
        self,
        message_id: str,
        *,
        block_id: str,
        action_id: str,
        value: str | None = None,
        label: str | None = None,
        values: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        data: dict[str, Any] = {"blockId": block_id, "actionId": action_id}
        if value is not None:
            data["value"] = value
        if label is not None:
            data["label"] = label
        if values is not None:
            data["values"] = values
        return self._post(f"/api/messages/{message_id}/interactive", json=data)

    def get_interactive_state(
        self, message_id: str, block_id: str | None = None
    ) -> dict[str, Any]:
        params: dict[str, Any] = {}
        if block_id:
            params["blockId"] = block_id
        return self._get(
            f"/api/messages/{message_id}/interactive-state",
            params=params or None,
        )

    def edit_message(self, message_id: str, content: str) -> dict[str, Any]:
        return self._patch(f"/api/messages/{message_id}", json={"content": content})

    def delete_message(self, message_id: str) -> None:
        self._delete(f"/api/messages/{message_id}")

    # ── Pins ─────────────────────────────────────────────────────────────

    def pin_message(self, message_id: str) -> dict[str, Any]:
        return self._post(f"/api/messages/{message_id}/pin")

    def unpin_message(self, message_id: str) -> dict[str, Any]:
        return self._request("DELETE", f"/api/messages/{message_id}/pin")

    def get_pinned_messages(self, channel_id: str) -> list[dict[str, Any]]:
        return self._get(f"/api/channels/{channel_id}/pins")

    # ── Reactions ────────────────────────────────────────────────────────

    def add_reaction(self, message_id: str, emoji: str) -> None:
        self._post(f"/api/messages/{message_id}/reactions", json={"emoji": emoji})

    def remove_reaction(self, message_id: str, emoji: str) -> None:
        self._delete(f"/api/messages/{message_id}/reactions/{emoji}")

    def get_reactions(self, message_id: str) -> list[dict[str, Any]]:
        return self._get(f"/api/messages/{message_id}/reactions")

    # ── Threads ──────────────────────────────────────────────────────────

    def list_threads(self, channel_id: str) -> list[dict[str, Any]]:
        return self._get(f"/api/channels/{channel_id}/threads")

    def create_thread(
        self, channel_id: str, name: str, parent_message_id: str
    ) -> dict[str, Any]:
        return self._post(
            f"/api/channels/{channel_id}/threads",
            json={"name": name, "parentMessageId": parent_message_id},
        )

    def get_thread(self, thread_id: str) -> dict[str, Any]:
        return self._get(f"/api/threads/{thread_id}")

    def update_thread(self, thread_id: str, **kwargs: Any) -> dict[str, Any]:
        return self._patch(f"/api/threads/{thread_id}", json=kwargs)

    def delete_thread(self, thread_id: str) -> dict[str, Any]:
        return self._delete(f"/api/threads/{thread_id}")

    def get_thread_messages(
        self, thread_id: str, limit: int = 50, cursor: str | None = None
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {"limit": limit}
        if cursor:
            params["cursor"] = cursor
        return self._get(f"/api/threads/{thread_id}/messages", params=params)

    def send_to_thread(
        self,
        thread_id: str,
        content: str,
        reply_to_id: str | None = None,
        metadata: dict[str, Any] | None = None,
        mentions: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"content": content}
        if reply_to_id:
            payload["replyToId"] = reply_to_id
        if mentions is not None:
            payload["mentions"] = mentions
        if metadata is not None:
            payload["metadata"] = metadata
        return self._post(
            f"/api/threads/{thread_id}/messages", json=payload
        )

    # ── Direct channels ─────────────────────────────────────────────────

    def create_direct_channel(self, user_id: str) -> dict[str, Any]:
        return self._post("/api/channels/dm", json={"userId": user_id})

    def list_direct_channels(self) -> list[dict[str, Any]]:
        return self._get("/api/channels/dm")

    # ── Notifications ────────────────────────────────────────────────────

    def list_notifications(
        self, limit: int = 50, offset: int = 0
    ) -> list[dict[str, Any]]:
        return self._get(
            "/api/notifications", params={"limit": limit, "offset": offset}
        )

    def mark_notification_read(self, notification_id: str) -> dict[str, Any]:
        return self._patch(f"/api/notifications/{notification_id}/read")

    def mark_all_notifications_read(self) -> dict[str, Any]:
        return self._post("/api/notifications/read-all")

    def get_unread_count(self) -> dict[str, Any]:
        return self._get("/api/notifications/unread-count")

    def mark_scope_read(
        self,
        *,
        server_id: str | None = None,
        channel_id: str | None = None,
    ) -> dict[str, Any]:
        data: dict[str, Any] = {}
        if server_id:
            data["serverId"] = server_id
        if channel_id:
            data["channelId"] = channel_id
        return self._post("/api/notifications/read-scope", json=data)

    def get_scoped_unread(self) -> dict[str, Any]:
        return self._get("/api/notifications/scoped-unread")

    def get_notification_preferences(self) -> dict[str, Any]:
        return self._get("/api/notifications/preferences")

    def update_notification_preferences(self, **kwargs: Any) -> dict[str, Any]:
        return self._patch("/api/notifications/preferences", json=kwargs)

    def get_notification_channel_preferences(self) -> list[dict[str, Any]]:
        return self._get("/api/notifications/channel-preferences")

    def update_notification_channel_preference(
        self,
        *,
        kind: str,
        channel: str,
        enabled: bool,
    ) -> dict[str, Any]:
        return self._patch(
            "/api/notifications/channel-preferences",
            json={"kind": kind, "channel": channel, "enabled": enabled},
        )

    def register_push_token(
        self,
        *,
        platform: str,
        token: str,
        device_name: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"platform": platform, "token": token}
        if device_name is not None:
            payload["deviceName"] = device_name
        return self._post("/api/notifications/push-tokens", json=payload)

    def register_web_push_subscription(
        self,
        *,
        endpoint: str,
        keys: dict[str, str],
        user_agent: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"endpoint": endpoint, "keys": keys}
        if user_agent is not None:
            payload["userAgent"] = user_agent
        return self._post("/api/notifications/web-push-subscriptions", json=payload)

    # ── Search ───────────────────────────────────────────────────────────

    def search_messages(
        self,
        q: str,
        *,
        server_id: str | None = None,
        channel_id: str | None = None,
        author_id: str | None = None,
        limit: int | None = None,
        offset: int | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"q": q}
        if server_id:
            params["serverId"] = server_id
        if channel_id:
            params["channelId"] = channel_id
        if author_id:
            params["authorId"] = author_id
        if limit is not None:
            params["limit"] = limit
        if offset is not None:
            params["offset"] = offset
        return self._get("/api/search/messages", params=params)

    # ── Invites ──────────────────────────────────────────────────────────

    def list_invites(self) -> list[dict[str, Any]]:
        return self._get("/api/invites")

    def create_invites(
        self, count: int, note: str | None = None
    ) -> list[dict[str, Any]]:
        data: dict[str, Any] = {"count": count}
        if note:
            data["note"] = note
        return self._post("/api/invites", json=data)

    def deactivate_invite(self, invite_id: str) -> dict[str, Any]:
        return self._patch(f"/api/invites/{invite_id}/deactivate")

    def delete_invite(self, invite_id: str) -> dict[str, Any]:
        return self._delete(f"/api/invites/{invite_id}")

    # ── Media ────────────────────────────────────────────────────────────

    def upload_media(
        self,
        file_bytes: bytes,
        filename: str,
        content_type: str,
        message_id: str | None = None,
    ) -> dict[str, Any]:
        files = {"file": (filename, file_bytes, content_type)}
        data = {}
        if message_id:
            data["messageId"] = message_id
        resp = self._http.post(
            "/api/media/upload",
            files=files,
            data=data,
            headers={"Content-Type": None},  # let httpx set multipart
        )
        resp.raise_for_status()
        return resp.json()

    def resolve_attachment_media_url(
        self,
        attachment_id: str,
        *,
        disposition: str = "inline",
        variant: str | None = None,
    ) -> dict[str, Any]:
        path = f"/api/attachments/{attachment_id}/media-url"
        params: dict[str, Any] = {"disposition": disposition}
        if variant:
            params["variant"] = variant
        return self._get(path, params=params)

    def resolve_workspace_media_url(
        self,
        server_id: str,
        file_id: str,
        *,
        disposition: str = "inline",
        content_ref: str | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"disposition": disposition}
        if content_ref:
            params["contentRef"] = content_ref
        path = f"/api/servers/{server_id}/workspace/files/{file_id}/media-url"
        return self._get(path, params=params)

    # ── Friendships ──────────────────────────────────────────────────────

    def send_friend_request(self, username: str) -> dict[str, Any]:
        return self._post("/api/friends/request", json={"username": username})

    def accept_friend_request(self, request_id: str) -> dict[str, Any]:
        return self._post(f"/api/friends/{request_id}/accept")

    def reject_friend_request(self, request_id: str) -> dict[str, Any]:
        return self._post(f"/api/friends/{request_id}/reject")

    def remove_friend(self, friendship_id: str) -> dict[str, Any]:
        return self._delete(f"/api/friends/{friendship_id}")

    def list_friends(self) -> list[dict[str, Any]]:
        return self._get("/api/friends")

    def list_pending_friend_requests(self) -> list[dict[str, Any]]:
        return self._get("/api/friends/pending")

    def list_sent_friend_requests(self) -> list[dict[str, Any]]:
        return self._get("/api/friends/sent")

    # ── OAuth Apps ───────────────────────────────────────────────────────

    def create_oauth_app(
        self,
        *,
        name: str,
        redirect_uris: list[str],
        scopes: list[str] | None = None,
    ) -> dict[str, Any]:
        data: dict[str, Any] = {"name": name, "redirectUris": redirect_uris}
        if scopes:
            data["scopes"] = scopes
        return self._post("/api/oauth/apps", json=data)

    def list_oauth_apps(self) -> list[dict[str, Any]]:
        return self._get("/api/oauth/apps")

    def update_oauth_app(self, app_id: str, **kwargs: Any) -> dict[str, Any]:
        return self._patch(f"/api/oauth/apps/{app_id}", json=kwargs)

    def delete_oauth_app(self, app_id: str) -> dict[str, Any]:
        return self._delete(f"/api/oauth/apps/{app_id}")

    def reset_oauth_app_secret(self, app_id: str) -> dict[str, Any]:
        return self._post(f"/api/oauth/apps/{app_id}/reset-secret")

    def exchange_oauth_token(self, **kwargs: Any) -> dict[str, Any]:
        return self._post("/api/oauth/token", json=kwargs)

    def list_oauth_consents(self) -> list[dict[str, Any]]:
        return self._get("/api/oauth/consents")

    def revoke_oauth_consent(self, app_id: str) -> dict[str, Any]:
        return self._post("/api/oauth/revoke", json={"appId": app_id})

    def send_oauth_channel_message(
        self,
        channel_id: str,
        content: str,
        *,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        data: dict[str, Any] = {"content": content}
        if metadata is not None:
            data["metadata"] = metadata
        return self._post(f"/api/oauth/channels/{channel_id}/messages", json=data)

    def send_oauth_buddy_message(
        self,
        buddy_id: str,
        *,
        channel_id: str,
        content: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        data: dict[str, Any] = {"channelId": channel_id, "content": content}
        if metadata is not None:
            data["metadata"] = metadata
        return self._post(f"/api/oauth/buddies/{buddy_id}/messages", json=data)

    # ── Marketplace / Rentals ────────────────────────────────────────────

    def browse_listings(self, **kwargs: Any) -> dict[str, Any]:
        return self._get("/api/marketplace/listings", params=kwargs or None)

    def get_listing(self, listing_id: str) -> dict[str, Any]:
        return self._get(f"/api/marketplace/listings/{listing_id}")

    def estimate_rental_cost(
        self, listing_id: str, hours: int
    ) -> dict[str, Any]:
        return self._get(
            f"/api/marketplace/listings/{listing_id}/estimate",
            params={"hours": hours},
        )

    def list_my_listings(self) -> list[dict[str, Any]]:
        return self._get("/api/marketplace/my-listings")

    def create_listing(self, **kwargs: Any) -> dict[str, Any]:
        return self._post("/api/marketplace/listings", json=kwargs)

    def update_listing(self, listing_id: str, **kwargs: Any) -> dict[str, Any]:
        return self._put(f"/api/marketplace/listings/{listing_id}", json=kwargs)

    def toggle_listing(self, listing_id: str) -> dict[str, Any]:
        return self._put(f"/api/marketplace/listings/{listing_id}/toggle")

    def delete_listing(self, listing_id: str) -> dict[str, Any]:
        return self._delete(f"/api/marketplace/listings/{listing_id}")

    def sign_contract(self, listing_id: str, hours: int) -> dict[str, Any]:
        return self._post(
            "/api/marketplace/contracts",
            json={"listingId": listing_id, "hours": hours},
        )

    def list_contracts(self, **kwargs: Any) -> list[dict[str, Any]]:
        return self._get("/api/marketplace/contracts", params=kwargs or None)

    def get_contract(self, contract_id: str) -> dict[str, Any]:
        return self._get(f"/api/marketplace/contracts/{contract_id}")

    def terminate_contract(self, contract_id: str) -> dict[str, Any]:
        return self._post(f"/api/marketplace/contracts/{contract_id}/terminate")

    def record_usage_session(
        self, contract_id: str, **kwargs: Any
    ) -> dict[str, Any]:
        return self._post(
            f"/api/marketplace/contracts/{contract_id}/usage", json=kwargs
        )

    def report_violation(
        self, contract_id: str, reason: str
    ) -> dict[str, Any]:
        return self._post(
            f"/api/marketplace/contracts/{contract_id}/violate",
            json={"reason": reason},
        )

    # ── Shop ─────────────────────────────────────────────────────────────

    def get_shop(self, server_id: str) -> dict[str, Any]:
        return self._get(f"/api/servers/{server_id}/shop")

    def get_my_shop(self) -> dict[str, Any]:
        return self._get("/api/me/shop")

    def upsert_my_shop(self, **kwargs: Any) -> dict[str, Any]:
        return self._post("/api/me/shop", json=kwargs)

    def get_user_shop(self, user_id: str) -> dict[str, Any]:
        return self._get(f"/api/users/{user_id}/shop")

    def get_managed_user_shop(self, user_id: str) -> dict[str, Any]:
        return self._get(f"/api/users/{user_id}/shop/manage")

    def upsert_managed_user_shop(self, user_id: str, **kwargs: Any) -> dict[str, Any]:
        return self._post(f"/api/users/{user_id}/shop/manage", json=kwargs)

    def get_shop_by_id(self, shop_id: str) -> dict[str, Any]:
        return self._get(f"/api/shops/{shop_id}")

    def list_shop_products(self, shop_id: str, **kwargs: Any) -> dict[str, Any]:
        return self._get(f"/api/shops/{shop_id}/products", params=kwargs or None)

    def create_shop_product(self, shop_id: str, **kwargs: Any) -> dict[str, Any]:
        return self._post(f"/api/shops/{shop_id}/products", json=kwargs)

    def get_scope_neutral_product(self, product_id: str) -> dict[str, Any]:
        return self._get(f"/api/products/{product_id}")

    def get_shop_product(self, shop_id: str, product_id: str) -> dict[str, Any]:
        return self._get(f"/api/shops/{shop_id}/products/{product_id}")

    def update_shop_product(
        self, shop_id: str, product_id: str, **kwargs: Any
    ) -> dict[str, Any]:
        return self._put(f"/api/shops/{shop_id}/products/{product_id}", json=kwargs)

    def delete_shop_product(self, shop_id: str, product_id: str) -> dict[str, Any]:
        return self._delete(f"/api/shops/{shop_id}/products/{product_id}")

    def purchase_shop_product(
        self,
        shop_id: str,
        product_id: str,
        *,
        idempotency_key: str,
        sku_id: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"idempotencyKey": idempotency_key}
        if sku_id is not None:
            payload["skuId"] = sku_id
        return self._post(f"/api/shops/{shop_id}/products/{product_id}/purchase", json=payload)

    def purchase_commerce_offer(
        self,
        offer_id: str,
        *,
        idempotency_key: str,
        sku_id: str | None = None,
        destination_kind: str | None = None,
        destination_id: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"idempotencyKey": idempotency_key}
        if sku_id is not None:
            payload["skuId"] = sku_id
        if destination_kind is not None:
            payload["destinationKind"] = destination_kind
        if destination_id is not None:
            payload["destinationId"] = destination_id
        return self._post(f"/api/commerce/offers/{offer_id}/purchase", json=payload)

    def get_commerce_offer_checkout_preview(
        self,
        offer_id: str,
        *,
        sku_id: str | None = None,
        viewer_user_id: str | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {}
        if sku_id is not None:
            params["skuId"] = sku_id
        if viewer_user_id is not None:
            params["viewerUserId"] = viewer_user_id
        return self._get(
            f"/api/commerce/offers/{offer_id}/checkout-preview",
            params=params or None,
        )

    def create_commerce_offer(self, shop_id: str, **kwargs: Any) -> dict[str, Any]:
        return self._post(f"/api/shops/{shop_id}/offers", json=kwargs)

    def list_commerce_offers(self, shop_id: str, **kwargs: Any) -> dict[str, Any]:
        return self._get(f"/api/shops/{shop_id}/offers", params=kwargs or None)

    def create_commerce_deliverable(
        self, shop_id: str, offer_id: str, **kwargs: Any
    ) -> dict[str, Any]:
        return self._post(
            f"/api/shops/{shop_id}/offers/{offer_id}/deliverables", json=kwargs
        )

    def list_shop_asset_definitions(self, shop_id: str) -> dict[str, Any]:
        return self._get(f"/api/shops/{shop_id}/assets")

    def create_shop_asset_definition(self, shop_id: str, **kwargs: Any) -> dict[str, Any]:
        return self._post(f"/api/shops/{shop_id}/assets", json=kwargs)

    def update_shop_asset_definition(
        self, shop_id: str, asset_definition_id: str, **kwargs: Any
    ) -> dict[str, Any]:
        return self._patch(
            f"/api/shops/{shop_id}/assets/{asset_definition_id}", json=kwargs
        )

    def purchase_message_commerce_card(
        self,
        message_id: str,
        card_id: str,
        *,
        idempotency_key: str,
        sku_id: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"idempotencyKey": idempotency_key}
        if sku_id is not None:
            payload["skuId"] = sku_id
        return self._post(f"/api/messages/{message_id}/commerce-cards/{card_id}/purchase", json=payload)

    def list_commerce_product_cards(
        self,
        *,
        channel_id: str,
        target: str = "channel",
        keyword: str | None = None,
        limit: int | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"target": target}
        params["channelId"] = channel_id
        if keyword:
            params["keyword"] = keyword
        if limit is not None:
            params["limit"] = limit
        return self._get("/api/commerce/product-picker", params=params)

    def open_paid_file(self, file_id: str) -> dict[str, Any]:
        return self._post(f"/api/paid-files/{file_id}/open")

    def list_shop_entitlements(self, shop_id: str, **kwargs: Any) -> list[dict[str, Any]]:
        return self._get(f"/api/shops/{shop_id}/entitlements", params=kwargs or None)

    def update_shop(self, server_id: str, **kwargs: Any) -> dict[str, Any]:
        return self._put(f"/api/servers/{server_id}/shop", json=kwargs)

    def list_categories(self, server_id: str) -> list[dict[str, Any]]:
        return self._get(f"/api/servers/{server_id}/shop/categories")

    def create_category(
        self, server_id: str, **kwargs: Any
    ) -> dict[str, Any]:
        return self._post(
            f"/api/servers/{server_id}/shop/categories", json=kwargs
        )

    def update_category(
        self, server_id: str, category_id: str, **kwargs: Any
    ) -> dict[str, Any]:
        return self._put(
            f"/api/servers/{server_id}/shop/categories/{category_id}", json=kwargs
        )

    def delete_category(
        self, server_id: str, category_id: str
    ) -> dict[str, Any]:
        return self._delete(
            f"/api/servers/{server_id}/shop/categories/{category_id}"
        )

    def list_products(
        self, server_id: str, **kwargs: Any
    ) -> dict[str, Any]:
        return self._get(
            f"/api/servers/{server_id}/shop/products", params=kwargs or None
        )

    def get_product(self, server_id: str, product_id: str) -> dict[str, Any]:
        return self._get(f"/api/servers/{server_id}/shop/products/{product_id}")

    def create_product(self, server_id: str, **kwargs: Any) -> dict[str, Any]:
        return self._post(f"/api/servers/{server_id}/shop/products", json=kwargs)

    def update_product(
        self, server_id: str, product_id: str, **kwargs: Any
    ) -> dict[str, Any]:
        return self._put(
            f"/api/servers/{server_id}/shop/products/{product_id}", json=kwargs
        )

    def delete_product(
        self, server_id: str, product_id: str
    ) -> dict[str, Any]:
        return self._delete(f"/api/servers/{server_id}/shop/products/{product_id}")

    def get_cart(self, server_id: str) -> list[dict[str, Any]]:
        return self._get(f"/api/servers/{server_id}/shop/cart")

    def add_to_cart(
        self, server_id: str, product_id: str, quantity: int
    ) -> dict[str, Any]:
        return self._post(
            f"/api/servers/{server_id}/shop/cart",
            json={"productId": product_id, "quantity": quantity},
        )

    def update_cart_item(
        self, server_id: str, item_id: str, quantity: int
    ) -> dict[str, Any]:
        return self._put(
            f"/api/servers/{server_id}/shop/cart/{item_id}",
            json={"quantity": quantity},
        )

    def remove_cart_item(
        self, server_id: str, item_id: str
    ) -> dict[str, Any]:
        return self._delete(f"/api/servers/{server_id}/shop/cart/{item_id}")

    def create_order(
        self,
        server_id: str,
        *,
        idempotency_key: str,
        items: list[dict[str, Any]] | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        payload = {"idempotencyKey": idempotency_key, **kwargs}
        if items is not None:
            payload["items"] = items
        return self._post(f"/api/servers/{server_id}/shop/orders", json=payload)

    def list_orders(self, server_id: str) -> list[dict[str, Any]]:
        return self._get(f"/api/servers/{server_id}/shop/orders")

    def list_shop_orders(self, server_id: str) -> list[dict[str, Any]]:
        return self._get(f"/api/servers/{server_id}/shop/orders/manage")

    def get_order(self, server_id: str, order_id: str) -> dict[str, Any]:
        return self._get(f"/api/servers/{server_id}/shop/orders/{order_id}")

    def update_order_status(
        self, server_id: str, order_id: str, status: str
    ) -> dict[str, Any]:
        return self._put(
            f"/api/servers/{server_id}/shop/orders/{order_id}/status",
            json={"status": status},
        )

    def cancel_order(self, server_id: str, order_id: str) -> dict[str, Any]:
        return self._post(f"/api/servers/{server_id}/shop/orders/{order_id}/cancel")

    def get_product_reviews(
        self, server_id: str, product_id: str
    ) -> list[dict[str, Any]]:
        return self._get(
            f"/api/servers/{server_id}/shop/products/{product_id}/reviews"
        )

    def create_review(
        self, server_id: str, order_id: str, **kwargs: Any
    ) -> dict[str, Any]:
        return self._post(
            f"/api/servers/{server_id}/shop/orders/{order_id}/review", json=kwargs
        )

    def reply_to_review(
        self, server_id: str, review_id: str, reply: str
    ) -> dict[str, Any]:
        return self._put(
            f"/api/servers/{server_id}/shop/reviews/{review_id}/reply",
            json={"reply": reply},
        )

    def get_wallet(self) -> dict[str, Any]:
        return self._get("/api/wallet")

    def top_up_wallet(self, amount: float) -> dict[str, Any]:
        raise RuntimeError(
            "Public wallet top-up is disabled. Use a verified payment flow, "
            "refund, settlement, or admin grant."
        )

    def get_wallet_transactions(
        self,
        *,
        audience: str | None = None,
        direction: str | None = None,
        limit: int | None = None,
        offset: int | None = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {}
        if audience:
            params["audience"] = audience
        if direction:
            params["direction"] = direction
        if limit is not None:
            params["limit"] = limit
        if offset is not None:
            params["offset"] = offset
        return self._get("/api/wallet/transactions", params=params or None)

    # ── Community Economy ──────────────────────────────────────────────

    def list_community_assets(self) -> dict[str, Any]:
        return self._get("/api/economy/assets")

    def get_community_asset(self, grant_id: str) -> dict[str, Any]:
        return self._get(f"/api/economy/assets/{grant_id}")

    def consume_community_asset(self, grant_id: str, *, idempotency_key: str) -> dict[str, Any]:
        return self._post(
            f"/api/economy/assets/{grant_id}/consume",
            json={"idempotencyKey": idempotency_key},
        )

    def lock_community_asset(self, grant_id: str, *, idempotency_key: str) -> dict[str, Any]:
        return self._post(
            f"/api/economy/assets/{grant_id}/lock",
            json={"idempotencyKey": idempotency_key},
        )

    def unlock_community_asset(self, grant_id: str, *, idempotency_key: str) -> dict[str, Any]:
        return self._post(
            f"/api/economy/assets/{grant_id}/unlock",
            json={"idempotencyKey": idempotency_key},
        )

    def revoke_community_asset(
        self, grant_id: str, *, idempotency_key: str, reason: str | None = None
    ) -> dict[str, Any]:
        payload = {"idempotencyKey": idempotency_key}
        if reason is not None:
            payload["reason"] = reason
        return self._post(f"/api/economy/assets/{grant_id}/revoke", json=payload)

    def send_tip(
        self,
        *,
        recipient_user_id: str,
        amount: int,
        idempotency_key: str,
        message: str | None = None,
        context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "recipientUserId": recipient_user_id,
            "amount": amount,
            "idempotencyKey": idempotency_key,
        }
        if message is not None:
            payload["message"] = message
        if context is not None:
            payload["context"] = context
        return self._post("/api/economy/tips", json=payload)

    def list_tips(self) -> dict[str, Any]:
        return self._get("/api/economy/tips")

    def send_gift(
        self,
        *,
        recipient_user_id: str,
        idempotency_key: str,
        assets: list[dict[str, Any]] | None = None,
        currencies: list[dict[str, Any]] | None = None,
        message: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "recipientUserId": recipient_user_id,
            "idempotencyKey": idempotency_key,
        }
        if assets is not None:
            payload["assets"] = assets
        if currencies is not None:
            payload["currencies"] = currencies
        if message is not None:
            payload["message"] = message
        return self._post("/api/economy/gifts", json=payload)

    def list_gifts(self) -> dict[str, Any]:
        return self._get("/api/economy/gifts")

    def list_settlements(
        self, *, limit: int | None = None, offset: int | None = None
    ) -> dict[str, Any]:
        params: dict[str, Any] = {}
        if limit is not None:
            params["limit"] = limit
        if offset is not None:
            params["offset"] = offset
        return self._get("/api/economy/settlements", params=params or None)

    def settle_available_settlements(self) -> dict[str, Any]:
        return self._post("/api/economy/settlements/settle")

    # ── Cloud SaaS DIY Generation ──────────────────────────────────────

    def create_diy_cloud_run(
        self,
        *,
        prompt: str,
        feedback: str | None = None,
        previous_config: dict[str, Any] | None = None,
        locale: str | None = None,
        timezone: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"prompt": prompt}
        if feedback is not None:
            payload["feedback"] = feedback
        if previous_config is not None:
            payload["previousConfig"] = previous_config
        if locale is not None:
            payload["locale"] = locale
        if timezone is not None:
            payload["timezone"] = timezone
        return self._post("/api/cloud-saas/diy/runs", json=payload)

    def _stream_sse(
        self, method: str, path: str, **kwargs: Any
    ) -> Iterator[dict[str, Any]]:
        headers = {"Accept": "text/event-stream", **kwargs.pop("headers", {})}
        with self._http.stream(method, path, headers=headers, **kwargs) as resp:
            resp.raise_for_status()
            event = "message"
            data_lines: list[str] = []
            for line in resp.iter_lines():
                if line == "":
                    if data_lines:
                        data = "\n".join(data_lines)
                        yield {"event": event, "data": json.loads(data)}
                    event = "message"
                    data_lines = []
                    continue
                if line.startswith("event:"):
                    event = line[6:].strip()
                elif line.startswith("data:"):
                    data_lines.append(line[5:].lstrip())
            if data_lines:
                yield {"event": event, "data": json.loads("\n".join(data_lines))}

    def get_diy_cloud_run(self, run_id: str) -> dict[str, Any]:
        return self._get(f"/api/cloud-saas/diy/runs/{run_id}")

    def create_diy_cloud_feedback_run(
        self,
        run_id: str,
        feedback: str,
        *,
        prompt: str | None = None,
        locale: str | None = None,
        timezone: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"feedback": feedback}
        if prompt is not None:
            payload["prompt"] = prompt
        if locale is not None:
            payload["locale"] = locale
        if timezone is not None:
            payload["timezone"] = timezone
        return self._post(f"/api/cloud-saas/diy/runs/{run_id}/feedback", json=payload)

    def stream_diy_cloud_run(
        self, run_id: str, after_seq: int | None = None
    ) -> Iterator[dict[str, Any]]:
        params = {"afterSeq": after_seq} if after_seq is not None else None
        yield from self._stream_sse(
            "GET", f"/api/cloud-saas/diy/runs/{run_id}/stream", params=params
        )

    def cancel_diy_cloud_run(self, run_id: str) -> dict[str, Any]:
        return self._post(f"/api/cloud-saas/diy/runs/{run_id}/cancel")

    # ── Cloud SaaS Deployment Runtime ─────────────────────────────────

    def get_cloud_deployment_manifest(self, deployment_id: str) -> dict[str, Any]:
        return self._get(f"/api/cloud-saas/deployments/{deployment_id}/manifest")

    def sync_cloud_deployment_template(
        self,
        deployment_id: str,
        *,
        name: str | None = None,
        description: str | None = None,
        content: dict[str, Any] | None = None,
        tags: list[str] | None = None,
        category: str | None = None,
        base_cost: int | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {}
        if name is not None:
            payload["name"] = name
        if description is not None:
            payload["description"] = description
        if content is not None:
            payload["content"] = content
        if tags is not None:
            payload["tags"] = tags
        if category is not None:
            payload["category"] = category
        if base_cost is not None:
            payload["baseCost"] = base_cost
        return self._post(
            f"/api/cloud-saas/deployments/{deployment_id}/template", json=payload
        )

    def redeploy_cloud_deployment(
        self,
        deployment_id: str,
        *,
        mode: str | None = None,
        template_slug: str | None = None,
        config_snapshot: dict[str, Any] | None = None,
        env_vars: dict[str, str] | None = None,
        runtime_context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {}
        if mode is not None:
            payload["mode"] = mode
        if template_slug is not None:
            payload["templateSlug"] = template_slug
        if config_snapshot is not None:
            payload["configSnapshot"] = config_snapshot
        if env_vars is not None:
            payload["envVars"] = env_vars
        if runtime_context is not None:
            payload["runtimeContext"] = runtime_context
        return self._post(
            f"/api/cloud-saas/deployments/{deployment_id}/redeploy", json=payload
        )

    def pause_cloud_deployment(
        self, deployment_id: str, *, agent_id: str | None = None
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {}
        if agent_id is not None:
            payload["agentId"] = agent_id
        return self._post(
            f"/api/cloud-saas/deployments/{deployment_id}/pause", json=payload
        )

    def resume_cloud_deployment(
        self, deployment_id: str, *, agent_id: str | None = None
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {}
        if agent_id is not None:
            payload["agentId"] = agent_id
        return self._post(
            f"/api/cloud-saas/deployments/{deployment_id}/resume", json=payload
        )

    def list_cloud_deployment_backups(
        self, deployment_id: str, *, agent_id: str | None = None
    ) -> dict[str, Any]:
        params = {"agentId": agent_id} if agent_id is not None else None
        return self._get(
            f"/api/cloud-saas/deployments/{deployment_id}/backups", params=params
        )

    def create_cloud_deployment_backup(
        self,
        deployment_id: str,
        *,
        agent_id: str | None = None,
        driver: str | None = None,
        retention_days: int | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {}
        if agent_id is not None:
            payload["agentId"] = agent_id
        if driver is not None:
            payload["driver"] = driver
        if retention_days is not None:
            payload["retentionDays"] = retention_days
        return self._post(
            f"/api/cloud-saas/deployments/{deployment_id}/backups", json=payload
        )

    def restore_cloud_deployment_backup(
        self,
        deployment_id: str,
        *,
        agent_id: str | None = None,
        backup_id: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {}
        if agent_id is not None:
            payload["agentId"] = agent_id
        if backup_id is not None:
            payload["backupId"] = backup_id
        return self._post(
            f"/api/cloud-saas/deployments/{deployment_id}/restore", json=payload
        )

    # ── Cloud SaaS Provider Gateway ────────────────────────────────────

    def list_cloud_provider_catalogs(self) -> dict[str, Any]:
        return self._get("/api/cloud-saas/provider-catalogs")

    def list_cloud_provider_profiles(self) -> dict[str, Any]:
        return self._get("/api/cloud-saas/provider-profiles")

    def upsert_cloud_provider_profile(self, **kwargs: Any) -> dict[str, Any]:
        return self._put("/api/cloud-saas/provider-profiles", json=kwargs)

    def test_cloud_provider_profile(self, profile_id: str) -> dict[str, Any]:
        return self._post(f"/api/cloud-saas/provider-profiles/{profile_id}/test")

    def refresh_cloud_provider_profile_models(self, profile_id: str) -> dict[str, Any]:
        return self._post(
            f"/api/cloud-saas/provider-profiles/{profile_id}/models/refresh"
        )

    def delete_cloud_provider_profile(self, profile_id: str) -> dict[str, Any]:
        return self._delete(f"/api/cloud-saas/provider-profiles/{profile_id}")

    def get_entitlements(self, server_id: str) -> list[ShadowEntitlement | dict[str, Any]]:
        return self._get(f"/api/servers/{server_id}/shop/entitlements")

    def get_all_entitlements(self) -> list[ShadowEntitlement | dict[str, Any]]:
        return self._get("/api/entitlements")

    def verify_entitlement(self, entitlement_id: str) -> dict[str, Any]:
        return self._get(f"/api/entitlements/{entitlement_id}/verify")

    def cancel_entitlement(
        self,
        entitlement_id: str,
        *,
        reason: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {}
        if reason is not None:
            payload["reason"] = reason
        return self._post(f"/api/entitlements/{entitlement_id}/cancel", json=payload)

    # ── Task Center ──────────────────────────────────────────────────────

    def get_task_center(self) -> dict[str, Any]:
        return self._get("/api/tasks")

    def claim_task(self, task_key: str) -> dict[str, Any]:
        return self._post(f"/api/tasks/{task_key}/claim")

    def get_referral_summary(self) -> dict[str, Any]:
        return self._get("/api/tasks/referral-summary")

    def get_reward_history(self) -> dict[str, Any]:
        return self._get("/api/tasks/rewards")

    # ── Workspace ────────────────────────────────────────────────────────

    def get_workspace(self, server_id: str) -> dict[str, Any]:
        return self._get(f"/api/servers/{server_id}/workspace")

    def update_workspace(self, server_id: str, **kwargs: Any) -> dict[str, Any]:
        return self._patch(f"/api/servers/{server_id}/workspace", json=kwargs)

    def get_workspace_tree(self, server_id: str) -> dict[str, Any]:
        return self._get(f"/api/servers/{server_id}/workspace/tree")

    def get_workspace_stats(self, server_id: str) -> dict[str, Any]:
        return self._get(f"/api/servers/{server_id}/workspace/stats")

    def get_workspace_children(
        self, server_id: str, parent_id: str | None = None
    ) -> list[dict[str, Any]]:
        params = {}
        if parent_id:
            params["parentId"] = parent_id
        return self._get(
            f"/api/servers/{server_id}/workspace/children", params=params or None
        )

    def create_workspace_folder(
        self, server_id: str, **kwargs: Any
    ) -> dict[str, Any]:
        return self._post(f"/api/servers/{server_id}/workspace/folders", json=kwargs)

    def update_workspace_folder(
        self, server_id: str, folder_id: str, **kwargs: Any
    ) -> dict[str, Any]:
        return self._patch(
            f"/api/servers/{server_id}/workspace/folders/{folder_id}", json=kwargs
        )

    def delete_workspace_folder(
        self, server_id: str, folder_id: str
    ) -> dict[str, Any]:
        return self._delete(f"/api/servers/{server_id}/workspace/folders/{folder_id}")

    def create_workspace_file(
        self, server_id: str, **kwargs: Any
    ) -> dict[str, Any]:
        return self._post(f"/api/servers/{server_id}/workspace/files", json=kwargs)

    def get_workspace_file(
        self, server_id: str, file_id: str
    ) -> dict[str, Any]:
        return self._get(f"/api/servers/{server_id}/workspace/files/{file_id}")

    def update_workspace_file(
        self, server_id: str, file_id: str, **kwargs: Any
    ) -> dict[str, Any]:
        return self._patch(
            f"/api/servers/{server_id}/workspace/files/{file_id}", json=kwargs
        )

    def delete_workspace_file(
        self, server_id: str, file_id: str
    ) -> dict[str, Any]:
        return self._delete(f"/api/servers/{server_id}/workspace/files/{file_id}")

    # ── API Tokens ───────────────────────────────────────────────────────

    def create_api_token(
        self, name: str, scope: str | None = None, expires_in_days: int | None = None
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"name": name}
        if scope:
            body["scope"] = scope
        if expires_in_days:
            body["expiresInDays"] = expires_in_days
        return self._post("/api/tokens", json=body)

    def list_api_tokens(self) -> list[dict[str, Any]]:
        return self._get("/api/tokens")

    def delete_api_token(self, token_id: str) -> dict[str, Any]:
        return self._delete(f"/api/tokens/{token_id}")

    # ── Discover ─────────────────────────────────────────────────────────

    def discover_feed(
        self,
        type: str | None = None,
        limit: int | None = None,
        offset: int | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {}
        if type:
            params["type"] = type
        if limit:
            params["limit"] = limit
        if offset:
            params["offset"] = offset
        return self._get("/api/discover/feed", params=params or None)

    def discover_search(
        self,
        q: str,
        type: str | None = None,
        limit: int | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"q": q}
        if type:
            params["type"] = type
        if limit:
            params["limit"] = limit
        return self._get("/api/discover/search", params=params)

    # ── Voice Enhance ────────────────────────────────────────────────────

    def enhance_voice(
        self,
        transcript: str,
        language: str | None = None,
        options: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"transcript": transcript}
        if language:
            body["language"] = language
        if options:
            body["options"] = options
        return self._post("/api/voice/enhance", json=body)

    def get_voice_config(self) -> dict[str, Any]:
        return self._get("/api/voice/config")

    def update_voice_config(self, **kwargs: Any) -> dict[str, Any]:
        return self._post("/api/voice/config", json=kwargs)

    def voice_health_check(self) -> dict[str, Any]:
        return self._get("/api/voice/health")

    # ── Profile Comments ─────────────────────────────────────────────────

    def get_profile_comments(
        self, profile_user_id: str, limit: int | None = None, offset: int | None = None
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {}
        if limit:
            params["limit"] = limit
        if offset:
            params["offset"] = offset
        return self._get(
            f"/api/profile-comments/{profile_user_id}", params=params or None
        )

    def get_profile_comment_stats(self, profile_user_id: str) -> dict[str, Any]:
        return self._get(f"/api/profile-comments/{profile_user_id}/stats")

    def get_comment_replies(
        self, parent_id: str, limit: int | None = None, offset: int | None = None
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {}
        if limit:
            params["limit"] = limit
        if offset:
            params["offset"] = offset
        return self._get(
            f"/api/profile-comments/replies/{parent_id}", params=params or None
        )

    def create_profile_comment(
        self,
        profile_user_id: str,
        content: str,
        parent_id: str | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"profileUserId": profile_user_id, "content": content}
        if parent_id:
            body["parentId"] = parent_id
        return self._post("/api/profile-comments", json=body)

    def delete_profile_comment(self, comment_id: str) -> dict[str, Any]:
        return self._delete(f"/api/profile-comments/{comment_id}")

    def add_profile_comment_reaction(
        self, comment_id: str, emoji: str
    ) -> dict[str, Any]:
        return self._post(
            f"/api/profile-comments/{comment_id}/reactions", json={"emoji": emoji}
        )

    def remove_profile_comment_reaction(
        self, comment_id: str, emoji: str
    ) -> dict[str, Any]:
        return self._delete(
            f"/api/profile-comments/{comment_id}/reactions", json={"emoji": emoji}
        )

    # ── Agent Dashboard ──────────────────────────────────────────────────

    def get_agent_dashboard(self, agent_id: str) -> dict[str, Any]:
        return self._get(f"/api/agents/{agent_id}/dashboard")

    def add_agent_dashboard_event(
        self,
        agent_id: str,
        event_type: str,
        event_data: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"eventType": event_type}
        if event_data:
            body["eventData"] = event_data
        return self._post(f"/api/agents/{agent_id}/dashboard/events", json=body)

    # ── Channel Archive ──────────────────────────────────────────────────

    def archive_channel(
        self, channel_id: str, reason: str | None = None
    ) -> dict[str, Any]:
        body = {"reason": reason} if reason else {}
        return self._post(f"/api/channels/{channel_id}/archive", json=body)

    def unarchive_channel(self, channel_id: str) -> dict[str, Any]:
        return self._post(f"/api/channels/{channel_id}/unarchive")

    def get_archived_channels(self, server_id: str) -> list[dict[str, Any]]:
        return self._get(f"/api/servers/{server_id}/channels/archived")

    # ── Auth (extended) ──────────────────────────────────────────────────

    def change_password(
        self, current_password: str, new_password: str
    ) -> dict[str, Any]:
        return self._put(
            "/api/auth/password",
            json={"currentPassword": current_password, "newPassword": new_password},
        )

    def get_dashboard(self) -> dict[str, Any]:
        return self._get("/api/auth/dashboard")

    def login_with_google_id_token(self, id_token: str) -> dict[str, Any]:
        return self._post("/api/auth/google/id-token", json={"idToken": id_token})
