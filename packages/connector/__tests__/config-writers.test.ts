import { parse as parseToml } from 'smol-toml'
import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'
import {
  mergeCcConnectConfigContent,
  mergeEnvContent,
  mergeHermesConfigContent,
  mergeOpenClawConfigContent,
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

  it('merges Hermes env and YAML config in place', () => {
    const env = mergeEnvContent('DEEPSEEK_API_KEY=keep\nSHADOW_TOKEN=old\n', {
      token: 'new token',
      serverUrl: 'http://localhost:3000',
    })
    expect(env).toContain('DEEPSEEK_API_KEY=keep')
    expect(env).toContain('SHADOW_TOKEN="new token"')
    expect(env).toContain('SHADOW_BASE_URL=http://localhost:3000')

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
      { token: 'tok', serverUrl: 'https://shadow.example.com' },
    )
    const parsed = parseYaml(yaml) as any
    expect(parsed.plugins.enabled).toEqual(['existing', 'shadowob'])
    expect(parsed.platforms.slack.enabled).toBe(true)
    expect(parsed.platforms.shadowob.enabled).toBe(true)
    expect(parsed.platforms.shadowob.token).toBe('tok')
    expect(parsed.platforms.shadowob.extra.base_url).toBe('https://shadow.example.com')
    expect(parsed.platforms.shadowob.extra.mention_only).toBe(true)
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
})
