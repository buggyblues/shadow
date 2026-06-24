import { describe, expect, it } from 'vitest'
import { assertNoReservedEnvOverrides, dedupeEnvVars, isReservedRuntimeEnvKey } from './env-vars.js'

describe('dedupeEnvVars', () => {
  it('keeps the later value for duplicate Kubernetes env names', () => {
    expect(
      dedupeEnvVars([
        { name: 'NODE_ENV', value: 'production' },
        { name: 'PATH', value: '/usr/bin' },
        { name: 'PATH', value: '/opt/runtime/bin:/usr/bin' },
      ]),
    ).toEqual([
      { name: 'NODE_ENV', value: 'production' },
      { name: 'PATH', value: '/opt/runtime/bin:/usr/bin' },
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
    expect(isReservedRuntimeEnvKey('SHADOW_AGENT_SERVER_URL')).toBe(true)
    expect(isReservedRuntimeEnvKey('SHADOW_CLOUD_DEPLOYMENT_ID')).toBe(true)
    expect(() =>
      assertNoReservedEnvOverrides(
        [{ name: 'SHADOW_AGENT_ID', value: 'agent-1' }],
        [{ name: 'SHADOW_AGENT_SERVER_URL', value: 'https://evil.example' }],
        'Plugin env',
      ),
    ).toThrow('Plugin env cannot override reserved runtime env var: SHADOW_AGENT_SERVER_URL')
  })

  it('rejects plugin env vars that shadow base env names', () => {
    expect(() =>
      assertNoReservedEnvOverrides(
        [{ name: 'SHADOW_AGENT_ID', value: 'agent-1' }],
        [{ name: 'SHADOW_AGENT_ID', value: 'agent-2' }],
        'Plugin env',
      ),
    ).toThrow('Plugin env cannot override reserved runtime env var: SHADOW_AGENT_ID')
  })

  it('allows plugin-specific env vars', () => {
    expect(() =>
      assertNoReservedEnvOverrides(
        [{ name: 'SHADOW_AGENT_ID', value: 'agent-1' }],
        [{ name: 'PLUGIN_CACHE_DIR', value: '/tmp/plugin' }],
        'Plugin env',
      ),
    ).not.toThrow()
  })
})
