import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const localeDir = join(dirname(fileURLToPath(import.meta.url)), 'locales')
const localeCodes = ['en', 'ja', 'ko', 'zh-CN', 'zh-TW'] as const

function connectorCopy(localeCode: (typeof localeCodes)[number]) {
  const locale = JSON.parse(readFileSync(join(localeDir, `${localeCode}.json`), 'utf8')) as {
    cloudComputers?: {
      connectors?: {
        useTokenInstead?: string
        access?: Record<string, string>
        accessHint?: Record<string, string>
        filter?: Record<string, string>
      }
    }
  }
  return locale.cloudComputers?.connectors
}

describe('web connector locale coverage', () => {
  it.each(localeCodes)('defines access states and filters for %s', (localeCode) => {
    const connectors = connectorCopy(localeCode)
    expect(connectors?.useTokenInstead).toBeTruthy()
    for (const key of [
      'oauth',
      'oauthUnavailable',
      'manual',
      'direct',
      'oauthConnected',
      'credentialsConnected',
    ]) {
      expect(connectors?.access?.[key]).toBeTruthy()
    }
    for (const key of ['oauth', 'manual', 'direct']) {
      expect(connectors?.accessHint?.[key]).toBeTruthy()
      expect(connectors?.filter?.[key]).toBeTruthy()
    }
  })
})
