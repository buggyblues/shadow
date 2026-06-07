"""Basic unit tests for the Shadow Python SDK client initialization."""

from shadowob_sdk import (
    ShadowAgentUsageSnapshotInput,
    ShadowClient,
    ShadowCommerceProductContext,
    ShadowCommunityAssetDefinition,
    ShadowConnectorBootstrapResult,
    ShadowConnectorComputer,
    ShadowConnectorRuntimeInfo,
    ShadowEntitlement,
    ShadowPaidFileOpenResult,
    ShadowSocket,
    ShadowSettlementLine,
    ShadowUsageProviderSnapshot,
)


def test_client_creation():
    client = ShadowClient("https://example.com", "test-token")
    assert client._base_url == "https://example.com"
    assert client._token == "test-token"
    client.close()


def test_commerce_models_are_exported():
    assert ShadowCommerceProductContext
    assert ShadowCommunityAssetDefinition
    assert ShadowConnectorBootstrapResult
    assert ShadowConnectorComputer
    assert ShadowConnectorRuntimeInfo
    assert ShadowEntitlement
    assert ShadowPaidFileOpenResult
    assert ShadowSettlementLine


def test_client_strips_trailing_api():
    client = ShadowClient("https://example.com/api", "test-token")
    assert client._base_url == "https://example.com"
    client.close()


def test_client_strips_trailing_api_slash():
    client = ShadowClient("https://example.com/api/", "test-token")
    assert client._base_url == "https://example.com"
    client.close()


def test_client_context_manager():
    with ShadowClient("https://example.com", "test-token") as client:
        assert client._base_url == "https://example.com"


def test_launch_play_posts_launch_session_id(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")
    captured = {}

    def fake_post(path, json=None):
        captured["path"] = path
        captured["json"] = json
        return {"ok": True, "status": "fallback"}

    monkeypatch.setattr(client, "_post", fake_post)

    result = client.launch_play(
        play_id="daily-brief",
        launch_session_id="launch-session-1",
        invite_code="ABCD1234",
    )

    assert captured == {
        "path": "/api/play/launch",
        "json": {
            "playId": "daily-brief",
            "launchSessionId": "launch-session-1",
            "inviteCode": "ABCD1234",
        },
    }
    assert result["ok"] is True
    client.close()


def test_get_play_catalog_returns_plays(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")
    captured = {}

    def fake_get(path):
        captured["path"] = path
        return {"plays": [{"id": "gstack-buddy", "status": "gated"}]}

    monkeypatch.setattr(client, "_get", fake_get)

    result = client.get_play_catalog()

    assert captured == {"path": "/api/play/catalog"}
    assert result == [{"id": "gstack-buddy", "status": "gated"}]
    client.close()


def test_connector_computer_methods(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")
    calls = []

    def fake_get(path):
        calls.append(("get", path))
        return {"computers": []}

    def fake_post(path, json=None):
        calls.append(("post", path, json))
        return {"command": "npx @shadowob/connector@latest --daemon", "computer": {"id": "pc-1"}}

    monkeypatch.setattr(client, "_get", fake_get)
    monkeypatch.setattr(client, "_post", fake_post)

    assert client.list_connector_computers() == {"computers": []}
    assert client.get_latest_desktop_release() == {"computers": []}
    assert client.create_connector_bootstrap(server_url="https://shadowob.com", name="Laptop")[
        "command"
    ].startswith("npx")
    assert client.create_agent_on_connector_computer(
        "pc-1",
        runtime_id="codex",
        server_url="https://shadowob.com",
        name="Alice",
        username="alice",
    )["computer"]["id"] == "pc-1"
    assert client.configure_agent_on_connector_computer(
        "pc-1",
        "agent-1",
        runtime_id="claude-code",
        server_url="https://shadowob.com",
    )["computer"]["id"] == "pc-1"
    assert calls == [
        ("get", "/api/connector/computers"),
        ("get", "/api/desktop/releases/latest"),
        (
            "post",
            "/api/connector/computers/bootstrap",
            {"serverUrl": "https://shadowob.com", "name": "Laptop"},
        ),
        (
            "post",
            "/api/connector/computers/pc-1/buddies",
            {
                "runtimeId": "codex",
                "serverUrl": "https://shadowob.com",
                "name": "Alice",
                "username": "alice",
                "buddyMode": "private",
                "allowedServerIds": [],
            },
        ),
        (
            "post",
            "/api/connector/computers/pc-1/buddies/agent-1/configure",
            {"runtimeId": "claude-code", "serverUrl": "https://shadowob.com"},
        ),
    ]
    client.close()


def test_get_commerce_offer_checkout_preview(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")
    captured = {}

    def fake_get(path, *, params=None):
        captured["path"] = path
        captured["params"] = params
        return {"viewerState": "active", "nextAction": "open_paid_file"}

    monkeypatch.setattr(client, "_get", fake_get)

    result = client.get_commerce_offer_checkout_preview(
        "offer-1", sku_id="sku-1", viewer_user_id="user-2"
    )

    assert captured == {
        "path": "/api/commerce/offers/offer-1/checkout-preview",
        "params": {"skuId": "sku-1", "viewerUserId": "user-2"},
    }
    assert result["nextAction"] == "open_paid_file"
    client.close()


def test_get_oauth_commerce_entitlement_access(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")
    captured = {}

    def fake_get(path, *, params=None):
        captured["path"] = path
        captured["params"] = params
        return {"allowed": True, "resourceId": "app-1:premium"}

    monkeypatch.setattr(client, "_get", fake_get)

    result = client.get_oauth_commerce_entitlement_access(
        resource_type="external_app", resource_id="app-1:premium", capability="use"
    )

    assert captured == {
        "path": "/api/oauth/commerce/entitlements",
        "params": {
            "resourceType": "external_app",
            "resourceId": "app-1:premium",
            "capability": "use",
        },
    }
    assert result["allowed"] is True
    client.close()


def test_redeem_oauth_commerce_entitlement(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")
    captured = {}

    def fake_post(path, json=None):
        captured["path"] = path
        captured["json"] = json
        return {"redeemed": True, "resourceId": "app-1:premium"}

    monkeypatch.setattr(client, "_post", fake_post)

    result = client.redeem_oauth_commerce_entitlement(
        idempotency_key="redeem-key-1",
        resource_id="app-1:premium",
        metadata={"providerOrderId": "provider-order-1"},
    )

    assert captured == {
        "path": "/api/oauth/commerce/entitlements/redeem",
        "json": {
            "idempotencyKey": "redeem-key-1",
            "resourceId": "app-1:premium",
            "metadata": {"providerOrderId": "provider-order-1"},
        },
    }
    assert result["redeemed"] is True
    client.close()


def test_get_wallet_transactions_with_display_filters(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")
    captured = {}

    def fake_get(path, *, params=None):
        captured["path"] = path
        captured["params"] = params
        return []

    monkeypatch.setattr(client, "_get", fake_get)

    result = client.get_wallet_transactions(
        audience="consumer", direction="income", limit=20, offset=40
    )

    assert captured == {
        "path": "/api/wallet/transactions",
        "params": {
            "audience": "consumer",
            "direction": "income",
            "limit": 20,
            "offset": 40,
        },
    }
    assert result == []
    client.close()


def test_resolve_attachment_media_url_accepts_variant(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")
    captured = {}

    def fake_get(path, *, params=None):
        captured["path"] = path
        captured["params"] = params
        return {
            "url": "/api/media/signed/token",
            "expiresAt": "2026-05-13T04:00:00.000Z",
        }

    monkeypatch.setattr(client, "_get", fake_get)

    result = client.resolve_attachment_media_url(
        "attachment-1", disposition="inline", variant="preview"
    )

    assert captured == {
        "path": "/api/attachments/attachment-1/media-url",
        "params": {"disposition": "inline", "variant": "preview"},
    }
    assert result["url"] == "/api/media/signed/token"
    client.close()


def test_get_channel_bootstrap_uses_message_limit(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")
    captured = {}

    def fake_get(path, *, params=None):
        captured["path"] = path
        captured["params"] = params
        return {
            "access": {"canAccess": True},
            "channel": {"id": "channel-1"},
            "server": None,
            "channels": [],
            "members": [],
            "messages": {"messages": [], "hasMore": False},
            "slashCommands": {"commands": []},
        }

    monkeypatch.setattr(client, "_get", fake_get)

    result = client.get_channel_bootstrap("channel-1", messages_limit=50)

    assert captured == {
        "path": "/api/channels/channel-1/bootstrap",
        "params": {"messagesLimit": 50},
    }
    assert result["messages"]["hasMore"] is False
    client.close()


def test_join_voice_channel_posts_state(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")
    captured = {}

    def fake_post(path, json=None):
        captured["path"] = path
        captured["json"] = json
        return {"credentials": {"appId": "agora-app", "uid": 1}, "state": {"participants": []}}

    monkeypatch.setattr(client, "_post", fake_post)

    result = client.join_voice_channel("channel-1", client_id="cli", muted=True)

    assert captured == {
        "path": "/api/channels/channel-1/voice/join",
        "json": {"clientId": "cli", "muted": True},
    }
    assert result["credentials"]["appId"] == "agora-app"
    client.close()


def test_renew_and_leave_voice_channel_posts_client_id(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")
    calls = []

    def fake_post(path, json=None):
        calls.append({"path": path, "json": json})
        return {"credentials": {"appId": "agora-app"}, "state": {"participants": []}}

    monkeypatch.setattr(client, "_post", fake_post)

    client.renew_voice_credentials("channel-1", client_id="cli")
    client.leave_voice_channel("channel-1", client_id="cli")

    assert calls == [
        {
            "path": "/api/channels/channel-1/voice/renew",
            "json": {"clientId": "cli"},
        },
        {
            "path": "/api/channels/channel-1/voice/leave",
            "json": {"clientId": "cli"},
        },
    ]
    client.close()


def test_update_voice_policy_uses_voice_policy_endpoint(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")
    captured = {}

    def fake_put(path, json=None):
        captured["path"] = path
        captured["json"] = json
        return {"agentId": "agent-1", "channelId": "channel-1", "autoJoin": True}

    monkeypatch.setattr(client, "_put", fake_put)

    result = client.update_voice_policy(
        "channel-1",
        agent_id="agent-1",
        auto_join=True,
        consume_screen_share=True,
    )

    assert captured == {
        "path": "/api/channels/channel-1/voice-policy",
        "json": {
            "agentId": "agent-1",
            "autoJoin": True,
            "consumeScreenShare": True,
        },
    }
    assert result["autoJoin"] is True
    client.close()


def test_socket_creation():
    sock = ShadowSocket("https://example.com", "test-token")
    assert sock.connected is False
    assert sock._server_url == "https://example.com"


def test_list_policies_uses_agent_policies_endpoint_and_filters_by_server(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")

    def fake_get(path, *, params=None):
        assert path == "/api/agents/agent-1/policies"
        return [
            {"id": "p1", "serverId": "srv-1", "channelId": "ch-1"},
            {"id": "p2", "serverId": "srv-2", "channelId": "ch-2"},
        ]

    monkeypatch.setattr(client, "_get", fake_get)

    assert client.list_policies("agent-1", "srv-1") == [
        {"id": "p1", "serverId": "srv-1", "channelId": "ch-1"}
    ]
    client.close()


def test_upsert_policy_uses_batch_agent_policies_endpoint(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")
    captured = {}

    def fake_put(path, json=None):
        captured["path"] = path
        captured["json"] = json
        return [{"id": "p1", "serverId": "srv-1", "channelId": "ch-1", "reply": True}]

    monkeypatch.setattr(client, "_put", fake_put)

    result = client.upsert_policy(
        "agent-1",
        "srv-1",
        channelId="ch-1",
        listen=False,
        reply=True,
        mentionOnly=False,
    )

    assert captured == {
        "path": "/api/agents/agent-1/policies",
        "json": {
            "policies": [
                {
                    "serverId": "srv-1",
                    "channelId": "ch-1",
                    "listen": False,
                    "reply": True,
                    "mentionOnly": False,
                }
            ]
        },
    }
    assert result == {"id": "p1", "serverId": "srv-1", "channelId": "ch-1", "reply": True}
    client.close()


def test_slash_command_registry_methods(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")
    captured = {}

    def fake_put(path, json=None):
        captured["put"] = {"path": path, "json": json}
        return {"ok": True, "commands": json["commands"]}

    def fake_get(path, *, params=None):
        captured.setdefault("get", []).append(path)
        return {"commands": [{"name": "audit"}]}

    monkeypatch.setattr(client, "_put", fake_put)
    monkeypatch.setattr(client, "_get", fake_get)

    result = client.update_agent_slash_commands(
        "agent-1", [{"name": "audit", "description": "Run audit"}]
    )
    agent_commands = client.get_agent_slash_commands("agent-1")
    channel_commands = client.list_channel_slash_commands("channel-1")

    assert captured["put"] == {
        "path": "/api/agents/agent-1/slash-commands",
        "json": {"commands": [{"name": "audit", "description": "Run audit"}]},
    }
    assert captured["get"] == [
        "/api/agents/agent-1/slash-commands",
        "/api/channels/channel-1/slash-commands",
    ]
    assert result["ok"] is True
    assert agent_commands["commands"][0]["name"] == "audit"
    assert channel_commands["commands"][0]["name"] == "audit"
    client.close()


def test_report_agent_usage_snapshot_posts_runtime_telemetry(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")
    captured = {}

    def fake_post(path, json=None):
        captured["path"] = path
        captured["json"] = json
        return {"ok": True}

    monkeypatch.setattr(client, "_post", fake_post)

    result = client.report_agent_usage_snapshot(
        "agent-1",
        {
            "source": "openclaw-trajectory",
            "model": "qwen3.6-plus",
            "totalTokens": 1234,
        },
    )

    assert captured == {
        "path": "/api/agents/agent-1/usage-snapshot",
        "json": {
            "source": "openclaw-trajectory",
            "model": "qwen3.6-plus",
            "totalTokens": 1234,
        },
    }
    assert result == {"ok": True}
    client.close()


def test_report_agent_usage_snapshot_accepts_typed_payload(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")
    captured = {}

    def fake_post(path, json=None):
        captured["path"] = path
        captured["json"] = json
        return {"ok": True}

    monkeypatch.setattr(client, "_post", fake_post)

    result = client.report_agent_usage_snapshot(
        "agent-1",
        ShadowAgentUsageSnapshotInput(
            source="openclaw-trajectory",
            model="qwen3.6-plus",
            total_usd=0.12,
            input_tokens=100,
            total_tokens=1234,
            providers=[
                ShadowUsageProviderSnapshot(
                    provider="openclaw",
                    amount_usd=0.12,
                    total_tokens=1234,
                )
            ],
        ),
    )

    assert captured == {
        "path": "/api/agents/agent-1/usage-snapshot",
        "json": {
            "source": "openclaw-trajectory",
            "model": "qwen3.6-plus",
            "totalUsd": 0.12,
            "inputTokens": 100,
            "totalTokens": 1234,
            "providers": [
                {
                    "provider": "openclaw",
                    "amountUsd": 0.12,
                    "totalTokens": 1234,
                }
            ],
        },
    }
    assert result == {"ok": True}
    client.close()


def test_send_message_includes_mentions(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")
    captured = {}

    def fake_post(path, json=None):
        captured["path"] = path
        captured["json"] = json
        return {"id": "msg-1"}

    monkeypatch.setattr(client, "_post", fake_post)

    result = client.send_message(
        "channel-1",
        "hello @alice",
        mentions=[
            {
                "kind": "user",
                "targetId": "user-1",
                "userId": "user-1",
                "token": "<@user-1>",
                "sourceToken": "@alice",
                "label": "@Alice",
            }
        ],
    )

    assert captured == {
        "path": "/api/channels/channel-1/messages",
        "json": {
            "content": "hello @alice",
            "mentions": [
                {
                    "kind": "user",
                    "targetId": "user-1",
                    "userId": "user-1",
                    "token": "<@user-1>",
                    "sourceToken": "@alice",
                    "label": "@Alice",
                }
            ],
        },
    }
    assert result == {"id": "msg-1"}
    client.close()


def test_suggest_and_resolve_mentions(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")
    captured = []

    def fake_get(path, params=None):
        captured.append(("get", path, params))
        return {"suggestions": []}

    def fake_post(path, json=None):
        captured.append(("post", path, json))
        return {"mentions": []}

    monkeypatch.setattr(client, "_get", fake_get)
    monkeypatch.setattr(client, "_post", fake_post)

    assert client.suggest_mentions("channel-1", "#", query="general", limit=10) == {
        "suggestions": []
    }
    assert client.resolve_mentions("channel-1", "hello #general") == {"mentions": []}

    assert captured == [
        (
            "get",
            "/api/mentions/suggest",
            {"channelId": "channel-1", "trigger": "#", "q": "general", "limit": 10},
        ),
        ("post", "/api/mentions/resolve", {"channelId": "channel-1", "content": "hello #general"}),
    ]
    client.close()


def test_send_thread_message_includes_mentions(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")
    captured = {}

    def fake_post(path, json=None):
        captured["path"] = path
        captured["json"] = json
        return {"id": "msg-1"}

    monkeypatch.setattr(client, "_post", fake_post)

    client.send_to_thread(
        "thread-1",
        "hello @alice",
        mentions=[
            {
                "kind": "user",
                "targetId": "user-1",
                "userId": "user-1",
                "token": "<@user-1>",
                "sourceToken": "@alice",
                "label": "@Alice",
            }
        ],
    )

    assert captured["path"] == "/api/threads/thread-1/messages"
    assert captured["json"]["mentions"][0]["sourceToken"] == "@alice"
    client.close()


def test_submit_interactive_action_posts_to_source_message(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")
    captured = {}

    def fake_post(path, json=None):
        captured["path"] = path
        captured["json"] = json
        return {"id": "reply-1"}

    monkeypatch.setattr(client, "_post", fake_post)

    result = client.submit_interactive_action(
        "message-1",
        block_id="office-hour",
        action_id="submit",
        values={"pain": "Manual reporting"},
    )

    assert captured == {
        "path": "/api/messages/message-1/interactive",
        "json": {
            "blockId": "office-hour",
            "actionId": "submit",
            "values": {"pain": "Manual reporting"},
        },
    }
    assert result == {"id": "reply-1"}
    client.close()


def test_get_interactive_state_fetches_source_state(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")
    captured = {}

    def fake_get(path, params=None):
        captured["path"] = path
        captured["params"] = params
        return {"sourceMessageId": "message-1", "blockId": "office-hour", "submitted": True}

    monkeypatch.setattr(client, "_get", fake_get)

    result = client.get_interactive_state("message-1", block_id="office-hour")

    assert captured == {
        "path": "/api/messages/message-1/interactive-state",
        "params": {"blockId": "office-hour"},
    }
    assert result["submitted"] is True
    client.close()


def test_send_to_thread_posts_metadata(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")
    captured = {}

    def fake_post(path, json=None):
        captured["path"] = path
        captured["json"] = json
        return {"id": "thread-message-1"}

    monkeypatch.setattr(client, "_post", fake_post)

    result = client.send_to_thread(
        "thread-1",
        "Thread reply",
        metadata={
            "collaboration": {
                "id": "collab-1",
                "rootMessageId": "root-1",
                "buddyId": "buddy-1",
                "turn": 1,
            }
        },
    )

    assert captured == {
        "path": "/api/threads/thread-1/messages",
        "json": {
            "content": "Thread reply",
            "metadata": {
                "collaboration": {
                    "id": "collab-1",
                    "rootMessageId": "root-1",
                    "buddyId": "buddy-1",
                    "turn": 1,
                }
            },
        },
    }
    assert result == {"id": "thread-message-1"}
    client.close()


def test_send_to_thread_posts_reply_to_id(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")
    captured = {}

    def fake_post(path, json=None):
        captured["path"] = path
        captured["json"] = json
        return {"id": "thread-message-1"}

    monkeypatch.setattr(client, "_post", fake_post)

    result = client.send_to_thread("thread-1", "Thread reply", reply_to_id="message-1")

    assert captured == {
        "path": "/api/threads/thread-1/messages",
        "json": {"content": "Thread reply", "replyToId": "message-1"},
    }
    assert result == {"id": "thread-message-1"}
    client.close()


def test_channel_access_request_and_review(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")
    captured = []

    def fake_post(path, json=None):
        captured.append(("post", path, json))
        return {"ok": True, "status": "pending", "requestId": "req-1"}

    def fake_patch(path, json=None):
        captured.append(("patch", path, json))
        return {"ok": True}

    monkeypatch.setattr(client, "_post", fake_post)
    monkeypatch.setattr(client, "_patch", fake_patch)

    assert client.request_channel_access("ch-1")["status"] == "pending"
    assert client.review_channel_join_request("req-1", "approved") == {"ok": True}
    assert captured == [
        ("post", "/api/channels/ch-1/join-requests", None),
        ("patch", "/api/channel-join-requests/req-1", {"status": "approved"}),
    ]
    client.close()


def test_server_access_fetch_request_and_review(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")
    captured = []

    def fake_get(path):
        captured.append(("get", path, None))
        return {"canAccess": False, "requiresApproval": True}

    def fake_post(path, json=None):
        captured.append(("post", path, json))
        return {"ok": True, "status": "pending", "requestId": "req-1"}

    def fake_patch(path, json=None):
        captured.append(("patch", path, json))
        return {"ok": True}

    monkeypatch.setattr(client, "_get", fake_get)
    monkeypatch.setattr(client, "_post", fake_post)
    monkeypatch.setattr(client, "_patch", fake_patch)

    assert client.get_server_access("private")["requiresApproval"] is True
    assert client.request_server_access("private")["status"] == "pending"
    assert client.review_server_join_request("req-1", "approved") == {"ok": True}
    assert captured == [
        ("get", "/api/servers/private/access", None),
        ("post", "/api/servers/private/join-requests", None),
        ("patch", "/api/servers/join-requests/req-1", {"status": "approved"}),
    ]
    client.close()


def test_notifications_mark_scope_read_supports_channel_id(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")
    captured = {}

    def fake_post(path, json=None):
        captured["path"] = path
        captured["json"] = json
        return {"updated": 1}

    monkeypatch.setattr(client, "_post", fake_post)

    assert client.mark_scope_read(channel_id="channel-1") == {"updated": 1}
    assert captured == {
        "path": "/api/notifications/read-scope",
        "json": {"channelId": "channel-1"},
    }
    client.close()


def test_notifications_mark_all_uses_post(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")
    captured = {}

    def fake_post(path, json=None):
        captured["path"] = path
        captured["json"] = json
        return {"ok": True}

    monkeypatch.setattr(client, "_post", fake_post)

    assert client.mark_all_notifications_read() == {"ok": True}
    assert captured == {"path": "/api/notifications/read-all", "json": None}
    client.close()


def test_buddy_inbox_methods_use_canonical_paths(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")
    captured = []

    def fake_get(path, params=None):
        captured.append(("get", path, params))
        return []

    def fake_post(path, json=None):
        captured.append(("post", path, json))
        return {"ok": True}

    def fake_put(path, json=None):
        captured.append(("put", path, json))
        return {"policy": json}

    def fake_patch(path, json=None):
        captured.append(("patch", path, json))
        return {"status": json["status"]}

    monkeypatch.setattr(client, "_get", fake_get)
    monkeypatch.setattr(client, "_post", fake_post)
    monkeypatch.setattr(client, "_put", fake_put)
    monkeypatch.setattr(client, "_patch", fake_patch)

    assert client.list_buddy_inboxes() == []
    assert client.list_server_buddy_inboxes("shadow-plays") == []
    assert client.ensure_buddy_inbox("shadow-plays", "agent-1") == {"ok": True}
    assert client.update_buddy_inbox_admission_policy(
        "shadow-plays",
        "agent-1",
        {"defaultMode": "allow", "rules": []},
    ) == {"policy": {"defaultMode": "allow", "rules": []}}
    assert client.list_buddy_inbox_admission_pending("shadow-plays", "agent-1") == []
    assert client.approve_buddy_inbox_admission_pending(
        "shadow-plays",
        "agent-1",
        "pending-1",
    ) == {"ok": True}
    assert client.reject_buddy_inbox_admission_pending(
        "shadow-plays",
        "agent-1",
        "pending-2",
    ) == {"ok": True}
    assert client.enqueue_inbox_task_for_agent(
        "shadow-plays",
        "agent-1",
        title="Install",
        tags=["UI", {"label": "High touch"}],
        app={
            "appKey": "figma",
            "name": "Figma",
            "iconUrl": "https://example.com/figma.png",
        },
        idempotency_key="skills:install:x",
    ) == {"ok": True}
    assert client.enqueue_inbox_task("channel-1", title="Review") == {"ok": True}
    assert client.claim_next_inbox_task("shadow-plays", "agent-1", ttl_seconds=60) == {
        "ok": True
    }
    assert client.claim_task_card("message-1", "card-1", note="Start") == {"ok": True}
    assert client.update_task_card("message-1", "card-1", status="running") == {
        "status": "running"
    }
    assert client.retry_task_card("message-1", "card-1") == {"ok": True}
    assert client.promote_message_to_inbox_task(
        "message-1",
        server_id="server-1",
        agent_id="agent-1",
    ) == {"ok": True}
    assert captured == [
        ("get", "/api/buddy-inboxes", None),
        ("get", "/api/servers/shadow-plays/inboxes", None),
        ("post", "/api/servers/shadow-plays/inboxes/agent-1", None),
        (
            "put",
            "/api/servers/shadow-plays/inboxes/agent-1/admission-policy",
            {"defaultMode": "allow", "rules": []},
        ),
        ("get", "/api/servers/shadow-plays/inboxes/agent-1/admission-pending", None),
        (
            "post",
            "/api/servers/shadow-plays/inboxes/agent-1/admission-pending/pending-1/approve",
            None,
        ),
        (
            "post",
            "/api/servers/shadow-plays/inboxes/agent-1/admission-pending/pending-2/reject",
            None,
        ),
        (
            "post",
            "/api/servers/shadow-plays/inboxes/agent-1/tasks",
            {
                "title": "Install",
                "tags": ["UI", {"label": "High touch"}],
                "app": {
                    "appKey": "figma",
                    "name": "Figma",
                    "iconUrl": "https://example.com/figma.png",
                },
                "idempotencyKey": "skills:install:x",
            },
        ),
        ("post", "/api/channels/channel-1/inbox/tasks", {"title": "Review"}),
        (
            "post",
            "/api/servers/shadow-plays/inboxes/agent-1/claim-next",
            {"ttlSeconds": 60},
        ),
        ("post", "/api/messages/message-1/cards/card-1/claim", {"note": "Start"}),
        ("patch", "/api/messages/message-1/cards/card-1", {"status": "running"}),
        ("post", "/api/messages/message-1/cards/card-1/retry", {}),
        (
            "post",
            "/api/messages/message-1/inbox/tasks",
            {"serverId": "server-1", "agentId": "agent-1"},
        ),
    ]
    client.close()


def test_notification_channel_preference_and_push_token_paths(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")
    captured = []

    def fake_patch(path, json=None):
        captured.append(("patch", path, json))
        return {"kind": json["kind"], "enabled": json["enabled"]}

    def fake_post(path, json=None):
        captured.append(("post", path, json))
        return {"id": "token-1"}

    monkeypatch.setattr(client, "_patch", fake_patch)
    monkeypatch.setattr(client, "_post", fake_post)

    assert client.update_notification_channel_preference(
        kind="commerce.renewal_failed",
        channel="mobile_push",
        enabled=False,
    ) == {"kind": "commerce.renewal_failed", "enabled": False}
    assert client.register_push_token(
        platform="ios",
        token="ExponentPushToken[abc]",
        device_name="iPhone",
    ) == {"id": "token-1"}
    assert captured == [
        (
            "patch",
            "/api/notifications/channel-preferences",
            {
                "kind": "commerce.renewal_failed",
                "channel": "mobile_push",
                "enabled": False,
            },
        ),
        (
            "post",
            "/api/notifications/push-tokens",
            {
                "platform": "ios",
                "token": "ExponentPushToken[abc]",
                "deviceName": "iPhone",
            },
        ),
    ]
    client.close()


def test_commerce_picker_purchase_and_entitlement_paths(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")
    captured = []

    def fake_get(path, *, params=None):
        captured.append(("get", path, params))
        return {"cards": []}

    def fake_post(path, json=None):
        captured.append(("post", path, json))
        return {"ok": True}

    def fake_patch(path, json=None):
        captured.append(("patch", path, json))
        return {"ok": True}

    monkeypatch.setattr(client, "_get", fake_get)
    monkeypatch.setattr(client, "_post", fake_post)
    monkeypatch.setattr(client, "_patch", fake_patch)

    assert client.list_commerce_product_cards(
        target="channel",
        channel_id="channel-1",
        limit=3,
    ) == {"cards": []}
    assert client.purchase_shop_product(
        "shop-1",
        "prod-1",
        idempotency_key="idem-1",
    ) == {"ok": True}
    assert client.create_shop_asset_definition(
        "shop-1",
        assetType="badge",
        name="Founder",
        status="active",
    ) == {"ok": True}
    assert client.update_shop_asset_definition(
        "shop-1",
        "asset-def-1",
        status="paused",
    ) == {"ok": True}
    assert client.create_commerce_deliverable(
        "shop-1",
        "offer-1",
        kind="community_asset",
        resourceType="community_asset_definition",
        resourceId="asset-def-1",
    ) == {"ok": True}
    assert client.lock_community_asset("grant-1", idempotency_key="lock-idem-1") == {"ok": True}
    assert client.unlock_community_asset("grant-1", idempotency_key="unlock-idem-1") == {"ok": True}
    assert client.revoke_community_asset(
        "grant-1", idempotency_key="revoke-idem-1", reason="cleanup"
    ) == {"ok": True}
    assert client.send_tip(
        recipient_user_id="user-2",
        amount=10,
        idempotency_key="tip-idem-1",
    ) == {"ok": True}
    assert client.send_gift(
        recipient_user_id="user-2",
        currencies=[{"currencyCode": "shrimp_coin", "amount": 5}],
        idempotency_key="gift-idem-1",
    ) == {"ok": True}
    assert client.list_settlements(limit=20, offset=40) == {"cards": []}
    assert client.create_order(
        "server-1",
        idempotency_key="order-idem-1",
        items=[{"productId": "prod-1", "skuId": "sku-1", "quantity": 2}],
    ) == {"ok": True}
    assert client.complete_order("server-1", "order-1") == {"ok": True}
    assert client.cancel_entitlement("ent-1", reason="user_cancelled") == {"ok": True}
    assert client.cancel_entitlement_renewal(
        "ent-1", reason="buyer_cancelled_auto_renewal"
    ) == {"ok": True}
    assert captured == [
        ("get", "/api/commerce/product-picker", {"target": "channel", "channelId": "channel-1", "limit": 3}),
        (
            "post",
            "/api/shops/shop-1/products/prod-1/purchase",
            {"idempotencyKey": "idem-1"},
        ),
        (
            "post",
            "/api/shops/shop-1/assets",
            {"assetType": "badge", "name": "Founder", "status": "active"},
        ),
        (
            "patch",
            "/api/shops/shop-1/assets/asset-def-1",
            {"status": "paused"},
        ),
        (
            "post",
            "/api/shops/shop-1/offers/offer-1/deliverables",
            {
                "kind": "community_asset",
                "resourceType": "community_asset_definition",
                "resourceId": "asset-def-1",
            },
        ),
        (
            "post",
            "/api/economy/assets/grant-1/lock",
            {"idempotencyKey": "lock-idem-1"},
        ),
        (
            "post",
            "/api/economy/assets/grant-1/unlock",
            {"idempotencyKey": "unlock-idem-1"},
        ),
        (
            "post",
            "/api/economy/assets/grant-1/revoke",
            {"idempotencyKey": "revoke-idem-1", "reason": "cleanup"},
        ),
        (
            "post",
            "/api/economy/tips",
            {"recipientUserId": "user-2", "amount": 10, "idempotencyKey": "tip-idem-1"},
        ),
        (
            "post",
            "/api/economy/gifts",
            {
                "recipientUserId": "user-2",
                "idempotencyKey": "gift-idem-1",
                "currencies": [{"currencyCode": "shrimp_coin", "amount": 5}],
            },
        ),
        ("get", "/api/economy/settlements", {"limit": 20, "offset": 40}),
        (
            "post",
            "/api/servers/server-1/shop/orders",
            {
                "idempotencyKey": "order-idem-1",
                "items": [{"productId": "prod-1", "skuId": "sku-1", "quantity": 2}],
            },
        ),
        ("post", "/api/servers/server-1/shop/orders/order-1/complete", None),
        ("post", "/api/entitlements/ent-1/cancel", {"reason": "user_cancelled"}),
        (
            "post",
            "/api/entitlements/ent-1/cancel-renewal",
            {"reason": "buyer_cancelled_auto_renewal"},
        ),
    ]
    client.close()


def test_delete_policy_resolves_policy_id_before_delete(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")
    captured = {}

    def fake_get(path, *, params=None):
        assert path == "/api/agents/agent-1/policies"
        return [
            {"id": "p1", "serverId": "srv-1", "channelId": "ch-1"},
            {"id": "p2", "serverId": "srv-2", "channelId": "ch-2"},
        ]

    def fake_delete(path):
        captured["path"] = path
        return {"success": True}

    monkeypatch.setattr(client, "_get", fake_get)
    monkeypatch.setattr(client, "_delete", fake_delete)

    result = client.delete_policy("agent-1", "srv-1", "ch-1")

    assert captured["path"] == "/api/agents/agent-1/policies/p1"
    assert result == {"success": True}
    client.close()
