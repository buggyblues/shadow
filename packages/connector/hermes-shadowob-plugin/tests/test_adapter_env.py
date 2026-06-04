from pathlib import Path
import sys
import asyncio
import os
import json

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import adapter


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


def test_resolve_channels_creates_owner_dm_home_channel_when_empty():
    class FakeClient:
        async def get_agent_config(self, agent_id):
            assert agent_id == 'agent-1'
            return {
                'agentId': 'agent-1',
                'botUserId': 'bot-1',
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
    instance._bot_user_id = 'bot-1'
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


def test_member_added_refreshes_remote_config_and_joins_channel():
    class FakeClient:
        async def get_agent_config(self, agent_id):
            assert agent_id == 'agent-1'
            return {
                'agentId': 'agent-1',
                'botUserId': 'bot-1',
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
    instance._bot_user_id = 'bot-1'
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
    monkeypatch.delenv('SHADOW_HOME_CHANNEL', raising=False)

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
    monkeypatch.delenv('SHADOW_HOME_CHANNEL', raising=False)
    monkeypatch.delenv('SHADOW_HOME_THREAD_ID', raising=False)

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


def test_list_chats_includes_home_channel_when_not_joined(monkeypatch):
    monkeypatch.delenv('SHADOW_HOME_CHANNEL', raising=False)

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


def test_shadowob_send_message_tool_sends_attachment_via_rest(monkeypatch):
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
    assert FakeClient.sent == [('home-1', 'HTML attached', {'thread_id': None})]
    assert FakeClient.uploaded == [('/tmp/report.html', {'message_id': 'message-1', 'kind': None})]


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
