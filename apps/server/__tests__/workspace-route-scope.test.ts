import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { createWorkspaceHandler } from '../src/handlers/workspace.handler'

describe('workspace route scope', () => {
  it('does not intercept public server discovery routes mounted after workspace', async () => {
    const app = new Hono()

    app.route('/api', createWorkspaceHandler({} as never))
    app.get('/api/servers/discover', (c) => c.json([{ id: 'public-server' }]))

    const response = await app.request('/api/servers/discover')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual([{ id: 'public-server' }])
  })

  it('still protects workspace routes', async () => {
    const app = new Hono()

    app.route('/api', createWorkspaceHandler({} as never))

    const response = await app.request('/api/servers/demo/workspace')

    expect(response.status).toBe(401)
  })
})
