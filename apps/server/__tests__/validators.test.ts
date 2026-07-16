import { describe, expect, it } from 'vitest'
import { loginSchema, registerSchema } from '../src/validators/auth.schema'
import { createChannelSchema, updateChannelSchema } from '../src/validators/channel.schema'
import {
  createPollSchema,
  createThreadSchema,
  pollVoteSchema,
  reactionSchema,
  sendMessageSchema,
  updateMessageSchema,
} from '../src/validators/message.schema'
import {
  createServerSchema,
  joinServerSchema,
  updateServerDesktopLayoutSchema,
  updateServerSchema,
} from '../src/validators/server.schema'

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
      const result = sendMessageSchema.safeParse({ content: 'a'.repeat(16001) })
      expect(result.success).toBe(false)
    })

    it('should accept content at exactly max length', () => {
      const result = sendMessageSchema.safeParse({ content: 'a'.repeat(16000) })
      expect(result.success).toBe(true)
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

    it('should reject legacy metadata.collaboration', () => {
      const result = sendMessageSchema.safeParse({
        content: 'reply',
        metadata: {
          collaboration: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            rootMessageId: '550e8400-e29b-41d4-a716-446655440002',
            buddyId: '550e8400-e29b-41d4-a716-446655440001',
            turn: 1,
            target: 'thread',
            threadId: '550e8400-e29b-41d4-a716-446655440003',
          },
        },
      })
      expect(result.success).toBe(false)
    })

    it('should accept bounded runtime agent chain metadata', () => {
      const result = sendMessageSchema.safeParse({
        content: 'reply',
        metadata: {
          agentChain: {
            agentId: 'brandscout',
            depth: 1,
            participants: ['550e8400-e29b-41d4-a716-446655440001'],
            startedAt: Date.now(),
            rootMessageId: '550e8400-e29b-41d4-a716-446655440000',
          },
          shadowDelivery: {
            id: 'delivery-1',
            source: 'openclaw-shadowob',
            replyToId: '550e8400-e29b-41d4-a716-446655440000',
          },
          ccConnectDelivery: {
            id: 'delivery-2',
            source: 'cc-connect-shadowob',
            replyToId: '550e8400-e29b-41d4-a716-446655440000',
          },
        },
      })
      expect(result.success).toBe(true)
    })

    it('should reject oversized runtime agent chain metadata', () => {
      const result = sendMessageSchema.safeParse({
        content: 'reply',
        metadata: {
          agentChain: {
            agentId: 'brandscout',
            depth: 101,
            participants: Array.from({ length: 101 }, (_, index) => `agent-${index}`),
          },
        },
      })
      expect(result.success).toBe(false)
    })

    it('should reject unknown top-level metadata fields', () => {
      const result = sendMessageSchema.safeParse({
        content: 'reply',
        metadata: {
          removedField: true,
        },
      })
      expect(result.success).toBe(false)
    })

    it('should accept bounded Copilot app metadata', () => {
      const result = sendMessageSchema.safeParse({
        content: 'current Space App context',
        metadata: {
          copilotContext: {
            kind: 'space_app_copilot',
            appKey: 'kanban',
            spaceAppId: 'space-app-1',
            appName: 'Kanban',
            serverId: 'server-1',
            serverSlug: 'growth',
            channelId: 'inbox-1',
            channelKind: 'inbox',
          },
        },
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.metadata?.copilotContext?.appKey).toBe('kanban')
      }
    })

    it('should reject oversized Copilot app metadata', () => {
      const result = sendMessageSchema.safeParse({
        content: 'current Space App context',
        metadata: {
          copilotContext: {
            kind: 'space_app_copilot',
            appKey: 'x'.repeat(121),
          },
        },
      })

      expect(result.success).toBe(false)
    })

    it('should accept a minimal commerce offer card in unified cards metadata', () => {
      const result = sendMessageSchema.safeParse({
        content: '这盒火柴给你。',
        metadata: {
          cards: [
            {
              kind: 'offer',
              offerId: '550e8400-e29b-41d4-a716-446655440000',
            },
          ],
        },
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

  describe('createPollSchema', () => {
    it('should accept a valid poll and apply Discord-style defaults', () => {
      const result = createPollSchema.safeParse({
        question: ' Which time works best? ',
        answers: [{ text: ' 10:00 ' }, { text: '14:00' }],
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toMatchObject({
          question: 'Which time works best?',
          allowMultiselect: false,
          durationHours: 24,
          layoutType: 1,
        })
        expect(result.data.answers[0]?.text).toBe('10:00')
      }
    })

    it('should require 2 to 10 poll answers', () => {
      expect(
        createPollSchema.safeParse({
          question: 'Pick one',
          answers: [{ text: 'Only one' }],
        }).success,
      ).toBe(false)
      expect(
        createPollSchema.safeParse({
          question: 'Pick one',
          answers: Array.from({ length: 11 }, (_, index) => ({ text: `Answer ${index + 1}` })),
        }).success,
      ).toBe(false)
    })

    it('should enforce poll question, answer, and duration limits', () => {
      expect(
        createPollSchema.safeParse({
          question: 'a'.repeat(301),
          answers: [{ text: 'A' }, { text: 'B' }],
        }).success,
      ).toBe(false)
      expect(
        createPollSchema.safeParse({
          question: 'Pick one',
          answers: [{ text: 'a'.repeat(56) }, { text: 'B' }],
        }).success,
      ).toBe(false)
      expect(
        createPollSchema.safeParse({
          question: 'Pick one',
          answers: [{ text: 'A' }, { text: 'B' }],
          durationHours: 769,
        }).success,
      ).toBe(false)
    })
  })

  describe('pollVoteSchema', () => {
    it('should accept option ids, answer ids, and empty option ids for removing a vote', () => {
      expect(
        pollVoteSchema.safeParse({
          optionIds: ['550e8400-e29b-41d4-a716-446655440000'],
        }).success,
      ).toBe(true)
      expect(pollVoteSchema.safeParse({ answerIds: [1, 2] }).success).toBe(true)
      expect(pollVoteSchema.safeParse({ optionIds: [] }).success).toBe(true)
    })

    it('should reject missing vote targets and out-of-range answer ids', () => {
      expect(pollVoteSchema.safeParse({}).success).toBe(false)
      expect(pollVoteSchema.safeParse({ answerIds: [11] }).success).toBe(false)
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
        iconUrl: 'https://shadowob.com/icon.png',
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

  describe('updateServerDesktopLayoutSchema', () => {
    it('should accept desktop icons and sticky note widgets', () => {
      const result = updateServerDesktopLayoutSchema.safeParse({
        version: 2,
        items: [
          {
            id: 'workspace:550e8400-e29b-41d4-a716-446655440000',
            kind: 'workspace-node',
            workspaceNodeId: '550e8400-e29b-41d4-a716-446655440000',
            source: 'workspace-root',
            x: 24,
            y: 56,
          },
          {
            id: 'builtin:workspace',
            kind: 'builtin-app',
            builtinKey: 'workspace',
            title: 'Workspace',
            x: 128,
            y: 56,
          },
        ],
        widgets: [
          {
            id: 'widget:notice',
            kind: 'sticky-note',
            x: 232,
            y: 168,
            zIndex: 10,
            widthCells: 6,
            heightCells: 4,
            rotation: 4,
            content: '## Notice',
            updatedAt: '2026-06-24T00:00:00.000Z',
          },
          {
            id: 'widget:chat',
            kind: 'chat-input',
            x: 456,
            y: 168,
            zIndex: 20,
            widthCells: 10,
            heightCells: 2,
            rotation: -3,
            defaultAgentId: '550e8400-e29b-41d4-a716-446655440001',
            inboxViewMode: 'chat',
            placeholder: 'Ask Buddy anything',
            completionItems: ['Summarize today', 'Draft a reply'],
            updatedAt: '2026-06-24T00:00:00.000Z',
          },
          {
            id: 'widget:youtube',
            kind: 'video-player',
            provider: 'youtube',
            x: 560,
            y: 168,
            zIndex: 30,
            widthCells: 10,
            heightCells: 6,
            rotation: 7,
            source: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            title: 'Launch video',
            autoplay: false,
            muted: true,
            showCover: true,
            updatedAt: '2026-06-24T00:00:00.000Z',
          },
          {
            id: 'widget:typewriter',
            kind: 'typewriter',
            x: 24,
            y: 616,
            zIndex: 40,
            widthCells: 8,
            heightCells: 6,
            rotation: -8,
            content: 'SYSTEM READY',
            speedMs: 160,
            pauseMs: 1800,
            loop: true,
            cursor: true,
            fontFamily: 'mono',
            fontSize: 32,
            color: '#ffffff',
            textShadow: 'soft',
            textStrokeWidth: 0,
            textStrokeColor: '#000000',
            updatedAt: '2026-06-24T00:00:00.000Z',
          },
          {
            id: 'widget:photo',
            kind: 'photo',
            sourceType: 'workspace-file',
            source: '550e8400-e29b-41d4-a716-446655440000',
            x: 24,
            y: 392,
            zIndex: 50,
            widthCells: 6,
            aspectRatio: 1.5,
            rotation: -6,
            title: 'Launch photo',
            workspaceFileName: 'launch.jpg',
            updatedAt: '2026-06-24T00:00:00.000Z',
          },
          {
            id: 'widget:docs',
            kind: 'web-embed',
            sourceType: 'url',
            source: 'https://example.com/docs',
            x: 24,
            y: 392,
            zIndex: 60,
            widthCells: 10,
            heightCells: 8,
            rotation: 5,
            title: 'Docs',
            updatedAt: '2026-06-24T00:00:00.000Z',
          },
        ],
      })

      expect(result.success).toBe(true)
    })

    it('should reject oversized sticky note content', () => {
      const result = updateServerDesktopLayoutSchema.safeParse({
        version: 2,
        items: [],
        widgets: [
          {
            id: 'widget:notice',
            kind: 'sticky-note',
            x: 0,
            y: 0,
            widthCells: 6,
            heightCells: 4,
            content: 'a'.repeat(8001),
          },
        ],
      })

      expect(result.success).toBe(false)
    })

    it('should reject widget z-index outside the supported range', () => {
      const result = updateServerDesktopLayoutSchema.safeParse({
        version: 2,
        items: [],
        widgets: [
          {
            id: 'widget:notice',
            kind: 'sticky-note',
            x: 0,
            y: 0,
            zIndex: 1001,
            widthCells: 6,
            heightCells: 4,
            content: 'Notice',
          },
        ],
      })

      expect(result.success).toBe(false)
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
