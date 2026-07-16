import { describe, expect, it, vi } from 'vitest'
import { ComputerService } from '../src/services/computer.service'

const localComputer = {
  id: 'local-1',
  installationId: 'install-local-1',
  name: 'Alex’s MacBook',
  status: 'offline' as const,
  hostname: 'alex-macbook.local',
  os: 'darwin',
  osVersion: '26.0',
  arch: 'arm64',
  deviceClass: 'macbook',
  deviceVendor: 'Apple',
  deviceModel: 'MacBookPro18,3',
  daemonVersion: '1.1.65',
  capabilities: ['tasks', 'files', 'terminal'],
  runtimes: [
    { id: 'codex', label: 'Codex CLI', kind: 'cli' as const, status: 'available' as const },
  ],
  lastSeenAt: '2026-07-14T01:00:00.000Z',
  createdAt: '2026-07-13T01:00:00.000Z',
  updatedAt: '2026-07-14T01:00:00.000Z',
}

function createService() {
  const connectorService = {
    listComputers: vi.fn(async () => [localComputer]),
    renameComputer: vi.fn(async () => ({ ...localComputer, name: 'Renamed' })),
    revokeComputer: vi.fn(async () => ({ ok: true, computerId: localComputer.id })),
  }
  const connectorDao = {
    listConnectorAgentsForComputer: vi.fn(async () => [
      {
        agent: {
          id: 'agent-local',
          kernelType: 'codex',
          status: 'running',
          config: { connectorRuntimeId: 'codex', connectorRuntimeLabel: 'Codex CLI' },
        },
        botUser: {
          id: 'bot-local',
          username: 'local-buddy',
          displayName: 'Local Buddy',
          avatarUrl: null,
        },
        placement: {
          runtimeId: 'codex',
          runtimeLabel: 'Codex CLI',
          workDir: '.',
        },
      },
    ]),
  }
  const cloudDeploymentDao = {
    listCloudComputerCandidatesByUser: vi.fn(async () => [
      {
        id: 'deployment-1',
        userId: 'user-1',
        name: 'Build Cloud',
        namespace: 'build-cloud',
        status: 'deployed',
        saasMode: true,
        resourceTier: 'lightweight',
        hourlyCost: 1,
        monthlyCost: null,
        configSnapshot: {
          cloudComputer: { schemaVersion: 2, runtimes: [{ id: 'codex' }] },
          deployments: { agents: [] },
        },
        createdAt: new Date('2026-07-13T00:00:00.000Z'),
        updatedAt: new Date('2026-07-14T00:00:00.000Z'),
        lastActiveAt: new Date('2026-07-14T00:00:00.000Z'),
      },
    ]),
    updateName: vi.fn(),
  }
  const agentService = { getByIds: vi.fn(async () => []) }
  return {
    connectorService,
    service: new ComputerService({
      connectorDao: connectorDao as never,
      connectorService: connectorService as never,
      cloudDeploymentDao: cloudDeploymentDao as never,
      agentService: agentService as never,
    }),
  }
}

describe('ComputerService', () => {
  it('aggregates retained local computers and cloud computers into one domain model', async () => {
    const { service } = createService()

    const computers = await service.listComputers('user-1')

    expect(computers).toHaveLength(2)
    expect(computers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'local:local-1',
          kind: 'local',
          status: 'offline',
          device: expect.objectContaining({ class: 'macbook', model: 'MacBookPro18,3' }),
          buddies: [
            expect.objectContaining({
              agentId: 'agent-local',
              runtimeId: 'codex',
              status: 'offline',
            }),
          ],
        }),
        expect.objectContaining({
          kind: 'cloud',
          name: 'Build Cloud',
          device: expect.objectContaining({ class: 'cloud' }),
        }),
      ]),
    )
  })

  it('projects Buddy placement from the unified computer model', async () => {
    const { service } = createService()

    const placement = (await service.placementMap('user-1')).get('agent-local')

    expect(placement).toEqual(
      expect.objectContaining({
        computerId: 'local:local-1',
        computerKind: 'local',
        computerName: 'Alex’s MacBook',
        computerStatus: 'offline',
        deviceClass: 'macbook',
        runtimeId: 'codex',
      }),
    )
  })
})
