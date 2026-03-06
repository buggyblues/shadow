/**
 * API Capabilities E2E Tests (TDD)
 *
 * Tests for missing Discord-like API capabilities:
 * 1. Thread CRUD (list, get, update, delete, post to thread)
 * 2. Pin/Unpin messages
 * 3. Member management (kick, role update, nickname)
 * 4. Channel reorder (batch position update)
 * 5. Invite regeneration
 *
 * Uses mock DAOs to test through service + handler layers.
 */
import { describe, expect, it, vi } from 'vitest'
import { ChannelService } from '../src/services/channel.service'
import { MessageService } from '../src/services/message.service'
import { ServerService } from '../src/services/server.service'

// ─── Mock factories ────────────────────────────────────────────

function createMockMessageDao(overrides = {}) {
  return {
    findById: vi.fn(),
    findByChannelId: vi.fn(),
    findByThreadId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    createThread: vi.fn(),
    findThreadById: vi.fn(),
    findThreadsByChannelId: vi.fn(),
    updateThread: vi.fn(),
    deleteThread: vi.fn(),
    addReaction: vi.fn(),
    removeReaction: vi.fn(),
    getReactions: vi.fn(),
    getAttachments: vi.fn().mockResolvedValue([]),
    pinMessage: vi.fn(),
    unpinMessage: vi.fn(),
    findPinnedByChannelId: vi.fn(),
    ...overrides,
  }
}

function createMockUserDao(overrides = {}) {
  return {
    findById: vi.fn(),
    updateStatus: vi.fn(),
    ...overrides,
  }
}

function createMockServerDao(overrides = {}) {
  return {
    findById: vi.fn(),
    findBySlug: vi.fn(),
    findByInviteCode: vi.fn(),
    findByUserId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    addMember: vi.fn(),
    removeMember: vi.fn(),
    getMember: vi.fn(),
    getMembers: vi.fn(),
    updateMember: vi.fn(),
    findAll: vi.fn(),
    findPublic: vi.fn(),
    regenerateInviteCode: vi.fn(),
    ...overrides,
  }
}

function createMockChannelDao(overrides = {}) {
  return {
    findById: vi.fn(),
    findByServerId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    updatePositions: vi.fn(),
    ...overrides,
  }
}

// ═══════════════════════════════════════════════════════════════
// 1. THREAD CRUD
// ═══════════════════════════════════════════════════════════════

describe('Thread API', () => {
  const mockThread = {
    id: 'thread-1',
    name: 'Discussion Thread',
    channelId: 'ch-1',
    parentMessageId: 'msg-1',
    creatorId: 'user-1',
    isArchived: false,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  }

  describe('List threads in a channel', () => {
    it('should return active threads for a channel', async () => {
      const messageDao = createMockMessageDao({
        findThreadsByChannelId: vi.fn().mockResolvedValue([mockThread]),
      })
      const userDao = createMockUserDao()
      const service = new MessageService({ messageDao: messageDao as any, userDao: userDao as any })

      const result = await service.getThreadsByChannelId('ch-1')
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Discussion Thread')
      expect(messageDao.findThreadsByChannelId).toHaveBeenCalledWith('ch-1')
    })

    it('should return empty array when no threads exist', async () => {
      const messageDao = createMockMessageDao({
        findThreadsByChannelId: vi.fn().mockResolvedValue([]),
      })
      const userDao = createMockUserDao()
      const service = new MessageService({ messageDao: messageDao as any, userDao: userDao as any })

      const result = await service.getThreadsByChannelId('ch-empty')
      expect(result).toEqual([])
    })
  })

  describe('Get thread by ID', () => {
    it('should return thread when found', async () => {
      const messageDao = createMockMessageDao({
        findThreadById: vi.fn().mockResolvedValue(mockThread),
      })
      const userDao = createMockUserDao()
      const service = new MessageService({ messageDao: messageDao as any, userDao: userDao as any })

      const result = await service.getThread('thread-1')
      expect(result).toEqual(mockThread)
    })

    it('should throw 404 when thread not found', async () => {
      const messageDao = createMockMessageDao({
        findThreadById: vi.fn().mockResolvedValue(null),
      })
      const userDao = createMockUserDao()
      const service = new MessageService({ messageDao: messageDao as any, userDao: userDao as any })

      await expect(service.getThread('nonexistent')).rejects.toThrow('Thread not found')
    })
  })

  describe('Update thread', () => {
    it('should update thread name', async () => {
      const updated = { ...mockThread, name: 'Renamed Thread' }
      const messageDao = createMockMessageDao({
        findThreadById: vi.fn().mockResolvedValue(mockThread),
        updateThread: vi.fn().mockResolvedValue(updated),
      })
      const userDao = createMockUserDao()
      const service = new MessageService({ messageDao: messageDao as any, userDao: userDao as any })

      const result = await service.updateThread('thread-1', 'user-1', { name: 'Renamed Thread' })
      expect(result.name).toBe('Renamed Thread')
    })

    it('should archive a thread', async () => {
      const archived = { ...mockThread, isArchived: true }
      const messageDao = createMockMessageDao({
        findThreadById: vi.fn().mockResolvedValue(mockThread),
        updateThread: vi.fn().mockResolvedValue(archived),
      })
      const userDao = createMockUserDao()
      const service = new MessageService({ messageDao: messageDao as any, userDao: userDao as any })

      const result = await service.updateThread('thread-1', 'user-1', { isArchived: true })
      expect(result.isArchived).toBe(true)
    })

    it('should throw 404 when thread not found', async () => {
      const messageDao = createMockMessageDao({
        findThreadById: vi.fn().mockResolvedValue(null),
      })
      const userDao = createMockUserDao()
      const service = new MessageService({ messageDao: messageDao as any, userDao: userDao as any })

      await expect(service.updateThread('nonexistent', 'user-1', { name: 'New' })).rejects.toThrow(
        'Thread not found',
      )
    })

    it('should throw 403 when non-creator tries to update', async () => {
      const messageDao = createMockMessageDao({
        findThreadById: vi.fn().mockResolvedValue(mockThread),
      })
      const userDao = createMockUserDao()
      const service = new MessageService({ messageDao: messageDao as any, userDao: userDao as any })

      await expect(
        service.updateThread('thread-1', 'user-other', { name: 'Nope' }),
      ).rejects.toThrow('Can only update your own threads')
    })
  })

  describe('Delete thread', () => {
    it('should delete thread by creator', async () => {
      const messageDao = createMockMessageDao({
        findThreadById: vi.fn().mockResolvedValue(mockThread),
        deleteThread: vi.fn().mockResolvedValue(undefined),
      })
      const userDao = createMockUserDao()
      const service = new MessageService({ messageDao: messageDao as any, userDao: userDao as any })

      await expect(service.deleteThread('thread-1', 'user-1')).resolves.toBeUndefined()
      expect(messageDao.deleteThread).toHaveBeenCalledWith('thread-1')
    })

    it('should throw 404 when thread not found', async () => {
      const messageDao = createMockMessageDao({
        findThreadById: vi.fn().mockResolvedValue(null),
      })
      const userDao = createMockUserDao()
      const service = new MessageService({ messageDao: messageDao as any, userDao: userDao as any })

      await expect(service.deleteThread('nonexistent', 'user-1')).rejects.toThrow(
        'Thread not found',
      )
    })

    it('should throw 403 when non-creator tries to delete', async () => {
      const messageDao = createMockMessageDao({
        findThreadById: vi.fn().mockResolvedValue(mockThread),
      })
      const userDao = createMockUserDao()
      const service = new MessageService({ messageDao: messageDao as any, userDao: userDao as any })

      await expect(service.deleteThread('thread-1', 'user-other')).rejects.toThrow(
        'Can only delete your own threads',
      )
    })
  })

  describe('Send message to thread', () => {
    it('should send message with threadId set', async () => {
      const mockMessage = {
        id: 'msg-new',
        content: 'Thread reply',
        channelId: 'ch-1',
        authorId: 'user-1',
        threadId: 'thread-1',
        replyToId: null,
        isEdited: false,
        isPinned: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      const mockUser = {
        id: 'user-1',
        username: 'testuser',
        displayName: 'Test',
        avatarUrl: null,
        status: 'online',
        isBot: false,
      }
      const messageDao = createMockMessageDao({
        findThreadById: vi.fn().mockResolvedValue(mockThread),
        create: vi.fn().mockResolvedValue(mockMessage),
      })
      const userDao = createMockUserDao({
        findById: vi.fn().mockResolvedValue(mockUser),
      })
      const service = new MessageService({ messageDao: messageDao as any, userDao: userDao as any })

      const result = await service.sendToThread('thread-1', 'user-1', { content: 'Thread reply' })
      expect(result.threadId).toBe('thread-1')
      expect(result.content).toBe('Thread reply')
      expect(result.author).toBeDefined()
    })

    it('should throw 404 when thread not found', async () => {
      const messageDao = createMockMessageDao({
        findThreadById: vi.fn().mockResolvedValue(null),
      })
      const userDao = createMockUserDao()
      const service = new MessageService({ messageDao: messageDao as any, userDao: userDao as any })

      await expect(
        service.sendToThread('nonexistent', 'user-1', { content: 'Hello' }),
      ).rejects.toThrow('Thread not found')
    })

    it('should throw 400 when thread is archived', async () => {
      const archivedThread = { ...mockThread, isArchived: true }
      const messageDao = createMockMessageDao({
        findThreadById: vi.fn().mockResolvedValue(archivedThread),
      })
      const userDao = createMockUserDao()
      const service = new MessageService({ messageDao: messageDao as any, userDao: userDao as any })

      await expect(
        service.sendToThread('thread-1', 'user-1', { content: 'Hello' }),
      ).rejects.toThrow('Thread is archived')
    })
  })
})

// ═══════════════════════════════════════════════════════════════
// 2. PIN / UNPIN MESSAGES
// ═══════════════════════════════════════════════════════════════

describe('Pin API', () => {
  const mockMessage = {
    id: 'msg-1',
    content: 'Important message',
    channelId: 'ch-1',
    authorId: 'user-1',
    threadId: null,
    replyToId: null,
    isEdited: false,
    isPinned: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  describe('Pin a message', () => {
    it('should pin an existing message', async () => {
      const pinned = { ...mockMessage, isPinned: true }
      const messageDao = createMockMessageDao({
        findById: vi.fn().mockResolvedValue(mockMessage),
        pinMessage: vi.fn().mockResolvedValue(pinned),
      })
      const userDao = createMockUserDao()
      const service = new MessageService({ messageDao: messageDao as any, userDao: userDao as any })

      const result = await service.pinMessage('ch-1', 'msg-1')
      expect(result.isPinned).toBe(true)
    })

    it('should throw 404 when message not found', async () => {
      const messageDao = createMockMessageDao({
        findById: vi.fn().mockResolvedValue(null),
      })
      const userDao = createMockUserDao()
      const service = new MessageService({ messageDao: messageDao as any, userDao: userDao as any })

      await expect(service.pinMessage('ch-1', 'nonexistent')).rejects.toThrow('Message not found')
    })

    it('should throw 400 when message is in different channel', async () => {
      const messageDao = createMockMessageDao({
        findById: vi.fn().mockResolvedValue({ ...mockMessage, channelId: 'ch-other' }),
      })
      const userDao = createMockUserDao()
      const service = new MessageService({ messageDao: messageDao as any, userDao: userDao as any })

      await expect(service.pinMessage('ch-1', 'msg-1')).rejects.toThrow(
        'Message does not belong to this channel',
      )
    })
  })

  describe('Unpin a message', () => {
    it('should unpin a pinned message', async () => {
      const pinnedMessage = { ...mockMessage, isPinned: true }
      const unpinned = { ...mockMessage, isPinned: false }
      const messageDao = createMockMessageDao({
        findById: vi.fn().mockResolvedValue(pinnedMessage),
        unpinMessage: vi.fn().mockResolvedValue(unpinned),
      })
      const userDao = createMockUserDao()
      const service = new MessageService({ messageDao: messageDao as any, userDao: userDao as any })

      const result = await service.unpinMessage('ch-1', 'msg-1')
      expect(result.isPinned).toBe(false)
    })

    it('should throw 404 when message not found', async () => {
      const messageDao = createMockMessageDao({
        findById: vi.fn().mockResolvedValue(null),
      })
      const userDao = createMockUserDao()
      const service = new MessageService({ messageDao: messageDao as any, userDao: userDao as any })

      await expect(service.unpinMessage('ch-1', 'nonexistent')).rejects.toThrow('Message not found')
    })
  })

  describe('List pinned messages', () => {
    it('should return pinned messages for a channel', async () => {
      const pinnedMessages = [
        { ...mockMessage, isPinned: true, author: { id: 'user-1', username: 'alice' } },
      ]
      const messageDao = createMockMessageDao({
        findPinnedByChannelId: vi.fn().mockResolvedValue(pinnedMessages),
      })
      const userDao = createMockUserDao()
      const service = new MessageService({ messageDao: messageDao as any, userDao: userDao as any })

      const result = await service.getPinnedMessages('ch-1')
      expect(result).toHaveLength(1)
      expect(result[0].isPinned).toBe(true)
    })

    it('should return empty array when no pinned messages', async () => {
      const messageDao = createMockMessageDao({
        findPinnedByChannelId: vi.fn().mockResolvedValue([]),
      })
      const userDao = createMockUserDao()
      const service = new MessageService({ messageDao: messageDao as any, userDao: userDao as any })

      const result = await service.getPinnedMessages('ch-1')
      expect(result).toEqual([])
    })
  })
})

// ═══════════════════════════════════════════════════════════════
// 3. MEMBER MANAGEMENT
// ═══════════════════════════════════════════════════════════════

describe('Member Management API', () => {
  const mockServer = {
    id: 'srv-1',
    name: 'Test Server',
    ownerId: 'owner-1',
    inviteCode: 'abcd1234',
    isPublic: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockMember = {
    id: 'mem-1',
    userId: 'user-target',
    serverId: 'srv-1',
    role: 'member' as const,
    nickname: null,
    joinedAt: new Date(),
  }

  describe('Kick member', () => {
    it('should kick a member from the server', async () => {
      const serverDao = createMockServerDao({
        findById: vi.fn().mockResolvedValue(mockServer),
        getMember: vi
          .fn()
          .mockResolvedValueOnce({ ...mockMember, userId: 'admin-1', role: 'admin' }) // requester
          .mockResolvedValueOnce(mockMember), // target
        removeMember: vi.fn().mockResolvedValue(undefined),
      })
      const channelDao = createMockChannelDao()
      const service = new ServerService({
        serverDao: serverDao as any,
        channelDao: channelDao as any,
      })

      await expect(service.kickMember('srv-1', 'user-target', 'admin-1')).resolves.toBeUndefined()
      expect(serverDao.removeMember).toHaveBeenCalledWith('srv-1', 'user-target')
    })

    it('should throw 403 when kicker is not admin/owner', async () => {
      const serverDao = createMockServerDao({
        findById: vi.fn().mockResolvedValue(mockServer),
        getMember: vi
          .fn()
          .mockResolvedValueOnce({ ...mockMember, userId: 'regular-1', role: 'member' }),
      })
      const channelDao = createMockChannelDao()
      const service = new ServerService({
        serverDao: serverDao as any,
        channelDao: channelDao as any,
      })

      await expect(service.kickMember('srv-1', 'user-target', 'regular-1')).rejects.toThrow(
        'Requires admin role or higher',
      )
    })

    it('should throw 400 when trying to kick the owner', async () => {
      const serverDao = createMockServerDao({
        findById: vi.fn().mockResolvedValue(mockServer),
        getMember: vi
          .fn()
          .mockResolvedValueOnce({ ...mockMember, userId: 'admin-1', role: 'admin' }) // requester
          .mockResolvedValueOnce({ ...mockMember, userId: 'owner-1', role: 'owner' }), // target is owner
      })
      const channelDao = createMockChannelDao()
      const service = new ServerService({
        serverDao: serverDao as any,
        channelDao: channelDao as any,
      })

      await expect(service.kickMember('srv-1', 'owner-1', 'admin-1')).rejects.toThrow(
        'Cannot kick the server owner',
      )
    })

    it('should throw 404 when target is not a member', async () => {
      const serverDao = createMockServerDao({
        findById: vi.fn().mockResolvedValue(mockServer),
        getMember: vi
          .fn()
          .mockResolvedValueOnce({ ...mockMember, userId: 'admin-1', role: 'admin' }) // requester
          .mockResolvedValueOnce(null), // target not found
      })
      const channelDao = createMockChannelDao()
      const service = new ServerService({
        serverDao: serverDao as any,
        channelDao: channelDao as any,
      })

      await expect(service.kickMember('srv-1', 'ghost', 'admin-1')).rejects.toThrow(
        'Member not found',
      )
    })
  })

  describe('Update member role', () => {
    it('should update member role from member to admin', async () => {
      const updated = { ...mockMember, role: 'admin' }
      const serverDao = createMockServerDao({
        findById: vi.fn().mockResolvedValue(mockServer),
        getMember: vi
          .fn()
          .mockResolvedValueOnce({ ...mockMember, userId: 'owner-1', role: 'owner' }) // requester = owner
          .mockResolvedValueOnce(mockMember), // target
        updateMember: vi.fn().mockResolvedValue(updated),
      })
      const channelDao = createMockChannelDao()
      const service = new ServerService({
        serverDao: serverDao as any,
        channelDao: channelDao as any,
      })

      const result = await service.updateMember('srv-1', 'user-target', 'owner-1', {
        role: 'admin',
      })
      expect(result.role).toBe('admin')
    })

    it('should update member nickname', async () => {
      const updated = { ...mockMember, nickname: 'Nickname' }
      const serverDao = createMockServerDao({
        findById: vi.fn().mockResolvedValue(mockServer),
        getMember: vi
          .fn()
          .mockResolvedValueOnce({ ...mockMember, userId: 'admin-1', role: 'admin' }) // requester
          .mockResolvedValueOnce(mockMember), // target
        updateMember: vi.fn().mockResolvedValue(updated),
      })
      const channelDao = createMockChannelDao()
      const service = new ServerService({
        serverDao: serverDao as any,
        channelDao: channelDao as any,
      })

      const result = await service.updateMember('srv-1', 'user-target', 'admin-1', {
        nickname: 'Nickname',
      })
      expect(result.nickname).toBe('Nickname')
    })

    it('should throw 403 when non-owner tries to set owner role', async () => {
      const serverDao = createMockServerDao({
        findById: vi.fn().mockResolvedValue(mockServer),
        getMember: vi
          .fn()
          .mockResolvedValueOnce({ ...mockMember, userId: 'admin-1', role: 'admin' }),
      })
      const channelDao = createMockChannelDao()
      const service = new ServerService({
        serverDao: serverDao as any,
        channelDao: channelDao as any,
      })

      await expect(
        service.updateMember('srv-1', 'user-target', 'admin-1', { role: 'owner' }),
      ).rejects.toThrow('Only the server owner can assign the owner role')
    })

    it('should throw 403 when member tries to update roles', async () => {
      const serverDao = createMockServerDao({
        findById: vi.fn().mockResolvedValue(mockServer),
        getMember: vi
          .fn()
          .mockResolvedValueOnce({ ...mockMember, userId: 'regular-1', role: 'member' }),
      })
      const channelDao = createMockChannelDao()
      const service = new ServerService({
        serverDao: serverDao as any,
        channelDao: channelDao as any,
      })

      await expect(
        service.updateMember('srv-1', 'user-target', 'regular-1', { role: 'admin' }),
      ).rejects.toThrow('Requires admin role or higher')
    })
  })
})

// ═══════════════════════════════════════════════════════════════
// 4. CHANNEL REORDER
// ═══════════════════════════════════════════════════════════════

describe('Channel Reorder API', () => {
  describe('Batch update channel positions', () => {
    it('should update positions for multiple channels', async () => {
      const positions = [
        { id: 'ch-1', position: 2 },
        { id: 'ch-2', position: 0 },
        { id: 'ch-3', position: 1 },
      ]
      const channelDao = createMockChannelDao({
        updatePositions: vi.fn().mockResolvedValue(undefined),
        findByServerId: vi.fn().mockResolvedValue([
          { id: 'ch-2', position: 0, name: 'ch2' },
          { id: 'ch-3', position: 1, name: 'ch3' },
          { id: 'ch-1', position: 2, name: 'ch1' },
        ]),
      })
      const service = new ChannelService({ channelDao: channelDao as any })

      const result = await service.updatePositions('srv-1', positions)
      expect(channelDao.updatePositions).toHaveBeenCalledWith(positions)
      expect(result).toHaveLength(3)
    })

    it('should throw 400 when positions array is empty', async () => {
      const channelDao = createMockChannelDao()
      const service = new ChannelService({ channelDao: channelDao as any })

      await expect(service.updatePositions('srv-1', [])).rejects.toThrow(
        'Positions array cannot be empty',
      )
    })
  })
})

// ═══════════════════════════════════════════════════════════════
// 5. INVITE REGENERATION
// ═══════════════════════════════════════════════════════════════

describe('Invite Regeneration API', () => {
  const mockServer = {
    id: 'srv-1',
    name: 'Test Server',
    ownerId: 'owner-1',
    inviteCode: 'oldcode1',
    isPublic: false,
  }

  describe('Regenerate invite code', () => {
    it('should regenerate invite code for server owner', async () => {
      const updated = { ...mockServer, inviteCode: 'newcode1' }
      const serverDao = createMockServerDao({
        findById: vi.fn().mockResolvedValue(mockServer),
        getMember: vi.fn().mockResolvedValue({ role: 'owner', userId: 'owner-1' }),
        regenerateInviteCode: vi.fn().mockResolvedValue(updated),
      })
      const channelDao = createMockChannelDao()
      const service = new ServerService({
        serverDao: serverDao as any,
        channelDao: channelDao as any,
      })

      const result = await service.regenerateInvite('srv-1', 'owner-1')
      expect(result.inviteCode).toBe('newcode1')
      expect(result.inviteCode).not.toBe('oldcode1')
    })

    it('should allow admin to regenerate invite code', async () => {
      const updated = { ...mockServer, inviteCode: 'admcode1' }
      const serverDao = createMockServerDao({
        findById: vi.fn().mockResolvedValue(mockServer),
        getMember: vi.fn().mockResolvedValue({ role: 'admin', userId: 'admin-1' }),
        regenerateInviteCode: vi.fn().mockResolvedValue(updated),
      })
      const channelDao = createMockChannelDao()
      const service = new ServerService({
        serverDao: serverDao as any,
        channelDao: channelDao as any,
      })

      const result = await service.regenerateInvite('srv-1', 'admin-1')
      expect(result.inviteCode).toBe('admcode1')
    })

    it('should throw 403 for regular members', async () => {
      const serverDao = createMockServerDao({
        findById: vi.fn().mockResolvedValue(mockServer),
        getMember: vi.fn().mockResolvedValue({ role: 'member', userId: 'regular-1' }),
      })
      const channelDao = createMockChannelDao()
      const service = new ServerService({
        serverDao: serverDao as any,
        channelDao: channelDao as any,
      })

      await expect(service.regenerateInvite('srv-1', 'regular-1')).rejects.toThrow(
        'Requires admin role or higher',
      )
    })

    it('should throw 404 when server not found', async () => {
      const serverDao = createMockServerDao({
        findById: vi.fn().mockResolvedValue(null),
      })
      const channelDao = createMockChannelDao()
      const service = new ServerService({
        serverDao: serverDao as any,
        channelDao: channelDao as any,
      })

      await expect(service.regenerateInvite('nonexistent', 'owner-1')).rejects.toThrow(
        'Server not found',
      )
    })
  })
})

// ═══════════════════════════════════════════════════════════════
// 6. HANDLER E2E: Thread, Pin, Member endpoints
// ═══════════════════════════════════════════════════════════════

describe('Handler E2E: Thread endpoints', () => {
  it('should validate createThreadSchema', () => {
    // Schema test: createThread requires name + parentMessageId
    const { createThreadSchema } = require('../src/validators/message.schema')
    expect(
      createThreadSchema.safeParse({
        name: 'Thread',
        parentMessageId: '550e8400-e29b-41d4-a716-446655440000',
      }).success,
    ).toBe(true)
    expect(createThreadSchema.safeParse({ name: '' }).success).toBe(false)
    expect(createThreadSchema.safeParse({ name: 'T', parentMessageId: 'not-uuid' }).success).toBe(
      false,
    )
  })

  it('should validate updateThreadSchema', () => {
    const { updateThreadSchema } = require('../src/validators/message.schema')
    expect(updateThreadSchema.safeParse({ name: 'New Name' }).success).toBe(true)
    expect(updateThreadSchema.safeParse({ isArchived: true }).success).toBe(true)
    expect(updateThreadSchema.safeParse({ name: 'N', isArchived: false }).success).toBe(true)
    expect(updateThreadSchema.safeParse({}).success).toBe(true) // empty partial update
    expect(updateThreadSchema.safeParse({ name: '' }).success).toBe(false)
    expect(updateThreadSchema.safeParse({ name: 'x'.repeat(101) }).success).toBe(false)
  })
})

describe('Handler E2E: Member management validators', () => {
  it('should validate updateMemberSchema', () => {
    const { updateMemberSchema } = require('../src/validators/server.schema')
    expect(updateMemberSchema.safeParse({ role: 'admin' }).success).toBe(true)
    expect(updateMemberSchema.safeParse({ nickname: 'Nick' }).success).toBe(true)
    expect(updateMemberSchema.safeParse({ role: 'invalid' }).success).toBe(false)
    expect(updateMemberSchema.safeParse({ nickname: 'x'.repeat(65) }).success).toBe(false)
  })
})

describe('Handler E2E: Channel positions validator', () => {
  it('should validate channelPositionsSchema', () => {
    const { channelPositionsSchema } = require('../src/validators/channel.schema')
    const valid = {
      positions: [
        { id: '550e8400-e29b-41d4-a716-446655440000', position: 0 },
        { id: '550e8400-e29b-41d4-a716-446655440001', position: 1 },
      ],
    }
    expect(channelPositionsSchema.safeParse(valid).success).toBe(true)
    expect(channelPositionsSchema.safeParse({ positions: [] }).success).toBe(false)
    expect(
      channelPositionsSchema.safeParse({ positions: [{ id: 'not-uuid', position: 0 }] }).success,
    ).toBe(false)
  })
})
