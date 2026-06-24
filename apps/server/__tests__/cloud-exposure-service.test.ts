import { BUDDY_INBOX_DELIVERY_PERMISSION } from '@shadowob/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudExposureService } from '../src/services/cloud-exposure.service'
import type { ServerAppManifestInput } from '../src/validators/app-integration.schema'

const now = new Date('2026-06-23T00:00:00.000Z')
const deployment = {
  id: '00000000-0000-0000-0000-000000000001',
  userId: 'user-1',
  clusterId: null,
  namespace: 'test-deployment',
  name: 'Test Deployment',
  status: 'deployed',
  agentCount: 1,
  configSnapshot: null,
  errorMessage: null,
  templateSlug: null,
  resourceTier: null,
  monthlyCost: null,
  hourlyCost: 1,
  lastHourlyBilledAt: null,
  lastActiveAt: now,
  expiresAt: null,
  saasMode: false,
  createdAt: now,
  updatedAt: now,
} as const

const serverId = '00000000-0000-0000-0000-000000000002'

const manifest: ServerAppManifestInput = {
  schemaVersion: 'shadow.app/1',
  appKey: 'demo-app',
  name: 'Demo App',
  iconUrl: 'http://127.0.0.1:4310/assets/icon.png',
  marketplace: {},
  version: '1.0.0',
  updatedAt: '2026-06-23T00:00:00.000Z',
  api: { baseUrl: 'http://127.0.0.1:4310/api', auth: { type: 'oauth2-bearer' } },
  iframe: {
    entry: 'http://127.0.0.1:4310/shadow/server',
    allowedOrigins: ['http://127.0.0.1:4310'],
  },
  commands: [
    {
      name: 'status.get',
      path: '/api/shadow/commands/status.get',
      permission: 'demo.status:read',
      action: 'read',
      dataClass: 'server-private',
    },
  ],
}

function createService() {
  let exposure: Record<string, any> | null = null
  let appInstance: Record<string, any> | null = null
  let release: Record<string, any> | null = null
  const backupSets: Record<string, any>[] = []
  const backupComponents: Record<string, any>[] = []
  const cloudExposureDao = {
    upsertExposure: vi.fn(async (data: Record<string, any>) => {
      exposure = {
        id: exposure?.id ?? 'exp-1',
        createdAt: now,
        updatedAt: now,
        closedAt: null,
        closeReason: null,
        stableHost: null,
        manifestUrl: null,
        health: null,
        ...exposure,
        ...data,
      }
      return exposure
    }),
    closeMissingRuntimeExposures: vi.fn(async () => []),
    createExposureEvent: vi.fn(async (data: Record<string, any>) => ({
      id: 'event-1',
      createdAt: now,
      ...data,
    })),
    upsertAppInstance: vi.fn(async (data: Record<string, any>) => {
      appInstance = {
        id: 'app-instance-1',
        currentReleaseId: null,
        currentExposureId: null,
        serverAppIntegrationId: null,
        createdAt: now,
        updatedAt: now,
        ...data,
      }
      return appInstance
    }),
    updateAppInstancePointers: vi.fn(async (data: Record<string, any>) => {
      appInstance = { ...appInstance, ...data, updatedAt: now }
      return appInstance
    }),
    findAppInstance: vi.fn(async (data: Record<string, any>) => {
      if (!appInstance) return null
      if (data.appKey && appInstance.appKey !== data.appKey) return null
      if (data.deploymentId && appInstance.deploymentId !== data.deploymentId) return null
      if (data.serverId && appInstance.serverId !== data.serverId) return null
      if (data.userId && appInstance.userId !== data.userId) return null
      return appInstance
    }),
    createAppRelease: vi.fn(async (data: Record<string, any>) => {
      release = {
        id: 'release-1',
        createdAt: now,
        activatedAt: data.activatedAt ?? null,
        ...data,
      }
      return release
    }),
    updateExposureRelease: vi.fn(async (data: Record<string, any>) => {
      exposure = { ...exposure, ...data, updatedAt: now }
      return exposure
    }),
    activateRelease: vi.fn(async (data: Record<string, any>) => {
      release = release
        ? {
            ...release,
            exposureId: data.exposureId,
            serverAppIntegrationId: data.serverAppIntegrationId,
            status: 'active',
            activatedAt: now,
          }
        : release
      appInstance = {
        ...appInstance,
        currentReleaseId: data.releaseId,
        currentExposureId: data.exposureId,
        serverAppIntegrationId: data.serverAppIntegrationId,
        status: 'active',
      }
      return release ?? { id: data.releaseId }
    }),
    findExposureById: vi.fn(async () => exposure),
    upsertBackupPolicy: vi.fn(async (data: Record<string, any>) => ({
      id: 'policy-1',
      createdAt: now,
      updatedAt: now,
      ...data,
    })),
    createBackupSet: vi.fn(async (data: Record<string, any>) => {
      const backupSet = {
        id: `backup-set-${backupSets.length + 1}`,
        createdAt: now,
        updatedAt: now,
        ...data,
      }
      backupSets.push(backupSet)
      return backupSet
    }),
    createBackupComponent: vi.fn(async (data: Record<string, any>) => {
      const component = { id: `component-${backupComponents.length + 1}`, createdAt: now, ...data }
      backupComponents.push(component)
      return component
    }),
    listBackupComponents: vi.fn(async () => backupComponents),
    listReleases: vi.fn(async () => (release ? [release] : [])),
    listBackupSets: vi.fn(async () => backupSets),
    findReleaseById: vi.fn(async (id: string) => (release?.id === id ? release : null)),
    findExposureByHost: vi.fn(async (host: string) =>
      exposure?.host === host || exposure?.stableHost === host ? exposure : null,
    ),
  }
  const appIntegrationService = {
    discover: vi.fn(async () => ({ manifest })),
    install: vi.fn(async () => ({ id: 'installed-app-1', appKey: 'demo-app' })),
    updateAccessPolicy: vi.fn(),
    grant: vi.fn(),
    delete: vi.fn(),
    introspectLaunchToken: vi.fn(async () => ({
      active: true,
      shadow: { actor: { kind: 'user', userId: 'user-1' } },
    })),
    callCommand: vi.fn(async () => ({ ok: true, result: { ok: true, ready: true } })),
  }
  const serverDao = {
    findById: vi.fn(async (id: string) => (id === serverId ? { id, slug: 'shadow-plays' } : null)),
    findBySlug: vi.fn(async (slug: string) =>
      slug === 'shadow-plays' ? { id: serverId, slug } : null,
    ),
  }
  const service = new CloudExposureService({
    cloudDeploymentDao: {
      findByIdOnly: vi.fn(async () => deployment),
    } as any,
    cloudDeploymentBackupDao: {
      findById: vi.fn(),
    } as any,
    cloudExposureDao: cloudExposureDao as any,
    appIntegrationDao: {
      findByServerAndKey: vi.fn(async () => ({ id: 'installed-app-1', serverId: 'server-1' })),
    } as any,
    appIntegrationService: appIntegrationService as any,
    serverDao: serverDao as any,
  })

  return { appIntegrationService, cloudExposureDao, serverDao, service }
}

describe('CloudExposureService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    delete process.env.SHADOWOB_CLOUD_EXPOSURE_ALLOW_PUBLIC
    delete process.env.SHADOWOB_CLOUD_EXPOSURE_GATEWAY_MODE
    process.env.SHADOWOB_CLOUD_EXPOSURE_DOMAIN = 'shadowob.com'
  })

  it('denies public runtime exposures while public exposure is gated', async () => {
    const { service } = createService()

    const result = await service.reconcileRuntimeExposures(
      {
        deploymentId: deployment.id,
        agentId: 'codex-1',
        exposures: [{ id: 'preview', port: 4310, visibility: 'public' }],
      },
      { actor: { kind: 'user', userId: 'user-1', authMethod: 'jwt', scopes: [] } },
    )

    expect(result.accepted).toEqual([])
    expect(result.denied[0]?.reason).toContain('Public cloud exposure is not enabled')
  })

  it('publishes an App through a stable host and creates a BackupSet', async () => {
    const { appIntegrationService, cloudExposureDao, service } = createService()

    const result = await service.publishApp(
      { kind: 'user', userId: 'user-1', authMethod: 'jwt', scopes: [] },
      {
        deploymentId: deployment.id,
        agentId: 'codex-1',
        serverId,
        port: 4310,
        manifest,
        sourcePath: '/workspace/demo-app',
        statePaths: ['/workspace/demo-app/data'],
        defaultPermissions: ['demo.status:read'],
      },
    )

    expect(result.appInstance.stableHost).toMatch(/^app-demo-app-[a-f0-9]{10}\.shadowob\.com$/)
    expect(result.exposure.publicBaseUrl).toBe(`https://${result.appInstance.stableHost}`)
    expect(appIntegrationService.install).toHaveBeenCalledWith(serverId, expect.any(Object), {
      manifest: expect.objectContaining({
        api: expect.objectContaining({
          baseUrl: `${result.appInstance.stableBaseUrl}/api`,
        }),
        iframe: expect.objectContaining({
          entry: `${result.appInstance.stableBaseUrl}/shadow/server`,
          allowedOrigins: [result.appInstance.stableBaseUrl],
        }),
      }),
      manifestUrl: `${result.appInstance.stableBaseUrl}/.well-known/shadow-app.json`,
    })
    expect(cloudExposureDao.createBackupSet).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: 'publish',
        status: 'pending',
      }),
    )
    expect(result.backupSet?.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ componentKind: 'manifest', status: 'succeeded' }),
        expect.objectContaining({ componentKind: 'release', status: 'succeeded' }),
        expect.objectContaining({ componentKind: 'state', status: 'pending' }),
      ]),
    )
    expect(cloudExposureDao.upsertExposure).toHaveBeenCalledWith(
      expect.objectContaining({
        localId: expect.stringMatching(/^app-demo-app-[a-f0-9]{10}$/),
        dynamicConfig: expect.objectContaining({ appKey: 'demo-app', localId: 'demo-app' }),
      }),
    )
    expect(result.exposure.localId).toBe('demo-app')
  })

  it('keeps runtime exposure identity separate from published App identity', async () => {
    const { cloudExposureDao, service } = createService()

    await service.reconcileRuntimeExposures(
      {
        deploymentId: deployment.id,
        agentId: 'codex-1',
        exposures: [{ id: 'demo-app', port: 4310, kind: 'server_app', appKey: 'demo-app' }],
      },
      { actor: { kind: 'user', userId: 'user-1', authMethod: 'jwt', scopes: [] } },
    )
    await service.publishApp(
      { kind: 'user', userId: 'user-1', authMethod: 'jwt', scopes: [] },
      {
        deploymentId: deployment.id,
        agentId: 'codex-1',
        serverId,
        port: 4310,
        manifest,
        install: false,
      },
    )

    const runtimeWrite = cloudExposureDao.upsertExposure.mock.calls[0]![0]
    const publishWrite = cloudExposureDao.upsertExposure.mock.calls[1]![0]
    expect(runtimeWrite).toMatchObject({
      source: 'runtime',
      localId: expect.stringMatching(/^rt-demo-app-[a-f0-9]{10}$/),
      dynamicConfig: expect.objectContaining({ localId: 'demo-app', appKey: 'demo-app' }),
    })
    expect(publishWrite).toMatchObject({
      source: 'publish',
      localId: expect.stringMatching(/^app-demo-app-[a-f0-9]{10}$/),
      dynamicConfig: expect.objectContaining({ localId: 'demo-app', appKey: 'demo-app' }),
    })
    expect(runtimeWrite.localId).not.toBe(publishWrite.localId)
    expect(cloudExposureDao.closeMissingRuntimeExposures).toHaveBeenCalledWith(
      expect.objectContaining({
        keepLocalIds: [runtimeWrite.localId],
      }),
    )
  })

  it('allows published Buddy grants to use the Inbox delivery platform permission', async () => {
    const { appIntegrationService, service } = createService()

    await service.publishApp(
      { kind: 'user', userId: 'user-1', authMethod: 'jwt', scopes: [] },
      {
        deploymentId: deployment.id,
        agentId: 'codex-1',
        serverId,
        port: 4310,
        manifest,
        buddyGrants: [
          {
            buddyAgentId: 'agent-1',
            permissions: [BUDDY_INBOX_DELIVERY_PERMISSION],
            approvalMode: 'none',
          },
        ],
      },
    )

    expect(appIntegrationService.grant).toHaveBeenCalledWith(
      serverId,
      'demo-app',
      expect.any(Object),
      expect.objectContaining({
        buddyAgentId: 'agent-1',
        permissions: [BUDDY_INBOX_DELIVERY_PERMISSION],
      }),
    )
  })

  it('resolves server slugs without attempting a UUID lookup', async () => {
    const { appIntegrationService, serverDao, service } = createService()

    await service.publishApp(
      { kind: 'user', userId: 'user-1', authMethod: 'jwt', scopes: [] },
      {
        deploymentId: deployment.id,
        agentId: 'codex-1',
        serverId: 'shadow-plays',
        port: 4310,
        manifest,
        sourcePath: '/workspace/demo-app',
      },
    )

    expect(serverDao.findById).not.toHaveBeenCalledWith('shadow-plays')
    expect(serverDao.findBySlug).toHaveBeenCalledWith('shadow-plays')
    expect(appIntegrationService.install).toHaveBeenCalledWith(serverId, expect.any(Object), {
      manifest: expect.any(Object),
      manifestUrl: expect.stringMatching(/^https:\/\/app-demo-app-[a-f0-9]{10}\.shadowob\.com/),
    })
  })

  it('lets an owner-scoped agent read the App it published for the deployment owner', async () => {
    const { cloudExposureDao, service } = createService()

    await service.publishApp(
      { kind: 'agent', userId: 'bot-user-1', agentId: 'codex-1', ownerId: 'user-1', scopes: [] },
      {
        deploymentId: deployment.id,
        agentId: 'codex-1',
        serverId,
        port: 4310,
        manifest,
        sourcePath: '/workspace/demo-app',
        statePaths: ['/workspace/demo-app/data'],
      },
    )

    const result = await service.status(
      { kind: 'agent', userId: 'bot-user-1', agentId: 'codex-1', ownerId: 'user-1', scopes: [] },
      'demo-app',
      { deploymentId: deployment.id, serverId },
    )

    expect(result.appInstance.appKey).toBe('demo-app')
    expect(cloudExposureDao.findAppInstance).toHaveBeenLastCalledWith(
      expect.objectContaining({
        appKey: 'demo-app',
        deploymentId: deployment.id,
        serverId,
        userId: 'user-1',
      }),
    )
  })

  it('allows App source and state paths under the standard Cloud runner home', async () => {
    const { service } = createService()

    const result = await service.publishApp(
      { kind: 'agent', userId: 'bot-user-1', agentId: 'codex-1', ownerId: 'user-1', scopes: [] },
      {
        deploymentId: deployment.id,
        agentId: 'codex-1',
        serverId,
        port: 4310,
        manifest,
        sourcePath: '/home/shadow/counter-app',
        statePaths: ['/home/shadow/counter-app/data'],
      },
    )

    expect(result.appInstance.appKey).toBe('demo-app')
  })

  it('rejects paths that only share a runner-home prefix', async () => {
    const { service } = createService()

    await expect(
      service.publishApp(
        { kind: 'agent', userId: 'bot-user-1', agentId: 'codex-1', ownerId: 'user-1', scopes: [] },
        {
          deploymentId: deployment.id,
          agentId: 'codex-1',
          serverId,
          port: 4310,
          manifest,
          sourcePath: '/home/shadowevil/counter-app',
        },
      ),
    ).rejects.toMatchObject({ code: 'UNSAFE_RUNTIME_PATH' })
  })

  it('enforces gateway method policy before proxying to the workload', async () => {
    const { service } = createService()
    const reconciled = await service.reconcileRuntimeExposures(
      {
        deploymentId: deployment.id,
        agentId: 'codex-1',
        exposures: [
          {
            id: 'preview',
            port: 4310,
            policy: { allowedMethods: ['GET'] },
          },
        ],
      },
      { actor: { kind: 'user', userId: 'user-1', authMethod: 'jwt', scopes: [] } },
    )

    const host = reconciled.accepted[0]!.host
    const response = await service.gatewayProxy(
      host,
      new Request(`http://${host}/mutate`, { method: 'POST' }),
      '/mutate',
    )

    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('GET')
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'method_not_allowed' })
  })
})
