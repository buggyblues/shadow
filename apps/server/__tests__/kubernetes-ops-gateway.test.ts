import { existsSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KubernetesOpsGateway } from '../src/gateways/kubernetes-ops.gateway'

const ptyMocks = vi.hoisted(() => ({
  spawn: vi.fn(),
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

function createGateway() {
  return new KubernetesOpsGateway({
    accessService: {} as never,
    cloudDeploymentDao: {} as never,
    logger: { warn: vi.fn() } as never,
  })
}

describe('KubernetesOpsGateway interactive terminal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.KUBECONFIG_CONTEXT
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('spawns a kubectl exec PTY and proxies terminal operations', () => {
    const fakePty = createFakePty()
    ptyMocks.spawn.mockReturnValue(fakePty)

    const gateway = createGateway()
    const session = gateway.spawnInteractiveTerminal({
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
    expect(existsSync(args[1] as string)).toBe(false)
  })

  it('rejects unsafe Kubernetes object names before spawning', () => {
    const gateway = createGateway()
    expect(() =>
      gateway.spawnInteractiveTerminal({
        namespace: 'shadow-test',
        pod: 'agent;rm',
      }),
    ).toThrow('Invalid Kubernetes pod')
    expect(ptyMocks.spawn).not.toHaveBeenCalled()
  })
})
