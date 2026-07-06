import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { createServerHandler } from '../src/handlers/server.handler'

const mockedAuthMiddleware = vi.hoisted(() =>
  vi.fn((c: { json: (body: unknown, status?: number) => Response }) =>
    c.json({ error: 'Unauthorized' }, 401),
  ),
)

vi.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: mockedAuthMiddleware,
}))

function createApp() {
  const publicServer = {
    id: 'server-1',
    name: 'Open Lab',
    slug: 'open-lab',
    description: 'A public server for testing discovery.',
    iconUrl: '/uploads/icon.png',
    bannerUrl: '/uploads/banner.png',
    wallpaperType: null,
    wallpaperUrl: null,
    wallpaperWorkspaceFileId: null,
    wallpaperInteractive: false,
    memberCount: 12,
    memberAvatars: [],
  }
  const serverService = {
    discoverPublic: vi.fn().mockResolvedValue([publicServer]),
  }
  const mediaService = {
    normalizeMediaUrl: vi.fn((mediaUrl: string | null | undefined) => mediaUrl ?? null),
    resolveMediaUrl: vi.fn((mediaUrl: string | null | undefined) =>
      mediaUrl ? `https://cdn.example${mediaUrl}` : null,
    ),
    createSignedUrl: vi.fn((input: { contentRef: string }) => ({
      url: `https://cdn.example${input.contentRef}`,
      expiresAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    })),
  }
  const container = {
    resolve: vi.fn((key: string) => {
      if (key === 'serverService') return serverService
      if (key === 'mediaService') return mediaService
      throw new Error(`Unexpected dependency: ${key}`)
    }),
  }
  const app = new Hono()
  app.route('/api/servers', createServerHandler(container as never))
  return { app, mediaService, serverService }
}

describe('public server discovery handler', () => {
  it('serves discovery results without authentication', async () => {
    const { app, mediaService, serverService } = createApp()

    const response = await app.request('http://localhost/api/servers/discover?limit=24&offset=3')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject([
      {
        id: 'server-1',
        name: 'Open Lab',
        slug: 'open-lab',
        iconUrl: 'https://cdn.example/uploads/icon.png',
        bannerUrl: 'https://cdn.example/uploads/banner.png',
        memberCount: 12,
      },
    ])
    expect(serverService.discoverPublic).toHaveBeenCalledWith(24, 3)
    expect(mediaService.resolveMediaUrl).toHaveBeenCalledWith('/uploads/icon.png', 'image/png', {
      variant: 'avatar',
    })
    expect(mockedAuthMiddleware).not.toHaveBeenCalled()
  })
})
