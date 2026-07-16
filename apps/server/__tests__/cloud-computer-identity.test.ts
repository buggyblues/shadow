import { describe, expect, it } from 'vitest'
import {
  cloudComputerIdForDeployment,
  selectCloudComputerDeploymentRows,
} from '../src/lib/cloud-computer-identity'

describe('cloud computer deployment identity', () => {
  it('selects the newest deployment while a redeploy is still preparing', () => {
    const olderRunning = {
      id: 'older-running',
      clusterId: null,
      namespace: 'cloud-computer-a',
      name: 'Cloud Computer',
      status: 'deployed',
      createdAt: new Date('2026-07-13T07:00:00.000Z'),
      updatedAt: new Date('2026-07-13T07:05:00.000Z'),
    }
    const newerPreparing = {
      ...olderRunning,
      id: 'newer-preparing',
      status: 'pending',
      createdAt: new Date('2026-07-13T07:10:00.000Z'),
      updatedAt: new Date('2026-07-13T07:10:00.000Z'),
    }

    expect(selectCloudComputerDeploymentRows([olderRunning, newerPreparing])).toEqual([
      newerPreparing,
    ])
  })

  it('keeps same-name computers separate by their persisted instance identity', () => {
    const first = {
      id: 'first',
      clusterId: null,
      namespace: 'cc-my-computer-first',
      name: 'My Cloud Computer',
      status: 'deployed',
      configSnapshot: {
        cloudComputer: { instanceId: '10000000-0000-4000-8000-000000000001' },
      },
    }
    const second = {
      ...first,
      id: 'second',
      namespace: 'cc-my-computer-second',
      configSnapshot: {
        cloudComputer: { instanceId: '20000000-0000-4000-8000-000000000002' },
      },
    }

    expect(selectCloudComputerDeploymentRows([first, second])).toEqual([first, second])
    expect(cloudComputerIdForDeployment(first)).not.toBe(cloudComputerIdForDeployment(second))
  })

  it('groups redeploy history by instance identity even when runtime metadata changes', () => {
    const instanceId = '30000000-0000-4000-8000-000000000003'
    const older = {
      id: 'older',
      clusterId: null,
      namespace: 'cc-runtime-before',
      name: 'Renamed Computer',
      status: 'deployed',
      createdAt: new Date('2026-07-13T07:00:00.000Z'),
      configSnapshot: { cloudComputer: { instanceId } },
    }
    const newer = {
      ...older,
      id: 'newer',
      namespace: 'cc-runtime-after',
      status: 'pending',
      createdAt: new Date('2026-07-13T08:00:00.000Z'),
    }

    expect(selectCloudComputerDeploymentRows([older, newer])).toEqual([newer])
    expect(cloudComputerIdForDeployment(older)).toBe(cloudComputerIdForDeployment(newer))
  })

  it('does not let destroying one same-name computer hide another instance', () => {
    const destroyed = {
      id: 'destroyed',
      clusterId: null,
      namespace: 'cc-same-name-one',
      name: 'Same Name',
      status: 'destroyed',
      updatedAt: new Date('2026-07-13T08:00:00.000Z'),
      configSnapshot: {
        cloudComputer: { instanceId: '40000000-0000-4000-8000-000000000004' },
      },
    }
    const running = {
      ...destroyed,
      id: 'running',
      namespace: 'cc-same-name-two',
      status: 'deployed',
      configSnapshot: {
        cloudComputer: { instanceId: '50000000-0000-4000-8000-000000000005' },
      },
    }

    expect(selectCloudComputerDeploymentRows([destroyed, running])).toEqual([running])
  })
})
