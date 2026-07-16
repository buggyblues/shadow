import { describe, expect, it, vi } from 'vitest'

const cloudMocks = vi.hoisted(() => ({
  deleteKubernetesResourceAsync: vi.fn(),
  deleteNamespace: vi.fn(),
  listManagedNamespaceSummaries: vi.fn(),
  listPodsAsync: vi.fn(),
  namespaceExists: vi.fn(),
  scaleAgentSandboxAsync: vi.fn(),
  waitForAgentSandboxPaused: vi.fn(),
  waitForAgentSandboxReady: vi.fn(),
}))
const backupRuntimeMocks = vi.hoisted(() => ({
  runCloudDeploymentBackup: vi.fn(),
}))
const kmsMocks = vi.hoisted(() => ({
  decrypt: vi.fn((value: string) => `decrypted:${value}`),
}))

vi.mock('@shadowob/cloud', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shadowob/cloud')>()
  return {
    ...actual,
    deleteKubernetesResourceAsync: cloudMocks.deleteKubernetesResourceAsync,
    deleteNamespace: cloudMocks.deleteNamespace,
    listManagedNamespaceSummaries: cloudMocks.listManagedNamespaceSummaries,
    listPodsAsync: cloudMocks.listPodsAsync,
    namespaceExists: cloudMocks.namespaceExists,
    scaleAgentSandboxAsync: cloudMocks.scaleAgentSandboxAsync,
    waitForAgentSandboxPaused: cloudMocks.waitForAgentSandboxPaused,
    waitForAgentSandboxReady: cloudMocks.waitForAgentSandboxReady,
  }
})

vi.mock('../src/lib/cloud-deployment-backup-runtime', () => ({
  runCloudDeploymentBackup: backupRuntimeMocks.runCloudDeploymentBackup,
}))

vi.mock('../src/lib/kms', () => ({
  decrypt: kmsMocks.decrypt,
}))

import {
  CLOUD_COMPUTER_BILLING_PAUSE_REASON,
  CLOUD_COMPUTER_MANUAL_PAUSE_REASON,
} from '../src/lib/cloud-computer-billing'
import {
  buildCloudExposureTokenEnvVars,
  calculateCloudHourlyBillingCharge,
  createCloudHourlyBillingReferenceId,
  ensureNamespaceDeletionStarted,
  hasReadyDeploymentRuntimeResources,
  isCloudDeploymentDestroyFailure,
  isUserCancelledDeploymentError,
  pauseCloudComputerForBilling,
  previousScheduledBackupAt,
  probeDeploymentRuntimeResources,
  reconcileExpiredBackups,
  reconcileIdleAutoPauseDeployments,
  reconcileManagedNamespaceGarbage,
  reconcilePersistedCloudComputerRuntimeOverlays,
  reconcileReadyFailedDeployments,
  reconcileScheduledBackups,
  reconcileStaleBackupOperations,
  reconcileStaleRestoreOperations,
  recordDeploymentActivityForBuddyUsers,
  resolveCloudDestroyBillingCutoff,
  resolveDeploymentShadowProvisionToken,
  resumePausedDeploymentsForBuddyUsers,
  runCloudTasksWithConcurrency,
  shouldRunScheduledBackup,
  waitForNamespaceDeletion,
} from '../src/lib/cloud-deployment-processor'
import { verifyCloudExposureToken } from '../src/lib/jwt'

describe('persisted Cloud Computer runtime overlays', () => {
  it('reapplies declared browser components during startup reconciliation', async () => {
    process.env.CLOUD_COMPUTER_BROWSER_IMAGE = 'mcr.microsoft.com/playwright:v1.59.1-noble'
    const applyManifest = vi.fn(async () => ({ ok: true }))
    const deployment = {
      id: 'cloud-computer-overlay-1',
      userId: 'user-1',
      clusterId: null,
      namespace: 'cloud-computer-overlay',
      name: 'Overlay Computer',
      status: 'deployed',
      configSnapshot: {
        deployments: { agents: [{ id: 'agent-1' }] },
        cloudComputer: { components: { browser: true } },
      },
    }
    const deploymentDao = {
      listLive: vi.fn(async () => [deployment]),
      appendLog: vi.fn(async () => null),
    }
    const appContainer = {
      resolve: vi.fn((name: string) => {
        if (name === 'kubernetesOpsGateway') return { applyManifest }
        throw new Error(`Unexpected dependency: ${name}`)
      }),
    }

    try {
      await expect(
        reconcilePersistedCloudComputerRuntimeOverlays(
          deploymentDao as never,
          appContainer as never,
        ),
      ).resolves.toEqual({ deployments: 1, components: 1, failed: 0 })
      expect(applyManifest).toHaveBeenCalledWith(
        expect.objectContaining({
          manifest: expect.objectContaining({
            kind: 'Deployment',
            metadata: expect.objectContaining({ name: 'cloud-computer-browser' }),
          }),
        }),
      )
    } finally {
      delete process.env.CLOUD_COMPUTER_BROWSER_IMAGE
    }
  })

  it('retries retired Buddy identity cleanup after a server restart', async () => {
    const deleteAgent = vi.fn(async () => null)
    const deployment = {
      id: 'cloud-computer-cleanup-1',
      userId: 'user-1',
      clusterId: null,
      namespace: 'cloud-computer-cleanup',
      name: 'Cleanup Computer',
      status: 'deployed',
      configSnapshot: {
        version: '1',
        deployments: { agents: [{ id: 'cloud-computer-host', runtime: 'openclaw' }] },
        cloudComputer: {
          buddyIdentityCleanup: [
            {
              buddyId: 'retired-buddy',
              agentId: 'retired-agent',
              deploymentId: 'older-deployment',
              requestedAt: '2026-07-13T00:00:00.000Z',
            },
          ],
        },
      },
    }
    const updateConfigSnapshot = vi.fn(async () => null)
    const deploymentDao = {
      listLive: vi.fn(async () => [deployment]),
      appendLog: vi.fn(async () => null),
      updateConfigSnapshot,
    }
    const appContainer = {
      resolve: vi.fn((name: string) => {
        if (name === 'agentDao') {
          return {
            findById: vi.fn(async () => ({
              id: 'retired-agent',
              config: {
                shadowob: {
                  buddyId: 'retired-buddy',
                  deploymentId: 'older-deployment',
                  namespace: deployment.namespace,
                },
              },
            })),
          }
        }
        if (name === 'agentService') return { delete: deleteAgent }
        throw new Error(`Unexpected dependency: ${name}`)
      }),
    }

    await expect(
      reconcilePersistedCloudComputerRuntimeOverlays(deploymentDao as never, appContainer as never),
    ).resolves.toEqual({ deployments: 1, components: 0, failed: 0 })
    expect(deleteAgent).toHaveBeenCalledWith('retired-agent')
    expect(updateConfigSnapshot).toHaveBeenCalledWith(
      deployment.id,
      expect.not.objectContaining({
        cloudComputer: expect.objectContaining({ buddyIdentityCleanup: expect.anything() }),
      }),
    )
  })
})

describe('calculateCloudHourlyBillingCharge', () => {
  it('bills deployment runtime in 15-minute increments at 1 Shrimp Coin per hour', () => {
    const charge = calculateCloudHourlyBillingCharge({
      lastBilledAt: new Date('2026-05-08T00:00:00.000Z'),
      now: new Date('2026-05-08T00:44:59.000Z'),
      hourlyCost: 1,
    })

    expect(charge).toEqual({
      intervals: 2,
      amountMicros: 500_000,
      billedUntil: new Date('2026-05-08T00:30:00.000Z'),
    })
  })

  it('waits until a full 15-minute precision window has elapsed', () => {
    expect(
      calculateCloudHourlyBillingCharge({
        lastBilledAt: new Date('2026-05-08T00:00:00.000Z'),
        now: new Date('2026-05-08T00:14:59.000Z'),
        hourlyCost: 1,
      }),
    ).toBeNull()
  })
})

describe('Cloud Computer insufficient-balance pause', () => {
  it('scales compute to zero, retains the entry, and sends a renewal notification', async () => {
    cloudMocks.scaleAgentSandboxAsync.mockClear()
    cloudMocks.waitForAgentSandboxPaused.mockClear()
    cloudMocks.deleteNamespace.mockClear()
    cloudMocks.scaleAgentSandboxAsync.mockResolvedValue(undefined)
    cloudMocks.waitForAgentSandboxPaused.mockResolvedValue(undefined)
    const deployment = {
      id: 'deployment-billing-pause-1',
      userId: 'user-1',
      name: 'Research Computer',
      namespace: 'research-computer',
      clusterId: null,
      status: 'deployed',
      configSnapshot: {
        cloudComputer: { version: 1 },
        deployments: { agents: [{ id: 'buddy-runtime' }] },
      },
    }
    const deploymentDao = {
      appendLog: vi.fn().mockResolvedValue(undefined),
      updateStatusIfStatus: vi.fn().mockResolvedValue({ ...deployment, status: 'paused' }),
    }
    const dispatch = vi.fn().mockResolvedValue({ id: 'notification-1' })
    const appContainer = {
      resolve: vi.fn((name: string) => {
        if (name === 'notificationTriggerService') return { dispatch }
        throw new Error(`Unexpected service: ${name}`)
      }),
    }

    const result = await pauseCloudComputerForBilling({
      deployment: deployment as never,
      deploymentDao: deploymentDao as never,
      clusterDao: {} as never,
      appContainer: appContainer as never,
      balance: 0,
      shortfall: 0.25,
    })

    expect(result.pauseError).toBeNull()
    expect(cloudMocks.scaleAgentSandboxAsync).toHaveBeenCalledWith(
      'research-computer',
      'buddy-runtime',
      0,
      undefined,
    )
    expect(cloudMocks.waitForAgentSandboxPaused).toHaveBeenCalled()
    expect(deploymentDao.updateStatusIfStatus).toHaveBeenCalledWith(
      'deployment-billing-pause-1',
      'deployed',
      'paused',
      CLOUD_COMPUTER_BILLING_PAUSE_REASON,
    )
    expect(cloudMocks.deleteNamespace).not.toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        kind: 'cloud_computer.billing_paused',
        referenceType: 'cloud_computer',
      }),
    )
  })
})

describe('createCloudHourlyBillingReferenceId', () => {
  it('creates a stable UUID per deployment billing window', () => {
    const deploymentId = '105eaf9f-d1b9-4c18-9990-d26975878422'
    const billedUntil = new Date('2026-05-08T00:30:00.000Z')

    const referenceId = createCloudHourlyBillingReferenceId(deploymentId, billedUntil)

    expect(referenceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(referenceId).toBe(createCloudHourlyBillingReferenceId(deploymentId, billedUntil))
    expect(referenceId).not.toBe(
      createCloudHourlyBillingReferenceId(deploymentId, new Date('2026-05-08T00:45:00.000Z')),
    )
  })
})

describe('waitForNamespaceDeletion', () => {
  it('returns as soon as the namespace is deleted', async () => {
    const result = await waitForNamespaceDeletion('gstack-buddy', undefined, {
      exists: () => false,
      timeoutMs: 5_000,
      intervalMs: 1_000,
    })

    expect(result).toBe('deleted')
  })

  it('exits promptly when cancellation is requested during verification', async () => {
    let cancelled = false
    setTimeout(() => {
      cancelled = true
    }, 50)

    const startedAt = Date.now()
    const result = await waitForNamespaceDeletion('gstack-buddy', undefined, {
      exists: () => true,
      isCancelled: () => cancelled,
      timeoutMs: 5_000,
      intervalMs: 4_000,
    })

    expect(result).toBe('cancelled')
    expect(Date.now() - startedAt).toBeLessThan(1_000)
  })

  it('times out when Kubernetes never confirms deletion', async () => {
    const result = await waitForNamespaceDeletion('gstack-buddy', undefined, {
      exists: () => true,
      timeoutMs: 25,
      intervalMs: 10,
    })

    expect(result).toBe('timeout')
  })
})

describe('cloud deployment destroy scheduling', () => {
  it('identifies destroy failures so recovery cannot revive deleted runtimes', () => {
    expect(isCloudDeploymentDestroyFailure('destroy: namespace deletion timed out')).toBe(true)
    expect(isCloudDeploymentDestroyFailure('Pulumi deploy timed out')).toBe(false)
    expect(isCloudDeploymentDestroyFailure(null)).toBe(false)
  })

  it('runs independent deletion tasks with bounded concurrency', async () => {
    let active = 0
    let maxActive = 0
    const completed: number[] = []

    await runCloudTasksWithConcurrency([1, 2, 3, 4, 5], 2, async (task) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      completed.push(task)
      active -= 1
    })

    expect(maxActive).toBe(2)
    expect(completed.sort()).toEqual([1, 2, 3, 4, 5])
  })

  it('stops billing at the first deletion request and does not bill retries', () => {
    const queuedAt = new Date('2026-07-13T08:00:00.000Z')
    const now = new Date('2026-07-13T08:05:00.000Z')
    const billingStartedAt = new Date('2026-07-13T07:00:00.000Z')

    expect(
      resolveCloudDestroyBillingCutoff(
        {
          errorMessage: 'destroy:queued:deployed',
          updatedAt: queuedAt,
          lastHourlyBilledAt: billingStartedAt,
        },
        now,
      ),
    ).toEqual(queuedAt)
    expect(
      resolveCloudDestroyBillingCutoff(
        {
          errorMessage: 'destroy:retry_queued',
          updatedAt: now,
          lastHourlyBilledAt: billingStartedAt,
        },
        now,
      ),
    ).toBeNull()
    expect(
      resolveCloudDestroyBillingCutoff(
        {
          errorMessage: 'destroy:removing_resources',
          updatedAt: now,
          lastHourlyBilledAt: billingStartedAt,
        },
        now,
      ),
    ).toBeNull()
  })

  it('does not charge a deployment that never reached ready when it is deleted', () => {
    expect(
      resolveCloudDestroyBillingCutoff(
        {
          errorMessage: 'destroy:queued:failed',
          updatedAt: new Date('2026-07-13T08:00:00.000Z'),
          lastHourlyBilledAt: null,
        },
        new Date('2026-07-13T08:05:00.000Z'),
      ),
    ).toBeNull()
  })
})

describe('ensureNamespaceDeletionStarted', () => {
  it('requests Kubernetes namespace deletion when Pulumi destroy leaves the namespace behind', async () => {
    await expect(
      ensureNamespaceDeletionStarted('gstack-buddy', 'kubeconfig-yaml', {
        exists: () => true,
      }),
    ).resolves.toEqual({ status: 'delete-requested' })

    expect(cloudMocks.deleteNamespace).toHaveBeenCalledWith('gstack-buddy', 'kubeconfig-yaml')
  })

  it('does not request deletion when the namespace is already gone', async () => {
    cloudMocks.deleteNamespace.mockClear()

    await expect(
      ensureNamespaceDeletionStarted('gstack-buddy', undefined, {
        exists: () => false,
      }),
    ).resolves.toEqual({ status: 'already-deleted' })

    expect(cloudMocks.deleteNamespace).not.toHaveBeenCalled()
  })

  it('surfaces kubectl delete errors so destroy does not silently wait forever', async () => {
    cloudMocks.deleteNamespace.mockImplementationOnce(() => {
      throw new Error('api server unavailable')
    })

    await expect(
      ensureNamespaceDeletionStarted('gstack-buddy', undefined, {
        exists: () => true,
      }),
    ).resolves.toEqual({
      status: 'delete-failed',
      error: 'api server unavailable',
    })
  })
})

describe('probeDeploymentRuntimeResources', () => {
  it('detects OpenClaw pods created by Kubernetes even when Pulumi readiness times out', async () => {
    cloudMocks.listPodsAsync.mockResolvedValueOnce([
      {
        name: 'strategy-buddy-abc',
        ready: '1/2',
        status: 'Running',
        restarts: 0,
        age: '2026-04-30T00:00:00Z',
        containers: ['agent-pack-sync', 'openclaw'],
        deploymentId: 'deployment-new',
      },
      {
        name: 'pause',
        ready: '1/1',
        status: 'Running',
        restarts: 0,
        age: '2026-04-30T00:00:00Z',
        containers: ['pause'],
      },
    ])

    await expect(
      probeDeploymentRuntimeResources('gstack-buddy', undefined, 'deployment-new'),
    ).resolves.toEqual({
      agentCount: 1,
      podNames: ['strategy-buddy-abc'],
      readyPods: 0,
    })
  })

  it('ignores ready pods that belong to the superseded deployment revision', async () => {
    cloudMocks.listPodsAsync.mockResolvedValueOnce([
      {
        name: 'strategy-buddy-old',
        ready: '1/1',
        status: 'Running',
        restarts: 0,
        age: '2026-04-30T00:00:00Z',
        containers: ['openclaw'],
        deploymentId: 'deployment-old',
      },
    ])

    await expect(
      probeDeploymentRuntimeResources('gstack-buddy', undefined, 'deployment-new'),
    ).resolves.toBeNull()
  })
})

describe('cloud deployment recovery classification', () => {
  it('does not treat kubelet context cancellation as a user cancellation', () => {
    expect(
      isUserCancelledDeploymentError(
        { cancelled: false },
        'Back-off pulling image: ErrImagePull: rpc error: code = Canceled desc = context canceled',
      ),
    ).toBe(false)
  })

  it('treats an explicit cancellation token as a user cancellation', () => {
    expect(isUserCancelledDeploymentError({ cancelled: true }, 'context canceled')).toBe(true)
  })

  it('requires all recovered OpenClaw pods to be ready before marking a failed deployment live', () => {
    expect(
      hasReadyDeploymentRuntimeResources({
        agentCount: 1,
        podNames: ['strategy-buddy-abc'],
        readyPods: 0,
      }),
    ).toBe(false)

    expect(
      hasReadyDeploymentRuntimeResources({
        agentCount: 1,
        podNames: ['strategy-buddy-abc'],
        readyPods: 1,
      }),
    ).toBe(true)
  })
})

describe('reconcileManagedNamespaceGarbage', () => {
  it('deletes stale failed and destroyed namespaces but preserves ready failed runtimes', async () => {
    cloudMocks.deleteNamespace.mockClear()
    cloudMocks.namespaceExists.mockResolvedValue(true)
    cloudMocks.listPodsAsync.mockImplementation(async (namespace: string) =>
      namespace === 'ready-failed'
        ? [
            {
              name: 'ready-failed-openclaw',
              ready: '1/1',
              status: 'Running',
              restarts: 0,
              age: '2026-06-29T00:00:00Z',
              containers: ['openclaw'],
              deploymentId: 'ready-deployment',
            },
          ]
        : [
            {
              name: `${namespace}-openclaw`,
              ready: '0/1',
              status: 'Running',
              restarts: 12,
              age: '2026-06-29T00:00:00Z',
              containers: ['openclaw'],
            },
          ],
    )

    const failed = {
      id: 'failed-deployment',
      userId: 'user-1',
      namespace: 'crashing-failed',
      clusterId: null,
      status: 'failed',
      updatedAt: new Date('2026-06-29T00:00:00.000Z'),
    }
    const readyFailed = {
      id: 'ready-deployment',
      userId: 'user-1',
      namespace: 'ready-failed',
      clusterId: null,
      status: 'failed',
      updatedAt: new Date('2026-06-29T00:00:00.000Z'),
    }
    const destroyed = {
      id: 'destroyed-deployment',
      userId: 'user-1',
      namespace: 'destroyed-leftover',
      clusterId: null,
      status: 'destroyed',
      updatedAt: new Date('2026-06-29T00:00:00.000Z'),
    }
    const deploymentDao = {
      listTerminalNamespaceGcCandidates: vi
        .fn()
        .mockResolvedValue([failed, readyFailed, destroyed]),
      findLatestCurrentInNamespace: vi.fn().mockResolvedValue(null),
      appendLog: vi.fn().mockResolvedValue(undefined),
      listByNamespacesAnyCluster: vi.fn().mockResolvedValue([]),
    }

    const result = await reconcileManagedNamespaceGarbage(deploymentDao as never, {} as never, {
      now: new Date('2026-06-29T01:00:00.000Z'),
      failedGraceMs: 1,
      destroyedGraceMs: 1,
      terminalMode: 'delete',
      orphanMode: 'disabled',
    })

    expect(result).toMatchObject({
      terminalScanned: 3,
      deleteRequested: 2,
      retained: 1,
      errors: 0,
    })
    expect(cloudMocks.deleteNamespace).toHaveBeenCalledWith('crashing-failed', undefined)
    expect(cloudMocks.deleteNamespace).toHaveBeenCalledWith('destroyed-leftover', undefined)
    expect(cloudMocks.deleteNamespace).not.toHaveBeenCalledWith('ready-failed', undefined)
    expect(deploymentDao.appendLog).toHaveBeenCalledWith(
      'failed-deployment',
      expect.stringContaining('Requested Kubernetes namespace deletion'),
      'warn',
    )
  })

  it('continues namespace cleanup after destroy failure even if an old runtime pod is ready', async () => {
    cloudMocks.deleteNamespace.mockClear()
    cloudMocks.namespaceExists.mockReset()
    cloudMocks.namespaceExists.mockResolvedValue(true)
    cloudMocks.listPodsAsync.mockClear()
    cloudMocks.listPodsAsync.mockResolvedValue([
      {
        name: 'old-openclaw',
        ready: '1/1',
        status: 'Running',
        restarts: 0,
        age: '2026-06-29T00:00:00Z',
        containers: ['openclaw'],
        deploymentId: 'destroy-failed-deployment',
      },
    ])
    const deployment = {
      id: 'destroy-failed-deployment',
      userId: 'user-1',
      namespace: 'destroy-failed-ready-runtime',
      clusterId: null,
      status: 'failed',
      errorMessage: 'destroy: namespace deletion timed out',
      updatedAt: new Date('2026-06-29T00:00:00.000Z'),
    }
    const deploymentDao = {
      listTerminalNamespaceGcCandidates: vi.fn().mockResolvedValue([deployment]),
      findLatestCurrentInNamespace: vi.fn().mockResolvedValue(null),
      appendLog: vi.fn().mockResolvedValue(undefined),
      listByNamespacesAnyCluster: vi.fn().mockResolvedValue([]),
    }

    const result = await reconcileManagedNamespaceGarbage(deploymentDao as never, {} as never, {
      now: new Date('2026-06-29T01:00:00.000Z'),
      failedGraceMs: 1,
      destroyedGraceMs: 1,
      terminalMode: 'delete',
      orphanMode: 'disabled',
    })

    expect(result.deleteRequested).toBe(1)
    expect(cloudMocks.listPodsAsync).not.toHaveBeenCalled()
    expect(cloudMocks.deleteNamespace).toHaveBeenCalledWith(
      'destroy-failed-ready-runtime',
      undefined,
    )
  })

  it('cleans unowned server managed namespaces and skips ambiguous BYOK-owned names', async () => {
    cloudMocks.deleteNamespace.mockClear()
    cloudMocks.listPodsAsync.mockReset()
    cloudMocks.namespaceExists.mockReset()
    cloudMocks.listManagedNamespaceSummaries.mockReset()
    cloudMocks.listManagedNamespaceSummaries.mockResolvedValueOnce([
      {
        name: 'orphan-server-ns',
        labels: {
          'shadowob-cloud/managed': 'true',
          'shadowob.cloud/server-managed': 'true',
        },
        annotations: {
          'shadowob.cloud/source': 'shadow-server',
        },
      },
      {
        name: 'byok-owned-name',
        labels: {
          'shadowob-cloud/managed': 'true',
        },
        annotations: {},
      },
      {
        name: 'platform-owned-name',
        labels: {
          'shadowob-cloud/managed': 'true',
        },
        annotations: {},
      },
    ])
    const deploymentDao = {
      listTerminalNamespaceGcCandidates: vi.fn().mockResolvedValue([]),
      listByNamespacesAnyCluster: vi.fn().mockResolvedValue([
        {
          id: 'byok-deployment',
          namespace: 'byok-owned-name',
          clusterId: 'byok-cluster',
        },
        {
          id: 'platform-deployment',
          namespace: 'platform-owned-name',
          clusterId: null,
        },
      ]),
    }
    const clusterDao = {
      findByIdOnly: vi.fn().mockResolvedValue({ id: 'byok-cluster', isPlatform: false }),
    }

    const result = await reconcileManagedNamespaceGarbage(
      deploymentDao as never,
      clusterDao as never,
      {
        terminalMode: 'disabled',
        orphanMode: 'delete',
      },
    )

    expect(result).toMatchObject({
      orphanScanned: 1,
      deleteRequested: 1,
      retained: 1,
      skipped: 1,
    })
    expect(cloudMocks.deleteNamespace).toHaveBeenCalledTimes(1)
    expect(cloudMocks.deleteNamespace).toHaveBeenCalledWith('orphan-server-ns', undefined)
    expect(clusterDao.findByIdOnly).toHaveBeenCalledWith('byok-cluster')
  })
})

describe('resolveDeploymentShadowProvisionToken', () => {
  it('keeps an explicit runtime token when one is provided', async () => {
    await expect(
      resolveDeploymentShadowProvisionToken({ SHADOWOB_USER_TOKEN: 'explicit-token' }, 'user-1'),
    ).resolves.toBe('explicit-token')
  })

  it('mints a transient access token for server-side Shadow provisioning', async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret'

    const token = await resolveDeploymentShadowProvisionToken({}, 'user-1')

    expect(token).toBeTruthy()
    expect(token).not.toContain('explicit-token')
  })
})

describe('buildCloudExposureTokenEnvVars', () => {
  it('mints one scoped reconcile token per deployment agent', () => {
    const env = buildCloudExposureTokenEnvVars({
      deployment: {
        id: 'dep-1',
        namespace: 'app-ns',
        userId: 'user-1',
      },
      configSnapshot: {
        deployments: {
          agents: [{ id: 'app-maker' }, { id: 'app-maker' }, { id: 'qa-agent' }],
        },
      },
    })

    expect(Object.keys(env).sort()).toEqual([
      'SHADOWOB_CLOUD_EXPOSURE_TOKEN_APP_MAKER',
      'SHADOWOB_CLOUD_EXPOSURE_TOKEN_QA_AGENT',
    ])

    const claims = verifyCloudExposureToken(env.SHADOWOB_CLOUD_EXPOSURE_TOKEN_APP_MAKER ?? '')
    expect(claims).toMatchObject({
      userId: 'user-1',
      deploymentId: 'dep-1',
      namespace: 'app-ns',
      agentId: 'app-maker',
      scopes: ['cloud:exposure:reconcile'],
    })
  })
})

describe('reconcileStaleBackupOperations', () => {
  it('marks stale active backups failed and records an operator-visible log', async () => {
    const staleBackup = {
      id: 'backup-1',
      deploymentId: 'deployment-1',
      phase: 'object-archiving',
    }
    const backupDao = {
      listActiveUpdatedBefore: vi.fn().mockResolvedValue([staleBackup]),
      failIfActive: vi.fn().mockResolvedValue(staleBackup),
    }
    const deploymentDao = {
      appendLog: vi.fn().mockResolvedValue(undefined),
    }

    await reconcileStaleBackupOperations(backupDao as never, deploymentDao as never)

    expect(backupDao.listActiveUpdatedBefore).toHaveBeenCalledWith(expect.any(Date))
    expect(backupDao.failIfActive).toHaveBeenCalledWith(
      'backup-1',
      expect.stringContaining('marked failed during startup reconcile'),
    )
    expect(deploymentDao.appendLog).toHaveBeenCalledWith(
      'deployment-1',
      expect.stringContaining('phase=object-archiving'),
      'error',
    )
  })

  it('does not write a log when another process already completed the backup', async () => {
    const staleBackup = {
      id: 'backup-2',
      deploymentId: 'deployment-2',
      phase: 'snapshot-waiting',
    }
    const backupDao = {
      listActiveUpdatedBefore: vi.fn().mockResolvedValue([staleBackup]),
      failIfActive: vi.fn().mockResolvedValue(null),
    }
    const deploymentDao = {
      appendLog: vi.fn().mockResolvedValue(undefined),
    }

    await reconcileStaleBackupOperations(backupDao as never, deploymentDao as never)

    expect(backupDao.failIfActive).toHaveBeenCalledWith(
      'backup-2',
      expect.stringContaining('marked failed during startup reconcile'),
    )
    expect(deploymentDao.appendLog).not.toHaveBeenCalled()
  })
})

describe('reconcileStaleRestoreOperations', () => {
  it('fails deployments stuck in resuming and marks the stale restore phase failed', async () => {
    const staleBackup = {
      id: 'backup-restore-1',
      deploymentId: 'deployment-restore-1',
      phase: 'restoring-resuming',
    }
    const backupDao = {
      listRestoringUpdatedBefore: vi.fn().mockResolvedValue([staleBackup]),
      markRestoreFailedIfRestoring: vi.fn().mockResolvedValue(staleBackup),
    }
    const deploymentDao = {
      findByIdOnly: vi.fn().mockResolvedValue({
        id: 'deployment-restore-1',
        status: 'resuming',
      }),
      failIfStatus: vi.fn().mockResolvedValue({ id: 'deployment-restore-1' }),
      appendLog: vi.fn().mockResolvedValue(undefined),
    }

    await reconcileStaleRestoreOperations(backupDao as never, deploymentDao as never)

    expect(backupDao.listRestoringUpdatedBefore).toHaveBeenCalledWith(expect.any(Date))
    expect(deploymentDao.failIfStatus).toHaveBeenCalledWith(
      'deployment-restore-1',
      'resuming',
      expect.stringContaining('Restore operation did not update'),
    )
    expect(backupDao.markRestoreFailedIfRestoring).toHaveBeenCalledWith(
      'backup-restore-1',
      expect.stringContaining('Restore operation did not update'),
    )
    expect(deploymentDao.appendLog).toHaveBeenCalledWith(
      'deployment-restore-1',
      expect.stringContaining('phase=restoring-resuming'),
      'error',
    )
  })

  it('only clears restore phase when deployment already left resuming', async () => {
    const backupDao = {
      listRestoringUpdatedBefore: vi.fn().mockResolvedValue([
        {
          id: 'backup-restore-2',
          deploymentId: 'deployment-restore-2',
          phase: 'restoring-pvc',
        },
      ]),
      markRestoreCompletedIfRestoring: vi.fn().mockResolvedValue({ id: 'backup-restore-2' }),
    }
    const deploymentDao = {
      findByIdOnly: vi.fn().mockResolvedValue({
        id: 'deployment-restore-2',
        status: 'deployed',
      }),
      failIfStatus: vi.fn().mockResolvedValue(null),
      appendLog: vi.fn().mockResolvedValue(undefined),
    }

    await reconcileStaleRestoreOperations(backupDao as never, deploymentDao as never)

    expect(deploymentDao.failIfStatus).not.toHaveBeenCalled()
    expect(backupDao.markRestoreCompletedIfRestoring).toHaveBeenCalledWith('backup-restore-2')
    expect(deploymentDao.appendLog).toHaveBeenCalledWith(
      'deployment-restore-2',
      expect.stringContaining('deployment status is already deployed'),
      'warn',
    )
  })

  it('marks stale restore phase failed when deployment already failed', async () => {
    const backupDao = {
      listRestoringUpdatedBefore: vi.fn().mockResolvedValue([
        {
          id: 'backup-restore-3',
          deploymentId: 'deployment-restore-3',
          phase: 'restoring-pvc',
        },
      ]),
      markRestoreFailedIfRestoring: vi.fn().mockResolvedValue({ id: 'backup-restore-3' }),
    }
    const deploymentDao = {
      findByIdOnly: vi.fn().mockResolvedValue({
        id: 'deployment-restore-3',
        status: 'failed',
        errorMessage: 'PVC restore failed',
      }),
      failIfStatus: vi.fn().mockResolvedValue(null),
      appendLog: vi.fn().mockResolvedValue(undefined),
    }

    await reconcileStaleRestoreOperations(backupDao as never, deploymentDao as never)

    expect(deploymentDao.failIfStatus).not.toHaveBeenCalled()
    expect(backupDao.markRestoreFailedIfRestoring).toHaveBeenCalledWith(
      'backup-restore-3',
      'PVC restore failed',
    )
    expect(deploymentDao.appendLog).toHaveBeenCalledWith(
      'deployment-restore-3',
      expect.stringContaining('Marked restore phase failed'),
      'error',
    )
  })
})

describe('reconcileExpiredBackups', () => {
  it('deletes expired object artifacts and marks the backup expired', async () => {
    const backup = {
      id: 'backup-expired-1',
      deploymentId: 'deployment-expired-1',
      namespace: 'gstack-buddy',
      objectKey: 'backups/cloud/example.tar.gz',
      snapshotName: null,
    }
    const backupDao = {
      listExpiredBefore: vi.fn().mockResolvedValue([backup]),
      markExpired: vi.fn().mockResolvedValue({ ...backup, status: 'expired' }),
    }
    const deploymentDao = {
      findByIdOnly: vi.fn().mockResolvedValue({ id: 'deployment-expired-1', clusterId: null }),
      appendLog: vi.fn().mockResolvedValue(undefined),
    }
    const appContainer = {
      resolve: vi.fn().mockReturnValue({
        deletePrivateObject: vi.fn().mockResolvedValue(true),
      }),
    }

    await reconcileExpiredBackups(
      backupDao as never,
      deploymentDao as never,
      {} as never,
      appContainer as never,
    )

    expect(appContainer.resolve).toHaveBeenCalledWith('mediaService')
    expect(backupDao.markExpired).toHaveBeenCalledWith('backup-expired-1')
    expect(deploymentDao.appendLog).toHaveBeenCalledWith(
      'deployment-expired-1',
      expect.stringContaining('expired and managed artifacts were removed'),
      'info',
    )
  })

  it('keeps expired backups retryable when artifact cleanup fails', async () => {
    const backupDao = {
      listExpiredBefore: vi.fn().mockResolvedValue([
        {
          id: 'backup-expired-2',
          deploymentId: 'deployment-expired-2',
          namespace: 'gstack-buddy',
          objectKey: 'backups/cloud/example.tar.gz',
          snapshotName: null,
        },
      ]),
      markExpired: vi.fn().mockResolvedValue(null),
    }
    const deploymentDao = {
      findByIdOnly: vi.fn().mockResolvedValue({ id: 'deployment-expired-2', clusterId: null }),
      appendLog: vi.fn().mockResolvedValue(undefined),
    }
    const appContainer = {
      resolve: vi.fn().mockReturnValue({
        deletePrivateObject: vi.fn().mockResolvedValue(false),
      }),
    }

    await reconcileExpiredBackups(
      backupDao as never,
      deploymentDao as never,
      {} as never,
      appContainer as never,
    )

    expect(backupDao.markExpired).not.toHaveBeenCalled()
    expect(deploymentDao.appendLog).toHaveBeenCalledWith(
      'deployment-expired-2',
      expect.stringContaining('Retention cleanup for backup backup-expired-2 is pending'),
      'warn',
    )
  })
})

describe('scheduled cloud deployment backups', () => {
  it('computes previous supported schedule run times in UTC', () => {
    expect(previousScheduledBackupAt('@hourly', new Date('2026-06-20T10:23:45.000Z'))).toEqual(
      new Date('2026-06-20T10:00:00.000Z'),
    )
    expect(previousScheduledBackupAt('*/15 * * * *', new Date('2026-06-20T10:44:00.000Z'))).toEqual(
      new Date('2026-06-20T10:30:00.000Z'),
    )
    expect(previousScheduledBackupAt('0 3 * * *', new Date('2026-06-20T04:00:00.000Z'))).toEqual(
      new Date('2026-06-20T03:00:00.000Z'),
    )
    expect(previousScheduledBackupAt('not a schedule')).toBeNull()
  })

  it('runs only after the latest backup falls behind the previous schedule point', () => {
    expect(
      shouldRunScheduledBackup({
        schedule: '0 * * * *',
        now: new Date('2026-06-20T10:05:00.000Z'),
        deploymentCreatedAt: new Date('2026-06-20T08:00:00.000Z'),
        latestBackupCreatedAt: new Date('2026-06-20T09:59:00.000Z'),
      }),
    ).toBe(true)
    expect(
      shouldRunScheduledBackup({
        schedule: '0 * * * *',
        now: new Date('2026-06-20T10:05:00.000Z'),
        deploymentCreatedAt: new Date('2026-06-20T08:00:00.000Z'),
        latestBackupCreatedAt: new Date('2026-06-20T10:01:00.000Z'),
      }),
    ).toBe(false)
  })

  it('reconciles failed deployments with ready Kubernetes runtime resources without a time window', async () => {
    cloudMocks.listPodsAsync.mockResolvedValueOnce([
      {
        name: 'strategy-buddy-abc',
        ready: '1/1',
        status: 'Running',
        restarts: 0,
        age: '2026-04-30T00:00:00Z',
        containers: ['openclaw'],
        deploymentId: 'deployment-recover-ready',
      },
    ])
    const deployment = {
      id: 'deployment-recover-ready',
      userId: 'user-1',
      name: 'Recovered Runtime',
      namespace: 'recovered-runtime',
      clusterId: null,
      status: 'failed',
      agentCount: 0,
      monthlyCost: 0,
      hourlyCost: 0,
      saasMode: false,
      createdAt: new Date('2026-04-30T00:00:00.000Z'),
      updatedAt: new Date('2026-04-30T00:00:00.000Z'),
    }
    const deployed = { ...deployment, status: 'deployed', agentCount: 1 }
    const deploymentDao = {
      listRecoverableFailed: vi.fn().mockResolvedValue([deployment]),
      listRecoverableFailedSince: vi.fn().mockResolvedValue([]),
      appendLog: vi.fn().mockResolvedValue(undefined),
      markDeployedIfStatus: vi.fn().mockResolvedValue(deployed),
      markOlderCurrentRowsSuperseded: vi.fn().mockResolvedValue([]),
    }

    await reconcileReadyFailedDeployments(deploymentDao as never, {} as never, {} as never)

    expect(deploymentDao.listRecoverableFailed).toHaveBeenCalledWith(50)
    expect(deploymentDao.listRecoverableFailedSince).not.toHaveBeenCalled()
    expect(deploymentDao.markDeployedIfStatus).toHaveBeenCalledWith(
      'deployment-recover-ready',
      'failed',
      1,
      expect.any(Date),
    )
    expect(deploymentDao.appendLog).toHaveBeenCalledWith(
      'deployment-recover-ready',
      expect.stringContaining('Marking deployment as deployed'),
      'warn',
    )
  })

  it('does not revive a deployment whose deletion failed', async () => {
    cloudMocks.listPodsAsync.mockClear()
    const deployment = {
      id: 'deployment-destroy-failed',
      userId: 'user-1',
      name: 'Deleted Runtime',
      namespace: 'deleted-runtime',
      clusterId: null,
      status: 'failed',
      errorMessage: 'destroy: namespace deletion timed out',
      createdAt: new Date('2026-04-30T00:00:00.000Z'),
      updatedAt: new Date('2026-04-30T00:00:00.000Z'),
    }
    const deploymentDao = {
      listRecoverableFailed: vi.fn().mockResolvedValue([deployment]),
      listRecoverableFailedSince: vi.fn().mockResolvedValue([]),
      appendLog: vi.fn().mockResolvedValue(undefined),
      markDeployed: vi.fn(),
    }

    await reconcileReadyFailedDeployments(deploymentDao as never, {} as never, {} as never)

    expect(cloudMocks.listPodsAsync).not.toHaveBeenCalled()
    expect(deploymentDao.markDeployed).not.toHaveBeenCalled()
  })

  it('creates configured automatic backups for deployed agents', async () => {
    backupRuntimeMocks.runCloudDeploymentBackup.mockClear()
    backupRuntimeMocks.runCloudDeploymentBackup.mockResolvedValue({ id: 'backup-scheduled-1' })
    const deployment = {
      id: 'deployment-scheduled-1',
      userId: 'user-1',
      name: 'hermes-buddy',
      namespace: 'buddy-cloud-hermes',
      clusterId: null,
      status: 'deployed',
      createdAt: new Date('2026-06-20T08:00:00.000Z'),
      configSnapshot: {
        deployments: {
          sandbox: { backup: { enabled: true, schedule: '@hourly', retention: 14 } },
          agents: [{ id: 'hermes-buddy', runtime: 'hermes' }],
        },
      },
    }
    const deploymentDao = {
      listLive: vi.fn().mockResolvedValue([deployment]),
      listPaused: vi.fn().mockResolvedValue([]),
      tryAcquireOperationLock: vi.fn().mockResolvedValue(true),
      releaseOperationLock: vi.fn().mockResolvedValue(undefined),
      findByIdOnly: vi.fn().mockResolvedValue(deployment),
      appendLog: vi.fn().mockResolvedValue(undefined),
    }
    const backupDao = {
      findLatestByDeploymentAgent: vi.fn().mockResolvedValue({
        id: 'backup-old',
        status: 'succeeded',
        createdAt: new Date('2026-06-20T08:30:00.000Z'),
      }),
    }
    const appContainer = {}

    const created = await reconcileScheduledBackups(
      deploymentDao as never,
      backupDao as never,
      {} as never,
      new Date('2026-06-20T10:05:00.000Z'),
      { appContainer: appContainer as never },
    )

    expect(created).toBe(1)
    expect(backupRuntimeMocks.runCloudDeploymentBackup).toHaveBeenCalledWith(
      expect.objectContaining({
        appContainer,
        deploymentDao,
        backupDao,
        deployment,
        agentId: 'hermes-buddy',
        retentionDays: 14,
        reason: 'scheduled',
      }),
    )
  })

  it('passes configured GitHub backup targets through encrypted connections', async () => {
    backupRuntimeMocks.runCloudDeploymentBackup.mockClear()
    kmsMocks.decrypt.mockClear()
    backupRuntimeMocks.runCloudDeploymentBackup.mockResolvedValue({ id: 'backup-github-1' })
    const connectionId = '11111111-1111-4111-8111-111111111111'
    const deployment = {
      id: 'deployment-scheduled-github',
      userId: 'user-1',
      name: 'hermes-buddy',
      namespace: 'buddy-cloud-hermes',
      clusterId: null,
      status: 'deployed',
      createdAt: new Date('2026-06-20T08:00:00.000Z'),
      configSnapshot: {
        deployments: {
          sandbox: {
            backup: {
              enabled: true,
              schedule: '@hourly',
              target: {
                type: 'github',
                connectionId,
                repository: 'shadow/backup-state',
                branch: 'backups',
                pathPrefix: 'cloud-state',
              },
            },
          },
          agents: [{ id: 'hermes-buddy', runtime: 'hermes' }],
        },
      },
    }
    const deploymentDao = {
      listLive: vi.fn().mockResolvedValue([deployment]),
      listPaused: vi.fn().mockResolvedValue([]),
      tryAcquireOperationLock: vi.fn().mockResolvedValue(true),
      releaseOperationLock: vi.fn().mockResolvedValue(undefined),
      findByIdOnly: vi.fn().mockResolvedValue(deployment),
      appendLog: vi.fn().mockResolvedValue(undefined),
    }
    const backupDao = {
      findLatestByDeploymentAgent: vi.fn().mockResolvedValue({
        id: 'backup-old',
        status: 'succeeded',
        createdAt: new Date('2026-06-20T08:30:00.000Z'),
      }),
    }
    const cloudGitConnectionDao = {
      findByIdForUser: vi.fn().mockResolvedValue({
        id: connectionId,
        tokenEncrypted: 'ciphertext-token',
      }),
      touch: vi.fn().mockResolvedValue(undefined),
    }
    const appContainer = {
      resolve: vi.fn((name: string) => {
        if (name === 'cloudGitConnectionDao') return cloudGitConnectionDao
        throw new Error(`unexpected dependency: ${name}`)
      }),
    }

    const created = await reconcileScheduledBackups(
      deploymentDao as never,
      backupDao as never,
      {} as never,
      new Date('2026-06-20T10:05:00.000Z'),
      { appContainer: appContainer as never },
    )

    expect(created).toBe(1)
    expect(cloudGitConnectionDao.findByIdForUser).toHaveBeenCalledWith(connectionId, 'user-1')
    expect(cloudGitConnectionDao.touch).toHaveBeenCalledWith(connectionId, 'user-1')
    expect(kmsMocks.decrypt).toHaveBeenCalledWith('ciphertext-token')
    expect(backupRuntimeMocks.runCloudDeploymentBackup).toHaveBeenCalledWith(
      expect.objectContaining({
        gitHubTarget: {
          repository: 'shadow/backup-state',
          branch: 'backups',
          pathPrefix: 'cloud-state',
          token: 'decrypted:ciphertext-token',
        },
      }),
    )
  })

  it('skips automatic backups when a backup is already active or not due', async () => {
    backupRuntimeMocks.runCloudDeploymentBackup.mockClear()
    const deployment = {
      id: 'deployment-scheduled-2',
      userId: 'user-1',
      name: 'hermes-buddy',
      namespace: 'buddy-cloud-hermes',
      clusterId: null,
      status: 'deployed',
      createdAt: new Date('2026-06-20T08:00:00.000Z'),
      configSnapshot: {
        deployments: {
          agents: [
            {
              id: 'active-backup',
              sandbox: { backup: { enabled: true, schedule: '@hourly' } },
            },
            {
              id: 'fresh-backup',
              sandbox: { backup: { enabled: true, schedule: '@hourly' } },
            },
          ],
        },
      },
    }
    const deploymentDao = {
      listLive: vi.fn().mockResolvedValue([deployment]),
      listPaused: vi.fn().mockResolvedValue([]),
      tryAcquireOperationLock: vi.fn().mockResolvedValue(true),
      releaseOperationLock: vi.fn().mockResolvedValue(undefined),
      findByIdOnly: vi.fn().mockResolvedValue(deployment),
      appendLog: vi.fn().mockResolvedValue(undefined),
    }
    const backupDao = {
      findLatestByDeploymentAgent: vi.fn().mockImplementation(async ({ agentId }) => {
        if (agentId === 'active-backup') {
          return {
            id: 'backup-active',
            status: 'running',
            createdAt: new Date('2026-06-20T09:00:00.000Z'),
          }
        }
        return {
          id: 'backup-fresh',
          status: 'succeeded',
          createdAt: new Date('2026-06-20T10:01:00.000Z'),
        }
      }),
    }

    const created = await reconcileScheduledBackups(
      deploymentDao as never,
      backupDao as never,
      {} as never,
      new Date('2026-06-20T10:05:00.000Z'),
      { appContainer: {} as never },
    )

    expect(created).toBe(0)
    expect(backupRuntimeMocks.runCloudDeploymentBackup).not.toHaveBeenCalled()
    expect(deploymentDao.tryAcquireOperationLock).not.toHaveBeenCalled()
  })
})

describe('reconcileIdleAutoPauseDeployments', () => {
  it('pauses deployed sandbox agents after their configured idle window', async () => {
    cloudMocks.scaleAgentSandboxAsync.mockResolvedValue(undefined)
    cloudMocks.waitForAgentSandboxPaused.mockResolvedValue(undefined)
    backupRuntimeMocks.runCloudDeploymentBackup.mockClear()
    const deployment = {
      id: 'deployment-idle-1',
      userId: 'user-1',
      namespace: 'gstack-buddy',
      clusterId: null,
      status: 'deployed',
      updatedAt: new Date('2026-05-11T00:00:00.000Z'),
      lastActiveAt: new Date('2026-05-11T00:00:00.000Z'),
      configSnapshot: {
        deployments: {
          agents: [
            {
              id: 'strategy-buddy',
              runtime: 'openclaw',
              sandbox: { lifecycle: { autoPause: true, idleSeconds: 120 } },
            },
          ],
        },
      },
    }
    const deploymentDao = {
      listLive: vi.fn().mockResolvedValue([deployment]),
      tryAcquireOperationLock: vi.fn().mockResolvedValue(true),
      releaseOperationLock: vi.fn().mockResolvedValue(undefined),
      findByIdOnly: vi.fn().mockResolvedValue(deployment),
      updateStatus: vi.fn().mockResolvedValue({ ...deployment, status: 'paused' }),
      appendLog: vi.fn().mockResolvedValue(undefined),
    }
    const clusterDao = {}

    await reconcileIdleAutoPauseDeployments(
      deploymentDao as never,
      clusterDao as never,
      new Date('2026-05-11T00:03:00.000Z'),
    )

    expect(cloudMocks.scaleAgentSandboxAsync).toHaveBeenCalledWith(
      'gstack-buddy',
      'strategy-buddy',
      0,
      undefined,
    )
    expect(cloudMocks.waitForAgentSandboxPaused).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: 'gstack-buddy',
        agentName: 'strategy-buddy',
      }),
    )
    expect(deploymentDao.updateStatus).toHaveBeenCalledWith('deployment-idle-1', 'paused')
  })

  it('creates a backup before idle pause when backupBeforePause is enabled', async () => {
    cloudMocks.scaleAgentSandboxAsync.mockClear()
    cloudMocks.scaleAgentSandboxAsync.mockResolvedValue(undefined)
    cloudMocks.waitForAgentSandboxPaused.mockResolvedValue(undefined)
    backupRuntimeMocks.runCloudDeploymentBackup.mockClear()
    backupRuntimeMocks.runCloudDeploymentBackup.mockResolvedValue({ id: 'backup-auto-1' })
    const deployment = {
      id: 'deployment-idle-backup-1',
      userId: 'user-1',
      namespace: 'gstack-buddy',
      clusterId: null,
      status: 'deployed',
      updatedAt: new Date('2026-05-11T00:00:00.000Z'),
      lastActiveAt: new Date('2026-05-11T00:00:00.000Z'),
      configSnapshot: {
        deployments: {
          agents: [
            {
              id: 'strategy-buddy',
              runtime: 'openclaw',
              sandbox: {
                lifecycle: { autoPause: true, idleSeconds: 120, backupBeforePause: true },
              },
            },
          ],
        },
      },
    }
    const deploymentDao = {
      listLive: vi.fn().mockResolvedValue([deployment]),
      tryAcquireOperationLock: vi.fn().mockResolvedValue(true),
      releaseOperationLock: vi.fn().mockResolvedValue(undefined),
      findByIdOnly: vi.fn().mockResolvedValue(deployment),
      updateStatus: vi.fn().mockResolvedValue({ ...deployment, status: 'paused' }),
      appendLog: vi.fn().mockResolvedValue(undefined),
    }
    const backupDao = {}
    const appContainer = {}

    await reconcileIdleAutoPauseDeployments(
      deploymentDao as never,
      {} as never,
      new Date('2026-05-11T00:03:00.000Z'),
      { backupDao: backupDao as never, appContainer: appContainer as never },
    )

    expect(backupRuntimeMocks.runCloudDeploymentBackup).toHaveBeenCalledWith(
      expect.objectContaining({
        appContainer,
        deploymentDao,
        backupDao,
        deployment,
        agentId: 'strategy-buddy',
        retentionDays: 7,
        reason: 'auto-pause',
      }),
    )
    expect(cloudMocks.scaleAgentSandboxAsync).toHaveBeenCalledWith(
      'gstack-buddy',
      'strategy-buddy',
      0,
      undefined,
    )
    expect(backupRuntimeMocks.runCloudDeploymentBackup.mock.invocationCallOrder[0]).toBeLessThan(
      cloudMocks.scaleAgentSandboxAsync.mock.invocationCallOrder[0] ?? 0,
    )
  })

  it('does not pause when backupBeforePause backup fails', async () => {
    cloudMocks.scaleAgentSandboxAsync.mockClear()
    backupRuntimeMocks.runCloudDeploymentBackup.mockClear()
    backupRuntimeMocks.runCloudDeploymentBackup.mockRejectedValueOnce(new Error('backup failed'))
    const deployment = {
      id: 'deployment-idle-backup-2',
      userId: 'user-1',
      namespace: 'gstack-buddy',
      clusterId: null,
      status: 'deployed',
      updatedAt: new Date('2026-05-11T00:00:00.000Z'),
      lastActiveAt: new Date('2026-05-11T00:00:00.000Z'),
      configSnapshot: {
        deployments: {
          agents: [
            {
              id: 'strategy-buddy',
              sandbox: {
                lifecycle: { autoPause: true, idleSeconds: 120, backupBeforePause: true },
              },
            },
          ],
        },
      },
    }
    const deploymentDao = {
      listLive: vi.fn().mockResolvedValue([deployment]),
      tryAcquireOperationLock: vi.fn().mockResolvedValue(true),
      releaseOperationLock: vi.fn().mockResolvedValue(undefined),
      findByIdOnly: vi.fn().mockResolvedValue(deployment),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      appendLog: vi.fn().mockResolvedValue(undefined),
    }

    await reconcileIdleAutoPauseDeployments(
      deploymentDao as never,
      {} as never,
      new Date('2026-05-11T00:03:00.000Z'),
      { backupDao: {} as never, appContainer: {} as never },
    )

    expect(cloudMocks.scaleAgentSandboxAsync).not.toHaveBeenCalled()
    expect(deploymentDao.updateStatus).not.toHaveBeenCalledWith(
      'deployment-idle-backup-2',
      'paused',
    )
    expect(deploymentDao.appendLog).toHaveBeenCalledWith(
      'deployment-idle-backup-2',
      '[auto-pause] Failed: backup failed',
      'error',
    )
  })

  it('does not pause when only some agents opt into auto pause', async () => {
    cloudMocks.scaleAgentSandboxAsync.mockClear()
    const deploymentDao = {
      listLive: vi.fn().mockResolvedValue([
        {
          id: 'deployment-idle-2',
          namespace: 'gstack-buddy',
          updatedAt: new Date('2026-05-11T00:00:00.000Z'),
          lastActiveAt: new Date('2026-05-11T00:00:00.000Z'),
          configSnapshot: {
            deployments: {
              agents: [
                {
                  id: 'strategy-buddy',
                  sandbox: { lifecycle: { autoPause: true, idleSeconds: 60 } },
                },
                { id: 'always-on-buddy' },
              ],
            },
          },
        },
      ]),
    }

    await reconcileIdleAutoPauseDeployments(
      deploymentDao as never,
      {} as never,
      new Date('2026-05-11T00:03:00.000Z'),
    )

    expect(cloudMocks.scaleAgentSandboxAsync).not.toHaveBeenCalled()
  })
})

describe('cloud deployment activity and auto resume', () => {
  it('records activity for deployed workloads that belong to mentioned buddy users', async () => {
    const deploymentDao = {
      listLive: vi.fn().mockResolvedValue([
        {
          id: 'deployment-active-1',
          configSnapshot: {
            __shadowobRuntime: {
              provisionState: {
                plugins: {
                  shadowob: { buddies: { buddy: { userId: 'buddy-user-1' } } },
                },
              },
            },
          },
        },
      ]),
      recordActivity: vi.fn().mockResolvedValue(undefined),
    }

    await recordDeploymentActivityForBuddyUsers({
      deploymentDao: deploymentDao as never,
      buddyUserIds: ['buddy-user-1'],
      at: new Date('2026-05-11T01:00:00.000Z'),
    })

    expect(deploymentDao.recordActivity).toHaveBeenCalledWith(
      'deployment-active-1',
      new Date('2026-05-11T01:00:00.000Z'),
    )
  })

  it('resumes paused deployments when a provisioned buddy is mentioned', async () => {
    cloudMocks.scaleAgentSandboxAsync.mockClear()
    cloudMocks.waitForAgentSandboxReady.mockClear()
    cloudMocks.scaleAgentSandboxAsync.mockResolvedValue(undefined)
    cloudMocks.waitForAgentSandboxReady.mockResolvedValue(undefined)
    const deployment = {
      id: 'deployment-resume-1',
      namespace: 'gstack-buddy',
      clusterId: null,
      status: 'paused',
      configSnapshot: {
        __shadowobRuntime: {
          provisionState: {
            plugins: {
              shadowob: { buddies: { buddy: { userId: 'buddy-user-1' } } },
            },
          },
        },
        deployments: { agents: [{ id: 'strategy-buddy' }] },
      },
    }
    const deploymentDao = {
      listPaused: vi.fn().mockResolvedValue([deployment]),
      tryAcquireOperationLock: vi.fn().mockResolvedValue(true),
      releaseOperationLock: vi.fn().mockResolvedValue(undefined),
      findByIdOnly: vi.fn().mockResolvedValue(deployment),
      updateStatusIfStatus: vi
        .fn()
        .mockImplementation(async (_id: string, _currentStatus: string, status: string) => ({
          ...deployment,
          status,
        })),
      failIfStatus: vi.fn().mockResolvedValue(null),
      appendLog: vi.fn().mockResolvedValue(undefined),
    }

    await resumePausedDeploymentsForBuddyUsers({
      deploymentDao: deploymentDao as never,
      clusterDao: {} as never,
      buddyUserIds: ['buddy-user-1'],
      reason: 'test mention',
    })

    expect(deploymentDao.updateStatusIfStatus).toHaveBeenCalledWith(
      'deployment-resume-1',
      'paused',
      'resuming',
    )
    expect(cloudMocks.scaleAgentSandboxAsync).toHaveBeenCalledWith(
      'gstack-buddy',
      'strategy-buddy',
      1,
      undefined,
    )
    expect(deploymentDao.updateStatusIfStatus).toHaveBeenCalledWith(
      'deployment-resume-1',
      'resuming',
      'deployed',
    )
  })

  it('does not auto-resume a Cloud Computer paused for insufficient balance', async () => {
    cloudMocks.scaleAgentSandboxAsync.mockClear()
    const deployment = {
      id: 'deployment-billing-paused-1',
      namespace: 'gstack-buddy',
      clusterId: null,
      status: 'paused',
      errorMessage: CLOUD_COMPUTER_BILLING_PAUSE_REASON,
      configSnapshot: {
        __shadowobRuntime: {
          provisionState: {
            plugins: {
              shadowob: { buddies: { buddy: { userId: 'buddy-user-1' } } },
            },
          },
        },
        deployments: { agents: [{ id: 'strategy-buddy' }] },
      },
    }
    const deploymentDao = {
      listPaused: vi.fn().mockResolvedValue([deployment]),
      tryAcquireOperationLock: vi.fn().mockResolvedValue(true),
      updateStatus: vi.fn().mockResolvedValue(deployment),
    }

    const resumed = await resumePausedDeploymentsForBuddyUsers({
      deploymentDao: deploymentDao as never,
      clusterDao: {} as never,
      buddyUserIds: ['buddy-user-1'],
      reason: 'test mention',
    })

    expect(resumed).toBe(0)
    expect(deploymentDao.tryAcquireOperationLock).not.toHaveBeenCalled()
    expect(cloudMocks.scaleAgentSandboxAsync).not.toHaveBeenCalled()
  })

  it('does not auto-resume a Cloud Computer explicitly paused by its owner', async () => {
    cloudMocks.scaleAgentSandboxAsync.mockClear()
    const deployment = {
      id: 'deployment-manually-paused-1',
      namespace: 'gstack-buddy',
      clusterId: null,
      status: 'paused',
      errorMessage: CLOUD_COMPUTER_MANUAL_PAUSE_REASON,
      configSnapshot: {
        __shadowobRuntime: {
          provisionState: {
            plugins: {
              shadowob: { buddies: { buddy: { userId: 'buddy-user-1' } } },
            },
          },
        },
        deployments: { agents: [{ id: 'strategy-buddy' }] },
      },
    }
    const deploymentDao = {
      listPaused: vi.fn().mockResolvedValue([deployment]),
      tryAcquireOperationLock: vi.fn().mockResolvedValue(true),
    }

    const resumed = await resumePausedDeploymentsForBuddyUsers({
      deploymentDao: deploymentDao as never,
      clusterDao: {} as never,
      buddyUserIds: ['buddy-user-1'],
      reason: 'agent heartbeat',
    })

    expect(resumed).toBe(0)
    expect(deploymentDao.tryAcquireOperationLock).not.toHaveBeenCalled()
    expect(cloudMocks.scaleAgentSandboxAsync).not.toHaveBeenCalled()
  })
})
