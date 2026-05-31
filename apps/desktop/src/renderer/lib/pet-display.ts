import type { ChatMessage } from './chatbot'
import type { PetState } from './game'

export function localizedChatText(
  message: ChatMessage,
  petState: PetState,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (!message.key) return message.text ?? ''
  return t(`desktopPet.${message.key}`, {
    mood: petState.stats.mood,
    hunger: petState.stats.hunger,
    energy: petState.stats.energy,
    health: petState.stats.health,
    shells: petState.game.shells,
  })
}

export function localizedPetDisplayText(
  message: ChatMessage,
  petState: PetState,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const text = localizedChatText(message, petState, t)
  return message.role === 'pet' ? normalizePetDisplayText(text) : text
}

export function stripBracketedText(text: string) {
  let content = text
  let previous = ''
  while (content !== previous) {
    previous = content
    content = content
      .replace(/\([^()]*\)/g, '')
      .replace(/（[^（）]*）/g, '')
      .replace(/\[[^\[\]]*\]/g, '')
      .replace(/【[^【】]*】/g, '')
  }
  return content
    .replace(/\([^)]*$/g, '')
    .replace(/（[^）]*$/g, '')
    .replace(/\[[^\]]*$/g, '')
    .replace(/【[^】]*$/g, '')
}

export function normalizePetDisplayText(text: string) {
  return stripBracketedText(text)
    .replace(/\*\*/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function normalizeTtsText(text: string) {
  return stripBracketedText(text)
    .replace(/\*\*/g, '')
    .replace(/[\u{1f300}-\u{1faff}\u{2600}-\u{27bf}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
