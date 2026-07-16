import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  CLOUD_COMPUTER_BILLING_PAUSE_PENDING_REASON,
  CLOUD_COMPUTER_BILLING_PAUSE_REASON,
  isCloudComputerBillingPauseReason,
  isCloudComputerDeploymentSnapshot,
} from '../src/lib/cloud-computer-billing'

describe('cloud computer billing', () => {
  it('identifies the Cloud Computer runtime overlay without changing its metered cost', () => {
    const snapshot = {
      cloudComputer: { components: { browser: true } },
      workspace: { enabled: true },
    }

    expect(isCloudComputerDeploymentSnapshot(snapshot)).toBe(true)
  })

  it('does not classify standard Cloud SaaS deployments as cloud computers', () => {
    expect(isCloudComputerDeploymentSnapshot({ deployments: { agents: [] } })).toBe(false)
  })

  it('recognizes both completed and pending billing pause reasons', () => {
    expect(isCloudComputerBillingPauseReason(CLOUD_COMPUTER_BILLING_PAUSE_REASON)).toBe(true)
    expect(isCloudComputerBillingPauseReason(CLOUD_COMPUTER_BILLING_PAUSE_PENDING_REASON)).toBe(
      true,
    )
    expect(isCloudComputerBillingPauseReason('paused by user')).toBe(false)
  })

  it('restores metering only for active Cloud Computer deployments created by the old policy', () => {
    const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '../src/db/migrations')
    const migration = readFileSync(
      join(migrationsDir, '0110_restore_cloud_computer_metering.sql'),
      'utf8',
    )

    expect(migration).toContain('"hourly_cost" = 1')
    expect(migration).toContain('"hourly_cost" = 0')
    expect(migration).toContain('"config_snapshot" ? \'cloudComputer\'')
    expect(migration).toContain('"saas_mode" = true')
    expect(migration).toContain('"status"::text IN')
    expect(migration).not.toContain("'destroyed'")
  })
})
