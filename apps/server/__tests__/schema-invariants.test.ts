import { describe, expect, it, vi } from 'vitest'
import {
  assertCloudDeploymentStatusEnumValues,
  assertDatabaseSchemaInvariants,
  REQUIRED_CLOUD_ACTIVITY_TYPE_VALUES,
  REQUIRED_CLOUD_DEPLOYMENT_STATUS_VALUES,
  REQUIRED_CLOUD_TEMPLATE_COLUMNS,
  REQUIRED_CLOUD_TEMPLATE_REVIEW_STATUS_VALUES,
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

describe('assertDatabaseSchemaInvariants', () => {
  it('accepts databases with required enum values and columns', async () => {
    const database = {
      execute: vi
        .fn()
        .mockResolvedValueOnce(
          REQUIRED_CLOUD_DEPLOYMENT_STATUS_VALUES.map((enumlabel) => ({ enumlabel })),
        )
        .mockResolvedValueOnce(
          REQUIRED_CLOUD_TEMPLATE_REVIEW_STATUS_VALUES.map((enumlabel) => ({ enumlabel })),
        )
        .mockResolvedValueOnce(
          REQUIRED_CLOUD_ACTIVITY_TYPE_VALUES.map((enumlabel) => ({ enumlabel })),
        )
        .mockResolvedValueOnce(
          REQUIRED_CLOUD_TEMPLATE_COLUMNS.map((column_name) => ({ column_name })),
        ),
    }

    await expect(assertDatabaseSchemaInvariants(database as never)).resolves.toBeUndefined()
  })

  it('fails fast when cloud template review columns are missing', async () => {
    const database = {
      execute: vi
        .fn()
        .mockResolvedValueOnce(
          REQUIRED_CLOUD_DEPLOYMENT_STATUS_VALUES.map((enumlabel) => ({ enumlabel })),
        )
        .mockResolvedValueOnce(
          REQUIRED_CLOUD_TEMPLATE_REVIEW_STATUS_VALUES.map((enumlabel) => ({ enumlabel })),
        )
        .mockResolvedValueOnce(
          REQUIRED_CLOUD_ACTIVITY_TYPE_VALUES.map((enumlabel) => ({ enumlabel })),
        )
        .mockResolvedValueOnce([]),
    }

    await expect(assertDatabaseSchemaInvariants(database as never)).rejects.toThrow('review_note')
  })
})
