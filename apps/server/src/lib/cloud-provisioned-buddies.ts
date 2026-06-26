import { extractCloudSaasRuntime } from '@shadowob/cloud'

export type ProvisionedBuddySummary = {
  id: string
  agentId: string
  userId?: string | null
  namespace?: string | null
  deploymentId?: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function readOptionalString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function extractCloudProvisionedBuddies(configSnapshot: unknown): ProvisionedBuddySummary[] {
  const shadowobState = extractCloudSaasRuntime(configSnapshot).provisionState?.plugins.shadowob
  if (!isRecord(shadowobState) || !isRecord(shadowobState.buddies)) return []

  const buddies: ProvisionedBuddySummary[] = []
  for (const [id, value] of Object.entries(shadowobState.buddies)) {
    if (!id || !isRecord(value)) continue

    const agentId = readOptionalString(value, 'agentId')
    if (!agentId) continue

    const userId = readOptionalString(value, 'userId')
    const namespace = readOptionalString(value, 'namespace')
    const deploymentId = readOptionalString(value, 'deploymentId')

    buddies.push({
      id,
      agentId,
      ...(userId ? { userId } : {}),
      ...(namespace ? { namespace } : {}),
      ...(deploymentId ? { deploymentId } : {}),
    })
  }

  return buddies
}

export function attachCloudProvisionedBuddies<T extends { configSnapshot?: unknown }>(
  source: T,
  sanitized: T,
): T & { provisionedBuddies?: ProvisionedBuddySummary[] } {
  const provisionedBuddies = extractCloudProvisionedBuddies(source.configSnapshot)
  return provisionedBuddies.length > 0 ? { ...sanitized, provisionedBuddies } : sanitized
}
