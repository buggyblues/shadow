import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'connector-handler-test-secret'

const { createApp } = await import('../src/app')
const { createConnectorHandler } = await import('../src/handlers/connector.handler')
const { signAccessToken } = await import('../src/lib/jwt')

const machineToken = 'sk_machine_route_test'

function createConnectorTestApp(container: ReturnType<typeof makeContainer>['container']) {
  const app = new Hono()
  app.route('/api', createConnectorHandler(container as never))
  return app
}

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
    configureBuddyOnComputer: vi.fn(async () => ({
      agent: { id: 'agent-1', userId: 'bot-user-1', status: 'stopped' },
      job: { id: 'job-1', status: 'pending', type: 'configure-buddy' },
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
        deviceFingerprint: 'device-shared-1',
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
      expect.objectContaining({
        deviceFingerprint: 'device-shared-1',
        hostname: 'workstation.local',
      }),
    )
    expect(io.to).toHaveBeenCalledWith('user:user-1')
  })

  it('forwards a working directory when reconfiguring a local Buddy', async () => {
    const { connectorService, io, container } = makeContainer()
    const app = createConnectorTestApp(container)
    const response = await app.request(
      '/api/connector/computers/computer-1/buddies/agent-1/configure',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${signAccessToken({ userId: 'user-1' })}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          runtimeId: 'codex',
          serverUrl: 'https://shadowob.com',
          workDir: '/workspace/project',
        }),
      },
    )

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toMatchObject({
      agent: { id: 'agent-1' },
      job: { id: 'job-1', type: 'configure-buddy' },
    })
    expect(connectorService.configureBuddyOnComputer).toHaveBeenCalledWith(
      'user-1',
      'computer-1',
      'agent-1',
      {
        runtimeId: 'codex',
        serverUrl: 'https://shadowob.com',
        workDir: '/workspace/project',
      },
    )
    expect(io.to).toHaveBeenCalledWith('user:user-1')
  })

  it('rejects an empty working directory before creating a configure job', async () => {
    const { connectorService, container } = makeContainer()
    const app = createConnectorTestApp(container)
    const response = await app.request(
      '/api/connector/computers/computer-1/buddies/agent-1/configure',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${signAccessToken({ userId: 'user-1' })}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          runtimeId: 'codex',
          serverUrl: 'https://shadowob.com',
          workDir: '   ',
        }),
      },
    )

    expect(response.status).toBe(400)
    expect(connectorService.configureBuddyOnComputer).not.toHaveBeenCalled()
  })
})
