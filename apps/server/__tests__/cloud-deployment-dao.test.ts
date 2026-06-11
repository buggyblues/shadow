import { describe, expect, it } from 'vitest'
import {
  countCurrentDeploymentNamespaces,
  selectCurrentDeploymentRowsByNamespace,
} from '../src/dao/cloud-deployment.dao'

function row(
  namespace: string,
  status: string,
  timestamp: string,
  errorMessage: string | null = null,
) {
  const date = new Date(timestamp)
  return {
    namespace,
    status,
    errorMessage,
    createdAt: date,
    updatedAt: date,
  }
}

describe('countCurrentDeploymentNamespaces', () => {
  it('counts current namespaces instead of historical deployed rows', () => {
    expect(
      countCurrentDeploymentNamespaces([
        row('buddy-cloud-a', 'deployed', '2026-06-10T08:00:00.000Z'),
        row('buddy-cloud-a', 'deployed', '2026-06-10T09:00:00.000Z'),
        row('buddy-cloud-b', 'deployed', '2026-06-10T08:30:00.000Z'),
        row('buddy-cloud-b', 'deployed', '2026-06-10T09:30:00.000Z'),
      ]),
    ).toBe(2)
  })

  it('uses the latest visible row per namespace regardless of current status', () => {
    expect(
      countCurrentDeploymentNamespaces([
        row('buddy-cloud-a', 'deployed', '2026-06-10T08:00:00.000Z'),
        row('buddy-cloud-a', 'resuming', '2026-06-10T09:00:00.000Z'),
        row('buddy-cloud-b', 'paused', '2026-06-10T08:30:00.000Z'),
      ]),
    ).toBe(2)
  })

  it('does not count a namespace when the latest visible row is failed', () => {
    expect(
      countCurrentDeploymentNamespaces([
        row('buddy-cloud-a', 'deployed', '2026-06-10T08:00:00.000Z'),
        row('buddy-cloud-a', 'failed', '2026-06-10T09:00:00.000Z', 'runtime error'),
      ]),
    ).toBe(0)
  })

  it('ignores hidden failed rows before selecting the latest visible namespace row', () => {
    expect(
      countCurrentDeploymentNamespaces([
        row('buddy-cloud-a', 'deployed', '2026-06-10T08:00:00.000Z'),
        row('buddy-cloud-a', 'failed', '2026-06-10T09:00:00.000Z', 'cancelled by user'),
      ]),
    ).toBe(1)
  })

  it('selects only the latest current row per namespace for runtime scans', () => {
    const selected = selectCurrentDeploymentRowsByNamespace([
      row('buddy-cloud-a', 'deployed', '2026-06-10T08:00:00.000Z'),
      row('buddy-cloud-a', 'deployed', '2026-06-10T09:00:00.000Z'),
      row('buddy-cloud-b', 'paused', '2026-06-10T08:30:00.000Z'),
    ])

    expect(selected.map((item) => `${item.namespace}:${item.status}`)).toEqual([
      'buddy-cloud-a:deployed',
      'buddy-cloud-b:paused',
    ])
    expect(selected.find((item) => item.namespace === 'buddy-cloud-a')?.createdAt).toEqual(
      new Date('2026-06-10T09:00:00.000Z'),
    )
  })
})
