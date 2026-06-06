from shadowob_sdk import ShadowMessageCopilotContext


def test_copilot_context_builds_message_metadata():
    context = ShadowMessageCopilotContext(
        app_key="kanban",
        server_app_id="server-app-1",
        app_name="Kanban",
        server_slug="growth",
        channel_id="inbox-1",
        channel_kind="inbox",
    )

    assert context.to_metadata() == {
        "copilotContext": {
            "kind": "server_app_copilot",
            "appKey": "kanban",
            "serverAppId": "server-app-1",
            "appName": "Kanban",
            "serverSlug": "growth",
            "channelId": "inbox-1",
            "channelKind": "inbox",
        }
    }
