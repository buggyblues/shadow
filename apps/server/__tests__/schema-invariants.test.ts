import { describe, expect, it, vi } from 'vitest'
import {
  assertCloudDeploymentStatusEnumValues,
  REQUIRED_CLOUD_DEPLOYMENT_STATUS_VALUES,
} from '../src/db/schema-invariants'

describe('assertCloudDeploymentStatusEnumValues', () => {
  it('accepts databases with every cloud deployment status value', async () => {
    const database = {
      execute: vi
        .fn()
        .mockResolvedValue(
          REQUIRED_CLOUD_DEPLOYMENT_STATUS_VALUES.map((enumlabel) => ({ enumlabel })),
        ),
    }

    await expect(assertCloudDeploymentStatusEnumValues(database as never)).resolves.toBeUndefined()
  })

  it('fails fast when production enum drift would break worker polling', async () => {
    const database = {
      execute: vi
        .fn()
        .mockResolvedValue(
          REQUIRED_CLOUD_DEPLOYMENT_STATUS_VALUES.filter((value) => value !== 'cancelling').map(
            (enumlabel) => ({ enumlabel }),
          ),
        ),
    }

    await expect(assertCloudDeploymentStatusEnumValues(database as never)).rejects.toThrow(
      'cancelling',
    )
  })
})
