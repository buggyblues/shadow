import { describe, expect, it, vi } from 'vitest'
import type { AppContainer } from '../src/container'
import { cloudComputerIdForDeployment } from '../src/lib/cloud-computer-identity'
import { setupCloudComputerGateway } from '../src/ws/cloud-computer.gateway'

const deployment = {
  id: 'computer-1',
  userId: 'user-1',
  clusterId: null,
  namespace: 'shadow-computer',
  name: 'Computer One',
  status: 'deployed',
  configSnapshot: {
    deployments: {
      agents: [{ id: 'agent-1', runtime: 'openclaw' }],
    },
  },
}

describe('cloud computer gateway', () => {
  it('starts and controls an interactive terminal for a cloud computer', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const terminal = {
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      onData: vi.fn(),
      onExit: vi.fn(),
    }
    const kubernetesOpsGateway = {
      listPods: vi.fn(async () => [
        {
          name: 'agent-1-pod',
          status: 'Running',
          ready: '1/1',
          restarts: 0,
          age: '1m',
          containers: ['openclaw'],
        },
      ]),
      spawnInteractiveTerminal: vi.fn(() => terminal),
    }
    const cloudSaasUseCase = {
      getDeploymentOwned: vi.fn(async () => null),
      listDeployments: vi.fn(async () => [deployment]),
      findClusterByIdOnly: vi.fn(async () => null),
    }
    const cloudDeploymentDao = {
      listCloudComputerCandidatesByUser: vi.fn(async () => [deployment]),
    }
    const container = {
      resolve: vi.fn((name: string) => {
        if (name === 'cloudDeploymentDao') return cloudDeploymentDao
        if (name === 'cloudSaasUseCase') return cloudSaasUseCase
        if (name === 'kubernetesOpsGateway') return kubernetesOpsGateway
        throw new Error(`unexpected dependency ${name}`)
      }),
    } as unknown as AppContainer
    let connect: ((socket: unknown) => void) | null = null
    const io = {
      on: vi.fn((event: string, callback: (socket: unknown) => void) => {
        if (event === 'connection') connect = callback
      }),
    }
    const socket = {
      id: 'socket-1',
      data: { actor: { kind: 'user', userId: 'user-1' } },
      on: vi.fn((event: string, callback: (...args: unknown[]) => unknown) => {
        handlers.set(event, callback)
      }),
      emit: vi.fn(),
    }

    setupCloudComputerGateway(io as never, container)
    connect?.(socket)

    let ack: unknown
    await handlers.get('cloud-computer:terminal:start')?.(
      {
        computerId: cloudComputerIdForDeployment(deployment),
        agent: 'agent-1',
        cols: 80,
        rows: 24,
      },
      (value: unknown) => {
        ack = value
      },
    )

    expect(ack).toMatchObject({
      ok: true,
      namespace: deployment.namespace,
      pod: 'agent-1-pod',
      container: 'openclaw',
    })
    expect(cloudDeploymentDao.listCloudComputerCandidatesByUser).toHaveBeenCalledWith('user-1')
    const sessionId = (ack as { sessionId: string }).sessionId
    expect(kubernetesOpsGateway.spawnInteractiveTerminal).toHaveBeenCalledWith({
      namespace: deployment.namespace,
      pod: 'agent-1-pod',
      container: 'openclaw',
      kubeconfig: undefined,
      shell: undefined,
      cols: 80,
      rows: 24,
    })

    handlers.get('cloud-computer:terminal:input')?.({ sessionId, data: 'pwd\n' })
    handlers.get('cloud-computer:terminal:resize')?.({ sessionId, cols: 100, rows: 30 })
    handlers.get('cloud-computer:terminal:stop')?.({ sessionId })

    expect(terminal.write).toHaveBeenCalledWith('pwd\n')
    expect(terminal.resize).toHaveBeenCalledWith(100, 30)
    expect(terminal.kill).toHaveBeenCalled()
  })
})
