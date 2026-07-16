const APP_READABLE_STATUSES = new Set(['deployed', 'paused'])

/**
 * Published Apps are related content, not part of provisioning health. Avoid
 * issuing this optional request while the Cloud Computer is still changing.
 */
export function canLoadCloudComputerApps(status: string) {
  return APP_READABLE_STATUSES.has(status)
}
