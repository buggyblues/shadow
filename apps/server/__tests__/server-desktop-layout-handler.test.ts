import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { createServerHandler } from '../src/handlers/server.handler'

vi.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: async (
    c: { set: (key: string, value: unknown) => void },
    next: () => Promise<void>,
  ) => {
    c.set('user', { userId: 'user-1' })
    c.set('actor', 'user-1')
    await next()
  },
}))

const serverId = '550e8400-e29b-41d4-a716-446655440000'

const layout = {
  version: 2 as const,
  items: [
    {
      id: 'builtin:workspace',
      kind: 'builtin-app' as const,
      builtinKey: 'workspace',
      title: 'Workspace',
      x: 24,
      y: 56,
    },
    {
      id: 'buddy-inbox:550e8400-e29b-41d4-a716-446655440001',
      kind: 'buddy-inbox' as const,
      agentId: '550e8400-e29b-41d4-a716-446655440001',
      channelId: '550e8400-e29b-41d4-a716-446655440002',
      title: 'Planner Buddy',
      x: 128,
      y: 56,
    },
  ],
  widgets: [
    {
      id: 'widget:notice',
      kind: 'sticky-note' as const,
      x: 128,
      y: 168,
      widthCells: 6,
      heightCells: 4,
      content: '## Notice',
    },
    {
      id: 'widget:chat',
      kind: 'chat-input' as const,
      x: 456,
      y: 168,
      widthCells: 10,
      heightCells: 4,
      defaultAgentId: '550e8400-e29b-41d4-a716-446655440001',
      inboxViewMode: 'chat' as const,
    },
    {
      id: 'widget:docs',
      kind: 'web-embed' as const,
      sourceType: 'url' as const,
      source: 'https://example.com/docs',
      x: 760,
      y: 168,
      widthCells: 10,
      heightCells: 8,
      title: 'Docs',
    },
    {
      id: 'widget:typewriter',
      kind: 'typewriter' as const,
      x: 760,
      y: 168,
      widthCells: 8,
      heightCells: 6,
      content: 'SYSTEM READY',
      speedMs: 160,
      pauseMs: 1800,
      loop: true,
      cursor: true,
      fontFamily: 'mono' as const,
      fontSize: 32,
      color: '#ffffff',
      textShadow: 'soft' as const,
      textStrokeWidth: 0,
      textStrokeColor: '#000000',
    },
    {
      id: 'widget:photo',
      kind: 'photo' as const,
      sourceType: 'url' as const,
      source: 'https://example.com/photo.jpg',
      x: 24,
      y: 392,
      widthCells: 6,
      aspectRatio: 1.5,
      rotation: -6,
      title: 'Photo',
    },
  ],
}

function createApp(overrides: Record<string, unknown> = {}) {
  const serverDao = {
    findById: vi.fn().mockResolvedValue({
      id: serverId,
      name: 'Server',
      isPublic: false,
      desktopLayout: layout,
    }),
    getMember: vi.fn().mockResolvedValue({ userId: 'user-1', role: 'admin' }),
  }
  const serverService = {
    updateDesktopLayout: vi.fn().mockResolvedValue({
      id: serverId,
      desktopLayout: layout,
    }),
  }
  const container = {
    resolve: vi.fn((key: string) => {
      if (key === 'serverDao') return serverDao
      if (key === 'serverService') return serverService
      throw new Error(`Unexpected dependency: ${key}`)
    }),
    ...overrides,
  }
  const app = new Hono()
  app.route('/api/servers', createServerHandler(container as never))
  return { app, serverDao, serverService }
}

describe('server desktop layout handler', () => {
  it('returns a shared server desktop layout for members', async () => {
    const { app, serverDao } = createApp()

    const res = await app.request(`http://localhost/api/servers/${serverId}/desktop-layout`)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual(layout)
    expect(serverDao.getMember).toHaveBeenCalledWith(serverId, 'user-1')
  })

  it('updates the shared desktop layout through ServerService', async () => {
    const { app, serverService } = createApp()

    const res = await app.request(`http://localhost/api/servers/${serverId}/desktop-layout`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(layout),
    })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual(layout)
    expect(serverService.updateDesktopLayout).toHaveBeenCalledWith(serverId, layout, 'user-1')
  })
})
