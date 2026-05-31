import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const localeDir = join(dirname(fileURLToPath(import.meta.url)), 'locales')
const localeCodes = ['en', 'ja', 'ko', 'zh-CN', 'zh-TW'] as const
const requiredMembersKeys = [
  'online',
  'offline',
  'inviteMembers',
  'addToChannel',
  'serverBuddies',
  'serverBuddy',
  'serverMembers',
  'myBuddies',
  'searchMembers',
  'notOnServer',
  'noServerBuddies',
  'noServerMembers',
  'noMyBuddies',
] as const
const requiredCommonKeys = ['bot', 'share'] as const
const requiredChannelKeys = ['members', 'linkCopied'] as const
const requiredChatKeys = [
  'deleteMessageConfirm',
  'retry',
  'saveFile',
  'copyLink',
  'saveFailed',
  'permissionDenied',
  'imageSaved',
  'shareUnavailable',
  'shareFailed',
] as const
const requiredMemberKeys = ['policyReplyAllDesc', 'policyCustomDesc', 'policyDisabledDesc'] as const

function readLocale(localeCode: (typeof localeCodes)[number]) {
  return JSON.parse(readFileSync(join(localeDir, `${localeCode}.json`), 'utf8')) as {
    common?: Record<string, string>
    channel?: Record<string, string>
    chat?: Record<string, string>
    member?: Record<string, string>
    members?: Record<string, string>
  }
}

describe('mobile locale coverage', () => {
  it.each(localeCodes)('defines shared Buddy label for %s', (localeCode) => {
    const locale = readLocale(localeCode)
    for (const key of requiredCommonKeys) {
      expect(locale.common?.[key], `${localeCode}.common.${key}`).toBeTruthy()
    }
  })

  it.each(localeCodes)('defines mobile channel keys for %s', (localeCode) => {
    const locale = readLocale(localeCode)
    for (const key of requiredChannelKeys) {
      expect(locale.channel?.[key], `${localeCode}.channel.${key}`).toBeTruthy()
    }
  })

  it.each(localeCodes)('defines mobile chat action keys for %s', (localeCode) => {
    const locale = readLocale(localeCode)
    for (const key of requiredChatKeys) {
      expect(locale.chat?.[key], `${localeCode}.chat.${key}`).toBeTruthy()
    }
  })

  it.each(localeCodes)('defines mobile member policy descriptions for %s', (localeCode) => {
    const locale = readLocale(localeCode)
    for (const key of requiredMemberKeys) {
      expect(locale.member?.[key], `${localeCode}.member.${key}`).toBeTruthy()
    }
  })

  it.each(localeCodes)('defines mobile members keys for %s', (localeCode) => {
    const locale = readLocale(localeCode)
    for (const key of requiredMembersKeys) {
      expect(locale.members?.[key], `${localeCode}.members.${key}`).toBeTruthy()
    }
  })
})
