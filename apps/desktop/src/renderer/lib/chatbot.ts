import type { PetState } from './game'

export type ChatRole = 'pet' | 'user'
export type PetNoticeKind = 'runtime-busy' | 'runtime-terminal'

export interface PetNoticeOptions {
  noticeKind?: PetNoticeKind
  debugSource?: string
  debugContext?: Record<string, unknown>
}

export type ChatMessage = {
  id: string
  role: ChatRole
  key?: string
  text?: string
  createdAt: number
  streaming?: boolean
  noticeKind?: PetNoticeKind
}

export function createInitialMessages(now = Date.now()): ChatMessage[] {
  return [{ id: `pet-${now}`, role: 'pet', key: 'chatbot.welcome', createdAt: now }]
}

export function createPetReply(input: string, pet: PetState, now = Date.now()): ChatMessage {
  const normalized = input.trim().toLowerCase()
  let key = 'chatbot.replyDefault'
  if (/吃|饿|feed|hungry|snack/.test(normalized)) key = 'chatbot.replyHungry'
  if (/睡|累|rest|sleep|energy/.test(normalized)) key = 'chatbot.replySleepy'
  if (/等级|经验|level|xp/.test(normalized)) key = 'chatbot.replyLevel'
  if (/通知|社区|消息|notification|community/.test(normalized)) key = 'chatbot.replyCommunity'
  if (/状态|心情|health|status|mood/.test(normalized)) key = 'chatbot.replyStatus'
  if (pet.stats.health < 30) key = 'chatbot.replySick'
  if (pet.stats.hunger < 25) key = 'chatbot.replyHungry'

  return {
    id: `pet-${now}`,
    role: 'pet',
    key,
    createdAt: now,
  }
}
