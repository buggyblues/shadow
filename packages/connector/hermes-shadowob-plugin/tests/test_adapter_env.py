from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import adapter


def test_env_enablement_is_flat(monkeypatch):
    monkeypatch.setenv('SHADOW_BASE_URL', 'https://shadow.example.com/api')
    monkeypatch.setenv('SHADOW_TOKEN', 'tok')
    monkeypatch.setenv('SHADOW_CHANNEL_IDS', 'c1,c2')
    monkeypatch.setenv('SHADOW_HOME_CHANNEL', 'c3')
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
