import type { Locale } from 'date-fns'
import { enUS, ja, ko, zhCN, zhTW } from 'date-fns/locale'
import type { BuddyAgentEntry, MemberEntry } from './types'

export const quickEmojis = ['👍', '❤️', '😂', '🎉', '🤔', '👀']

export const EMPTY_MEMBER_ENTRIES: MemberEntry[] = []
export const EMPTY_BUDDY_AGENT_ENTRIES: BuddyAgentEntry[] = []

export const DATE_FNS_LOCALE_MAP: Record<string, Locale> = {
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  en: enUS,
  ja,
  ko,
}
