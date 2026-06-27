import { describe, expect, it } from 'vitest'
import { assertNoReservedEnvOverrides, dedupeEnvVars, isReservedRuntimeEnvKey } from './env-vars.js'

describe('dedupeEnvVars', () => {
  it('merges duplicate PATH values without dropping the persistent user bin', () => {
    expect(
      dedupeEnvVars([
        { name: 'NODE_ENV', value: 'production' },
        { name: 'PATH', value: '/home/shadow/.local/bin:/usr/local/bin:/usr/bin' },
        { name: 'PATH', value: '/opt/runtime/bin:/usr/bin' },
      ]),
    ).toEqual([
      { name: 'NODE_ENV', value: 'production' },
      {
        name: 'PATH',
        value: '/opt/runtime/bin:/home/shadow/.local/bin:/usr/local/bin:/usr/bin',
      },
    ])
  })

  it('keeps the later value for duplicate non-path Kubernetes env names', () => {
    expect(
      dedupeEnvVars([
        { name: 'NODE_ENV', value: 'production' },
        { name: 'PLUGIN_MODE', value: 'a' },
        { name: 'PLUGIN_MODE', value: 'b' },
      ]),
    ).toEqual([
      { name: 'NODE_ENV', value: 'production' },
      { name: 'PLUGIN_MODE', value: 'b' },
    ])
  })

  it('preserves non-string Pulumi input names without trying to merge them', () => {
    const symbolicName = { toString: () => 'PATH' }
    expect(
      dedupeEnvVars([
        { name: symbolicName, value: 'a' },
        { name: symbolicName, value: 'b' },
      ]),
    ).toEqual([
      { name: symbolicName, value: 'a' },
      { name: symbolicName, value: 'b' },
    ])
  })
})

describe('assertNoReservedEnvOverrides', () => {
  it('rejects plugin env vars that target reserved runtime keys', () => {
    expect(isReservedRuntimeEnvKey('SHADOWOB_SERVER_URL')).toBe(true)
    expect(isReservedRuntimeEnvKey('SHADOWOB_CLOUD_DEPLOYMENT_ID')).toBe(true)
    expect(() =>
      assertNoReservedEnvOverrides(
        [{ name: 'SHADOWOB_AGENT_ID', value: 'agent-1' }],
        [{ name: 'SHADOWOB_SERVER_URL', value: 'https://evil.example' }],
        'Plugin env',
      ),
    ).toThrow('Plugin env cannot override reserved runtime env var: SHADOWOB_SERVER_URL')
  })

  it('rejects plugin env vars that shadow base env names', () => {
    expect(() =>
      assertNoReservedEnvOverrides(
        [{ name: 'SHADOWOB_AGENT_ID', value: 'agent-1' }],
        [{ name: 'SHADOWOB_AGENT_ID', value: 'agent-2' }],
        'Plugin env',
      ),
    ).toThrow('Plugin env cannot override reserved runtime env var: SHADOWOB_AGENT_ID')
  })

  it('allows plugin env vars to provide merged path-style runtime env names', () => {
    expect(() =>
      assertNoReservedEnvOverrides(
        [{ name: 'PATH', value: '/home/shadow/.local/bin:/usr/local/bin:/usr/bin' }],
        [
          {
            name: 'PATH',
            value: '/opt/plugin/bin:/home/shadow/.local/bin:/usr/local/bin:/usr/bin',
          },
        ],
        'Plugin env',
      ),
    ).not.toThrow()
  })

  it('allows plugin-specific env vars', () => {
    expect(() =>
      assertNoReservedEnvOverrides(
        [{ name: 'SHADOWOB_AGENT_ID', value: 'agent-1' }],
        [{ name: 'PLUGIN_CACHE_DIR', value: '/tmp/plugin' }],
        'Plugin env',
      ),
    ).not.toThrow()
  })
})
