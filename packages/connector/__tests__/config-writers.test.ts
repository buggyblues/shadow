import { parse as parseToml } from 'smol-toml'
import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'
import {
  mergeCcConnectConfigContent,
  mergeEnvContent,
  mergeHermesConfigContent,
  mergeOpenClawConfigContent,
  removeCcConnectProjectConfigContent,
  removeOpenClawAccountConfigContent,
  removeShadowOfficialCcConnectProviders,
} from '../src/config-writers'

describe('connector config writers', () => {
  it('merges OpenClaw JSON config without dropping existing keys', () => {
    const next = mergeOpenClawConfigContent(
      JSON.stringify({
        models: { providers: { deepseek: { model: 'deepseek-chat' } } },
        channels: {
          discord: { token: 'discord-token' },
          'openclaw-shadowob': { token: 'old', serverUrl: 'https://old.example.com' },
        },
        plugins: { allow: ['existing-plugin'], entries: { other: { enabled: true } } },
      }),
      { token: 'new-token', serverUrl: 'https://shadow.example.com' },
    )

    const parsed = JSON.parse(next)
    expect(parsed.models.providers.deepseek.model).toBe('deepseek-chat')
    expect(parsed.channels.discord.token).toBe('discord-token')
    expect(parsed.channels.shadowob.token).toBe('new-token')
    expect(parsed.channels.shadowob.serverUrl).toBe('https://shadow.example.com')
    expect(parsed.channels['openclaw-shadowob']).toBeUndefined()
    expect(parsed.plugins.allow).toEqual(['existing-plugin', 'openclaw-shadowob'])
    expect(parsed.plugins.entries.other.enabled).toBe(true)
    expect(parsed.plugins.entries['openclaw-shadowob'].enabled).toBe(true)
  })

  it('keeps separate OpenClaw Shadow accounts for multiple Buddies', () => {
    const first = mergeOpenClawConfigContent('', {
      projectName: 'claude_buddy',
      token: 'tok-1',
      serverUrl: 'https://shadow.example.com',
      buddyId: 'agent-1',
      buddyName: 'Claude Buddy',
      agentId: 'agent-1',
    })
    const next = mergeOpenClawConfigContent(first, {
      projectName: 'opencode_buddy',
      token: 'tok-2',
      serverUrl: 'https://shadow.example.com',
      buddyId: 'agent-2',
      buddyName: 'OpenCode Buddy',
      agentId: 'agent-2',
    })

    const parsed = JSON.parse(next)
    expect(parsed.channels.shadowob.token).toBeUndefined()
    expect(parsed.channels.shadowob.accounts.claude_buddy.token).toBe('tok-1')
    expect(parsed.channels.shadowob.accounts.claude_buddy.agentId).toBe('agent-1')
    expect(parsed.channels.shadowob.accounts.claude_buddy.buddyName).toBe('Claude Buddy')
    expect(parsed.channels.shadowob.accounts.opencode_buddy.token).toBe('tok-2')
    expect(parsed.channels.shadowob.accounts.opencode_buddy.agentId).toBe('agent-2')
    expect(parsed.channels.shadowob.accounts.opencode_buddy.buddyName).toBe('OpenCode Buddy')
  })

  it('removes one OpenClaw Shadow account without dropping other Buddies', () => {
    const first = mergeOpenClawConfigContent('', {
      projectName: 'claude_buddy',
      token: 'tok-1',
      serverUrl: 'https://shadow.example.com',
    })
    const second = mergeOpenClawConfigContent(first, {
      projectName: 'codex_buddy',
      token: 'tok-2',
      serverUrl: 'https://shadow.example.com',
    })
    const parsed = JSON.parse(removeOpenClawAccountConfigContent(second, 'claude_buddy'))
    expect(parsed.channels.shadowob.accounts.claude_buddy).toBeUndefined()
    expect(parsed.channels.shadowob.accounts.codex_buddy.token).toBe('tok-2')
  })

  it('adds the official OpenAI-compatible model provider to OpenClaw config and env', () => {
    const provider = {
      id: 'shadow-official',
      baseUrl: 'https://shadow.example.com/api/ai/v1',
      apiKey: 'mp_test',
      model: 'deepseek-v4-flash',
    }
    const env = mergeEnvContent('', {
      token: 'tok',
      serverUrl: 'https://shadow.example.com',
      modelProvider: provider,
    })
    expect(env).toContain('OPENAI_COMPATIBLE_BASE_URL=https://shadow.example.com/api/ai/v1')
    expect(env).toContain('OPENAI_COMPATIBLE_API_KEY=mp_test')
    expect(env).toContain('OPENAI_COMPATIBLE_MODEL_ID=deepseek-v4-flash')

    const parsed = JSON.parse(
      mergeOpenClawConfigContent(
        JSON.stringify({ models: { providers: { existing: { api: 'anthropic' } } } }),
        {
          token: 'tok',
          serverUrl: 'https://shadow.example.com',
          modelProvider: provider,
        },
      ),
    )
    expect(parsed.models.providers.existing.api).toBe('anthropic')
    expect(parsed.models.providers['shadow-official'].api).toBe('openai-completions')
    expect(parsed.models.providers['shadow-official'].apiKey).toBe(
      '${env:OPENAI_COMPATIBLE_API_KEY}',
    )
    expect(parsed.models.providers['shadow-official'].models[0].id).toBe('deepseek-v4-flash')
  })

  it('merges Hermes env and YAML config in place', () => {
    const provider = {
      id: 'shadow-official',
      baseUrl: 'https://shadow.example.com/api/ai/v1',
      apiKey: 'mp_test',
      model: 'deepseek-v4-flash',
    }
    const env = mergeEnvContent('DEEPSEEK_API_KEY=keep\nSHADOW_TOKEN=old\n', {
      token: 'new token',
      serverUrl: 'http://localhost:3000',
      agentId: 'agent-1',
      modelProvider: provider,
    })
    expect(env).toContain('DEEPSEEK_API_KEY=keep')
    expect(env).toContain('SHADOW_TOKEN="new token"')
    expect(env).toContain('SHADOW_BASE_URL=http://localhost:3000')
    expect(env).toContain('SHADOW_AGENT_ID=agent-1')
    expect(env).toContain('OPENAI_COMPATIBLE_API_KEY=mp_test')

    const yaml = mergeHermesConfigContent(
      [
        'plugins:',
        '  enabled:',
        '    - existing',
        'platforms:',
        '  slack:',
        '    enabled: true',
        '  shadowob:',
        '    extra:',
        '      mention_only: true',
      ].join('\n'),
      {
        token: 'tok',
        serverUrl: 'https://shadow.example.com',
        agentId: 'agent-1',
        modelProvider: provider,
      },
    )
    const parsed = parseYaml(yaml) as any
    expect(parsed.plugins.enabled).toEqual(['existing', 'shadowob'])
    expect(parsed.platforms.slack.enabled).toBe(true)
    expect(parsed.platforms.shadowob.enabled).toBe(true)
    expect(parsed.platforms.shadowob.token).toBe('tok')
    expect(parsed.platforms.shadowob.extra.base_url).toBe('https://shadow.example.com')
    expect(parsed.platforms.shadowob.extra.agent_id).toBe('agent-1')
    expect(parsed.platforms.shadowob.extra.mention_only).toBe(true)
    expect(parsed.model).toEqual({
      default: 'deepseek-v4-flash',
      provider: 'shadow-official',
    })
    expect(parsed.custom_providers).toEqual([
      {
        name: 'shadow-official',
        base_url: 'https://shadow.example.com/api/ai/v1',
        key_env: 'OPENAI_COMPATIBLE_API_KEY',
        model: 'deepseek-v4-flash',
      },
    ])
  })

  it('merges cc-connect TOML project and platform config', () => {
    const next = mergeCcConnectConfigContent(
      [
        'language = "zh"',
        '',
        '[[projects]]',
        'name = "existing"',
        'work_dir = "/repo"',
        'agent_type = "codex"',
        '',
        '[[projects.platforms]]',
        'type = "github"',
        '',
        '[[projects.platforms]]',
        'type = "shadowob"',
        '',
        '[projects.platforms.options]',
        'token = "old"',
        'server_url = "https://old.example.com"',
        'listen_dms = false',
      ].join('\n'),
      {
        projectName: 'existing',
        workDir: '/repo',
        agentType: 'opencode',
        token: 'new-token',
        serverUrl: 'https://shadow.example.com',
      },
    )

    const parsed = parseToml(next) as any
    expect(parsed.language).toBe('zh')
    expect(parsed.projects).toHaveLength(1)
    expect(parsed.projects[0].agent_type).toBeUndefined()
    expect(parsed.projects[0].work_dir).toBeUndefined()
    expect(parsed.projects[0].agent.type).toBe('opencode')
    expect(parsed.projects[0].agent.options.work_dir).toBe('/repo')
    expect(parsed.projects[0].platforms).toHaveLength(2)
    const shadow = parsed.projects[0].platforms.find((item: any) => item.type === 'shadowob')
    expect(shadow.options.token).toBe('new-token')
    expect(shadow.options.server_url).toBe('https://shadow.example.com')
    expect(shadow.options.listen_dms).toBe(false)
  })

  it('adds the official model provider to cc-connect project config', () => {
    const next = mergeCcConnectConfigContent('', {
      projectName: 'buddy',
      workDir: '/repo',
      agentType: 'codex',
      token: 'tok',
      serverUrl: 'https://shadow.example.com',
      modelProvider: {
        id: 'shadow-official',
        baseUrl: 'https://shadow.example.com/api/ai/v1',
        apiKey: 'mp_test',
        model: 'deepseek-v4-flash',
      },
    })

    const parsed = parseToml(next) as any
    expect(parsed.projects[0].agent.options.provider).toBe('shadow-official')
    expect(parsed.projects[0].agent.options.model).toBe('deepseek-v4-flash')
    expect(parsed.projects[0].agent.providers[0].name).toBe('shadow-official')
    expect(parsed.projects[0].agent.providers[0].base_url).toBe(
      'https://shadow.example.com/api/ai/v1',
    )
    expect(parsed.projects[0].agent.providers[0].models[0].model).toBe('deepseek-v4-flash')
  })

  it('uses the Anthropic endpoint for Claude Code and OpenAI endpoint for other cc-connect runtimes', () => {
    const provider = {
      id: 'shadow-official',
      openAIBaseUrl: 'https://shadow.example.com/api/ai/v1',
      openAIApiKey: 'mp_openai',
      anthropicBaseUrl: 'https://shadow.example.com/api/ai/anthropic',
      anthropicApiKey: 'mp_anthropic',
      model: 'deepseek-v4-flash',
    }
    const claude = parseToml(
      mergeCcConnectConfigContent('', {
        projectName: 'claude',
        workDir: '/repo',
        agentType: 'claudecode',
        token: 'tok',
        serverUrl: 'https://shadow.example.com',
        modelProvider: provider,
      }),
    ) as any
    const opencode = parseToml(
      mergeCcConnectConfigContent('', {
        projectName: 'opencode',
        workDir: '/repo',
        agentType: 'opencode',
        token: 'tok',
        serverUrl: 'https://shadow.example.com',
        modelProvider: provider,
      }),
    ) as any

    expect(claude.projects[0].agent.providers[0].base_url).toBe(
      'https://shadow.example.com/api/ai/anthropic',
    )
    expect(claude.projects[0].agent.providers[0].api_key).toBe('mp_anthropic')
    expect(opencode.projects[0].agent.providers[0].base_url).toBe(
      'https://shadow.example.com/api/ai/v1',
    )
    expect(opencode.projects[0].agent.providers[0].api_key).toBe('mp_openai')
    expect(opencode.projects[0].agent.options.model).toBe('shadow-official/deepseek-v4-flash')
    expect(opencode.projects[0].agent.providers[0].model).toBe('shadow-official/deepseek-v4-flash')
    expect(opencode.projects[0].agent.providers[0].models[0].model).toBe(
      'shadow-official/deepseek-v4-flash',
    )
  })

  it('removes the generated official provider when no model provider is requested', () => {
    const first = mergeCcConnectConfigContent('', {
      projectName: 'buddy',
      workDir: '/repo',
      agentType: 'claudecode',
      token: 'tok',
      serverUrl: 'https://shadow.example.com',
      modelProvider: {
        id: 'shadow-official',
        baseUrl: 'https://shadow.example.com/api/ai/v1',
        apiKey: 'mp_test',
        model: 'deepseek-v4-flash',
      },
    })
    const next = mergeCcConnectConfigContent(first, {
      projectName: 'buddy',
      workDir: '/repo',
      agentType: 'claudecode',
      token: 'tok-2',
      serverUrl: 'https://shadow.example.com',
    })

    const parsed = parseToml(next) as any
    expect(parsed.projects[0].agent.options.provider).toBeUndefined()
    expect(parsed.projects[0].agent.options.model).toBeUndefined()
    expect(parsed.projects[0].agent.providers).toBeUndefined()
  })

  it('keeps separate cc-connect Buddy projects with the same work directory', () => {
    const first = mergeCcConnectConfigContent('', {
      projectName: 'claude_buddy',
      workDir: '.',
      agentType: 'claudecode',
      token: 'tok-1',
      serverUrl: 'https://shadow.example.com',
    })
    const next = mergeCcConnectConfigContent(first, {
      projectName: 'opencode_buddy',
      workDir: '.',
      agentType: 'opencode',
      token: 'tok-2',
      serverUrl: 'https://shadow.example.com',
    })

    const parsed = parseToml(next) as any
    expect(parsed.projects.map((item: any) => item.name)).toEqual([
      'claude_buddy',
      'opencode_buddy',
    ])
    expect(parsed.projects[0].platforms[0].options.token).toBe('tok-1')
    expect(parsed.projects[1].platforms[0].options.token).toBe('tok-2')
  })

  it('removes one cc-connect Buddy project without dropping other projects', () => {
    const first = mergeCcConnectConfigContent('', {
      projectName: 'claude_buddy',
      workDir: '.',
      agentType: 'claudecode',
      token: 'tok-1',
      serverUrl: 'https://shadow.example.com',
    })
    const second = mergeCcConnectConfigContent(first, {
      projectName: 'codex_buddy',
      workDir: '.',
      agentType: 'codex',
      token: 'tok-2',
      serverUrl: 'https://shadow.example.com',
    })
    const parsed = parseToml(removeCcConnectProjectConfigContent(second, 'claude_buddy')) as any
    expect(parsed.projects.map((item: any) => item.name)).toEqual(['codex_buddy'])
    expect(parsed.projects[0].platforms[0].options.token).toBe('tok-2')
  })

  it('removes stale Shadow official providers from cc-connect native projects', () => {
    const first = mergeCcConnectConfigContent('', {
      projectName: 'codex_buddy',
      workDir: '.',
      agentType: 'codex',
      token: 'tok-1',
      serverUrl: 'https://shadow.example.com',
      modelProvider: {
        id: 'shadow-official',
        label: 'Shadow official',
        baseUrl: 'https://shadow.example.com/api/ai/v1',
        apiKey: 'sk-test',
        model: 'deepseek-v4-flash',
      },
    })
    const next = removeShadowOfficialCcConnectProviders(first)
    const parsed = parseToml(next) as any
    expect(parsed.projects[0].agent.options.provider).toBeUndefined()
    expect(parsed.projects[0].agent.options.model).toBeUndefined()
    expect(parsed.projects[0].agent.providers).toBeUndefined()
  })
})
