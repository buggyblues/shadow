import type { MessageMention } from '@shadowob/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppContainer } from '../src/container'

const processorMocks = vi.hoisted(() => ({
  recordDeploymentActivityForBuddyUsers: vi.fn(),
  resumePausedDeploymentsForBuddyUsers: vi.fn(),
}))

vi.mock('../src/lib/cloud-deployment-processor', () => ({
  recordDeploymentActivityForBuddyUsers: processorMocks.recordDeploymentActivityForBuddyUsers,
  resumePausedDeploymentsForBuddyUsers: processorMocks.resumePausedDeploymentsForBuddyUsers,
}))

import {
  extractCloudResumeTargetUserIds,
  recordCloudDeploymentActivityAndResume,
} from '../src/lib/cloud-deployment-autoresume'

describe('extractCloudResumeTargetUserIds', () => {
  it('keeps unique user ids from user and buddy mentions only', () => {
    const mentions = [
      { kind: 'buddy', userId: 'buddy-user-1', targetId: 'buddy-target-1' },
      { kind: 'user', targetId: 'human-user-1' },
      { kind: 'role', targetId: 'role-1' },
      { kind: 'buddy', userId: 'buddy-user-1' },
      { kind: 'user', userId: '   ' },
    ] as MessageMention[]

    expect(extractCloudResumeTargetUserIds(mentions)).toEqual(['buddy-user-1', 'human-user-1'])
  })
})

describe('recordCloudDeploymentActivityAndResume', () => {
  beforeEach(() => {
    processorMocks.recordDeploymentActivityForBuddyUsers.mockReset()
    processorMocks.resumePausedDeploymentsForBuddyUsers.mockReset()
  })

  it('records deployment activity before resuming paused sandboxes', async () => {
    const deploymentDao = { kind: 'cloudDeploymentDao' }
    const clusterDao = { kind: 'cloudClusterDao' }
    const resolve = vi.fn((key: string) => {
      if (key === 'cloudDeploymentDao') return deploymentDao
      if (key === 'cloudClusterDao') return clusterDao
      throw new Error(`unexpected dependency: ${key}`)
    })
    const container = { resolve } as unknown as AppContainer
    const at = new Date('2026-05-11T12:00:00.000Z')
    processorMocks.recordDeploymentActivityForBuddyUsers.mockResolvedValue(undefined)
    processorMocks.resumePausedDeploymentsForBuddyUsers.mockResolvedValue(2)

    const resumed = await recordCloudDeploymentActivityAndResume({
      container,
      buddyUserIds: ['buddy-user-1', 'buddy-user-1', 'buddy-user-2'],
      reason: 'message mention',
      at,
    })

    expect(resumed).toBe(2)
    expect(processorMocks.recordDeploymentActivityForBuddyUsers).toHaveBeenCalledWith({
      deploymentDao,
      buddyUserIds: ['buddy-user-1', 'buddy-user-2'],
      at,
    })
    expect(processorMocks.resumePausedDeploymentsForBuddyUsers).toHaveBeenCalledWith({
      deploymentDao,
      clusterDao,
      buddyUserIds: ['buddy-user-1', 'buddy-user-2'],
      reason: 'message mention',
    })
    expect(
      processorMocks.recordDeploymentActivityForBuddyUsers.mock.invocationCallOrder[0],
    ).toBeLessThan(processorMocks.resumePausedDeploymentsForBuddyUsers.mock.invocationCallOrder[0])
  })

  it('skips empty targets without resolving cluster dependencies', async () => {
    const container = { resolve: vi.fn() } as unknown as AppContainer

    await expect(
      recordCloudDeploymentActivityAndResume({
        container,
        buddyUserIds: [' ', ''],
        reason: 'message mention',
      }),
    ).resolves.toBe(0)

    expect(container.resolve).not.toHaveBeenCalled()
    expect(processorMocks.recordDeploymentActivityForBuddyUsers).not.toHaveBeenCalled()
    expect(processorMocks.resumePausedDeploymentsForBuddyUsers).not.toHaveBeenCalled()
  })
})
