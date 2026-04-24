"""Basic unit tests for the Shadow Python SDK client initialization."""

from shadowob_sdk import ShadowClient, ShadowSocket


def test_client_creation():
    client = ShadowClient("https://example.com", "test-token")
    assert client._base_url == "https://example.com"
    assert client._token == "test-token"
    client.close()


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
                    "reply": True,
                    "mentionOnly": False,
                }
            ]
        },
    }
    assert result == {"id": "p1", "serverId": "srv-1", "channelId": "ch-1", "reply": True}
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
