import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { createAdminHandler } from '../src/handlers/admin.handler'

vi.mock('../src/lib/jwt', () => ({
  verifyToken: vi.fn().mockReturnValue({
    userId: 'admin-user-1',
    username: 'admin',
    typ: 'access',
    aud: 'shadow:access',
    iss: 'shadow',
    jti: 'jwt-admin-1',
  }),
}))

function createTestApp(deps: Record<string, unknown>) {
  const app = new Hono()
  app.route(
    '/api/admin',
    createAdminHandler({
      resolve: (name: string) => {
        const value = deps[name]
        if (value) return value
        throw new Error(`Unexpected dependency: ${name}`)
      },
    } as never),
  )
  return app
}

function createAdminUseCase() {
  return {
    getUserById: vi.fn().mockResolvedValue({ id: 'admin-user-1', isAdmin: true }),
    getUsers: vi.fn().mockResolvedValue({
      items: [
        {
          id: 'user-1',
          email: 'pengye91@example.com',
          username: 'pengye91_209538',
          displayName: 'pengye91',
          avatarUrl: null,
          status: 'online',
          isBot: false,
          createdAt: '2026-03-23T01:54:53.354Z',
        },
      ],
      total: 1,
      limit: 20,
      offset: 40,
    }),
  }
}

describe('admin users handler', () => {
  it('passes server-side search, filters, sort, and pagination to the use case', async () => {
    const adminUseCase = createAdminUseCase()
    const app = createTestApp({ adminUseCase })

    const response = await app.request(
      '/api/admin/users?includeTotal=1&limit=20&offset=40&search=pengye91_209538&status=online&type=user&sortBy=username&sortOrder=asc',
      { headers: { Authorization: 'Bearer access-token' } },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      items: [
        {
          id: 'user-1',
          email: 'pengye91@example.com',
          username: 'pengye91_209538',
          displayName: 'pengye91',
          avatarUrl: null,
          status: 'online',
          isBot: false,
          createdAt: '2026-03-23T01:54:53.354Z',
        },
      ],
      total: 1,
      limit: 20,
      offset: 40,
    })
    expect(adminUseCase.getUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 20,
        offset: 40,
        search: 'pengye91_209538',
        status: 'online',
        isBot: false,
        sortBy: 'username',
        sortOrder: 'asc',
      }),
    )
  })

  it('keeps the legacy array response when total metadata is not requested', async () => {
    const adminUseCase = createAdminUseCase()
    const app = createTestApp({ adminUseCase })

    const response = await app.request('/api/admin/users?search=pengye91_209538', {
      headers: { Authorization: 'Bearer access-token' },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([
      {
        id: 'user-1',
        email: 'pengye91@example.com',
        username: 'pengye91_209538',
        displayName: 'pengye91',
        avatarUrl: null,
        status: 'online',
        isBot: false,
        createdAt: '2026-03-23T01:54:53.354Z',
      },
    ])
  })
})
