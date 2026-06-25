import { afterEach, describe, expect, it, vi } from 'vitest'

describe('QnA runtime auth boundary', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('allows public read App commands without a launch token', async () => {
    vi.resetModules()
    vi.stubEnv('QNA_DATA_FILE', `.tmp/qna-public-read-${Date.now()}.json`)

    const { app } = await import('./server.js')
    const response = await app.request('/api/commands/questions.get', {
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

  it('blocks write App commands without a launch token', async () => {
    vi.resetModules()
    vi.stubEnv('QNA_DATA_FILE', `.tmp/qna-auth-${Date.now()}.json`)

    const { app } = await import('./server.js')
    const response = await app.request('/api/commands/questions.ask', {
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
    const response = await app.request('/api/inboxes')

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
    const response = await app.request('/api/images', { method: 'POST' })

    expect(response.status).toBe(404)
  })

  it('does not persist signed media links as author avatars', async () => {
    vi.resetModules()
    vi.stubEnv('QNA_DATA_FILE', `.tmp/qna-avatar-${Date.now()}.json`)
    vi.stubEnv('SHADOWOB_WEB_BASE_URL', 'https://shadowob.com')

    const { normalizeQnaAvatarUrl } = await import('./data.js')

    expect(normalizeQnaAvatarUrl('/api/media/signed/example')).toBeNull()
    expect(normalizeQnaAvatarUrl('https://shadowob.com/api/media/signed/example')).toBeNull()
    expect(normalizeQnaAvatarUrl('/avatars/example.png')).toBe(
      'https://shadowob.com/avatars/example.png',
    )
  })
})
