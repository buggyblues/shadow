import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KubernetesOpsGateway } from '../src/gateways/kubernetes-ops.gateway'

const childProcessMocks = vi.hoisted(() => ({
  spawn: vi.fn(),
}))

const ptyMocks = vi.hoisted(() => ({
  spawn: vi.fn(),
}))

const cloudRuntimeMocks = vi.hoisted(() => ({
  listManagedNamespaces: vi.fn(),
}))

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  spawn: childProcessMocks.spawn,
}))

vi.mock('@shadowob/cloud', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shadowob/cloud')>()),
  listManagedNamespaces: cloudRuntimeMocks.listManagedNamespaces,
}))

vi.mock('node-pty', () => ({
  spawn: ptyMocks.spawn,
}))

function createFakePty() {
  const exitListeners: Array<(event: { exitCode: number; signal?: number }) => void> = []
  return {
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn(),
    onExit: vi.fn((listener: (event: { exitCode: number; signal?: number }) => void) => {
      exitListeners.push(listener)
    }),
    emitExit(event: { exitCode: number; signal?: number }) {
      for (const listener of exitListeners) listener(event)
    },
  }
}

function createFakeChildProcess() {
  const proc = new EventEmitter() as EventEmitter & {
    stdin: EventEmitter & { writable: boolean; write: ReturnType<typeof vi.fn> }
    stdout: EventEmitter
    stderr: EventEmitter
    killed: boolean
    kill: ReturnType<typeof vi.fn>
  }
  proc.stdin = Object.assign(new EventEmitter(), { writable: true, write: vi.fn() })
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()
  proc.killed = false
  proc.kill = vi.fn(() => {
    proc.killed = true
    return true
  })
  return proc
}

function createGateway() {
  return new KubernetesOpsGateway({
    accessService: {} as never,
    cloudDeploymentDao: {} as never,
    logger: { warn: vi.fn() } as never,
  })
}

async function waitForSpawnCall() {
  for (let index = 0; index < 20; index += 1) {
    if (childProcessMocks.spawn.mock.calls[0]) return childProcessMocks.spawn.mock.calls[0]!
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error('spawn was not called')
}

describe('KubernetesOpsGateway kubectl operations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.KUBECONFIG_CONTEXT
    cloudRuntimeMocks.listManagedNamespaces.mockResolvedValue([])
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('lists pods through a bounded kubectl process', async () => {
    const child = createFakeChildProcess()
    childProcessMocks.spawn.mockReturnValue(child)
    const gateway = createGateway()

    const promise = gateway.listPods('shadow-test')

    const [, args, spawnOptions] = await waitForSpawnCall()
    expect(args).toEqual(expect.arrayContaining(['-n', 'shadow-test', 'get', 'pods', '-o', 'json']))
    expect(spawnOptions).toEqual({ stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.emit(
      'data',
      Buffer.from(
        JSON.stringify({
          items: [
            {
              metadata: { name: 'agent-0', creationTimestamp: '2026-06-29T00:00:00Z' },
              status: {
                phase: 'Running',
                containerStatuses: [
                  { name: 'openclaw', ready: true, restartCount: 1 },
                  { name: 'sidecar', ready: false, restartCount: 2 },
                ],
              },
            },
          ],
        }),
      ),
    )
    child.emit('close', 0)

    await expect(promise).resolves.toEqual([
      {
        name: 'agent-0',
        ready: '1/2',
        status: 'Running',
        restarts: 3,
        age: '2026-06-29T00:00:00Z',
        containers: ['openclaw', 'sidecar'],
      },
    ])
  })

  it('deletes namespaces asynchronously without waiting on finalizers', async () => {
    const child = createFakeChildProcess()
    childProcessMocks.spawn.mockReturnValue(child)
    const gateway = createGateway()

    const promise = gateway.deleteNamespace('shadow-test')

    const [, args, spawnOptions] = await waitForSpawnCall()
    expect(args).toEqual(
      expect.arrayContaining([
        'delete',
        'namespace',
        'shadow-test',
        '--ignore-not-found=true',
        '--wait=false',
      ]),
    )
    expect(spawnOptions).toEqual({ stdio: ['ignore', 'pipe', 'pipe'] })
    child.emit('close', 0)

    await expect(promise).resolves.toBeUndefined()
    expect(child.kill).not.toHaveBeenCalled()
  })

  it('deletes a deployment and waits for it to disappear before selector migration', async () => {
    const child = createFakeChildProcess()
    childProcessMocks.spawn.mockReturnValue(child)
    const gateway = createGateway()

    const promise = gateway.deleteDeployment('shadow-test', 'cloud-computer-browser')

    const [, args, spawnOptions] = await waitForSpawnCall()
    expect(args).toEqual(
      expect.arrayContaining([
        '-n',
        'shadow-test',
        'delete',
        'deployment',
        'cloud-computer-browser',
        '--ignore-not-found=true',
        '--wait=true',
      ]),
    )
    expect(spawnOptions).toEqual({ stdio: ['ignore', 'pipe', 'pipe'] })
    child.emit('close', 0)

    await expect(promise).resolves.toBeUndefined()
  })

  it('does not classify a managed namespace as orphaned when any deployment row owns it', async () => {
    cloudRuntimeMocks.listManagedNamespaces.mockResolvedValueOnce(['shadow-test'])
    const findByNamespaceAnyCluster = vi.fn(async () => ({ id: 'deployment-1' }))
    const gateway = new KubernetesOpsGateway({
      accessService: {} as never,
      cloudDeploymentDao: { findByNamespaceAnyCluster } as never,
      logger: { warn: vi.fn() } as never,
    })

    await expect(gateway.assertManagedOrphanNamespace('shadow-test')).rejects.toMatchObject({
      code: 'SCOPE_MISMATCH',
      status: 404,
      params: { message: 'Namespace is already owned by a deployment' },
    })
    expect(findByNamespaceAnyCluster).toHaveBeenCalledWith('shadow-test')
  })
})

describe('KubernetesOpsGateway interactive terminal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.KUBECONFIG_CONTEXT
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('spawns a kubectl exec PTY and proxies terminal operations', async () => {
    const fakePty = createFakePty()
    ptyMocks.spawn.mockReturnValue(fakePty)

    const gateway = createGateway()
    const session = await gateway.spawnInteractiveTerminal({
      namespace: 'shadow-test',
      pod: 'agent-0',
      container: 'openclaw',
      kubeconfig: 'apiVersion: v1\nkind: Config\nclusters: []\n',
      shell: '/bin/bash',
      cols: 160,
      rows: 48,
    })

    expect(ptyMocks.spawn).toHaveBeenCalledOnce()
    const [, args, options] = ptyMocks.spawn.mock.calls[0]!
    expect(args).toEqual(
      expect.arrayContaining([
        '-n',
        'shadow-test',
        'exec',
        '-it',
        'agent-0',
        '-c',
        'openclaw',
        '--',
        '/bin/bash',
        '-l',
      ]),
    )
    expect(args[0]).toBe('--kubeconfig')
    expect(existsSync(args[1] as string)).toBe(true)
    expect(options).toEqual(
      expect.objectContaining({ cols: 160, rows: 48, name: 'xterm-256color' }),
    )

    session.write('pwd\r')
    expect(fakePty.write).toHaveBeenCalledWith('pwd\r')

    session.resize(999, 1)
    expect(fakePty.resize).toHaveBeenCalledWith(240, 8)

    session.kill()
    expect(fakePty.kill).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(existsSync(args[1] as string)).toBe(false))
  })

  it('falls back to a pipe-backed kubectl exec when the native PTY is unavailable', async () => {
    const child = createFakeChildProcess()
    ptyMocks.spawn.mockImplementationOnce(() => {
      throw new Error('posix_spawnp failed')
    })
    childProcessMocks.spawn.mockReturnValueOnce(child)
    const gateway = createGateway()

    const session = await gateway.spawnInteractiveTerminal({
      namespace: 'shadow-test',
      pod: 'agent-0',
      container: 'openclaw',
    })

    const [command, args, options] = childProcessMocks.spawn.mock.calls[0]!
    expect(command).toBe('kubectl')
    expect(args).toEqual(
      expect.arrayContaining([
        '-n',
        'shadow-test',
        'exec',
        '-i',
        'agent-0',
        '-c',
        'openclaw',
        '--',
        '/bin/bash',
        '-il',
      ]),
    )
    expect(args).not.toContain('-it')
    expect(options).toEqual(expect.objectContaining({ stdio: ['pipe', 'pipe', 'pipe'] }))

    const onData = vi.fn()
    const onExit = vi.fn()
    session.onData(onData)
    session.onExit(onExit)
    child.stdout.emit('data', Buffer.from('ready\n'))
    session.write('pwz\u007fd\r')
    child.emit('exit', 0)

    expect(onData).toHaveBeenCalledWith('ready\n')
    expect(child.stdin.write).toHaveBeenCalledWith('pwd\n')
    expect(onData).toHaveBeenCalledWith('\b \b')
    expect(onData).toHaveBeenCalledWith('\r\n')
    expect(onExit).toHaveBeenCalledWith({ exitCode: 0 })
  })

  it('rejects unsafe Kubernetes object names before spawning', async () => {
    const gateway = createGateway()
    await expect(
      gateway.spawnInteractiveTerminal({
        namespace: 'shadow-test',
        pod: 'agent;rm',
      }),
    ).rejects.toThrow('Invalid Kubernetes pod')
    expect(ptyMocks.spawn).not.toHaveBeenCalled()
  })

  it('limits active terminals and releases the slot on exit', async () => {
    const gateway = createGateway()
    const ptys = Array.from({ length: 16 }, () => createFakePty())
    for (const pty of ptys) {
      ptyMocks.spawn.mockReturnValueOnce(pty)
      await gateway.spawnInteractiveTerminal({
        namespace: 'shadow-test',
        pod: 'agent-0',
      })
    }

    await expect(
      gateway.spawnInteractiveTerminal({
        namespace: 'shadow-test',
        pod: 'agent-1',
      }),
    ).rejects.toThrow('Kubernetes operation queue is full: interactive terminal')

    const nextPty = createFakePty()
    ptys[0]?.emitExit({ exitCode: 0 })
    ptyMocks.spawn.mockReturnValueOnce(nextPty)
    const session = await gateway.spawnInteractiveTerminal({
      namespace: 'shadow-test',
      pod: 'agent-1',
    })
    session.kill()

    for (const pty of ptys.slice(1)) {
      pty.emitExit({ exitCode: 0 })
    }
  })
})
