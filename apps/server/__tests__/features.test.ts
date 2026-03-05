import { describe, expect, it } from 'vitest'
import { reactionSchema, sendMessageSchema } from '../src/validators/message.schema'
import {
  createServerSchema,
  joinServerSchema,
  updateServerSchema,
} from '../src/validators/server.schema'

describe('Server validators (new fields)', () => {
  describe('createServerSchema', () => {
    it('should accept name only', () => {
      const result = createServerSchema.safeParse({ name: 'My Server' })
      expect(result.success).toBe(true)
    })

    it('should accept name with description', () => {
      const result = createServerSchema.safeParse({
        name: 'My Server',
        description: 'A cool server',
      })
      expect(result.success).toBe(true)
    })

    it('should accept name with isPublic flag', () => {
      const result = createServerSchema.safeParse({
        name: 'My Server',
        isPublic: true,
      })
      expect(result.success).toBe(true)
    })

    it('should accept all fields together', () => {
      const result = createServerSchema.safeParse({
        name: 'My Server',
        description: 'A cool server for gamers',
        iconUrl: 'https://example.com/icon.png',
        isPublic: true,
      })
      expect(result.success).toBe(true)
    })

    it('should reject description over 500 chars', () => {
      const result = createServerSchema.safeParse({
        name: 'My Server',
        description: 'x'.repeat(501),
      })
      expect(result.success).toBe(false)
    })

    it('should accept description at 500 chars', () => {
      const result = createServerSchema.safeParse({
        name: 'My Server',
        description: 'x'.repeat(500),
      })
      expect(result.success).toBe(true)
    })
  })

  describe('updateServerSchema', () => {
    it('should accept description update', () => {
      const result = updateServerSchema.safeParse({
        description: 'Updated description',
      })
      expect(result.success).toBe(true)
    })

    it('should accept isPublic update', () => {
      const result = updateServerSchema.safeParse({
        isPublic: true,
      })
      expect(result.success).toBe(true)
    })

    it('should accept nullable description', () => {
      const result = updateServerSchema.safeParse({
        description: null,
      })
      expect(result.success).toBe(true)
    })
  })

  describe('joinServerSchema', () => {
    it('should accept valid 8-char invite code', () => {
      const result = joinServerSchema.safeParse({ inviteCode: 'abcd1234' })
      expect(result.success).toBe(true)
    })

    it('should reject short invite code', () => {
      const result = joinServerSchema.safeParse({ inviteCode: 'abc' })
      expect(result.success).toBe(false)
    })

    it('should reject long invite code', () => {
      const result = joinServerSchema.safeParse({ inviteCode: 'abcdefghi' })
      expect(result.success).toBe(false)
    })
  })
})

describe('Message validators (reactions)', () => {
  describe('reactionSchema', () => {
    it('should accept valid emoji', () => {
      const result = reactionSchema.safeParse({ emoji: '👍' })
      expect(result.success).toBe(true)
    })

    it('should accept emoji string', () => {
      const result = reactionSchema.safeParse({ emoji: '❤️' })
      expect(result.success).toBe(true)
    })

    it('should reject empty emoji', () => {
      const result = reactionSchema.safeParse({ emoji: '' })
      expect(result.success).toBe(false)
    })
  })

  describe('sendMessageSchema', () => {
    it('should accept message with replyToId', () => {
      const result = sendMessageSchema.safeParse({
        content: 'Hello!',
        replyToId: '550e8400-e29b-41d4-a716-446655440000',
      })
      expect(result.success).toBe(true)
    })

    it('should accept message without replyToId', () => {
      const result = sendMessageSchema.safeParse({
        content: 'Hello!',
      })
      expect(result.success).toBe(true)
    })
  })
})
