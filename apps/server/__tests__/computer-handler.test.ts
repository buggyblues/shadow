import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'computer-handler-test-secret'

const { createComputerHandler } = await import('../src/handlers/computer.handler')
const { signAccessToken } = await import('../src/lib/jwt')

function setup() {
  const computer = {
    id: 'local:computer-1',
    sourceId: 'computer-1',
    kind: 'local',
    name: 'MacBook',
    status: 'online',
    device: { class: 'macbook', os: 'darwin', arch: 'arm64' },
    capabilities: {},
    runtimes: [],
    buddies: [],
    buddyCount: 0,
  }
  const computerService = {
    listComputers: vi.fn(async () => [computer]),
    getComputer: vi.fn(async () => computer),
    renameComputer: vi.fn(async (_userId: string, _id: string, name: string) => ({
      ...computer,
      name,
    })),
    removeLocalComputer: vi.fn(async (_userId: string, id: string) => ({
      ok: true,
      computerId: id,
    })),
  }
  const container = { resolve: vi.fn(() => computerService) }
  const app = new Hono()
  app.route('/api/computers', createComputerHandler(container as never))
  const headers = { Authorization: `Bearer ${signAccessToken({ userId: 'user-1' })}` }
  return { app, computerService, headers }
}

describe('computer handler', () => {
  it('lists the current user’s unified computers', async () => {
    const { app, computerService, headers } = setup()
    const response = await app.request('/api/computers?kind=local', { headers })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      computers: [expect.objectContaining({ id: 'local:computer-1' })],
    })
    expect(computerService.listComputers).toHaveBeenCalledWith('user-1', 'local')
  })

  it('renames and removes a local computer through the unified route', async () => {
    const { app, computerService, headers } = setup()
    const rename = await app.request('/api/computers/local%3Acomputer-1', {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Studio Mac' }),
    })
    const remove = await app.request('/api/computers/local%3Acomputer-1', {
      method: 'DELETE',
      headers,
    })

    expect(rename.status).toBe(200)
    expect(await rename.json()).toEqual({
      computer: expect.objectContaining({ name: 'Studio Mac' }),
    })
    expect(remove.status).toBe(200)
    expect(computerService.renameComputer).toHaveBeenCalledWith(
      'user-1',
      'local:computer-1',
      'Studio Mac',
    )
    expect(computerService.removeLocalComputer).toHaveBeenCalledWith('user-1', 'local:computer-1')
  })
})
