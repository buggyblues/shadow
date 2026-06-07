import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockChild = {
  pid: 1234,
  killed: false,
  kill: vi.fn(),
  on: vi.fn(),
}

// Mock child_process
vi.mock('node:child_process', () => ({
  fork: vi.fn(() => mockChild),
}))

// Mock node:path
vi.mock('node:path', async () => {
  const actual = await vi.importActual<typeof import('node:path')>('node:path')
  return {
    ...actual,
    resolve: vi.fn((...args: string[]) => actual.resolve(...args)),
  }
})

// Mock electron
const mockIpcHandlers = new Map<string, (...args: any[]) => any>()
vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn(() => '/app'),
    getName: vi.fn(() => 'Shadow'),
    getPath: vi.fn((name: string) =>
      name === 'exe' ? '/Applications/Shadow.app/Contents/MacOS/Shadow' : '/tmp/shadow',
    ),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
      mockIpcHandlers.set(channel, handler)
    }),
  },
}))

describe('process-manager', () => {
  async function registerHandlersForTest() {
    const { ProcessManagerService } = await import('../src/main/services/process-manager.service')
    const { registerProcessManagerHandlers } = await import(
      '../src/main/handlers/process-manager.handler'
    )
    registerProcessManagerHandlers({
      cradle: {
        processManagerService: new ProcessManagerService(),
      },
    } as any)
  }

  beforeEach(() => {
    vi.resetModules()
    mockIpcHandlers.clear()
    mockChild.killed = false
    mockChild.kill.mockClear()
    mockChild.on.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should register all IPC handlers', async () => {
    await registerHandlersForTest()

    expect(mockIpcHandlers.has('desktop:startAgent')).toBe(true)
    expect(mockIpcHandlers.has('desktop:stopAgent')).toBe(true)
    expect(mockIpcHandlers.has('desktop:getAgentStatus')).toBe(true)
    expect(mockIpcHandlers.has('desktop:listAgents')).toBe(true)
  })

  it('should reject script paths outside app directory', async () => {
    const { resolve } = await import('node:path')
    ;(resolve as ReturnType<typeof vi.fn>).mockReturnValue('/malicious/script.js')

    await registerHandlersForTest()

    const handler = mockIpcHandlers.get('desktop:startAgent')!
    const mockEvent = { sender: { send: vi.fn() } }

    await expect(
      handler(mockEvent, { name: 'test', scriptPath: '/malicious/script.js' }),
    ).rejects.toThrow('Agent script must be within the application directory')
  })

  it('should return agent status for running process', async () => {
    const { resolve } = await import('node:path')
    ;(resolve as ReturnType<typeof vi.fn>).mockReturnValue('/app/agents/test.js')

    await registerHandlersForTest()

    const startHandler = mockIpcHandlers.get('desktop:startAgent')!
    const statusHandler = mockIpcHandlers.get('desktop:getAgentStatus')!
    const mockEvent = { sender: { send: vi.fn() } }

    const result = await startHandler(mockEvent, {
      name: 'test',
      scriptPath: '/app/agents/test.js',
    })

    const status = await statusHandler(mockEvent, result.id)
    expect(status.running).toBe(true)
    expect(status.name).toBe('test')
  })

  it('should return not-running status for unknown process', async () => {
    await registerHandlersForTest()

    const handler = mockIpcHandlers.get('desktop:getAgentStatus')!
    const result = await handler({}, 'unknown-id')
    expect(result).toEqual({ running: false })
  })

  it('should list all running agents', async () => {
    const { resolve } = await import('node:path')
    ;(resolve as ReturnType<typeof vi.fn>).mockReturnValue('/app/agents/test.js')

    await registerHandlersForTest()

    const startHandler = mockIpcHandlers.get('desktop:startAgent')!
    const listHandler = mockIpcHandlers.get('desktop:listAgents')!
    const mockEvent = { sender: { send: vi.fn() } }

    await startHandler(mockEvent, { name: 'agent1', scriptPath: '/app/agents/test.js' })

    const list = await listHandler({})
    expect(list.length).toBe(1)
    expect(list[0].name).toBe('agent1')
    expect(list[0].running).toBe(true)
  })
})
