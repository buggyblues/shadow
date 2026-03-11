import { describe, expect, it } from 'vitest'
import { loginSchema, registerSchema } from '../src/validators/auth.schema'
import { createChannelSchema, updateChannelSchema } from '../src/validators/channel.schema'
import {
  createThreadSchema,
  reactionSchema,
  sendMessageSchema,
  updateMessageSchema,
} from '../src/validators/message.schema'
import {
  createServerSchema,
  joinServerSchema,
  updateServerSchema,
} from '../src/validators/server.schema'

describe('Auth Validators', () => {
  describe('registerSchema', () => {
    it('should accept valid registration data', () => {
      const result = registerSchema.safeParse({
        email: 'test@example.com',
        username: 'testuser',
        password: 'password123',
        displayName: 'Test User',
        inviteCode: 'ABC12345',
      })
      expect(result.success).toBe(true)
    })

    it('should reject invalid email', () => {
      const result = registerSchema.safeParse({
        email: 'not-an-email',
        username: 'testuser',
        password: 'password123',
      })
      expect(result.success).toBe(false)
    })

    it('should reject short username', () => {
      const result = registerSchema.safeParse({
        email: 'test@example.com',
        username: 'ab',
        password: 'password123',
      })
      expect(result.success).toBe(false)
    })

    it('should reject username with special characters', () => {
      const result = registerSchema.safeParse({
        email: 'test@example.com',
        username: 'user name!',
        password: 'password123',
      })
      expect(result.success).toBe(false)
    })

    it('should reject short password', () => {
      const result = registerSchema.safeParse({
        email: 'test@example.com',
        username: 'testuser',
        password: 'short',
      })
      expect(result.success).toBe(false)
    })

    it('should allow optional displayName', () => {
      const result = registerSchema.safeParse({
        email: 'test@example.com',
        username: 'testuser',
        password: 'password123',
        inviteCode: 'ABC12345',
      })
      expect(result.success).toBe(true)
    })

    it('should accept usernames with hyphens and underscores', () => {
      const result = registerSchema.safeParse({
        email: 'test@example.com',
        username: 'test-user_123',
        password: 'password123',
        inviteCode: 'ABC12345',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('loginSchema', () => {
    it('should accept valid login data', () => {
      const result = loginSchema.safeParse({
        email: 'test@example.com',
        password: 'password123',
      })
      expect(result.success).toBe(true)
    })

    it('should reject empty password', () => {
      const result = loginSchema.safeParse({
        email: 'test@example.com',
        password: '',
      })
      expect(result.success).toBe(false)
    })

    it('should reject invalid email', () => {
      const result = loginSchema.safeParse({
        email: 'invalid',
        password: 'password123',
      })
      expect(result.success).toBe(false)
    })
  })
})

describe('Channel Validators', () => {
  describe('createChannelSchema', () => {
    it('should accept valid channel data', () => {
      const result = createChannelSchema.safeParse({
        name: 'general',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.type).toBe('text')
      }
    })

    it('should accept all valid channel types', () => {
      for (const type of ['text', 'voice', 'announcement']) {
        const result = createChannelSchema.safeParse({ name: 'test', type })
        expect(result.success).toBe(true)
      }
    })

    it('should reject empty name', () => {
      const result = createChannelSchema.safeParse({ name: '' })
      expect(result.success).toBe(false)
    })

    it('should reject name exceeding 100 chars', () => {
      const result = createChannelSchema.safeParse({ name: 'a'.repeat(101) })
      expect(result.success).toBe(false)
    })

    it('should accept optional topic', () => {
      const result = createChannelSchema.safeParse({
        name: 'general',
        topic: 'General discussion',
      })
      expect(result.success).toBe(true)
    })

    it('should accept optional isPrivate', () => {
      const result = createChannelSchema.safeParse({
        name: 'private-room',
        isPrivate: true,
      })
      expect(result.success).toBe(true)
    })

    it('should reject topic exceeding 1024 chars', () => {
      const result = createChannelSchema.safeParse({
        name: 'general',
        topic: 'a'.repeat(1025),
      })
      expect(result.success).toBe(false)
    })
  })

  describe('updateChannelSchema', () => {
    it('should accept partial updates', () => {
      const result = updateChannelSchema.safeParse({ name: 'new-name' })
      expect(result.success).toBe(true)
    })

    it('should accept nullable topic', () => {
      const result = updateChannelSchema.safeParse({ topic: null })
      expect(result.success).toBe(true)
    })

    it('should accept position update', () => {
      const result = updateChannelSchema.safeParse({ position: 5 })
      expect(result.success).toBe(true)
    })

    it('should reject negative position', () => {
      const result = updateChannelSchema.safeParse({ position: -1 })
      expect(result.success).toBe(false)
    })

    it('should accept isPrivate update', () => {
      const result = updateChannelSchema.safeParse({ isPrivate: false })
      expect(result.success).toBe(true)
    })
  })
})

describe('Message Validators', () => {
  describe('sendMessageSchema', () => {
    it('should accept valid message', () => {
      const result = sendMessageSchema.safeParse({ content: 'Hello world' })
      expect(result.success).toBe(true)
    })

    it('should reject empty content', () => {
      const result = sendMessageSchema.safeParse({ content: '' })
      expect(result.success).toBe(false)
    })

    it('should reject content exceeding max length', () => {
      const result = sendMessageSchema.safeParse({ content: 'a'.repeat(4001) })
      expect(result.success).toBe(false)
    })

    it('should accept optional threadId as UUID', () => {
      const result = sendMessageSchema.safeParse({
        content: 'reply',
        threadId: '550e8400-e29b-41d4-a716-446655440000',
      })
      expect(result.success).toBe(true)
    })

    it('should reject invalid threadId format', () => {
      const result = sendMessageSchema.safeParse({
        content: 'reply',
        threadId: 'not-a-uuid',
      })
      expect(result.success).toBe(false)
    })

    it('should accept optional replyToId', () => {
      const result = sendMessageSchema.safeParse({
        content: 'reply',
        replyToId: '550e8400-e29b-41d4-a716-446655440000',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('updateMessageSchema', () => {
    it('should accept valid update', () => {
      const result = updateMessageSchema.safeParse({ content: 'updated' })
      expect(result.success).toBe(true)
    })

    it('should reject empty content', () => {
      const result = updateMessageSchema.safeParse({ content: '' })
      expect(result.success).toBe(false)
    })
  })

  describe('createThreadSchema', () => {
    it('should accept valid thread data', () => {
      const result = createThreadSchema.safeParse({
        name: 'My Thread',
        parentMessageId: '550e8400-e29b-41d4-a716-446655440000',
      })
      expect(result.success).toBe(true)
    })

    it('should reject without parentMessageId', () => {
      const result = createThreadSchema.safeParse({ name: 'Thread' })
      expect(result.success).toBe(false)
    })
  })

  describe('reactionSchema', () => {
    it('should accept valid emoji', () => {
      const result = reactionSchema.safeParse({ emoji: '👍' })
      expect(result.success).toBe(true)
    })

    it('should reject empty emoji', () => {
      const result = reactionSchema.safeParse({ emoji: '' })
      expect(result.success).toBe(false)
    })

    it('should reject emoji exceeding 32 chars', () => {
      const result = reactionSchema.safeParse({ emoji: 'a'.repeat(33) })
      expect(result.success).toBe(false)
    })
  })
})

describe('Server Validators', () => {
  describe('createServerSchema', () => {
    it('should accept valid server data', () => {
      const result = createServerSchema.safeParse({ name: 'My Server' })
      expect(result.success).toBe(true)
    })

    it('should reject empty name', () => {
      const result = createServerSchema.safeParse({ name: '' })
      expect(result.success).toBe(false)
    })

    it('should accept optional iconUrl', () => {
      const result = createServerSchema.safeParse({
        name: 'Server',
        iconUrl: 'https://example.com/icon.png',
      })
      expect(result.success).toBe(true)
    })

    it('should accept relative iconUrl (e.g. MinIO paths)', () => {
      const result = createServerSchema.safeParse({
        name: 'Server',
        iconUrl: '/shadow/uploads/icon.png',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('updateServerSchema', () => {
    it('should accept partial updates', () => {
      const result = updateServerSchema.safeParse({ name: 'Updated' })
      expect(result.success).toBe(true)
    })

    it('should accept nullable iconUrl', () => {
      const result = updateServerSchema.safeParse({ iconUrl: null })
      expect(result.success).toBe(true)
    })
  })

  describe('joinServerSchema', () => {
    it('should accept valid 8-char invite code', () => {
      const result = joinServerSchema.safeParse({ inviteCode: 'ABcd1234' })
      expect(result.success).toBe(true)
    })

    it('should reject invite code with wrong length', () => {
      const result = joinServerSchema.safeParse({ inviteCode: 'short' })
      expect(result.success).toBe(false)
    })

    it('should reject invite code too long', () => {
      const result = joinServerSchema.safeParse({ inviteCode: 'toolongcode' })
      expect(result.success).toBe(false)
    })
  })
})
