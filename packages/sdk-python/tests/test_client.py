"""Basic unit tests for the Shadow Python SDK client initialization."""

import re
from pathlib import Path

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
    ShadowServerDesktopLayout,
    ShadowServerDesktopLayoutBuiltinAppItem,
    ShadowServerDesktopStickyNoteWidget,
    ShadowServerDesktopVideoWidget,
    ShadowServerDesktopWebEmbedWidget,
    ShadowSocket,
    ShadowSettlementLine,
    ShadowUsageProviderSnapshot,
)


def _snake_case(name: str) -> str:
    for acronym in ("OAuth", "DIY", "API", "URL", "ID"):
        name = name.replace(acronym, acronym.title())
    return re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", name).lower()


def test_python_client_method_names_match_typescript_sdk():
    package_root = Path(__file__).resolve().parents[2]
    ts_client = (package_root / "sdk/src/client.ts").read_text()
    py_client = (Path(__file__).resolve().parents[1] / "shadowob_sdk/client.py").read_text()

    ts_methods = {
        _snake_case(match.group(1))
        for match in re.finditer(r"^\s{2}async\s+([A-Za-z_][A-Za-z0-9_]*)\(", ts_client, re.M)
        if match.group(1) not in {"request", "requestRaw"}
    }
    py_methods = {
        match.group(1)
        for match in re.finditer(r"^\s{4}def\s+([A-Za-z_][A-Za-z0-9_]*)\(", py_client, re.M)
        if not match.group(1).startswith("_") and match.group(1) != "close"
    }

    assert py_methods == ts_methods


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


def test_oauth_authorization_helpers_use_camel_case_body(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")
    captured = []

    def fake_get(path, params=None):
        captured.append(("GET", path, params))
        return {"appName": "Demo"}

    def fake_post(path, json=None):
        captured.append(("POST", path, json))
        return {"redirectUrl": "https://app.test/callback?code=abc"}

    monkeypatch.setattr(client, "_get", fake_get)
    monkeypatch.setattr(client, "_post", fake_post)

    client.get_oauth_authorization(
        client_id="shadow_client",
        redirect_uri="https://app.test/callback",
        scope="user:read",
        state="state-1",
    )
    client.approve_oauth_authorization(
        client_id="shadow_client",
        redirect_uri="https://app.test/callback",
        scope="user:read",
        state="state-1",
    )
    client.approve_oauth_authorization_silently(
        client_id="shadow_client",
        redirect_uri="https://app.test/callback",
        scope="user:read",
        state="state-1",
    )

    assert captured == [
        (
            "GET",
            "/api/oauth/authorize",
            {
                "response_type": "code",
                "client_id": "shadow_client",
                "redirect_uri": "https://app.test/callback",
                "scope": "user:read",
                "state": "state-1",
            },
        ),
        (
            "POST",
            "/api/oauth/authorize",
            {
                "clientId": "shadow_client",
                "redirectUri": "https://app.test/callback",
                "scope": "user:read",
                "state": "state-1",
            },
        ),
        (
            "POST",
            "/api/oauth/authorize/silent",
            {
                "clientId": "shadow_client",
                "redirectUri": "https://app.test/callback",
                "scope": "user:read",
                "state": "state-1",
            },
        ),
    ]
    client.close()


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


def test_upload_media_supports_voice_metadata(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")
    captured = {}

    def fake_multipart(method, path, *, files, data=None):
        captured["method"] = method
        captured["path"] = path
        captured["files"] = files
        captured["data"] = data
        return {"url": "/shadow/uploads/voice.wav"}

    monkeypatch.setattr(client, "_multipart_request", fake_multipart)

    result = client.upload_media(
        b"voice",
        "voice.wav",
        "audio/wav",
        "message-1",
        kind="voice",
        duration_ms=1200,
        waveform_peaks=[0.1, 0.2],
        transcript_text="hello",
        transcript_language="en",
        transcript_source="runtime",
    )

    assert captured["method"] == "POST"
    assert captured["path"] == "/api/media/upload"
    assert captured["files"]["file"] == ("voice.wav", b"voice", "audio/wav")
    assert captured["data"] == {
        "messageId": "message-1",
        "kind": "voice",
        "durationMs": "1200",
        "waveformPeaks": "[0.1, 0.2]",
        "transcriptText": "hello",
        "transcriptLanguage": "en",
        "transcriptSource": "runtime",
    }
    assert result["url"] == "/shadow/uploads/voice.wav"
    client.close()


def test_call_server_app_command_multipart_wraps_input(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")
    captured = {}

    def fake_multipart(method, path, *, files, data=None):
        captured["method"] = method
        captured["path"] = path
        captured["files"] = files
        captured["data"] = data
        return {"ok": True}

    monkeypatch.setattr(client, "_multipart_request", fake_multipart)

    result = client.call_server_app_command_multipart(
        "server-1",
        "demo-desk",
        "files.import",
        input={"purpose": "import"},
        file=b"pdf",
        filename="input.pdf",
        content_type="application/pdf",
        channel_id="channel-1",
        task={"messageId": "message-1", "cardId": "card-1"},
    )

    assert captured == {
        "method": "POST",
        "path": "/api/servers/server-1/apps/demo-desk/commands/files.import",
        "files": {"file": ("input.pdf", b"pdf", "application/pdf")},
        "data": {
            "input": '{"purpose": "import"}',
            "channelId": "channel-1",
            "task": '{"messageId": "message-1", "cardId": "card-1"}',
        },
    }
    assert result["ok"] is True
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


def test_voice_message_attachment_helpers(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")
    calls = []

    def fake_put(path, json=None):
        calls.append(("PUT", path, json))
        return {"ok": True}

    def fake_post(path, json=None):
        calls.append(("POST", path, json))
        return {"ok": True}

    monkeypatch.setattr(client, "_put", fake_put)
    monkeypatch.setattr(client, "_post", fake_post)

    client.mark_voice_played("attachment-1", position_ms=500, completed=True)
    client.request_voice_transcript("attachment-1", language="en")
    client.update_voice_transcript("attachment-1", text="hello", language="en", source="runtime")

    assert calls == [
        (
            "PUT",
            "/api/attachments/attachment-1/voice-playback",
            {"positionMs": 500, "completed": True},
        ),
        (
            "POST",
            "/api/attachments/attachment-1/transcript",
            {"mode": "server", "language": "en"},
        ),
        (
            "PUT",
            "/api/attachments/attachment-1/transcript",
            {"text": "hello", "language": "en", "source": "runtime"},
        ),
    ]
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


def test_get_messages_around(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")
    captured = {}

    def fake_get(path, params=None):
        captured["path"] = path
        captured["params"] = params
        return {"messages": [], "hasMore": False}

    monkeypatch.setattr(client, "_get", fake_get)

    result = client.get_messages_around("channel-1", "message-1", limit=25)

    assert captured == {
        "path": "/api/channels/channel-1/messages/around/message-1",
        "params": {"limit": 25},
    }
    assert result == {"messages": [], "hasMore": False}
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


def test_server_desktop_layout_methods_use_shared_endpoint(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")
    captured = []

    layout = ShadowServerDesktopLayout(
        items=[
            ShadowServerDesktopLayoutBuiltinAppItem(
                id="builtin:workspace",
                kind="builtin-app",
                builtin_key="workspace",
                title="Workspace",
                x=24,
                y=56,
            )
        ],
        widgets=[
            ShadowServerDesktopStickyNoteWidget(
                id="widget:notice",
                kind="sticky-note",
                x=128,
                y=168,
                width_cells=3,
                height_cells=2,
                content="## Notice",
            ),
            ShadowServerDesktopVideoWidget(
                id="widget:youtube",
                kind="video-player",
                provider="youtube",
                x=456,
                y=168,
                width_cells=5,
                height_cells=3,
                source="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                title="Launch video",
                autoplay=False,
                muted=True,
                danmaku=False,
                show_cover=True,
            ),
            ShadowServerDesktopWebEmbedWidget(
                id="widget:docs",
                kind="web-embed",
                source_type="url",
                source="https://example.com/docs",
                x=760,
                y=168,
                width_cells=5,
                height_cells=4,
                title="Docs",
            ),
        ],
    )

    def fake_get(path):
        captured.append(("get", path, None))
        return {"version": 1, "items": [], "widgets": []}

    def fake_patch(path, json=None):
        captured.append(("patch", path, json))
        return json

    monkeypatch.setattr(client, "_get", fake_get)
    monkeypatch.setattr(client, "_patch", fake_patch)

    assert client.get_server_desktop_layout("shadow-plays")["version"] == 1
    assert client.update_server_desktop_layout("shadow-plays", layout)["widgets"][0][
        "widthCells"
    ] == 3
    assert captured == [
        ("get", "/api/servers/shadow-plays/desktop-layout", None),
        (
            "patch",
            "/api/servers/shadow-plays/desktop-layout",
            {
                "version": 1,
                "items": [
                    {
                        "id": "builtin:workspace",
                        "kind": "builtin-app",
                        "builtinKey": "workspace",
                        "title": "Workspace",
                        "x": 24,
                        "y": 56,
                    }
                ],
                "widgets": [
                    {
                        "id": "widget:notice",
                        "kind": "sticky-note",
                        "x": 128,
                        "y": 168,
                        "widthCells": 3,
                        "heightCells": 2,
                        "content": "## Notice",
                    },
                    {
                        "id": "widget:youtube",
                        "kind": "video-player",
                        "provider": "youtube",
                        "x": 456,
                        "y": 168,
                        "widthCells": 5,
                        "heightCells": 3,
                        "source": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                        "title": "Launch video",
                        "autoplay": False,
                        "muted": True,
                        "danmaku": False,
                        "showCover": True,
                    },
                    {
                        "id": "widget:docs",
                        "kind": "web-embed",
                        "sourceType": "url",
                        "source": "https://example.com/docs",
                        "x": 760,
                        "y": 168,
                        "widthCells": 5,
                        "heightCells": 4,
                        "title": "Docs",
                    },
                ],
            },
        ),
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


def test_workspace_extended_methods_use_documented_endpoints(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")
    calls = []

    def fake_get(path, *, params=None):
        calls.append(("GET", path, params))
        return []

    def fake_post(path, json=None):
        calls.append(("POST", path, json))
        return {"ok": True}

    monkeypatch.setattr(client, "_get", fake_get)
    monkeypatch.setattr(client, "_post", fake_post)

    client.batch_workspace_children("server-1", ["folder-1", None])
    client.search_workspace_folders("server-1", query="docs", limit=5)
    client.search_workspace_files("server-1", query="index", ext="md", limit=10, offset=20)
    client.clone_workspace_file("server-1", "file-1")
    client.paste_workspace_nodes(
        "server-1",
        source_workspace_id="workspace-1",
        node_ids=["node-1"],
        mode="copy",
        target_parent_id="folder-2",
    )
    client.execute_workspace_commands("server-1", [{"type": "rename", "nodeId": "node-1"}])

    assert calls == [
        (
            "POST",
            "/api/servers/server-1/workspace/children/batch",
            {"parentIds": ["folder-1", None]},
        ),
        (
            "GET",
            "/api/servers/server-1/workspace/folders/search",
            {"searchText": "docs", "limit": 5},
        ),
        (
            "GET",
            "/api/servers/server-1/workspace/files/search",
            {"searchText": "index", "ext": "md", "limit": 10, "offset": 20},
        ),
        ("POST", "/api/servers/server-1/workspace/files/file-1/clone", None),
        (
            "POST",
            "/api/servers/server-1/workspace/nodes/paste",
            {
                "sourceWorkspaceId": "workspace-1",
                "nodeIds": ["node-1"],
                "mode": "copy",
                "targetParentId": "folder-2",
            },
        ),
        (
            "POST",
            "/api/servers/server-1/workspace/commands",
            {"commands": [{"type": "rename", "nodeId": "node-1"}]},
        ),
    ]
    client.close()


def test_cloud_and_recharge_methods_use_current_api_paths(monkeypatch):
    client = ShadowClient("https://example.com", "test-token")
    calls = []

    def fake_get(path, *, params=None):
        calls.append(("GET", path, params))
        return {"ok": True}

    def fake_post(path, json=None):
        calls.append(("POST", path, json))
        return {"ok": True}

    def fake_delete(path, json=None):
        calls.append(("DELETE", path, json))
        return {"ok": True}

    monkeypatch.setattr(client, "_get", fake_get)
    monkeypatch.setattr(client, "_post", fake_post)
    monkeypatch.setattr(client, "_delete", fake_delete)

    client.list_cloud_templates(q="web", locale="zh-CN")
    client.get_cloud_template("web-app", locale="zh-CN")
    client.get_cloud_template_env_refs("web-app")
    client.list_my_cloud_templates()
    client.get_my_cloud_template("my-template")
    client.create_cloud_template(slug="demo", name="Demo", content={})
    client.list_cloud_deployments(include_history=True, limit=20, offset=40)
    client.get_cloud_deployment("deployment-1")
    client.create_cloud_deployment(
        namespace="demo",
        name="Demo",
        template_slug="web-app",
        resource_tier="standard",
        config_snapshot={},
    )
    client.cancel_cloud_deployment("deployment-1")
    client.destroy_cloud_deployment("deployment-1")
    client.reconcile_cloud_runtime_exposures(
        deployment_id="deployment-1",
        agent_id="agent-1",
        exposures=[{"id": "desk", "port": 4216, "kind": "server_app"}],
    )
    client.publish_cloud_app(
        app_key="demo-desk",
        deployment_id="deployment-1",
        server_id="server-1",
        agent_id="agent-1",
        manifest_json={"appKey": "demo-desk"},
        manifest_url="https://apps.example/.well-known/shadow-app.json",
        source_path="/workspace/demo",
        state_paths=["/workspace/demo/data"],
        release_mode="installed",
        default_permissions=["counter.count:read"],
        default_approval_mode="none",
        buddy_agent_id="buddy-1",
        grant_permissions=["counter.count:write"],
        backup_policy={"driver": "metadata"},
    )
    client.get_cloud_app_status("demo-desk", deployment_id="deployment-1", server_id="server-1")
    client.backup_cloud_app(
        "demo-desk", deployment_id="deployment-1", deployment_backup_id="backup-1"
    )
    client.restore_cloud_app(
        "demo-desk", backup_set_id="set-1", create_safety_backup=False
    )
    client.unpublish_cloud_app("demo-desk", deployment_id="deployment-1", uninstall=True)
    client.get_recharge_config()
    client.create_recharge_intent(tier="1000", idempotency_key="recharge-1")
    client.get_recharge_history(limit=10, offset=20)
    client.confirm_recharge_payment("pi_123")

    assert calls == [
        ("GET", "/api/cloud-saas/templates", {"q": "web", "locale": "zh-CN"}),
        ("GET", "/api/cloud-saas/templates/web-app", {"locale": "zh-CN"}),
        ("GET", "/api/cloud-saas/templates/web-app/env-refs", None),
        ("GET", "/api/cloud-saas/templates/mine", None),
        ("GET", "/api/cloud-saas/templates/mine/my-template", None),
        ("POST", "/api/cloud-saas/templates", {"slug": "demo", "name": "Demo", "content": {}}),
        (
            "GET",
            "/api/cloud-saas/deployments",
            {"includeHistory": "1", "limit": 20, "offset": 40},
        ),
        ("GET", "/api/cloud-saas/deployments/deployment-1", None),
        (
            "POST",
            "/api/cloud-saas/deployments",
            {
                "namespace": "demo",
                "name": "Demo",
                "templateSlug": "web-app",
                "resourceTier": "standard",
                "configSnapshot": {},
            },
        ),
        ("POST", "/api/cloud-saas/deployments/deployment-1/cancel", None),
        ("DELETE", "/api/cloud-saas/deployments/deployment-1", None),
        (
            "POST",
            "/api/cloud/exposures/runtime/reconcile",
            {
                "deploymentId": "deployment-1",
                "agentId": "agent-1",
                "exposures": [{"id": "desk", "port": 4216, "kind": "server_app"}],
            },
        ),
        (
            "POST",
            "/api/cloud/exposures/server-apps/publish",
            {
                "appKey": "demo-desk",
                "deploymentId": "deployment-1",
                "serverId": "server-1",
                "agentId": "agent-1",
                "manifest": {"appKey": "demo-desk"},
                "manifestUrl": "https://apps.example/.well-known/shadow-app.json",
                "sourcePath": "/workspace/demo",
                "statePaths": ["/workspace/demo/data"],
                "releaseMode": "installed",
                "defaultPermissions": ["counter.count:read"],
                "defaultApprovalMode": "none",
                "buddyAgentId": "buddy-1",
                "grantPermissions": ["counter.count:write"],
                "backupPolicy": {"driver": "metadata"},
            },
        ),
        (
            "GET",
            "/api/cloud/exposures/server-apps/demo-desk/status",
            {"deploymentId": "deployment-1", "serverId": "server-1"},
        ),
        (
            "POST",
            "/api/cloud/exposures/server-apps/demo-desk/backup",
            {"deploymentId": "deployment-1", "deploymentBackupId": "backup-1"},
        ),
        (
            "POST",
            "/api/cloud/exposures/server-apps/demo-desk/restore",
            {"backupSetId": "set-1", "createSafetyBackup": False},
        ),
        (
            "POST",
            "/api/cloud/exposures/server-apps/demo-desk/unpublish",
            {"deploymentId": "deployment-1", "uninstall": True},
        ),
        ("GET", "/api/v1/recharge/config", None),
        (
            "POST",
            "/api/v1/recharge/create-intent",
            {"tier": "1000", "idempotencyKey": "recharge-1"},
        ),
        ("GET", "/api/v1/recharge/history", {"limit": 10, "offset": 20}),
        ("POST", "/api/v1/recharge/confirm", {"paymentIntentId": "pi_123"}),
    ]
    client.close()
