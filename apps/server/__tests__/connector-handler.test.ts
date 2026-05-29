import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app'

const machineToken = 'sk_machine_route_test'

function makeContainer() {
  const emit = vi.fn()
  const io = {
    to: vi.fn(() => ({ emit })),
  }
  const connectorService = {
    authenticateDaemon: vi.fn(async (apiKey: string) =>
      apiKey === machineToken ? { id: 'computer-1', userId: 'user-1' } : null,
    ),
    recordHeartbeat: vi.fn(async () => ({
      id: 'computer-1',
      name: 'Workstation',
      status: 'online',
      hostname: 'workstation.local',
      os: 'darwin',
      arch: 'arm64',
      daemonVersion: 'test',
      runtimes: [
        {
          id: 'codex',
          label: 'Codex CLI',
          kind: 'cli',
          status: 'available',
          version: 'test',
          command: 'codex',
          detectedAt: new Date().toISOString(),
        },
      ],
      lastSeenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
  }
  const agentDao = {
    findByTokenHash: vi.fn(async () => null),
    findByLastToken: vi.fn(async () => null),
  }

  return {
    connectorService,
    io,
    container: {
      resolve: vi.fn((name: string) => {
        if (name === 'connectorService') return connectorService
        if (name === 'io') return io
        if (name === 'agentDao') return agentDao
        throw new Error(`Unexpected dependency: ${name}`)
      }),
    },
  }
}

describe('connector handler routing', () => {
  it('accepts daemon machine-token heartbeats before broad user-auth /api handlers', async () => {
    const { connectorService, io, container } = makeContainer()
    const app = createApp(container as never)

    const response = await app.request('/api/connector/daemon/heartbeat', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${machineToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        hostname: 'workstation.local',
        os: 'darwin',
        arch: 'arm64',
        daemonVersion: 'test',
        runtimes: [
          {
            id: 'codex',
            label: 'Codex CLI',
            kind: 'cli',
            status: 'available',
            version: 'test',
            command: 'codex',
            detectedAt: new Date().toISOString(),
          },
        ],
      }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ ok: true })
    expect(connectorService.authenticateDaemon).toHaveBeenCalledWith(machineToken)
    expect(connectorService.recordHeartbeat).toHaveBeenCalledWith(
      'computer-1',
      expect.objectContaining({ hostname: 'workstation.local' }),
    )
    expect(io.to).toHaveBeenCalledWith('user:user-1')
  })
})
