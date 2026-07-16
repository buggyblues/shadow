from shadowob_sdk import (
    ShadowChannelPolicy,
    ShadowCloudComputerConfigurationQuote,
    ShadowCloudComputerConfigurationQuoteDetails,
    ShadowComputer,
    ShadowComputerCapabilities,
    ShadowComputerDevice,
    ShadowMessageAgentChainMetadata,
    ShadowMessageCopilotContext,
    ShadowRemoteChannel,
)


def test_cloud_computer_quote_exposes_deployment_revision():
    details = ShadowCloudComputerConfigurationQuoteDetails(
        cloud_computer_id="computer-1",
        resource_tier="standard",
        pricing_version="2026-07-14",
        deployment_revision="revision-1",
        buddy_count=2,
        hourly_credits=4,
        monthly_credits=2880,
        storage_gi=25,
        exp=1784000000,
    )

    quote = ShadowCloudComputerConfigurationQuote(quote_token="quote-token", quote=details)

    assert quote.quote.deployment_revision == "revision-1"


def test_unified_computer_model_supports_local_and_cloud_devices():
    computer = ShadowComputer(
        id="local:computer-1",
        source_id="computer-1",
        kind="local",
        name="Studio Mac",
        status="online",
        device=ShadowComputerDevice(class_name="macbook", os="darwin", arch="arm64"),
        capabilities=ShadowComputerCapabilities(buddies=True, terminal=True),
        buddy_count=1,
    )

    assert computer.device.class_name == "macbook"
    assert computer.capabilities.terminal is True


def test_copilot_context_builds_message_metadata():
    context = ShadowMessageCopilotContext(
        app_key="kanban",
        space_app_id="space-app-1",
        app_name="Kanban",
        server_slug="growth",
        channel_id="inbox-1",
        channel_kind="inbox",
    )

    assert context.to_metadata() == {
        "copilotContext": {
            "kind": "space_app_copilot",
            "appKey": "kanban",
            "spaceAppId": "space-app-1",
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


def test_remote_channel_exposes_explicit_inbox_route_type():
    channel = ShadowRemoteChannel(
        id="inbox-1",
        name="Inbox",
        type="text",
        kind="server",
        route_type="buddy-inbox",
        topic="shadow:buddy-inbox:agent-1",
        is_private=True,
        policy=ShadowChannelPolicy(
            listen=True,
            reply=True,
            mention_only=False,
        ),
    )

    assert channel.route_type == "buddy-inbox"
    assert channel.kind == "server"
