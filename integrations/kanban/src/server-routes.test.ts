import { describe, expect, it } from 'vitest'
import { app } from './server.js'

describe('Kanban runtime routes', () => {
  it('does not expose legacy local command routes', async () => {
    const response = await app.request('/api/local/commands/boards.get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: {} }),
    })

    expect(response.status).toBe(404)
  })

  it('does not expose the legacy board REST route', async () => {
    const response = await app.request('/api/board')

    expect(response.status).toBe(404)
  })

  it('blocks runtime inbox lookup without a launch token', async () => {
    const response = await app.request('/api/runtime/inboxes')

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'launch_required',
    })
  })
})
