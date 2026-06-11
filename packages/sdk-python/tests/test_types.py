from shadowob_sdk import ShadowMessageAgentChainMetadata, ShadowMessageCopilotContext


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


def test_agent_chain_builds_message_metadata():
    agent_chain = ShadowMessageAgentChainMetadata(
        agent_id="brandscout",
        depth=1,
        participants=["bot-user-1"],
        started_at=1802000000000,
        root_message_id="message-1",
    )

    assert agent_chain.to_metadata() == {
        "agentChain": {
            "agentId": "brandscout",
            "depth": 1,
            "participants": ["bot-user-1"],
            "startedAt": 1802000000000,
            "rootMessageId": "message-1",
        }
    }
