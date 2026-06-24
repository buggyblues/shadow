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
  version: 1 as const,
  items: [
    {
      id: 'builtin:workspace',
      kind: 'builtin-app' as const,
      builtinKey: 'workspace',
      title: 'Workspace',
      x: 24,
      y: 56,
    },
  ],
  widgets: [
    {
      id: 'widget:notice',
      kind: 'sticky-note' as const,
      x: 128,
      y: 168,
      widthCells: 3,
      heightCells: 2,
      content: '## Notice',
    },
    {
      id: 'widget:docs',
      kind: 'web-embed' as const,
      sourceType: 'url' as const,
      source: 'https://example.com/docs',
      x: 456,
      y: 168,
      widthCells: 5,
      heightCells: 4,
      title: 'Docs',
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
