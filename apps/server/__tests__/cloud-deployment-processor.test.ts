import { describe, expect, it, vi } from 'vitest'

const cloudMocks = vi.hoisted(() => ({
  deleteKubernetesResourceAsync: vi.fn(),
  deleteNamespace: vi.fn(),
  listPodsAsync: vi.fn(),
  scaleAgentSandboxAsync: vi.fn(),
  waitForAgentSandboxPaused: vi.fn(),
  waitForAgentSandboxReady: vi.fn(),
}))
const backupRuntimeMocks = vi.hoisted(() => ({
  runCloudDeploymentBackup: vi.fn(),
}))

vi.mock('@shadowob/cloud', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shadowob/cloud')>()
  return {
    ...actual,
    deleteKubernetesResourceAsync: cloudMocks.deleteKubernetesResourceAsync,
    deleteNamespace: cloudMocks.deleteNamespace,
    listPodsAsync: cloudMocks.listPodsAsync,
    scaleAgentSandboxAsync: cloudMocks.scaleAgentSandboxAsync,
    waitForAgentSandboxPaused: cloudMocks.waitForAgentSandboxPaused,
    waitForAgentSandboxReady: cloudMocks.waitForAgentSandboxReady,
  }
})

vi.mock('../src/lib/cloud-deployment-backup-runtime', () => ({
  runCloudDeploymentBackup: backupRuntimeMocks.runCloudDeploymentBackup,
}))

import {
  calculateCloudHourlyBillingCharge,
  createCloudHourlyBillingReferenceId,
  ensureNamespaceDeletionStarted,
  hasReadyDeploymentRuntimeResources,
  isUserCancelledDeploymentError,
  probeDeploymentRuntimeResources,
  reconcileExpiredBackups,
  reconcileIdleAutoPauseDeployments,
  reconcileStaleBackupOperations,
  reconcileStaleRestoreOperations,
  recordDeploymentActivityForBuddyUsers,
  resolveDeploymentShadowProvisionToken,
  resumePausedDeploymentsForBuddyUsers,
  waitForNamespaceDeletion,
} from '../src/lib/cloud-deployment-processor'

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

    await expect(probeDeploymentRuntimeResources('gstack-buddy')).resolves.toEqual({
      agentCount: 1,
      podNames: ['strategy-buddy-abc'],
      readyPods: 0,
    })
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

describe('resolveDeploymentShadowProvisionToken', () => {
  it('keeps an explicit runtime token when one is provided', async () => {
    await expect(
      resolveDeploymentShadowProvisionToken({ SHADOW_USER_TOKEN: 'explicit-token' }, 'user-1'),
    ).resolves.toBe('explicit-token')
  })

  it('mints a transient access token for server-side Shadow provisioning', async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret'

    const token = await resolveDeploymentShadowProvisionToken({}, 'user-1')

    expect(token).toBeTruthy()
    expect(token).not.toContain('explicit-token')
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
      expect.stringContaining('expired and artifacts were removed'),
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
      updateStatus: vi.fn().mockResolvedValue(deployment),
      appendLog: vi.fn().mockResolvedValue(undefined),
    }

    await resumePausedDeploymentsForBuddyUsers({
      deploymentDao: deploymentDao as never,
      clusterDao: {} as never,
      buddyUserIds: ['buddy-user-1'],
      reason: 'test mention',
    })

    expect(deploymentDao.updateStatus).toHaveBeenCalledWith('deployment-resume-1', 'resuming')
    expect(cloudMocks.scaleAgentSandboxAsync).toHaveBeenCalledWith(
      'gstack-buddy',
      'strategy-buddy',
      1,
      undefined,
    )
    expect(deploymentDao.updateStatus).toHaveBeenCalledWith('deployment-resume-1', 'deployed')
  })
})
