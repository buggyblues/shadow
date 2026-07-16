import { describe, expect, it, vi } from 'vitest'

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'connector-service-test-secret'

const { ConnectorService } = await import('../src/services/connector.service')

const now = () => new Date()

function makeComputer(overrides: Record<string, unknown> = {}) {
  return {
    id: 'computer-1',
    userId: 'user-1',
    installationId: null,
    deviceFingerprint: null,
    name: 'Laptop',
    hostname: 'laptop.local',
    os: 'darwin',
    osVersion: '26.0',
    arch: 'arm64',
    deviceClass: 'macbook',
    deviceVendor: 'Apple',
    deviceModel: 'MacBookPro18,3',
    daemonVersion: '0.1.0',
    capabilities: [],
    runtimes: [],
    lastSeenAt: now(),
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  }
}

function makeService() {
  let capturedPayloadEncrypted = ''
  const connectorDao = {
    createComputer: vi.fn(async (input: any) =>
      makeComputer({
        name: input.name,
        tokenHash: input.tokenHash,
        lastSeenAt: null,
      }),
    ),
    findPendingComputerForUser: vi.fn(async () => null),
    findComputerByInstallation: vi.fn(async () => null),
    findComputerByDeviceFingerprint: vi.fn(async () => null),
    resetComputerToken: vi.fn(async (id: string, userId: string, input: any) =>
      makeComputer({
        id,
        userId,
        name: input.name,
        tokenHash: input.tokenHash,
        lastSeenAt: null,
      }),
    ),
    deletePendingComputersForUserExcept: vi.fn(async () => undefined),
    listComputers: vi.fn(),
    findComputerByTokenHash: vi.fn(),
    findComputerById: vi.fn(),
    findComputerForUser: vi.fn(),
    updateComputerHeartbeat: vi.fn(),
    reconcileComputerDeviceFingerprint: vi.fn(),
    updateComputerName: vi.fn(),
    revokeComputer: vi.fn(),
    upsertLocalPlacement: vi.fn(),
    deletePlacement: vi.fn(),
    deletePlacementsForComputer: vi.fn(),
    updatePlacementStatus: vi.fn(),
    listConnectorAgentsForComputer: vi.fn(async () => []),
    hasRecentConfigureJob: vi.fn(async () => false),
    createJob: vi.fn(async (input: any) => {
      capturedPayloadEncrypted = input.payloadEncrypted
      return {
        id: 'job-1',
        userId: input.userId,
        computerId: input.computerId,
        agentId: input.agentId,
        type: input.type,
        status: 'pending',
        payloadEncrypted: input.payloadEncrypted,
        result: null,
        error: null,
        claimedAt: null,
        completedAt: null,
        createdAt: now(),
        updatedAt: now(),
      }
    }),
    claimPendingJobs: vi.fn(async () => [
      {
        id: 'job-1',
        type: 'configure-buddy',
        agentId: 'agent-1',
        payloadEncrypted: capturedPayloadEncrypted,
        createdAt: now(),
      },
    ]),
    updateJobForComputer: vi.fn(),
  }
  const agentService = {
    create: vi.fn(async (input: any) => ({
      id: 'agent-1',
      userId: 'bot-user-1',
      name: input.name,
      status: 'stopped',
      botUser: {
        id: 'bot-user-1',
        username: input.username,
        displayName: input.name,
      },
    })),
    generateToken: vi.fn(async () => ({
      token: 'buddy-token',
      agent: { id: 'agent-1', userId: 'bot-user-1', status: 'stopped' },
      botUser: {
        id: 'bot-user-1',
        username: 'alice',
        displayName: 'Alice',
      },
    })),
    updateConnectorBinding: vi.fn(async (_agentId: string, _ownerId: string, input: any) => ({
      id: 'agent-1',
      userId: 'bot-user-1',
      status: 'stopped',
      config: input,
      botUser: {
        id: 'bot-user-1',
        username: 'alice',
        displayName: 'Alice',
      },
    })),
  }

  return {
    connectorDao,
    agentService,
    service: new ConnectorService({
      connectorDao: connectorDao as any,
      agentService: agentService as any,
    }),
  }
}

describe('ConnectorService', () => {
  it('creates a daemon bootstrap command with a machine token', async () => {
    const { connectorDao, service } = makeService()

    const result = await service.createBootstrap('user-1', {
      serverUrl: 'https://shadowob.com/api',
      name: 'Workstation',
    })

    expect(result.apiKey).toMatch(/^sk_machine_[a-f0-9]{64}$/)
    expect(result.command).toContain('npx @shadowob/connector@latest --daemon')
    expect(result.command).toContain('--server-url https://shadowob.com')
    expect(result.command).toContain(`--api-key ${result.apiKey}`)
    expect(connectorDao.createComputer).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        name: 'Workstation',
        tokenHash: expect.not.stringContaining(result.apiKey),
      }),
    )
    expect(connectorDao.deletePendingComputersForUserExcept).toHaveBeenCalledWith(
      'user-1',
      'computer-1',
    )
  })

  it('reuses an unconnected pending computer when regenerating a daemon command', async () => {
    const { connectorDao, service } = makeService()
    connectorDao.findPendingComputerForUser.mockResolvedValue(
      makeComputer({
        id: 'pending-computer',
        lastSeenAt: null,
      }),
    )

    const result = await service.createBootstrap('user-1', {
      serverUrl: 'https://shadowob.com',
      name: 'Workstation',
    })

    expect(result.computer.id).toBe('pending-computer')
    expect(connectorDao.createComputer).not.toHaveBeenCalled()
    expect(connectorDao.resetComputerToken).toHaveBeenCalledWith(
      'pending-computer',
      'user-1',
      expect.objectContaining({
        name: 'Workstation',
        tokenHash: expect.not.stringContaining(result.apiKey),
      }),
    )
    expect(connectorDao.deletePendingComputersForUserExcept).toHaveBeenCalledWith(
      'user-1',
      'pending-computer',
    )
  })

  it('retains pending and offline computers and sorts online computers first', async () => {
    const { connectorDao, service } = makeService()
    connectorDao.listComputers.mockResolvedValue([
      makeComputer({
        id: 'pending',
        hostname: null,
        lastSeenAt: null,
      }),
      makeComputer({
        id: 'offline',
        hostname: 'offline.local',
        lastSeenAt: new Date(Date.now() - 120_000),
      }),
      makeComputer({
        id: 'online-old',
        hostname: 'same.local',
        lastSeenAt: new Date(Date.now() - 1_000),
      }),
      makeComputer({
        id: 'online-new',
        hostname: 'same.local',
        lastSeenAt: new Date(),
      }),
    ])

    const result = await service.listComputers('user-1')

    expect(result.map((computer) => computer.id)).toEqual([
      'online-new',
      'online-old',
      'offline',
      'pending',
    ])
  })

  it('reuses the same computer by stable desktop installation id', async () => {
    const { connectorDao, service } = makeService()
    connectorDao.findComputerByInstallation.mockResolvedValue(
      makeComputer({ id: 'existing-computer', installationId: 'install-1' }),
    )

    const result = await service.createBootstrap('user-1', {
      serverUrl: 'https://shadowob.com',
      name: 'Workstation',
      installationId: 'install-1',
    })

    expect(result.computer.id).toBe('existing-computer')
    expect(connectorDao.createComputer).not.toHaveBeenCalled()
    expect(connectorDao.resetComputerToken).toHaveBeenCalledWith(
      'existing-computer',
      'user-1',
      expect.objectContaining({ installationId: 'install-1' }),
    )
    expect(connectorDao.deletePendingComputersForUserExcept).not.toHaveBeenCalled()
  })

  it('reuses the physical computer by its shared device fingerprint across clients', async () => {
    const { connectorDao, service } = makeService()
    connectorDao.findComputerByDeviceFingerprint.mockResolvedValue(
      makeComputer({ id: 'physical-computer', deviceFingerprint: 'device-shared-1' }),
    )

    const result = await service.createBootstrap('user-1', {
      serverUrl: 'https://shadowob.com',
      name: 'MacBook Pro',
      installationId: 'desktop-installation-2',
      deviceFingerprint: 'device-shared-1',
    })

    expect(result.computer.id).toBe('physical-computer')
    expect(connectorDao.findComputerByInstallation).not.toHaveBeenCalled()
    expect(connectorDao.resetComputerToken).toHaveBeenCalledWith(
      'physical-computer',
      'user-1',
      expect.objectContaining({
        installationId: 'desktop-installation-2',
        deviceFingerprint: 'device-shared-1',
      }),
    )
  })

  it('queues a configure job for an online computer runtime', async () => {
    const { agentService, connectorDao, service } = makeService()
    connectorDao.findComputerForUser.mockResolvedValue(
      makeComputer({
        runtimes: [
          {
            id: 'codex',
            label: 'Codex CLI',
            kind: 'cli',
            status: 'available',
            version: '0.134.0',
            command: 'codex',
            detectedAt: now().toISOString(),
          },
        ],
      }),
    )

    const result = await service.createBuddyOnComputer('user-1', 'computer-1', {
      runtimeId: 'codex',
      serverUrl: 'https://shadowob.com',
      name: 'Alice',
      username: 'alice',
      buddyMode: 'private',
      allowedServerIds: ['server-1'],
    })

    expect(result.agent.id).toBe('agent-1')
    expect(agentService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        kernelType: 'codex',
        config: {
          connectorComputerId: 'computer-1',
          connectorRuntimeId: 'codex',
          connectorRuntimeLabel: 'Codex CLI',
          connectorServerUrl: 'https://shadowob.com',
          connectorWorkDir: '.',
        },
      }),
    )
    expect(connectorDao.createJob).toHaveBeenCalledWith(
      expect.objectContaining({
        computerId: 'computer-1',
        agentId: 'agent-1',
        type: 'configure-buddy',
      }),
    )

    const jobs = await service.claimDaemonJobs('computer-1')
    expect(jobs[0]?.payload).toMatchObject({
      serverUrl: 'https://shadowob.com',
      token: 'buddy-token',
      runtimeId: 'codex',
      buddy: {
        id: 'agent-1',
        username: 'alice',
        displayName: 'Alice',
      },
    })
  })

  it('queues a configure job for an existing buddy', async () => {
    const { agentService, connectorDao, service } = makeService()
    connectorDao.findComputerForUser.mockResolvedValue(
      makeComputer({
        runtimes: [
          {
            id: 'claude-code',
            label: 'Claude Code',
            kind: 'cli',
            status: 'available',
            version: '2.1.153',
            command: 'claude',
            detectedAt: now().toISOString(),
          },
        ],
      }),
    )

    const result = await service.configureBuddyOnComputer('user-1', 'computer-1', 'agent-1', {
      runtimeId: 'claude-code',
      serverUrl: 'https://shadowob.com/api',
      workDir: '/workspace/project',
    })

    expect(result.job?.id).toBe('job-1')
    expect(agentService.generateToken).toHaveBeenCalledWith('agent-1', 'user-1')
    expect(agentService.updateConnectorBinding).toHaveBeenCalledWith('agent-1', 'user-1', {
      connectorComputerId: 'computer-1',
      connectorRuntimeId: 'claude-code',
      connectorRuntimeLabel: 'Claude Code',
      connectorServerUrl: 'https://shadowob.com',
      connectorWorkDir: '/workspace/project',
    })
    expect(connectorDao.createJob).toHaveBeenCalledWith(
      expect.objectContaining({
        computerId: 'computer-1',
        agentId: 'agent-1',
        type: 'configure-buddy',
      }),
    )

    const jobs = await service.claimDaemonJobs('computer-1')
    expect(jobs[0]?.payload).toMatchObject({
      serverUrl: 'https://shadowob.com',
      token: 'buddy-token',
      runtimeId: 'claude-code',
      buddy: {
        id: 'agent-1',
        username: 'alice',
        displayName: 'Alice',
      },
      workDir: '/workspace/project',
    })
  })

  it('queues reconnect jobs for existing buddies when a daemon heartbeat arrives', async () => {
    const { agentService, connectorDao, service } = makeService()
    connectorDao.updateComputerHeartbeat.mockResolvedValue(
      makeComputer({
        runtimes: [
          {
            id: 'codex',
            label: 'Codex CLI',
            kind: 'cli',
            status: 'available',
            version: '0.134.0',
            command: 'codex',
            detectedAt: now().toISOString(),
          },
        ],
      }),
    )
    connectorDao.listConnectorAgentsForComputer.mockResolvedValue([
      {
        agent: {
          id: 'agent-1',
          userId: 'bot-user-1',
          ownerId: 'user-1',
          kernelType: 'codex',
          config: {
            connectorComputerId: 'computer-1',
            connectorRuntimeId: 'codex',
            connectorRuntimeLabel: 'Codex CLI',
            connectorServerUrl: 'https://shadowob.com/api',
            connectorWorkDir: '/work/project',
          },
          status: 'stopped',
          createdAt: now(),
          updatedAt: now(),
        },
        botUser: {
          id: 'bot-user-1',
          username: 'alice',
          displayName: 'Alice',
        },
      },
    ])

    await service.recordHeartbeat('computer-1', {
      hostname: 'laptop.local',
      os: 'darwin',
      arch: 'arm64',
      daemonVersion: 'test',
      runtimes: [
        {
          id: 'codex',
          label: 'Codex CLI',
          kind: 'cli',
          status: 'available',
          version: '0.134.0',
          command: 'codex',
          detectedAt: now().toISOString(),
        },
      ],
    })

    expect(connectorDao.listConnectorAgentsForComputer).toHaveBeenCalledWith('computer-1')
    expect(connectorDao.hasRecentConfigureJob).toHaveBeenCalledWith(
      'computer-1',
      'agent-1',
      expect.any(Date),
    )
    expect(agentService.generateToken).toHaveBeenCalledWith('agent-1', 'user-1')
    expect(connectorDao.createJob).toHaveBeenCalledWith(
      expect.objectContaining({
        computerId: 'computer-1',
        agentId: 'agent-1',
        type: 'configure-buddy',
      }),
    )

    const jobs = await service.claimDaemonJobs('computer-1')
    expect(jobs[0]?.payload).toMatchObject({
      serverUrl: 'https://shadowob.com',
      token: 'buddy-token',
      runtimeId: 'codex',
      workDir: '/work/project',
      buddy: {
        id: 'agent-1',
        username: 'alice',
        displayName: 'Alice',
      },
    })
  })

  it('does not enqueue duplicate reconnect jobs while one is active or recent', async () => {
    const { connectorDao, service } = makeService()
    connectorDao.updateComputerHeartbeat.mockResolvedValue(
      makeComputer({
        runtimes: [
          {
            id: 'codex',
            label: 'Codex CLI',
            kind: 'cli',
            status: 'available',
            detectedAt: now().toISOString(),
          },
        ],
      }),
    )
    connectorDao.listConnectorAgentsForComputer.mockResolvedValue([
      {
        agent: {
          id: 'agent-1',
          userId: 'bot-user-1',
          ownerId: 'user-1',
          kernelType: 'codex',
          config: { connectorRuntimeId: 'codex' },
          status: 'stopped',
          createdAt: now(),
          updatedAt: now(),
        },
        botUser: {
          id: 'bot-user-1',
          username: 'alice',
          displayName: 'Alice',
        },
      },
    ])
    connectorDao.hasRecentConfigureJob.mockResolvedValue(true)

    await service.recordHeartbeat('computer-1', {
      runtimes: [
        {
          id: 'codex',
          label: 'Codex CLI',
          kind: 'cli',
          status: 'available',
          detectedAt: now().toISOString(),
        },
      ],
    })

    expect(connectorDao.createJob).not.toHaveBeenCalled()
  })

  it('does not enqueue reconnect jobs for buddies that are already online', async () => {
    const { connectorDao, service } = makeService()
    connectorDao.updateComputerHeartbeat.mockResolvedValue(
      makeComputer({
        runtimes: [
          {
            id: 'codex',
            label: 'Codex CLI',
            kind: 'cli',
            status: 'available',
            detectedAt: now().toISOString(),
          },
        ],
      }),
    )
    connectorDao.listConnectorAgentsForComputer.mockResolvedValue([
      {
        agent: {
          id: 'agent-1',
          userId: 'bot-user-1',
          ownerId: 'user-1',
          kernelType: 'codex',
          config: { connectorRuntimeId: 'codex' },
          status: 'running',
          lastHeartbeat: new Date(),
          createdAt: now(),
          updatedAt: now(),
        },
        botUser: {
          id: 'bot-user-1',
          username: 'alice',
          displayName: 'Alice',
        },
      },
    ])

    await service.recordHeartbeat('computer-1', {
      runtimes: [
        {
          id: 'codex',
          label: 'Codex CLI',
          kind: 'cli',
          status: 'available',
          detectedAt: now().toISOString(),
        },
      ],
    })

    expect(connectorDao.hasRecentConfigureJob).not.toHaveBeenCalled()
    expect(connectorDao.createJob).not.toHaveBeenCalled()
  })
})
