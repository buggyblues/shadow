function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

/** The runtime overlay identifies deployments managed through the Cloud Computer facade. */
export function isCloudComputerDeploymentSnapshot(configSnapshot: unknown): boolean {
  return isRecord(configSnapshot) && isRecord(configSnapshot.cloudComputer)
}

export const CLOUD_COMPUTER_BILLING_PAUSE_REASON =
  'wallet insufficient for cloud computer hourly billing; persistent resources retained'
export const CLOUD_COMPUTER_BILLING_PAUSE_PENDING_REASON =
  'wallet insufficient for cloud computer hourly billing; compute pause pending; persistent resources retained'
export const CLOUD_COMPUTER_MANUAL_PAUSE_REASON =
  'cloud computer paused by user; persistent resources retained'

export function isCloudComputerBillingPauseReason(reason: unknown): boolean {
  return (
    typeof reason === 'string' &&
    reason.toLowerCase().includes('wallet insufficient for cloud computer hourly billing')
  )
}

export function isCloudComputerManualPauseReason(reason: unknown): boolean {
  return reason === CLOUD_COMPUTER_MANUAL_PAUSE_REASON
}
