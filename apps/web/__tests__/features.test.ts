import { beforeAll, describe, expect, it } from 'vitest'

// Mock localStorage for tests that import auth store
beforeAll(() => {
  if (typeof globalThis.localStorage === 'undefined') {
    const store: Record<string, string> = {}
    ;(globalThis as unknown as Record<string, unknown>).localStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value
      },
      removeItem: (key: string) => {
        delete store[key]
      },
      clear: () => {
        for (const k of Object.keys(store)) delete store[k]
      },
    }
  }
})

/**
 * Frontend feature integration tests
 * Tests for: emoji picker, reactions, auto-scroll, presence, invite links,
 * server discovery, notifications
 */

describe('Feature: Emoji Picker', () => {
  it('should export EmojiPicker component', async () => {
    const mod = await import('../src/components/common/emoji-picker')
    expect(mod.EmojiPicker).toBeDefined()
    expect(typeof mod.EmojiPicker).toBe('function')
  })
})

describe('Feature: Notification Bell', () => {
  it('should export NotificationBell component', async () => {
    const mod = await import('../src/components/notification/notification-bell')
    expect(mod.NotificationBell).toBeDefined()
    expect(typeof mod.NotificationBell).toBe('function')
  })
})

describe('Feature: Invite Page', () => {
  it('should export InvitePage component', async () => {
    const mod = await import('../src/pages/invite')
    expect(mod.InvitePage).toBeDefined()
    expect(typeof mod.InvitePage).toBe('function')
  })
})

describe('Feature: Discover Page', () => {
  it('should export DiscoverPage component', async () => {
    const mod = await import('../src/pages/discover')
    expect(mod.DiscoverPage).toBeDefined()
    expect(typeof mod.DiscoverPage).toBe('function')
  })
})

describe('Feature: Socket events', () => {
  it('should export updatePresence function', async () => {
    const mod = await import('../src/lib/socket')
    expect(mod.updatePresence).toBeDefined()
    expect(typeof mod.updatePresence).toBe('function')
  })

  it('should export all required socket functions', async () => {
    const mod = await import('../src/lib/socket')
    expect(mod.getSocket).toBeDefined()
    expect(mod.connectSocket).toBeDefined()
    expect(mod.disconnectSocket).toBeDefined()
    expect(mod.joinChannel).toBeDefined()
    expect(mod.leaveChannel).toBeDefined()
    expect(mod.sendWsMessage).toBeDefined()
    expect(mod.sendTyping).toBeDefined()
    expect(mod.updatePresence).toBeDefined()
  })
})

describe('Feature: i18n keys for new features', () => {
  it('should have all new feature keys in zh-CN', async () => {
    const zhCN = await import('../src/lib/locales/zh-CN.json')
    const data = zhCN.default || zhCN

    // Invite keys
    expect(data.invite).toBeDefined()
    expect(data.invite.title).toBeDefined()
    expect(data.invite.loginRequired).toBeDefined()
    expect(data.invite.invalidCode).toBeDefined()
    expect(data.invite.acceptInvite).toBeDefined()

    // Discover keys
    expect(data.discover).toBeDefined()
    expect(data.discover.title).toBeDefined()
    expect(data.discover.searchPlaceholder).toBeDefined()
    expect(data.discover.noServers).toBeDefined()

    // Notification keys
    expect(data.notification).toBeDefined()
    expect(data.notification.title).toBeDefined()
    expect(data.notification.markAllRead).toBeDefined()
    expect(data.notification.empty).toBeDefined()

    // Server new keys
    expect(data.server.joinServer).toBeDefined()
    expect(data.server.discover).toBeDefined()

    // Channel new keys
    expect(data.channel.inviteLink).toBeDefined()

    // Chat new keys
    expect(data.chat.newMessages).toBeDefined()
  })

  it('should have all new feature keys in en', async () => {
    const en = await import('../src/lib/locales/en.json')
    const data = en.default || en

    expect(data.invite).toBeDefined()
    expect(data.discover).toBeDefined()
    expect(data.notification).toBeDefined()
    expect(data.server.joinServer).toBeDefined()
    expect(data.server.discover).toBeDefined()
    expect(data.channel.inviteLink).toBeDefined()
    expect(data.chat.newMessages).toBeDefined()
  })

  it('should have all new feature keys in ja', async () => {
    const ja = await import('../src/lib/locales/ja.json')
    const data = ja.default || ja

    expect(data.invite).toBeDefined()
    expect(data.discover).toBeDefined()
    expect(data.notification).toBeDefined()
    expect(data.server.joinServer).toBeDefined()
  })

  it('should have all new feature keys in ko', async () => {
    const ko = await import('../src/lib/locales/ko.json')
    const data = ko.default || ko

    expect(data.invite).toBeDefined()
    expect(data.discover).toBeDefined()
    expect(data.notification).toBeDefined()
    expect(data.server.joinServer).toBeDefined()
  })

  it('should have all new feature keys in zh-TW', async () => {
    const zhTW = await import('../src/lib/locales/zh-TW.json')
    const data = zhTW.default || zhTW

    expect(data.invite).toBeDefined()
    expect(data.discover).toBeDefined()
    expect(data.notification).toBeDefined()
    expect(data.server.joinServer).toBeDefined()
  })
})

describe('Feature: Chat store', () => {
  it('should export useChatStore with required state', async () => {
    const mod = await import('../src/stores/chat.store')
    expect(mod.useChatStore).toBeDefined()

    const state = mod.useChatStore.getState()
    expect(state).toHaveProperty('activeServerId')
    expect(state).toHaveProperty('activeChannelId')
    expect(state).toHaveProperty('activeThreadId')
    expect(typeof state.setActiveServer).toBe('function')
    expect(typeof state.setActiveChannel).toBe('function')
    expect(typeof state.setActiveThread).toBe('function')
  })

  it('should reset channel when server changes', async () => {
    const { useChatStore } = await import('../src/stores/chat.store')
    useChatStore.getState().setActiveChannel('ch1')
    expect(useChatStore.getState().activeChannelId).toBe('ch1')

    useChatStore.getState().setActiveServer('srv2')
    expect(useChatStore.getState().activeServerId).toBe('srv2')
    expect(useChatStore.getState().activeChannelId).toBeNull()
  })
})
