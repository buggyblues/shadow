import { CLOUD_SAAS_RUNTIME_KEY, extractCloudSaasRuntime } from '@shadowob/cloud'

type PlayLaunchRuntimeMetadata = {
  defaultChannelName?: string
  greeting?: string
  locale?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeName(value: string | undefined | null) {
  return value?.trim().toLowerCase() || ''
}

export function attachPlayLaunchRuntimeMetadata(
  configSnapshot: Record<string, unknown>,
  metadata: PlayLaunchRuntimeMetadata,
) {
  if (!metadata.defaultChannelName && !metadata.greeting) return configSnapshot
  const runtime = isRecord(configSnapshot[CLOUD_SAAS_RUNTIME_KEY])
    ? (configSnapshot[CLOUD_SAAS_RUNTIME_KEY] as Record<string, unknown>)
    : {}
  const runtimePlayLaunch = isRecord(runtime.playLaunch) ? runtime.playLaunch : {}
  const use = Array.isArray(configSnapshot.use)
    ? configSnapshot.use.map((entry) => {
        if (!isRecord(entry) || entry.plugin !== 'shadowob') return entry
        const options = isRecord(entry.options) ? entry.options : {}
        const playLaunch = isRecord(options.playLaunch) ? options.playLaunch : {}
        return {
          ...entry,
          options: {
            ...options,
            playLaunch: {
              ...playLaunch,
              ...(metadata.defaultChannelName
                ? { defaultChannelName: metadata.defaultChannelName }
                : {}),
              ...(metadata.greeting ? { greeting: metadata.greeting } : {}),
            },
          },
        }
      })
    : configSnapshot.use

  return {
    ...configSnapshot,
    [CLOUD_SAAS_RUNTIME_KEY]: {
      ...runtime,
      playLaunch: {
        ...runtimePlayLaunch,
        ...(metadata.defaultChannelName ? { defaultChannelName: metadata.defaultChannelName } : {}),
        ...(metadata.greeting ? { greeting: metadata.greeting } : {}),
      },
    },
    ...(use ? { use } : {}),
  }
}

function playLaunchRuntimeMetadata(configSnapshot: unknown): PlayLaunchRuntimeMetadata {
  if (!isRecord(configSnapshot)) return {}
  const shadowobPlayLaunch = shadowobPlayLaunchMetadata(configSnapshot)
  const runtime = configSnapshot[CLOUD_SAAS_RUNTIME_KEY]
  if (!isRecord(runtime)) return shadowobPlayLaunch
  const contextLocale =
    isRecord(runtime.context) && typeof runtime.context.locale === 'string'
      ? runtime.context.locale
      : undefined
  if (!isRecord(runtime.playLaunch)) {
    return {
      ...shadowobPlayLaunch,
      ...(contextLocale ? { locale: contextLocale } : {}),
    }
  }
  return {
    ...shadowobPlayLaunch,
    ...(contextLocale ? { locale: contextLocale } : {}),
    ...(typeof runtime.playLaunch.defaultChannelName === 'string'
      ? { defaultChannelName: runtime.playLaunch.defaultChannelName }
      : {}),
    ...(typeof runtime.playLaunch.greeting === 'string'
      ? { greeting: runtime.playLaunch.greeting }
      : {}),
  }
}

export function extractPlayLaunchRuntimeMetadata(
  configSnapshot: unknown,
): PlayLaunchRuntimeMetadata {
  return playLaunchRuntimeMetadata(configSnapshot)
}

function shadowobOptions(configSnapshot: unknown): Record<string, unknown> | null {
  const { configSnapshot: cleanSnapshot } = extractCloudSaasRuntime(configSnapshot)
  const use = cleanSnapshot?.use
  if (!Array.isArray(use)) return null
  const shadowobEntry = use.find((entry) => isRecord(entry) && entry.plugin === 'shadowob')
  return isRecord(shadowobEntry) && isRecord(shadowobEntry.options) ? shadowobEntry.options : null
}

function shadowobPlayLaunchMetadata(configSnapshot: unknown): PlayLaunchRuntimeMetadata {
  const options = shadowobOptions(configSnapshot)
  const playLaunch = options?.playLaunch
  if (!isRecord(playLaunch)) return {}
  return {
    ...(typeof playLaunch.defaultChannelName === 'string'
      ? { defaultChannelName: playLaunch.defaultChannelName }
      : {}),
    ...(typeof playLaunch.greeting === 'string' ? { greeting: playLaunch.greeting } : {}),
  }
}

function resolvePreferredChannelConfigId(
  configSnapshot: unknown,
  defaultChannelName?: string | null,
): string | null {
  const options = shadowobOptions(configSnapshot)
  const servers = Array.isArray(options?.servers) ? options.servers : []
  const channels = servers.flatMap((server) =>
    isRecord(server) && Array.isArray(server.channels) ? server.channels : [],
  )
  const normalizedDefault = normalizeName(
    defaultChannelName ?? playLaunchRuntimeMetadata(configSnapshot).defaultChannelName,
  )

  if (normalizedDefault) {
    for (const channel of channels) {
      if (!isRecord(channel)) continue
      const id = typeof channel.id === 'string' ? channel.id : undefined
      const title = typeof channel.title === 'string' ? channel.title : undefined
      const name = typeof channel.name === 'string' ? channel.name : undefined
      if (
        normalizeName(id) === normalizedDefault ||
        normalizeName(title) === normalizedDefault ||
        normalizeName(name) === normalizedDefault
      ) {
        return id ?? title ?? name ?? null
      }
    }
  }

  for (const channel of channels) {
    if (!isRecord(channel)) continue
    const id = typeof channel.id === 'string' ? channel.id : undefined
    if (id) return id
  }
  return null
}

export function extractShadowProvisionTarget(
  configSnapshot: unknown,
  defaultChannelName?: string | null,
): {
  serverId: string | null
  channelId: string | null
} {
  const { provisionState } = extractCloudSaasRuntime(configSnapshot)
  const shadowob = provisionState?.plugins?.shadowob
  if (!shadowob || typeof shadowob !== 'object' || Array.isArray(shadowob)) {
    return { serverId: null, channelId: null }
  }

  const servers = (shadowob as Record<string, unknown>).servers
  const channels = (shadowob as Record<string, unknown>).channels
  const serverId =
    servers && typeof servers === 'object' && !Array.isArray(servers)
      ? (Object.values(servers).find((value): value is string => typeof value === 'string') ?? null)
      : null

  if (!channels || typeof channels !== 'object' || Array.isArray(channels)) {
    return { serverId, channelId: null }
  }

  const channelMap = channels as Record<string, unknown>
  const preferredConfigId = resolvePreferredChannelConfigId(configSnapshot, defaultChannelName)
  const preferredChannelId =
    preferredConfigId && typeof channelMap[preferredConfigId] === 'string'
      ? (channelMap[preferredConfigId] as string)
      : null
  const fallbackChannelId =
    Object.values(channelMap).find((value): value is string => typeof value === 'string') ?? null

  return { serverId, channelId: preferredChannelId ?? fallbackChannelId }
}

export function extractShadowProvisionBuddyUserIds(configSnapshot: unknown): string[] {
  const { provisionState } = extractCloudSaasRuntime(configSnapshot)
  const shadowob = provisionState?.plugins?.shadowob
  if (!isRecord(shadowob) || !isRecord(shadowob.buddies)) return []

  return Object.values(shadowob.buddies)
    .map((value) => (isRecord(value) && typeof value.userId === 'string' ? value.userId : null))
    .filter((value): value is string => Boolean(value))
}

export function extractShadowProvisionCommerce(configSnapshot: unknown): Array<{
  seedId: string
  shopId: string
  productId: string
  offerId: string
  fileId: string
  deliverableId: string
}> {
  const { provisionState } = extractCloudSaasRuntime(configSnapshot)
  const shadowob = provisionState?.plugins?.shadowob
  if (!isRecord(shadowob) || !isRecord(shadowob.commerce)) return []

  return Object.entries(shadowob.commerce).flatMap(([seedId, value]) => {
    if (!isRecord(value)) return []
    const shopId = typeof value.shopId === 'string' ? value.shopId : null
    const productId = typeof value.productId === 'string' ? value.productId : null
    const offerId = typeof value.offerId === 'string' ? value.offerId : null
    const fileId = typeof value.fileId === 'string' ? value.fileId : null
    const deliverableId = typeof value.deliverableId === 'string' ? value.deliverableId : null
    if (!shopId || !productId || !offerId || !fileId || !deliverableId) return []
    return [{ seedId, shopId, productId, offerId, fileId, deliverableId }]
  })
}
