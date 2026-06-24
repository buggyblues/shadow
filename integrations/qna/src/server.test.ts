import { afterEach, describe, expect, it, vi } from 'vitest'

describe('QnA runtime auth boundary', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('blocks runtime commands without a launch token', async () => {
    vi.resetModules()
    vi.stubEnv('QNA_DATA_FILE', `.tmp/qna-auth-${Date.now()}.json`)

    const { app } = await import('./server.js')
    const response = await app.request('/api/runtime/commands/questions.list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: {} }),
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'launch_required',
    })
  })

  it('does not expose legacy local command routes', async () => {
    vi.resetModules()
    vi.stubEnv('QNA_DATA_FILE', `.tmp/qna-local-route-${Date.now()}.json`)

    const { app } = await import('./server.js')
    const response = await app.request('/api/local/commands/questions.list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: {} }),
    })

    expect(response.status).toBe(404)
  })

  it('blocks runtime inbox lookup without a launch token', async () => {
    vi.resetModules()
    vi.stubEnv('QNA_DATA_FILE', `.tmp/qna-inboxes-${Date.now()}.json`)

    const { app } = await import('./server.js')
    const response = await app.request('/api/runtime/inboxes')

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'launch_required',
    })
  })

  it('does not expose the legacy image upload route', async () => {
    vi.resetModules()
    vi.stubEnv('QNA_DATA_FILE', `.tmp/qna-image-route-${Date.now()}.json`)

    const { app } = await import('./server.js')
    const response = await app.request('/api/runtime/images', { method: 'POST' })

    expect(response.status).toBe(404)
  })
})
