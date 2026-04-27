"""Shadow REST API client — Python edition.

Mirrors the TypeScript ``ShadowClient`` 1-to-1 so that every JS SDK method
has a Python equivalent with the same semantics.
"""

from __future__ import annotations

from typing import Any

import httpx


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

    def _delete(self, path: str) -> Any:
        return self._request("DELETE", path)

    # ── Auth ─────────────────────────────────────────────────────────────

    def register(
        self,
        *,
        email: str,
        password: str,
        username: str,
        invite_code: str,
        display_name: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "email": email,
            "password": password,
            "username": username,
            "inviteCode": invite_code,
        }
        if display_name:
            payload["displayName"] = display_name
        return self._post("/api/auth/register", json=payload)

    def login(self, *, email: str, password: str) -> dict[str, Any]:
        return self._post("/api/auth/login", json={"email": email, "password": password})

    def refresh_token(self) -> dict[str, Any]:
        return self._post("/api/auth/refresh")

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

    def get_user_profile(self, user_id: str) -> dict[str, Any]:
        return self._get(f"/api/auth/users/{user_id}")

    def list_oauth_accounts(self) -> list[dict[str, Any]]:
        return self._get("/api/auth/oauth/accounts")

    def unlink_oauth_account(self, account_id: str) -> dict[str, Any]:
        return self._delete(f"/api/auth/oauth/accounts/{account_id}")

    # ── Agents ───────────────────────────────────────────────────────────

    def list_agents(self) -> list[dict[str, Any]]:
        return self._get("/api/agents")

    def create_agent(
        self,
        *,
        name: str,
        display_name: str | None = None,
        avatar_url: str | None = None,
    ) -> dict[str, Any]:
        data: dict[str, Any] = {"name": name}
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

    def update_server(self, server_id: str, **kwargs: Any) -> dict[str, Any]:
        return self._patch(f"/api/servers/{server_id}", json=kwargs)

    def delete_server(self, server_id: str) -> dict[str, Any]:
        return self._delete(f"/api/servers/{server_id}")

    def join_server(
        self, server_id: str, invite_code: str | None = None
    ) -> dict[str, Any]:
        payload = {"inviteCode": invite_code} if invite_code else {}
        return self._post(f"/api/servers/{server_id}/join", json=payload)

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
        return self._post(f"/api/servers/{server_id}/invite")

    def add_agents_to_server(
        self, server_id: str, agent_ids: list[str]
    ) -> dict[str, Any]:
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
    ) -> dict[str, Any]:
        data: dict[str, Any] = {"name": name, "type": type}
        if description:
            data["description"] = description
        return self._post(f"/api/servers/{server_id}/channels", json=data)

    def get_channel(self, channel_id: str) -> dict[str, Any]:
        return self._get(f"/api/channels/{channel_id}")

    def get_channel_members(self, channel_id: str) -> list[dict[str, Any]]:
        return self._get(f"/api/channels/{channel_id}/members")

    def update_channel(self, channel_id: str, **kwargs: Any) -> dict[str, Any]:
        return self._patch(f"/api/channels/{channel_id}", json=kwargs)

    def delete_channel(self, channel_id: str) -> dict[str, Any]:
        return self._delete(f"/api/channels/{channel_id}")

    def reorder_channels(
        self, server_id: str, channel_ids: list[str]
    ) -> dict[str, Any]:
        return self._put(
            f"/api/servers/{server_id}/channels/reorder",
            json={"channelIds": channel_ids},
        )

    def add_channel_member(
        self, channel_id: str, user_id: str
    ) -> dict[str, Any]:
        return self._post(
            f"/api/channels/{channel_id}/members", json={"userId": user_id}
        )

    def remove_channel_member(
        self, channel_id: str, user_id: str
    ) -> dict[str, Any]:
        return self._delete(f"/api/channels/{channel_id}/members/{user_id}")

    def set_buddy_policy(
        self, channel_id: str, buddy_user_id: str, **kwargs: Any
    ) -> dict[str, Any]:
        return self._put(
            f"/api/channels/{channel_id}/buddy-policy",
            json={"buddyUserId": buddy_user_id, **kwargs},
        )

    def get_buddy_policy(self, channel_id: str) -> dict[str, Any] | None:
        return self._get(f"/api/channels/{channel_id}/buddy-policy")

    # ── Messages ─────────────────────────────────────────────────────────

    def send_message(
        self,
        channel_id: str,
        content: str,
        *,
        thread_id: str | None = None,
        reply_to_id: str | None = None,
    ) -> dict[str, Any]:
        data: dict[str, Any] = {"content": content}
        if thread_id:
            data["threadId"] = thread_id
        if reply_to_id:
            data["replyToId"] = reply_to_id
        return self._post(f"/api/channels/{channel_id}/messages", json=data)

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
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"content": content}
        if metadata is not None:
            payload["metadata"] = metadata
        return self._post(
            f"/api/threads/{thread_id}/messages", json=payload
        )

    # ── DMs ──────────────────────────────────────────────────────────────

    def create_dm_channel(self, user_id: str) -> dict[str, Any]:
        return self._post("/api/dm/channels", json={"userId": user_id})

    def list_dm_channels(self) -> list[dict[str, Any]]:
        return self._get("/api/dm/channels")

    def get_dm_messages(
        self, channel_id: str, limit: int = 50, cursor: str | None = None
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {"limit": limit}
        if cursor:
            params["cursor"] = cursor
        return self._get(f"/api/dm/channels/{channel_id}/messages", params=params)

    def send_dm_message(
        self,
        channel_id: str,
        content: str,
        reply_to_id: str | None = None,
        metadata: dict[str, Any] | None = None,
        attachments: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"content": content}
        if reply_to_id:
            payload["replyToId"] = reply_to_id
        if metadata is not None:
            payload["metadata"] = metadata
        if attachments is not None:
            payload["attachments"] = attachments
        return self._post(
            f"/api/dm/channels/{channel_id}/messages", json=payload
        )

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
        return self._patch("/api/notifications/read-all")

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
        dm_message_id: str | None = None,
    ) -> dict[str, Any]:
        files = {"file": (filename, file_bytes, content_type)}
        data = {}
        if message_id:
            data["messageId"] = message_id
        if dm_message_id:
            data["dmMessageId"] = dm_message_id
        resp = self._http.post(
            "/api/media/upload",
            files=files,
            data=data,
            headers={"Content-Type": None},  # let httpx set multipart
        )
        resp.raise_for_status()
        return resp.json()

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
        self, server_id: str, **kwargs: Any
    ) -> dict[str, Any]:
        return self._post(f"/api/servers/{server_id}/shop/orders", json=kwargs)

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
        return self._post("/api/wallet/topup", json={"amount": amount})

    def get_wallet_transactions(self) -> list[dict[str, Any]]:
        return self._get("/api/wallet/transactions")

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

    def get_cloud_provider_routing(self) -> dict[str, Any]:
        return self._get("/api/cloud-saas/provider-routing")

    def update_cloud_provider_routing(self, policy: dict[str, Any]) -> dict[str, Any]:
        return self._put("/api/cloud-saas/provider-routing", json={"policy": policy})

    def resolve_cloud_provider_route(
        self, *, selector: str | None = None, tags: list[str] | None = None
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {}
        if selector is not None:
            payload["selector"] = selector
        if tags is not None:
            payload["tags"] = tags
        return self._post("/api/cloud-saas/provider-routing/resolve", json=payload)

    def get_entitlements(self, server_id: str) -> list[dict[str, Any]]:
        return self._get(f"/api/servers/{server_id}/shop/entitlements")

    # ── Task Center ──────────────────────────────────────────────────────

    def get_task_center(self) -> dict[str, Any]:
        return self._get("/api/tasks")

    def claim_task(self, task_key: str) -> dict[str, Any]:
        return self._post(f"/api/tasks/{task_key}/claim")

    def get_referral_summary(self) -> dict[str, Any]:
        return self._get("/api/tasks/referral-summary")

    def get_reward_history(self) -> dict[str, Any]:
        return self._get("/api/tasks/rewards")

    # ── Server Apps ──────────────────────────────────────────────────────

    def list_apps(
        self, server_id: str, **kwargs: Any
    ) -> dict[str, Any]:
        return self._get(f"/api/servers/{server_id}/apps", params=kwargs or None)

    def get_homepage_app(self, server_id: str) -> dict[str, Any] | None:
        return self._get(f"/api/servers/{server_id}/apps/homepage")

    def get_app(self, server_id: str, app_id: str) -> dict[str, Any]:
        return self._get(f"/api/servers/{server_id}/apps/{app_id}")

    def create_app(self, server_id: str, **kwargs: Any) -> dict[str, Any]:
        return self._post(f"/api/servers/{server_id}/apps", json=kwargs)

    def update_app(
        self, server_id: str, app_id: str, **kwargs: Any
    ) -> dict[str, Any]:
        return self._patch(f"/api/servers/{server_id}/apps/{app_id}", json=kwargs)

    def delete_app(self, server_id: str, app_id: str) -> dict[str, Any]:
        return self._delete(f"/api/servers/{server_id}/apps/{app_id}")

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
