import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const localeFiles = [
  '../../web/src/lib/locales/en.json',
  '../../web/src/lib/locales/zh-CN.json',
  '../../web/src/lib/locales/zh-TW.json',
  '../../web/src/lib/locales/ja.json',
  '../../web/src/lib/locales/ko.json',
]

const runtimeActivityKinds = [
  'thinking',
  'reading',
  'working',
  'editing',
  'running',
  'testing',
  'tool_call',
  'approval',
  'waiting',
  'success',
  'error',
]

function readLocale(relativePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8')) as Record<
    string,
    unknown
  >
}

function readRuntimeActivity(locale: Record<string, unknown>): Record<string, unknown> {
  return (((locale.desktopPet as Record<string, unknown>).services as Record<string, unknown>)
    .runtimeActivity ?? {}) as Record<string, unknown>
}

describe('desktop pet runtime i18n', () => {
  it('covers every runtime activity kind in all desktop locales', () => {
    for (const file of localeFiles) {
      const runtimeActivity = readRuntimeActivity(readLocale(file))

      for (const kind of runtimeActivityKinds) {
        expect(runtimeActivity[kind], `${file} is missing ${kind}`).toEqual(expect.any(String))
        expect(runtimeActivity[`${kind}WithLabel`], `${file} is missing ${kind}WithLabel`).toEqual(
          expect.any(String),
        )
      }
    }
  })
})
