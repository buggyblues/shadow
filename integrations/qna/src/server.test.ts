import { afterEach, describe, expect, it, vi } from 'vitest'

describe('QnA runtime auth boundary', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('allows public read runtime commands without a launch token', async () => {
    vi.resetModules()
    vi.stubEnv('QNA_DATA_FILE', `.tmp/qna-public-read-${Date.now()}.json`)

    const { app } = await import('./server.js')
    const response = await app.request('/api/runtime/commands/questions.get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: { questionId: 'q_server_app_patterns' } }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      result: {
        question: {
          id: 'q_server_app_patterns',
        },
      },
    })
  })

  it('blocks write runtime commands without a launch token', async () => {
    vi.resetModules()
    vi.stubEnv('QNA_DATA_FILE', `.tmp/qna-auth-${Date.now()}.json`)

    const { app } = await import('./server.js')
    const response = await app.request('/api/runtime/commands/questions.ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: { title: 'Who can write?', body: 'launch required' } }),
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
