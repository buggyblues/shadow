import { beforeEach, describe, expect, it, vi } from 'vitest'

const testState = vi.hoisted(() => ({
  fetchWithAuth: vi.fn(),
  settings: {
    serverBaseUrl: 'https://shadowob.com',
    connectorComputerId: 'computer-1',
    connectorDeletedConnectionIds: [] as string[],
    connectorBuddyWorkDirs: {} as Record<string, string>,
  },
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp'),
    on: vi.fn(),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
  net: {
    fetch: vi.fn(),
  },
}))

vi.mock('../src/main/services/community-session.service', () => ({
  communitySessionService: {
    fetchWithAuth: testState.fetchWithAuth,
  },
}))

vi.mock('../src/main/services/desktop-settings.service', () => ({
  desktopSettingsService: {
    getSettings: vi.fn(async () => testState.settings),
    setSettings: vi.fn(async (patch: Record<string, unknown>) => ({
      ...testState.settings,
      ...patch,
    })),
    resolveDesktopServerBaseUrl: vi.fn(() => 'https://shadowob.com'),
    connectorWorkDirMapFilePath: vi.fn(() => '/tmp/connector-workdirs.json'),
  },
}))

vi.mock('../src/main/services/logger.service', () => ({
  loggerService: { write: vi.fn() },
}))

vi.mock('../src/main/services/process-manager.service', () => ({
  processManagerService: { resolveElectronNodeBinary: vi.fn(async () => '/usr/bin/node') },
}))

vi.mock('../src/main/services/window.service', () => ({
  windowService: {
    getConnectorAuthWindow: vi.fn(() => null),
  },
}))

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function computer(runtimeIds = ['codex']) {
  return {
    id: 'computer-1',
    name: 'This computer',
    status: 'online',
    hostname: 'test-host',
    os: 'darwin',
    arch: 'arm64',
    runtimes: runtimeIds.map((id) => ({ id, label: id, status: 'available' })),
  }
}

function createdAgent(runtimeId = 'codex') {
  return {
    id: 'agent-1',
    status: 'stopped',
    config: {
      connectorComputerId: 'computer-1',
      connectorRuntimeId: runtimeId,
      connectorRuntimeLabel: runtimeId,
    },
    botUser: {
      id: 'buddy-user-1',
      username: 'codex_buddy',
      displayName: 'Codex Buddy',
    },
  }
}

async function createBuddy() {
  const { connectorDaemonService } = await import('../src/main/services/connector-daemon.service')
  return connectorDaemonService.createBuddy({
    runtimeId: 'codex',
    name: 'Codex Buddy',
    username: 'codex_buddy',
  })
}

describe('desktop Connector Buddy creation compensation', () => {
  beforeEach(() => {
    vi.resetModules()
    testState.fetchWithAuth.mockReset()
    testState.settings.connectorDeletedConnectionIds = []
    testState.settings.connectorBuddyWorkDirs = {}
  })

  it('deletes the incomplete Buddy through its computer binding when the job fails', async () => {
    testState.fetchWithAuth.mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === '/api/connector/computers') {
        return jsonResponse({ computers: [computer()] })
      }
      if (path === '/api/connector/computers/computer-1/buddies' && options?.method === 'POST') {
        return jsonResponse({
          agent: createdAgent(),
          job: { id: 'job-1', status: 'pending', type: 'configure-buddy' },
        })
      }
      if (path === '/api/connector/jobs/job-1') {
        return jsonResponse({
          job: {
            id: 'job-1',
            status: 'failed',
            type: 'configure-buddy',
            error: 'Codex bridge failed to start',
          },
        })
      }
      if (
        path === '/api/connector/computers/computer-1/buddies/agent-1' &&
        options?.method === 'DELETE'
      ) {
        return jsonResponse({ agent: null, job: { id: 'remove-job-1' } })
      }
      throw new Error(`Unexpected request: ${options?.method ?? 'GET'} ${path}`)
    })

    await expect(createBuddy()).rejects.toThrow(
      'Buddy setup failed: Codex bridge failed to start. The incomplete Buddy was removed; you can retry safely.',
    )

    const deleteCall = testState.fetchWithAuth.mock.calls.find(
      ([path, options]) =>
        path === '/api/connector/computers/computer-1/buddies/agent-1' &&
        options?.method === 'DELETE',
    )
    expect(deleteCall).toBeDefined()
    expect(JSON.parse(String(deleteCall?.[1]?.body))).toEqual({ deleteCloudBuddy: true })
    expect(
      testState.fetchWithAuth.mock.calls.some(
        ([path, options]) => path === '/api/agents/agent-1' && options?.method === 'DELETE',
      ),
    ).toBe(false)
  })

  it('falls back to direct Agent deletion when binding cleanup fails', async () => {
    testState.fetchWithAuth.mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === '/api/connector/computers') {
        return jsonResponse({ computers: [computer()] })
      }
      if (path === '/api/connector/computers/computer-1/buddies' && options?.method === 'POST') {
        return jsonResponse({
          agent: createdAgent(),
          job: { id: 'job-1', status: 'pending', type: 'configure-buddy' },
        })
      }
      if (path === '/api/connector/jobs/job-1') {
        return jsonResponse({
          job: {
            id: 'job-1',
            status: 'failed',
            type: 'configure-buddy',
            error: 'Runtime configuration failed',
          },
        })
      }
      if (
        path === '/api/connector/computers/computer-1/buddies/agent-1' &&
        options?.method === 'DELETE'
      ) {
        return jsonResponse({ error: 'remove job unavailable' }, 500)
      }
      if (path === '/api/agents/agent-1' && options?.method === 'DELETE') {
        return jsonResponse({ ok: true })
      }
      throw new Error(`Unexpected request: ${options?.method ?? 'GET'} ${path}`)
    })

    await expect(createBuddy()).rejects.toThrow(
      'Buddy setup failed: Runtime configuration failed. The incomplete Buddy was removed; you can retry safely.',
    )
    expect(
      testState.fetchWithAuth.mock.calls.some(
        ([path, options]) => path === '/api/agents/agent-1' && options?.method === 'DELETE',
      ),
    ).toBe(true)
  })

  it('removes a running connection returned for the wrong runtime', async () => {
    testState.fetchWithAuth.mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === '/api/connector/computers') {
        return jsonResponse({ computers: [computer(['codex', 'claude-code'])] })
      }
      if (path === '/api/connector/computers/computer-1/buddies' && options?.method === 'POST') {
        return jsonResponse({
          agent: createdAgent(),
          job: { id: 'job-1', status: 'pending', type: 'configure-buddy' },
        })
      }
      if (path === '/api/connector/jobs/job-1') {
        return jsonResponse({
          job: {
            id: 'job-1',
            status: 'completed',
            type: 'configure-buddy',
            result: { runtimeId: 'codex' },
          },
        })
      }
      if (path === '/api/agents') {
        return jsonResponse([{ ...createdAgent('claude-code'), status: 'running' }])
      }
      if (
        path === '/api/connector/computers/computer-1/buddies/agent-1' &&
        options?.method === 'DELETE'
      ) {
        return jsonResponse({ agent: null, job: { id: 'remove-job-1' } })
      }
      throw new Error(`Unexpected request: ${options?.method ?? 'GET'} ${path}`)
    })

    await expect(createBuddy()).rejects.toThrow(
      'The Connector returned runtime "claude-code" instead of "codex".',
    )
    expect(
      testState.fetchWithAuth.mock.calls.some(
        ([path, options]) =>
          path === '/api/connector/computers/computer-1/buddies/agent-1' &&
          options?.method === 'DELETE',
      ),
    ).toBe(true)
  })
})
