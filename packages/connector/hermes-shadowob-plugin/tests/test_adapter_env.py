from pathlib import Path
import sys
import asyncio
import os
import json
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import adapter
from shadow_sdk import ShadowAsyncClient


def clear_shadow_context_env(monkeypatch):
    for key in (
        'SHADOW_HOME_CHANNEL',
        'SHADOW_HOME_THREAD_ID',
        'SHADOW_CURRENT_CHANNEL',
        'SHADOW_CURRENT_CHANNEL_ID',
        'SHADOW_CURRENT_THREAD_ID',
        'SHADOWOB_CHANNEL_ID',
        'SHADOWOB_THREAD_ID',
        'SHADOWOB_SERVER_ID',
        'SHADOW_SERVER_ID',
        'SHADOW_CURRENT_SERVER_ID',
        'SHADOW_CURRENT_SERVER_SLUG',
        'SHADOWOB_SERVER_SLUG',
    ):
        monkeypatch.delenv(key, raising=False)


def test_env_enablement_is_flat(monkeypatch):
    monkeypatch.setenv('SHADOW_BASE_URL', 'https://shadow.example.com/api')
    monkeypatch.setenv('SHADOW_TOKEN', 'tok')
    monkeypatch.setenv('SHADOW_CHANNEL_IDS', 'c1,c2')
    monkeypatch.setenv('SHADOW_HOME_CHANNEL', 'c3')
    monkeypatch.setenv('SHADOW_HOME_THREAD_ID', 't3')
    monkeypatch.setenv('SHADOW_MENTION_ONLY', 'true')
    monkeypatch.setenv('SHADOW_AGENT_ID', 'agent-1')
    monkeypatch.setenv('SHADOW_HEARTBEAT_INTERVAL_SECONDS', '15')
    monkeypatch.setenv(
        'SHADOW_SLASH_COMMANDS_JSON',
        '[{"name":"demo","description":"Demo command"}]',
    )

    seed = adapter._env_enablement()

    assert seed['base_url'] == 'https://shadow.example.com/api'
    assert seed['token'] == 'tok'
    assert seed['channel_ids'] == ['c1', 'c2', 'c3']
    assert seed['mention_only'] is True
    assert seed['agent_id'] == 'agent-1'
    assert seed['heartbeat_interval_seconds'] == '15'
    assert seed['slash_commands'][0]['name'] == 'demo'
    assert seed['home_channel']['chat_id'] == 'c3'
    assert seed['home_channel']['thread_id'] == 't3'
    assert 'extra' not in seed


def test_check_requirements_allows_dynamic_remote_config_without_channel(monkeypatch):
    monkeypatch.setenv('SHADOW_BASE_URL', 'https://shadow.example.com')
    monkeypatch.setenv('SHADOW_TOKEN', 'tok')
    monkeypatch.delenv('SHADOW_CHANNEL_IDS', raising=False)
    monkeypatch.delenv('SHADOW_CHANNEL_ID', raising=False)
    monkeypatch.delenv('SHADOW_HOME_CHANNEL', raising=False)
    monkeypatch.delenv('SHADOW_SERVER_IDS', raising=False)
    monkeypatch.delenv('SHADOW_AUTO_DISCOVER_CHANNELS', raising=False)

    assert adapter.check_requirements() is True


def test_collaboration_requires_multiple_buddy_mentions():
    single = {
        'metadata': {
            'mentions': [
                {
                    'kind': 'buddy',
                    'targetId': 'bot-1',
                    'userId': 'bot-1',
                    'token': '<@bot-1>',
                    'label': '@一号机',
                }
            ]
        }
    }
    multiple = {
        'metadata': {
            'mentions': [
                {
                    'kind': 'buddy',
                    'targetId': 'bot-1',
                    'userId': 'bot-1',
                    'token': '<@bot-1>',
                    'label': '@一号机',
                },
                {
                    'kind': 'buddy',
                    'targetId': 'bot-2',
                    'userId': 'bot-2',
                    'token': '<@bot-2>',
                    'label': '@二号机',
                },
            ]
        }
    }

    assert adapter._message_has_multiple_buddy_mentions(single) is False
    assert adapter._message_mentions_any_buddy(single) is True
    assert adapter._message_has_multiple_buddy_mentions(multiple) is True


def test_env_enablement_does_not_require_static_agent_or_channel(monkeypatch):
    monkeypatch.setenv('SHADOW_BASE_URL', 'https://shadow.example.com')
    monkeypatch.setenv('SHADOW_TOKEN', 'tok')
    monkeypatch.delenv('SHADOW_CHANNEL_IDS', raising=False)
    monkeypatch.delenv('SHADOW_CHANNEL_ID', raising=False)
    monkeypatch.delenv('SHADOW_HOME_CHANNEL', raising=False)
    monkeypatch.delenv('SHADOW_AGENT_ID', raising=False)

    seed = adapter._env_enablement()

    assert seed['base_url'] == 'https://shadow.example.com'
    assert seed['token'] == 'tok'
    assert 'channel_ids' not in seed
    assert 'agent_id' not in seed


def test_remote_config_entries_filter_listen_policy():
    remote_config = {
        'servers': [
            {
                'id': 'server-1',
                'name': 'Server',
                'slug': 'server',
                'channels': [
                    {'id': 'listen-1', 'name': 'general', 'policy': {'listen': True}},
                    {'id': 'skip-1', 'name': 'quiet', 'policy': {'listen': False}},
                ],
            }
        ]
    }

    entries = adapter._remote_listen_channel_entries(remote_config)

    assert [entry[0] for entry in entries] == ['listen-1']
    assert entries[0][1]['serverId'] == 'server-1'


def test_shadow_context_prompt_includes_channel_members_buddies_and_apps():
    context = adapter._shadow_context_from_bootstrap(
        {
            'channel': {'id': 'channel-1', 'name': 'general', 'kind': 'server'},
            'server': {'id': 'server-1', 'name': 'Shadow Lab', 'slug': 'shadow-lab'},
            'channels': [{'id': 'channel-1', 'name': 'general'}],
            'members': [
                {
                    'role': 'admin',
                    'userId': 'user-1',
                    'user': {
                        'id': 'user-1',
                        'username': 'admin',
                        'displayName': 'Admin',
                        'isBot': False,
                    },
                }
            ],
            'buddyInboxes': [
                {
                    'agentId': 'agent-2',
                    'name': 'Research Buddy',
                    'botUser': {'id': 'bot-2', 'username': 'research'},
                }
            ],
            'appSummaries': [{'appKey': 'cards', 'name': 'Cards', 'commands': [{'name': 'get'}]}],
            'slashCommands': {'commands': [{'name': 'ship', 'description': 'Ship it'}]},
        },
        channel_id='channel-1',
        thread_id='thread-1',
        agent_id='agent-1',
        buddy_user_id='bot-1',
        buddy_username='helper',
    )

    prompt = adapter._format_shadow_context_prompt(context)

    assert context['current']['threadId'] == 'thread-1'
    assert context['members'][0]['displayName'] == 'Admin'
    assert context['buddies'][0]['name'] == 'Research Buddy'
    assert context['serverApps'][0]['name'] == 'Cards'
    assert context['slashCommands'][0]['name'] == 'ship'
    assert 'Shadow Lab' in prompt
    assert 'Admin' in prompt
    assert 'Research Buddy' in prompt
    assert 'Cards' in prompt


def test_shadow_copilot_metadata_is_added_to_context_prompt():
    copilot = adapter._message_copilot_context(
        {
            'metadata': {
                'copilotContext': {
                    'kind': 'server_app_copilot',
                    'appKey': 'kanban',
                    'serverAppId': 'server-app-1',
                    'appName': 'Kanban',
                    'serverSlug': 'growth',
                    'channelId': 'inbox-1',
                    'channelKind': 'inbox',
                    'ignoredSecret': 'do-not-forward',
                }
            }
        }
    )
    prompt = adapter._format_shadow_context_prompt(
        {
            'current': {'channelId': 'inbox-1', 'name': 'Coordinator Inbox'},
            'copilotContext': copilot,
        }
    )

    assert copilot['appKey'] == 'kanban'
    assert copilot['channelKind'] == 'inbox'
    assert 'Copilot app context' in prompt
    assert 'kanban' in prompt
    assert 'do-not-forward' not in prompt


def test_metadata_payload_does_not_forward_collaboration():
    collaboration = {
        'id': 'collab-1',
        'rootMessageId': 'root-1',
        'buddyId': 'buddy-1',
        'turn': 1,
    }

    assert adapter._metadata_payload({'collaboration': collaboration}) is None
    assert adapter._metadata_payload({'custom': {'collaboration': collaboration}}) is None
    assert adapter._metadata_payload({'shadow_metadata': {'collaboration': collaboration}}) is None
    assert (
        adapter._metadata_payload({'shadow_metadata': {'custom': {'collaboration': collaboration}}})
        is None
    )


def test_multi_buddy_coordination_ensures_thread_and_first_reactor_speaks():
    class FakeClient:
        def __init__(self):
            self.ensured = []
            self.reactions = []

        async def ensure_thread(self, message_id, **kwargs):
            self.ensured.append((message_id, kwargs))
            return {'id': 'thread-1'}

        async def add_reaction(self, message_id, emoji):
            self.reactions.append((message_id, emoji))

        async def get_reactions(self, message_id):
            return [{'emoji': '👌', 'userIds': ['bot-1', 'bot-2']}]

    client = FakeClient()
    should_speak, metadata, reason = asyncio.run(
        adapter._coordinate_multi_buddy_thread_first_reply(
            client=client,
            message={
                'id': 'root-1',
                'content': '请一号机和二号机讨论',
                'metadata': {
                    'mentions': [
                        {'kind': 'buddy', 'userId': 'bot-1', 'targetId': 'bot-1'},
                        {'kind': 'buddy', 'userId': 'bot-2', 'targetId': 'bot-2'},
                    ]
                },
            },
            buddy_user_id='bot-1',
        )
    )

    assert should_speak is True
    assert reason is None
    assert metadata['threadId'] == 'thread-1'
    assert metadata['rootMessageId'] == 'root-1'
    assert client.ensured == [('root-1', {'name': '请一号机和二号机讨论'})]
    assert client.reactions == [('root-1', '👌')]


def test_multi_buddy_coordination_silences_non_first_reactor():
    class FakeClient:
        async def ensure_thread(self, message_id, **kwargs):
            return {'id': 'thread-1'}

        async def add_reaction(self, message_id, emoji):
            return None

        async def get_reactions(self, message_id):
            return [{'emoji': '👌', 'userIds': ['bot-2', 'bot-1']}]

    should_speak, metadata, reason = asyncio.run(
        adapter._coordinate_multi_buddy_thread_first_reply(
            client=FakeClient(),
            message={
                'id': 'root-1',
                'content': '讨论一下',
                'metadata': {
                    'mentions': [
                        {'kind': 'buddy', 'userId': 'bot-1', 'targetId': 'bot-1'},
                        {'kind': 'buddy', 'userId': 'bot-2', 'targetId': 'bot-2'},
                    ]
                },
            },
            buddy_user_id='bot-1',
        )
    )

    assert should_speak is False
    assert metadata is None
    assert 'not first' in reason


def test_metadata_payload_flattens_custom_shadow_fields():
    interactive = {'kind': 'buttons', 'id': 'ask'}
    assert adapter._metadata_payload({'custom': {'interactive': interactive}}) == {
        'interactive': interactive,
    }
    assert adapter._metadata_payload({'shadow_metadata': {'custom': {'interactive': interactive}}})[
        'interactive'
    ] == interactive


def test_gateway_shutdown_notice_detection():
    assert adapter._is_gateway_shutdown_notice(
        'WARNING: Gateway shutting down — Your current task will be interrupted.'
    )
    assert not adapter._is_gateway_shutdown_notice('Gateway is connected')


def test_outbound_metadata_preserves_delivery_without_collaboration():
    instance = adapter.ShadowOBAdapter.__new__(adapter.ShadowOBAdapter)
    instance._agent_id = 'agent-1'
    instance._buddy_user_id = 'bot-1'
    metadata = instance._metadata_for_send(
        {'shadowDelivery': {'id': 'delivery-1'}}, reply_to_id='msg-1'
    )

    assert metadata is not None
    assert metadata['shadowDelivery']['id'] == 'delivery-1'
    assert 'collaboration' not in metadata


def test_platform_send_routes_explicit_thread_target_to_thread():
    class FakeClient:
        def __init__(self):
            self.sent = []
            self.thread_sent = []
            self.reactions = []

        async def send_message(self, channel_id, content, **kwargs):
            self.sent.append((channel_id, content, kwargs))
            return {'id': 'message-1'}

        async def send_to_thread(self, thread_id, content, **kwargs):
            self.thread_sent.append((thread_id, content, kwargs))
            return {'id': 'thread-message-1'}

        async def add_reaction(self, message_id, emoji):
            self.reactions.append((message_id, emoji))

    instance = adapter.ShadowOBAdapter.__new__(adapter.ShadowOBAdapter)
    instance.client = FakeClient()
    instance._resolve_outbound_channel = lambda chat_id, metadata: ('channel-1', 'thread-1')

    async def set_activity(channel_id, status):
        return None

    instance._set_activity = set_activity
    result = asyncio.run(instance.send('channel-1', '补一个不同角度', reply_to='message-1'))

    assert result.success is True
    assert instance.client.sent == []
    assert instance.client.thread_sent == [
        (
            'thread-1',
            '补一个不同角度',
            {
                'reply_to_id': 'message-1',
            },
        )
    ]


def test_platform_send_uses_explicit_reply_target():
    class FakeClient:
        def __init__(self):
            self.sent = []

        async def send_message(self, channel_id, content, **kwargs):
            self.sent.append((channel_id, content, kwargs))
            return {'id': 'message-1'}

    instance = adapter.ShadowOBAdapter.__new__(adapter.ShadowOBAdapter)
    instance.client = FakeClient()
    instance._resolve_outbound_channel = lambda chat_id, metadata: ('channel-1', None)

    async def set_activity(channel_id, status):
        return None

    instance._set_activity = set_activity
    result = asyncio.run(instance.send('channel-1', '收到', reply_to='message-1'))

    assert result.success is True
    assert instance.client.sent == [
        (
            'channel-1',
            '收到',
            {
                'reply_to_id': 'message-1',
            },
        )
    ]


def test_platform_send_does_not_infer_reaction_from_text():
    class FakeClient:
        def __init__(self):
            self.sent = []
            self.thread_sent = []
            self.reactions = []

        async def send_message(self, channel_id, content, **kwargs):
            self.sent.append((channel_id, content, kwargs))
            return {'id': 'message-1'}

        async def send_to_thread(self, thread_id, content, **kwargs):
            self.thread_sent.append((thread_id, content, kwargs))
            return {'id': 'thread-message-1'}

        async def add_reaction(self, message_id, emoji):
            self.reactions.append((message_id, emoji))

    instance = adapter.ShadowOBAdapter.__new__(adapter.ShadowOBAdapter)
    instance.client = FakeClient()
    instance._resolve_outbound_channel = lambda chat_id, metadata: ('channel-1', None)

    async def set_activity(channel_id, status):
        return None

    instance._set_activity = set_activity
    result = asyncio.run(instance.send('channel-1', '+1', reply_to='message-1'))

    assert result.success is True
    assert instance.client.reactions == []
    assert instance.client.sent == [
        (
            'channel-1',
            '+1',
            {
                'reply_to_id': 'message-1',
            },
        )
    ]
    assert instance.client.thread_sent == []


def test_resolve_channels_creates_owner_dm_home_channel_when_empty():
    class FakeClient:
        async def get_agent_config(self, agent_id):
            assert agent_id == 'agent-1'
            return {
                'agentId': 'agent-1',
                'buddyUserId': 'bot-1',
                'ownerId': 'owner-1',
                'servers': [],
            }

        async def create_direct_channel(self, user_id):
            assert user_id == 'owner-1'
            return {'id': 'dm-owner', 'kind': 'dm', 'name': 'Owner DM'}

    class FakeSocket:
        def __init__(self):
            self.joined = []

        async def join_channel(self, channel_id):
            self.joined.append(channel_id)
            return {'ok': True}

    instance = adapter.ShadowOBAdapter.__new__(adapter.ShadowOBAdapter)
    instance.client = FakeClient()
    instance.socket = FakeSocket()
    instance._agent_id = 'agent-1'
    instance._buddy_user_id = 'bot-1'
    instance._slash_commands = []
    instance._channel_ids = []
    instance._configured_channel_ids = set()
    instance._remote_channel_ids = set()
    instance._channel_policies = {}
    instance._remote_config = None
    instance._channel_cache = {}
    instance._server_ids = []
    instance._auto_discover = False

    asyncio.run(instance._resolve_channels(sync_socket=True))

    assert instance._channel_ids == ['dm-owner']
    assert instance._channel_cache['dm-owner']['kind'] == 'dm'
    assert instance.socket.joined == ['dm-owner']


def test_task_card_reply_progress_stays_running_until_explicit_completion():
    class FakeClient:
        def __init__(self):
            self.calls = []

        async def update_task_card(self, message_id, card_id, *, status, note):
            self.calls.append(
                {
                    'message_id': message_id,
                    'card_id': card_id,
                    'status': status,
                    'note': note,
                }
            )

    instance = adapter.ShadowOBAdapter.__new__(adapter.ShadowOBAdapter)
    instance.client = FakeClient()

    asyncio.run(instance._complete_task_card('message-1', 'card-1'))

    assert instance.client.calls == [
        {
            'message_id': 'message-1',
            'card_id': 'card-1',
            'status': 'running',
            'note': 'Hermes delivered a reply; awaiting explicit task completion.',
        }
    ]


def test_task_card_failure_is_terminal():
    class FakeClient:
        def __init__(self):
            self.calls = []

        async def update_task_card(self, message_id, card_id, *, status, note):
            self.calls.append(
                {
                    'message_id': message_id,
                    'card_id': card_id,
                    'status': status,
                    'note': note,
                }
            )

    instance = adapter.ShadowOBAdapter.__new__(adapter.ShadowOBAdapter)
    instance.client = FakeClient()

    asyncio.run(instance._complete_task_card('message-1', 'card-1', failed=True, note='boom'))

    assert instance.client.calls == [
        {
            'message_id': 'message-1',
            'card_id': 'card-1',
            'status': 'failed',
            'note': 'boom',
        }
    ]


def test_hermes_task_prompt_includes_card_metadata_without_cli_policy():
    text = adapter._format_task_card_prompt(
        'Original dispatch text',
        {
            'id': 'task-card-1',
            'kind': 'task',
            'title': 'Finish Kanban card',
            'body': 'Research release notes and summarize changes.',
            'priority': 'high',
            'source': {
                'kind': 'server_app',
                'appKey': 'kanban',
                'label': 'Kanban',
            },
            'requirements': {
                'tools': [{'kind': 'shadow-app-command', 'name': 'cards.complete', 'required': True}]
            },
            'outputContract': {
                'submitCommand': {'appKey': 'kanban', 'command': 'cards.artifacts.add'}
            },
            'privacy': {'dataClass': 'server-private', 'redactionRequired': True},
            'claim': {'id': 'claim-1'},
            'data': {
                'task': {
                    'workspaceId': 'task_workspace',
                    'runtimeBinding': {
                        'taskCard': {
                            'body': 'Structured card description',
                            'data': {
                                'cardId': 'kanban-card-1',
                                'statusHooks': [{'id': 'hidden-hook'}],
                            },
                        },
                        'completedCommand': 'shadowob inbox update msg-1 task-card-1 --status completed --note "Done" --json',
                    },
                    'cliPolicy': {
                        'hooks': [{'id': 'kanban:complete'}],
                        'hookEvents': [{'command': 'shadowob app call kanban cards.complete'}],
                    },
                }
            },
        },
        message_id='msg-1',
    )

    assert 'Task requirements:' in text
    assert 'cards.complete' in text
    assert 'Task output contract:' in text
    assert 'Task privacy:' in text
    assert 'Task structured card context:' in text
    assert 'Structured card description' in text
    assert 'shadowob inbox update msg-1 task-card-1 --status completed' in text
    assert 'cliPolicy' not in text
    assert 'hookEvents' not in text
    assert 'statusHooks' not in text
    assert 'shadowob app call kanban cards.complete' not in text


def test_hermes_task_thread_comment_dispatches_from_binding(monkeypatch):
    completed = []
    events = []

    monkeypatch.setattr(adapter, 'MessageEvent', lambda **kwargs: SimpleNamespace(**kwargs))

    instance = adapter.ShadowOBAdapter.__new__(adapter.ShadowOBAdapter)
    instance.client = object()
    instance.config = SimpleNamespace(extra={})
    instance._processed_set = set()
    instance._remember_processed = lambda message_id: None
    instance._channel_ids = []
    instance._channel_cache = {'channel-1': {'id': 'channel-1', 'kind': 'channel', 'name': 'Inbox'}}
    instance._channel_policies = {
        'channel-1': {'listen': True, 'reply': False, 'config': {}, 'mentionOnly': True}
    }
    instance._buddy_user_id = 'bot-1'
    instance._buddy_username = 'buddy'
    instance._agent_id = 'agent-1'
    instance._mention_only = True
    instance._slash_commands = []
    instance._task_thread_bindings = {
        'thread-1': {
            'channel_id': 'channel-1',
            'thread_id': 'thread-1',
            'message_id': 'root-1',
            'card_id': 'card-1',
            'title': 'Bound task',
        }
    }
    instance._message_mentions_self = lambda message: False
    instance._set_runtime_current_channel = lambda *args, **kwargs: None
    instance._set_runtime_home_channel = lambda *args, **kwargs: None
    instance._resolve_inbound_media = lambda message: asyncio.sleep(
        0, result=([], [], 'text', {})
    )
    instance._shadow_channel_context = lambda channel_id, thread_id: asyncio.sleep(0, result={})
    instance._handle_shadow_control_command = lambda *args, **kwargs: asyncio.sleep(0, result=False)
    instance.build_source = lambda **kwargs: kwargs

    async def fake_complete(*args, **kwargs):
        completed.append((args, kwargs))

    async def fake_handle(event):
        events.append(event)

    instance._complete_task_card = fake_complete
    instance.handle_message = fake_handle

    asyncio.run(
        instance._handle_shadow_message(
            {
                'id': 'comment-1',
                'channelId': 'channel-1',
                'threadId': 'thread-1',
                'authorId': 'user-1',
                'content': 'Please answer the follow-up.',
                'author': {'id': 'user-1', 'username': 'admin', 'isBot': False},
            },
            source='test',
        )
    )

    assert events
    assert '[Shadow Inbox task thread comment]' in events[0].text
    assert 'Please answer the follow-up.' in events[0].text
    assert events[0].source['thread_id'] == 'thread-1'
    assert completed == []


def test_hermes_task_thread_comment_recovers_binding_from_parent(monkeypatch):
    events = []

    monkeypatch.setattr(adapter, 'MessageEvent', lambda **kwargs: SimpleNamespace(**kwargs))

    class FakeClient:
        async def get_thread(self, thread_id):
            assert thread_id == 'thread-1'
            return {
                'id': 'thread-1',
                'channelId': 'channel-1',
                'parentMessageId': 'root-1',
            }

        async def get_message(self, message_id):
            assert message_id == 'root-1'
            return {
                'id': 'root-1',
                'channelId': 'channel-1',
                'metadata': {
                    'cards': [
                        {
                            'id': 'card-1',
                            'kind': 'task',
                            'version': 1,
                            'title': 'Recovered task',
                            'status': 'running',
                            'assignee': {'agentId': 'agent-1', 'userId': 'bot-1'},
                            'data': {'task': {'threadId': 'thread-1'}},
                        }
                    ]
                },
            }

    instance = adapter.ShadowOBAdapter.__new__(adapter.ShadowOBAdapter)
    instance.client = FakeClient()
    instance.config = SimpleNamespace(extra={})
    instance._processed_set = set()
    instance._remember_processed = lambda message_id: None
    instance._channel_ids = []
    instance._channel_cache = {'channel-1': {'id': 'channel-1', 'kind': 'channel', 'name': 'Inbox'}}
    instance._channel_policies = {
        'channel-1': {'listen': True, 'reply': False, 'config': {}, 'mentionOnly': True}
    }
    instance._buddy_user_id = 'bot-1'
    instance._buddy_username = 'buddy'
    instance._agent_id = 'agent-1'
    instance._mention_only = True
    instance._slash_commands = []
    instance._task_thread_bindings = {}
    instance._message_mentions_self = lambda message: False
    instance._set_runtime_current_channel = lambda *args, **kwargs: None
    instance._set_runtime_home_channel = lambda *args, **kwargs: None
    instance._resolve_inbound_media = lambda message: asyncio.sleep(
        0, result=([], [], 'text', {})
    )
    instance._shadow_channel_context = lambda channel_id, thread_id: asyncio.sleep(0, result={})
    instance._handle_shadow_control_command = lambda *args, **kwargs: asyncio.sleep(0, result=False)
    instance._complete_task_card = lambda *args, **kwargs: asyncio.sleep(0)
    instance.build_source = lambda **kwargs: kwargs

    async def fake_handle(event):
        events.append(event)

    instance.handle_message = fake_handle

    asyncio.run(
        instance._handle_shadow_message(
            {
                'id': 'result-1',
                'channelId': 'channel-1',
                'threadId': 'thread-1',
                'authorId': 'worker-bot',
                'content': 'Worker finished the child task.',
                'author': {'id': 'worker-bot', 'username': 'worker', 'isBot': True},
                'metadata': {
                    'cards': [
                        {
                            'id': 'result-card',
                            'kind': 'task_result',
                            'version': 1,
                            'title': 'Recovered task',
                            'taskMessageId': 'child-task',
                            'taskCardId': 'child-card',
                            'status': 'completed',
                            'delivery': 'parent_task_thread',
                        }
                    ]
                },
            },
            source='test',
        )
    )

    assert instance._task_thread_bindings['thread-1']['message_id'] == 'root-1'
    assert events
    assert '[Shadow Inbox task thread comment]' in events[0].text
    assert 'Recovered task' in events[0].text
    assert 'Worker finished the child task.' in events[0].text


def test_hermes_buddy_message_defaults_to_skip_main_channel():
    instance = adapter.ShadowOBAdapter.__new__(adapter.ShadowOBAdapter)
    instance.client = object()
    instance._processed_set = set()
    instance._remember_processed = lambda message_id: None
    instance._channel_ids = []
    instance._channel_cache = {}
    instance._channel_policies = {'channel-1': {'listen': True, 'reply': True, 'config': {}}}
    instance._buddy_user_id = 'bot-1'
    instance._buddy_username = 'buddy'
    instance._agent_id = 'buddy-1'
    instance._mention_only = False
    instance._message_mentions_self = lambda message: False
    instance._set_runtime_current_channel = lambda *args, **kwargs: None
    instance._set_runtime_home_channel = lambda *args, **kwargs: None

    asyncio.run(
        instance._handle_shadow_message(
            {
                'id': 'buddy-msg-1',
                'channelId': 'channel-1',
                'authorId': 'buddy-user-2',
                'content': 'One more point.',
                'author': {'id': 'buddy-user-2', 'username': 'other-buddy', 'isBot': True},
            },
            source='test',
        )
    )


def test_hermes_buddy_message_honors_explicit_reply_to_buddy_false():
    instance = adapter.ShadowOBAdapter.__new__(adapter.ShadowOBAdapter)
    instance.client = object()
    instance._processed_set = set()
    instance._remember_processed = lambda message_id: None
    instance._channel_ids = []
    instance._channel_cache = {}
    instance._channel_policies = {
        'channel-1': {'listen': True, 'reply': True, 'config': {'replyToBuddy': False}}
    }
    instance._buddy_user_id = 'bot-1'
    instance._buddy_username = 'buddy'
    instance._agent_id = 'buddy-1'
    instance._mention_only = False
    instance._message_mentions_self = lambda message: False
    instance._set_runtime_current_channel = lambda *args, **kwargs: None
    instance._set_runtime_home_channel = lambda *args, **kwargs: None

    asyncio.run(
        instance._handle_shadow_message(
            {
                'id': 'buddy-msg-1',
                'channelId': 'channel-1',
                'authorId': 'buddy-user-2',
                'content': 'One more point.',
                'author': {'id': 'buddy-user-2', 'username': 'other-buddy', 'isBot': True},
            },
            source='test',
        )
    )


def test_shadow_client_thread_and_reactions_use_standard_routes():
    class FakeClient(ShadowAsyncClient):
        def __init__(self):
            super().__init__('https://shadow.example.com', 'tok')
            self.calls = []

        async def request(self, method, path, *, json_body=None, params=None):
            self.calls.append(
                {
                    'method': method,
                    'path': path,
                    'json_body': json_body,
                    'params': params,
                }
            )
            if path.endswith('/reactions'):
                return [{'emoji': '👌', 'userIds': ['bot-1']}]
            return {'id': 'thread-1'}

    client = FakeClient()

    thread = asyncio.run(client.ensure_thread('root-1', name='讨论'))
    reactions = asyncio.run(client.get_reactions('root-1'))

    assert thread == {'id': 'thread-1'}
    assert reactions == [{'emoji': '👌', 'userIds': ['bot-1']}]
    assert client.calls == [
        {
            'method': 'POST',
            'path': '/api/messages/root-1/thread',
            'json_body': {'name': '讨论'},
            'params': None,
        },
        {
            'method': 'GET',
            'path': '/api/messages/root-1/reactions',
            'json_body': None,
            'params': None,
        },
    ]


def test_member_added_refreshes_remote_config_and_joins_channel():
    class FakeClient:
        async def get_agent_config(self, agent_id):
            assert agent_id == 'agent-1'
            return {
                'agentId': 'agent-1',
                'buddyUserId': 'bot-1',
                'servers': [
                    {
                        'id': 'server-1',
                        'name': 'Server',
                        'channels': [
                            {
                                'id': 'channel-1',
                                'name': 'general',
                                'policy': {'listen': True, 'reply': True},
                            }
                        ],
                    }
                ],
            }

        async def get_channel(self, channel_id):
            return {'id': channel_id, 'kind': 'channel', 'name': 'general'}

    class FakeSocket:
        def __init__(self):
            self.joined = []

        async def join_channel(self, channel_id):
            self.joined.append(channel_id)
            return {'ok': True}

    instance = adapter.ShadowOBAdapter.__new__(adapter.ShadowOBAdapter)
    instance.client = FakeClient()
    instance.socket = FakeSocket()
    instance._agent_id = 'agent-1'
    instance._buddy_user_id = 'bot-1'
    instance._slash_commands = []
    instance._channel_ids = []
    instance._configured_channel_ids = set()
    instance._remote_channel_ids = set()
    instance._channel_policies = {}
    instance._remote_config = None
    instance._channel_cache = {}
    instance._server_ids = []
    instance._auto_discover = False
    instance._catchup_minutes = 0

    asyncio.run(instance._on_channel_member_added({'channelId': 'channel-1'}))

    assert instance._channel_ids == ['channel-1']
    assert instance._channel_policies['channel-1']['reply'] is True
    assert instance.socket.joined == ['channel-1']


def test_slash_command_prompt_and_interactive_block():
    commands = [
        {
            'name': 'deploy',
            'aliases': ['ship'],
            'description': 'Deploy something',
            'body': 'Run the deployment workflow.',
            'interaction': {
                'kind': 'form',
                'prompt': 'Choose a target',
                'fields': [{'id': 'target', 'kind': 'text', 'label': 'Target'}],
            },
        }
    ]

    match = adapter._slash_command_match('/ship prod', commands)

    assert match is not None
    assert match[1] == 'ship'
    assert match[2] == 'prod'
    prompt = adapter._format_slash_command_prompt('/ship prod', match)
    assert 'Slash command /deploy was invoked.' in prompt
    assert 'Run the deployment workflow.' in prompt
    block = adapter._slash_interactive_block(match, 'message-1')
    assert block['id'].endswith(':message-1')
    assert block['kind'] == 'form'


def test_hermes_slash_command_defaults_to_passthrough_without_dispatch():
    command = {'name': 'approve', 'packId': 'hermes', 'description': 'Approve'}

    assert adapter._slash_command_is_passthrough(command) is True


def test_agent_slash_command_with_body_is_not_passthrough():
    command = {'name': 'audit', 'packId': 'hermes', 'body': 'Run an audit.'}

    assert adapter._slash_command_is_passthrough(command) is False


def test_public_slash_commands_strip_runtime_only_fields():
    public = adapter._public_slash_commands(
        [
            {
                'name': 'approve',
                'description': 'Approve',
                'dispatch': 'passthrough',
                'body': 'internal',
                'packId': 'hermes',
            }
        ]
    )

    assert public == [{'name': 'approve', 'description': 'Approve', 'packId': 'hermes'}]


def test_sethome_is_handled_as_local_shadow_control_command(monkeypatch):
    clear_shadow_context_env(monkeypatch)

    class FakeClient:
        def __init__(self):
            self.sent = []

        async def send_message(self, channel_id, content, **kwargs):
            self.sent.append((channel_id, content, kwargs))
            return {'id': 'home-reply'}

    instance = adapter.ShadowOBAdapter.__new__(adapter.ShadowOBAdapter)
    instance.client = FakeClient()
    instance.extra = {}
    instance.config = type('Config', (), {'extra': {}})()

    handled = asyncio.run(
        instance._handle_shadow_control_command(
            '/sethome',
            channel_id='dm-1',
            thread_id=None,
            message_id='message-1',
        )
    )

    assert handled is True
    assert instance.extra['home_channel']['chat_id'] == 'dm-1'
    assert instance.config.extra['home_channel']['chat_id'] == 'dm-1'
    assert os.environ['SHADOW_HOME_CHANNEL'] == 'dm-1'
    assert instance.client.sent == [
        (
            'dm-1',
            'Home channel locked — this is now the Shadowob relay point.',
            {'thread_id': None, 'reply_to_id': 'message-1'},
        )
    ]


def test_runtime_home_channel_sets_env_config_and_home_channel(monkeypatch):
    clear_shadow_context_env(monkeypatch)

    instance = adapter.ShadowOBAdapter.__new__(adapter.ShadowOBAdapter)
    instance.extra = {}
    instance.config = type('Config', (), {'extra': {}})()
    instance.platform = None

    changed = instance._set_runtime_home_channel('channel-1', 'thread-1', force=False)

    assert changed is True
    assert os.environ['SHADOW_HOME_CHANNEL'] == 'channel-1'
    assert os.environ['SHADOW_HOME_THREAD_ID'] == 'thread-1'
    assert instance.extra['home_channel']['chat_id'] == 'channel-1'
    assert instance.config.extra['home_channel']['thread_id'] == 'thread-1'


def test_runtime_current_channel_sets_env_config_and_server_context(monkeypatch):
    clear_shadow_context_env(monkeypatch)

    instance = adapter.ShadowOBAdapter.__new__(adapter.ShadowOBAdapter)
    instance.extra = {}
    instance.config = type('Config', (), {'extra': {}})()

    instance._set_runtime_current_channel(
        'channel-1',
        'thread-1',
        {'name': 'general', 'serverId': 'server-1', 'serverSlug': 'server-slug'},
    )

    assert os.environ['SHADOW_CURRENT_CHANNEL'] == 'channel-1'
    assert os.environ['SHADOW_CURRENT_THREAD_ID'] == 'thread-1'
    assert os.environ['SHADOW_CURRENT_SERVER_ID'] == 'server-1'
    assert os.environ['SHADOW_CURRENT_SERVER_SLUG'] == 'server-slug'
    assert 'SHADOWOB_SERVER_ID' not in os.environ
    assert 'SHADOW_SERVER_ID' not in os.environ
    assert instance.extra['current_channel']['chat_id'] == 'channel-1'
    assert instance.config.extra['current_channel']['server_id'] == 'server-1'


def test_list_chats_includes_home_channel_when_not_joined(monkeypatch):
    clear_shadow_context_env(monkeypatch)

    instance = adapter.ShadowOBAdapter.__new__(adapter.ShadowOBAdapter)
    instance.config = type('Config', (), {'extra': {'home_channel': {'chat_id': 'home-1'}}})()
    instance._channel_ids = []
    instance._channel_cache = {'home-1': {'id': 'home-1', 'kind': 'dm', 'name': 'Home DM'}}

    chats = asyncio.run(instance.list_chats())

    assert chats == [{'id': 'home-1', 'name': 'Home DM', 'type': 'dm'}]


def test_register_exposes_shadowob_send_message_tool():
    class FakeContext:
        def __init__(self):
            self.tools = []
            self.platforms = []

        def register_tool(self, **kwargs):
            self.tools.append(kwargs)

        def register_platform(self, **kwargs):
            self.platforms.append(kwargs)

    ctx = FakeContext()

    adapter.register(ctx)

    assert ctx.tools[0]['name'] == 'shadowob_send_message'
    assert ctx.tools[0]['toolset'] == 'shadowob'
    assert ctx.tools[0]['is_async'] is True
    assert set(ctx.tools[0]['schema']['parameters']['properties']['action']['enum']) == {
        'send',
        'upload-file',
        'send-voice',
        'list',
        'react',
        'edit',
        'delete',
        'ensure-thread',
    }
    assert ctx.tools[0]['schema']['parameters']['properties']['message_id']['type'] == 'string'
    assert ctx.tools[0]['schema']['parameters']['properties']['emoji']['type'] == 'string'
    assert ctx.tools[0]['schema']['parameters']['properties']['parent_message_id']['type'] == 'string'
    assert ctx.tools[0]['schema']['parameters']['properties']['attachments']['type'] == 'array'
    assert ctx.platforms[0]['name'] == 'shadowob'


def test_shadowob_send_message_tool_extracts_media_and_attachment_paths():
    media, cleaned = adapter._shadowob_tool_media(
        {'attachments': [{'path': '/tmp/report.html', 'kind': 'document'}]},
        'Here is the file MEDIA:/tmp/chart.png',
    )

    assert cleaned == 'Here is the file'
    assert media == [
        {'path': '/tmp/chart.png', 'is_voice': False},
        {'path': '/tmp/report.html', 'kind': 'document', 'is_voice': False},
    ]


def test_default_auto_skills_include_shadow_context_and_server_apps():
    assert adapter._merge_auto_skills(None) == ['shadowob', 'shadow-server-app']
    assert adapter._merge_auto_skills(['custom', 'shadowob']) == [
        'custom',
        'shadowob',
        'shadow-server-app',
    ]


def test_shadowob_send_message_tool_sends_attachment_via_rest(monkeypatch):
    clear_shadow_context_env(monkeypatch)
    monkeypatch.setenv('SHADOW_BASE_URL', 'https://shadow.example.com')
    monkeypatch.setenv('SHADOW_TOKEN', 'tok')
    monkeypatch.setenv('SHADOW_HOME_CHANNEL', 'home-1')

    class FakeClient:
        sent = []
        uploaded = []

        def __init__(self, base_url, token):
            self.base_url = base_url
            self.token = token

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return None

        async def send_message(self, channel_id, content, **kwargs):
            self.sent.append((channel_id, content, kwargs))
            return {'id': 'message-1'}

        async def upload_media_from_url(self, path, **kwargs):
            self.uploaded.append((path, kwargs))
            return {'id': 'attachment-1', 'path': path}

    monkeypatch.setattr(adapter, 'ShadowAsyncClient', FakeClient)

    result = json.loads(
        asyncio.run(
            adapter._shadowob_send_message_tool(
                {'message': 'HTML attached', 'attachments': ['/tmp/report.html']}
            )
        )
    )

    assert result['success'] is True
    assert result['message_id'] == 'message-1'
    assert FakeClient.sent == [('home-1', 'HTML attached', {})]
    assert FakeClient.uploaded == [('/tmp/report.html', {'message_id': 'message-1', 'kind': None})]


def test_shadowob_send_message_tool_defaults_to_current_channel(monkeypatch):
    monkeypatch.setenv('SHADOW_BASE_URL', 'https://shadow.example.com')
    monkeypatch.setenv('SHADOW_TOKEN', 'tok')
    monkeypatch.setenv('SHADOW_HOME_CHANNEL', 'home-1')
    monkeypatch.setenv('SHADOW_CURRENT_CHANNEL', 'channel-1')
    monkeypatch.setenv('SHADOW_CURRENT_THREAD_ID', 'thread-1')

    class FakeClient:
        sent = []
        thread_sent = []

        def __init__(self, base_url, token):
            self.base_url = base_url
            self.token = token

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return None

        async def send_message(self, channel_id, content, **kwargs):
            self.sent.append((channel_id, content, kwargs))
            return {'id': 'message-1'}

        async def send_to_thread(self, thread_id, content, **kwargs):
            self.thread_sent.append((thread_id, content, kwargs))
            return {'id': 'thread-message-1'}

    monkeypatch.setattr(adapter, 'ShadowAsyncClient', FakeClient)

    result = json.loads(asyncio.run(adapter._shadowob_send_message_tool({'message': 'Current'})))

    assert result['success'] is True
    assert result['channel_id'] == 'channel-1'
    assert result['thread_id'] == 'thread-1'
    assert FakeClient.sent == []
    assert FakeClient.thread_sent == [('thread-1', 'Current', {})]


def test_shadowob_send_message_tool_ensures_thread(monkeypatch):
    clear_shadow_context_env(monkeypatch)
    monkeypatch.setenv('SHADOW_BASE_URL', 'https://shadow.example.com')
    monkeypatch.setenv('SHADOW_TOKEN', 'tok')

    class FakeClient:
        ensured = []

        def __init__(self, base_url, token):
            self.base_url = base_url
            self.token = token

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return None

        async def ensure_thread(self, parent_message_id, **kwargs):
            self.ensured.append((parent_message_id, kwargs))
            return {
                'id': 'thread-1',
                'channelId': 'channel-1',
                'parentMessageId': parent_message_id,
            }

    monkeypatch.setattr(adapter, 'ShadowAsyncClient', FakeClient)
    inbound_token = adapter.CURRENT_INBOUND_SHADOW_MESSAGE.set(
        {'id': 'message-1', 'channelId': 'channel-1'}
    )
    try:
        result = json.loads(
            asyncio.run(
                adapter._shadowob_send_message_tool(
                    {'action': 'ensure-thread', 'name': '夜宵讨论'}
                )
            )
        )
    finally:
        adapter.CURRENT_INBOUND_SHADOW_MESSAGE.reset(inbound_token)

    assert result['success'] is True
    assert result['action'] == 'ensure-thread'
    assert result['thread_id'] == 'thread-1'
    assert FakeClient.ensured == [('message-1', {'name': '夜宵讨论'})]


def test_shadowob_send_message_tool_blocks_plain_current_channel_send_during_inbound_message(
    monkeypatch,
):
    monkeypatch.setenv('SHADOW_BASE_URL', 'https://shadow.example.com')
    monkeypatch.setenv('SHADOW_TOKEN', 'tok')
    monkeypatch.setenv('SHADOW_CURRENT_CHANNEL', 'channel-1')

    class FakeClient:
        sent = []

        def __init__(self, base_url, token):
            self.base_url = base_url
            self.token = token

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return None

        async def send_message(self, channel_id, content, **kwargs):
            self.sent.append((channel_id, content, kwargs))
            return {'id': 'message-1'}

    monkeypatch.setattr(adapter, 'ShadowAsyncClient', FakeClient)
    token = adapter.CURRENT_INBOUND_SHADOW_MESSAGE.set(
        {'id': 'inbound-1', 'channelId': 'channel-1'}
    )
    try:
        result = json.loads(
            asyncio.run(adapter._shadowob_send_message_tool({'message': 'Plain reply'}))
        )
    finally:
        adapter.CURRENT_INBOUND_SHADOW_MESSAGE.reset(token)

    assert result['error']
    assert result['code'] == 'PLAIN_CURRENT_CHANNEL_SEND_BLOCKED'
    assert FakeClient.sent == []


def test_shadowob_send_message_tool_routes_send_after_ensured_thread(monkeypatch):
    clear_shadow_context_env(monkeypatch)
    monkeypatch.setenv('SHADOW_BASE_URL', 'https://shadow.example.com')
    monkeypatch.setenv('SHADOW_TOKEN', 'tok')
    monkeypatch.setenv('SHADOW_CURRENT_CHANNEL', 'channel-1')

    class FakeClient:
        sent = []
        thread_sent = []

        def __init__(self, base_url, token):
            self.base_url = base_url
            self.token = token

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return None

        async def send_message(self, channel_id, content, **kwargs):
            self.sent.append((channel_id, content, kwargs))
            return {'id': 'message-1'}

        async def send_to_thread(self, thread_id, content, **kwargs):
            self.thread_sent.append((thread_id, content, kwargs))
            return {'id': 'thread-message-1'}

    monkeypatch.setattr(adapter, 'ShadowAsyncClient', FakeClient)
    inbound_token = adapter.CURRENT_INBOUND_SHADOW_MESSAGE.set(
        {'id': 'message-1', 'channelId': 'channel-1'}
    )
    try:
        result = json.loads(
            asyncio.run(adapter._shadowob_send_message_tool({'message': '放到线程里', 'thread_id': 'thread-1'}))
        )
    finally:
        adapter.CURRENT_INBOUND_SHADOW_MESSAGE.reset(inbound_token)

    assert result['success'] is True
    assert result['thread_id'] == 'thread-1'
    assert FakeClient.sent == []
    assert FakeClient.thread_sent == [
        (
            'thread-1',
            '放到线程里',
            {},
        )
    ]


def test_shadowob_send_message_tool_sends_attachment_without_collaboration(monkeypatch):
    clear_shadow_context_env(monkeypatch)
    monkeypatch.setenv('SHADOW_BASE_URL', 'https://shadow.example.com')
    monkeypatch.setenv('SHADOW_TOKEN', 'tok')
    monkeypatch.setenv('SHADOW_CURRENT_CHANNEL', 'channel-1')

    class LiveAdapter:
        _agent_id = 'agent-1'
        _buddy_user_id = 'bot-1'

    class FakeClient:
        sent = []
        uploaded = []

        def __init__(self, base_url, token):
            self.base_url = base_url
            self.token = token

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return None

        async def send_message(self, channel_id, content, **kwargs):
            self.sent.append((channel_id, content, kwargs))
            return {'id': 'message-1'}

        async def upload_media_from_url(self, path, **kwargs):
            self.uploaded.append((path, kwargs))
            return {'id': 'attachment-1', 'path': path}

    monkeypatch.setattr(adapter, '_shadowob_live_adapter', lambda: LiveAdapter())
    monkeypatch.setattr(adapter, 'ShadowAsyncClient', FakeClient)
    result = json.loads(
        asyncio.run(
            adapter._shadowob_send_message_tool(
                {
                    'message': 'Tool reply',
                    'attachments': ['/tmp/report.html'],
                    'reply_to_message_id': 'buddy-parent-1',
                }
            )
        )
    )

    assert result['success'] is True
    assert result['attachments'] == [{'id': 'attachment-1', 'path': '/tmp/report.html'}]
    assert FakeClient.sent == [
        (
            'channel-1',
            'Tool reply',
            {
                'reply_to_id': 'buddy-parent-1',
            },
        )
    ]
    assert FakeClient.uploaded == [('/tmp/report.html', {'message_id': 'message-1', 'kind': None})]


def test_shadowob_send_message_tool_routes_explicit_thread_attachment(monkeypatch):
    clear_shadow_context_env(monkeypatch)
    monkeypatch.setenv('SHADOW_BASE_URL', 'https://shadow.example.com')
    monkeypatch.setenv('SHADOW_TOKEN', 'tok')
    monkeypatch.setenv('SHADOW_CURRENT_CHANNEL', 'channel-1')

    class LiveAdapter:
        _agent_id = 'agent-1'
        _buddy_user_id = 'bot-1'

    class FakeClient:
        sent = []
        thread_sent = []
        uploaded = []

        def __init__(self, base_url, token):
            self.base_url = base_url
            self.token = token

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return None

        async def send_message(self, channel_id, content, **kwargs):
            self.sent.append((channel_id, content, kwargs))
            return {'id': 'message-1'}

        async def send_to_thread(self, thread_id, content, **kwargs):
            self.thread_sent.append((thread_id, content, kwargs))
            return {'id': 'thread-message-1'}

        async def upload_media_from_url(self, path, **kwargs):
            self.uploaded.append((path, kwargs))
            return {'id': 'attachment-1', 'path': path}

    monkeypatch.setattr(adapter, '_shadowob_live_adapter', lambda: LiveAdapter())
    monkeypatch.setattr(adapter, 'ShadowAsyncClient', FakeClient)
    result = json.loads(
        asyncio.run(
            adapter._shadowob_send_message_tool(
                {
                    'message': 'Tool reply',
                    'attachments': ['/tmp/report.html'],
                    'thread_id': 'thread-1',
                    'reply_to_message_id': 'buddy-parent-1',
                }
            )
        )
    )

    assert result['success'] is True
    assert FakeClient.sent == []
    assert FakeClient.thread_sent == [
        (
            'thread-1',
            'Tool reply',
            {
                'reply_to_id': 'buddy-parent-1',
            },
        )
    ]
    assert FakeClient.uploaded == [
        ('/tmp/report.html', {'message_id': 'thread-message-1', 'kind': None})
    ]


def test_shadowob_send_message_tool_supports_openclaw_message_actions(monkeypatch):
    clear_shadow_context_env(monkeypatch)
    monkeypatch.setenv('SHADOW_BASE_URL', 'https://shadow.example.com')
    monkeypatch.setenv('SHADOW_TOKEN', 'tok')

    class FakeClient:
        edited = []
        deleted = []
        reactions = []

        def __init__(self, base_url, token):
            self.base_url = base_url
            self.token = token

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return None

        async def edit_message(self, message_id, content):
            self.edited.append((message_id, content))
            return {'id': message_id, 'content': content}

        async def delete_message(self, message_id):
            self.deleted.append(message_id)

        async def add_reaction(self, message_id, emoji):
            self.reactions.append((message_id, emoji))

    monkeypatch.setattr(adapter, 'ShadowAsyncClient', FakeClient)

    edit_result = json.loads(
        asyncio.run(
            adapter._shadowob_send_message_tool(
                {'action': 'edit', 'message_id': 'message-1', 'message': 'Updated'}
            )
        )
    )
    react_result = json.loads(
        asyncio.run(
            adapter._shadowob_send_message_tool(
                {'action': 'react', 'message_id': 'message-1', 'emoji': '+1'}
            )
        )
    )
    delete_result = json.loads(
        asyncio.run(
            adapter._shadowob_send_message_tool({'action': 'delete', 'message_id': 'message-1'})
        )
    )

    assert edit_result['success'] is True
    assert edit_result['action'] == 'edit'
    assert react_result['success'] is True
    assert react_result['action'] == 'react'
    assert delete_result['success'] is True
    assert delete_result['action'] == 'delete'
    assert FakeClient.edited == [('message-1', 'Updated')]
    assert FakeClient.reactions == [('message-1', '+1')]
    assert FakeClient.deleted == ['message-1']


def test_platform_send_suppresses_final_text_after_fulfilled_shadow_action():
    instance = adapter.ShadowOBAdapter.__new__(adapter.ShadowOBAdapter)
    instance.client = None

    inbound_token = adapter.CURRENT_INBOUND_SHADOW_MESSAGE.set(
        {'id': 'message-1', 'channelId': 'channel-1'}
    )
    effects_token = adapter.CURRENT_SHADOW_TOOL_EFFECTS.set({})
    try:
        adapter._record_shadow_tool_effect('react', reply_fulfilled=True)
        result = asyncio.run(instance.send('channel-1', '已点赞'))
    finally:
        adapter.CURRENT_SHADOW_TOOL_EFFECTS.reset(effects_token)
        adapter.CURRENT_INBOUND_SHADOW_MESSAGE.reset(inbound_token)

    assert result.success is True
    assert result.message_id == ''
    assert result.raw_response == {
        'suppressed': True,
        'reason': 'shadow_tool_action_fulfilled',
    }


def test_platform_file_send_uses_current_channel_when_chat_id_is_home(monkeypatch):
    clear_shadow_context_env(monkeypatch)

    class FakeSendResult:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)

    class FakeClient:
        def __init__(self):
            self.sent = []
            self.uploaded = []

        async def send_message(self, channel_id, content, **kwargs):
            self.sent.append((channel_id, content, kwargs))
            return {'id': 'message-1'}

        async def upload_media_from_path(self, path, **kwargs):
            self.uploaded.append((path, kwargs))
            return {'id': 'attachment-1'}

    monkeypatch.setattr(adapter, 'SendResult', FakeSendResult)

    instance = adapter.ShadowOBAdapter.__new__(adapter.ShadowOBAdapter)
    instance.client = FakeClient()
    instance.socket = None
    instance._activity_clear_tasks = {}
    instance.config = type(
        'Config',
        (),
        {
            'extra': {
                'home_channel': {'chat_id': 'home-1'},
                'current_channel': {'chat_id': 'channel-1', 'thread_id': 'thread-1'},
            }
        },
    )()

    result = asyncio.run(instance._send_file('home-1', '/tmp/report.html', caption='Report'))

    assert result.success is True
    assert instance.client.sent == [('channel-1', 'Report', {'thread_id': 'thread-1', 'reply_to_id': None, 'metadata': None})]
    assert instance.client.uploaded == [
        (
            '/tmp/report.html',
            {
                'message_id': 'message-1',
                'kind': None,
                'duration_ms': None,
                'waveform_peaks': None,
                'transcript_text': None,
                'transcript_language': None,
                'transcript_source': None,
            },
        )
    ]


def test_runner_readiness_file_is_written_after_shadow_transport_ready(tmp_path):
    class FakeSocket:
        connected = True

    ready_file = tmp_path / 'ready.json'
    instance = adapter.ShadowOBAdapter.__new__(adapter.ShadowOBAdapter)
    instance._ready_file = str(ready_file)
    instance._agent_id = 'agent-1'
    instance._channel_ids = ['dm-1']
    instance.socket = FakeSocket()
    instance._rest_only = False

    instance._mark_runner_ready()

    payload = json.loads(ready_file.read_text())
    assert payload['platform'] == 'shadowob'
    assert payload['agent_id'] == 'agent-1'
    assert payload['channels'] == ['dm-1']
    assert payload['socket'] is True
    assert payload['rest_only'] is False


def test_runner_readiness_file_is_cleared_on_disconnect_path(tmp_path):
    ready_file = tmp_path / 'ready.json'
    ready_file.write_text('{}')
    instance = adapter.ShadowOBAdapter.__new__(adapter.ShadowOBAdapter)
    instance._ready_file = str(ready_file)

    instance._clear_runner_ready()

    assert not ready_file.exists()


def test_interactive_response_text_appends_shadow_context():
    message = {
        'metadata': {
            'interactiveResponse': {
                'blockId': 'block-1',
                'actionId': 'approve',
                'value': 'yes',
                'values': {'comment': 'ok'},
            }
        }
    }

    text = adapter._interactive_response_text('Clicked approve', message)

    assert 'Clicked approve' in text
    assert '[Shadow interactive response]' in text
    assert 'actionId: approve' in text
    assert '"comment": "ok"' in text


def test_interactive_response_text_includes_source_followup_prompt():
    message = {
        'metadata': {
            'interactiveResponse': {
                'sourceMessageId': 'source-1',
                'blockId': 'block-1',
                'actionId': 'ok',
                'value': 'ok',
            }
        }
    }
    source = {
        'content': 'Choose an action',
        'metadata': {
            'interactive': {
                'prompt': 'Confirm the action',
                'responsePrompt': 'Reply exactly DONE.',
            }
        },
    }

    text = adapter._interactive_response_text('', message, source)

    assert 'sourceMessage: Choose an action' in text
    assert 'sourcePrompt: Confirm the action' in text
    assert 'followUpInstruction: Reply exactly DONE.' in text
