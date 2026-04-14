import { describe, expect, it } from 'vitest'
import {
  normalizeGroupName,
  toProviderSecretEnvKey,
  withLegacyEnvAliases,
} from '../../src/utils/env-names.js'

describe('env-names helpers', () => {
  it('normalizes empty group names to default', () => {
    expect(normalizeGroupName()).toBe('default')
    expect(normalizeGroupName('')).toBe('default')
    expect(normalizeGroupName('  ')).toBe('default')
    expect(normalizeGroupName('prod')).toBe('prod')
  })

  it('builds canonical provider env keys', () => {
    expect(toProviderSecretEnvKey('openai', 'apiKey')).toBe('OPENAI_API_KEY')
    expect(toProviderSecretEnvKey('deep-seek', 'api-key')).toBe('DEEP_SEEK_API_KEY')
    expect(toProviderSecretEnvKey('github-enterprise', 'token')).toBe('GITHUB_ENTERPRISE_TOKEN')
  })

  it('adds legacy aliases for *_API_KEY values', () => {
    expect(withLegacyEnvAliases('OPENAI_API_KEY', 'secret')).toEqual({
      OPENAI_API_KEY: 'secret',
      OPENAI_APIKEY: 'secret',
    })
    expect(withLegacyEnvAliases('GITHUB_TOKEN', 'token')).toEqual({
      GITHUB_TOKEN: 'token',
    })
  })
})
