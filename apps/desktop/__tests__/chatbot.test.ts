import { describe, expect, it } from 'vitest'
import { createInitialMessages, createPetReply } from '../src/renderer/lib/chatbot'
import { createDefaultPetState } from '../src/renderer/lib/game'

describe('desktop pet chatbot', () => {
  it('starts with a localized welcome message key', () => {
    const messages = createInitialMessages(1_700_000_000_000)

    expect(messages).toEqual([
      {
        id: 'pet-1700000000000',
        role: 'pet',
        key: 'chatbot.welcome',
        createdAt: 1_700_000_000_000,
      },
    ])
  })

  it('selects a contextual reply key from user input', () => {
    const pet = createDefaultPetState(1_700_000_000_000)
    const reply = createPetReply('Can you show me your level and xp?', pet, 1_700_000_060_000)

    expect(reply).toMatchObject({
      id: 'pet-1700000060000',
      role: 'pet',
      key: 'chatbot.replyLevel',
      createdAt: 1_700_000_060_000,
    })
  })

  it('prioritizes urgent pet state over generic input', () => {
    const pet = createDefaultPetState(1_700_000_000_000)
    pet.stats.hunger = 12

    expect(createPetReply('hello', pet, 1_700_000_060_000).key).toBe('chatbot.replyHungry')
  })
})
