import { CLOUD_SAAS_RUNTIME_KEY, extractCloudSaasRuntime } from '@shadowob/cloud'

type GreetingMessageConfig = {
  id?: string
  channelId?: string
  buddyId?: string
  content: string
}

type GreetingRuntimeMetadata = {
  entryChannelId?: string
  messages: GreetingMessageConfig[]
  locale?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeName(value: string | undefined | null) {
  return value?.trim().toLowerCase() || ''
}

export function attachGreetingRuntimeMetadata(
  configSnapshot: Record<string, unknown>,
  metadata: Partial<Omit<GreetingRuntimeMetadata, 'locale'>>,
) {
  if (!metadata.entryChannelId && !metadata.messages?.length) return configSnapshot
  const runtime = isRecord(configSnapshot[CLOUD_SAAS_RUNTIME_KEY])
    ? (configSnapshot[CLOUD_SAAS_RUNTIME_KEY] as Record<string, unknown>)
    : {}
  const runtimeGreeting = normalizeGreetingConfig(runtime.greeting)

  return {
    ...configSnapshot,
    [CLOUD_SAAS_RUNTIME_KEY]: {
      ...runtime,
      greeting: {
        ...(runtimeGreeting.entryChannelId
          ? { entryChannelId: runtimeGreeting.entryChannelId }
          : {}),
        ...(metadata.entryChannelId ? { entryChannelId: metadata.entryChannelId } : {}),
        messages: metadata.messages?.length ? metadata.messages : runtimeGreeting.messages,
      },
    },
  }
}

function greetingRuntimeMetadata(configSnapshot: unknown): GreetingRuntimeMetadata {
  const empty: GreetingRuntimeMetadata = { messages: [] }
  if (!isRecord(configSnapshot)) return empty
  const shadowobGreeting = shadowobGreetingMetadata(configSnapshot)
  const runtime = configSnapshot[CLOUD_SAAS_RUNTIME_KEY]
  if (!isRecord(runtime)) return shadowobGreeting
  const contextLocale =
    isRecord(runtime.context) && typeof runtime.context.locale === 'string'
      ? runtime.context.locale
      : undefined
  const runtimeGreeting = normalizeGreetingConfig(runtime.greeting)
  return {
    ...shadowobGreeting,
    ...(runtimeGreeting.entryChannelId ? { entryChannelId: runtimeGreeting.entryChannelId } : {}),
    messages: runtimeGreeting.messages.length
      ? runtimeGreeting.messages
      : shadowobGreeting.messages,
    ...(contextLocale ? { locale: contextLocale } : {}),
  }
}

export function extractGreetingRuntimeMetadata(configSnapshot: unknown): GreetingRuntimeMetadata {
  return greetingRuntimeMetadata(configSnapshot)
}

function shadowobOptions(configSnapshot: unknown): Record<string, unknown> | null {
  const { configSnapshot: cleanSnapshot } = extractCloudSaasRuntime(configSnapshot)
  const use = cleanSnapshot?.use
  if (!Array.isArray(use)) return null
  const shadowobEntry = use.find((entry) => isRecord(entry) && entry.plugin === 'shadowob')
  return isRecord(shadowobEntry) && isRecord(shadowobEntry.options) ? shadowobEntry.options : null
}

function shadowobGreetingMetadata(configSnapshot: unknown): GreetingRuntimeMetadata {
  const options = shadowobOptions(configSnapshot)
  return normalizeGreetingConfig(options?.greeting)
}

function normalizeGreetingConfig(value: unknown): GreetingRuntimeMetadata {
  const empty: GreetingRuntimeMetadata = { messages: [] }
  if (!isRecord(value)) return empty
  const messages = Array.isArray(value.messages)
    ? value.messages
        .map((message): GreetingMessageConfig | null => {
          if (!isRecord(message) || typeof message.content !== 'string') return null
          return {
            ...(typeof message.id === 'string' ? { id: message.id } : {}),
            ...(typeof message.channelId === 'string' ? { channelId: message.channelId } : {}),
            ...(typeof message.buddyId === 'string' ? { buddyId: message.buddyId } : {}),
            content: message.content,
          }
        })
        .filter((message): message is GreetingMessageConfig => message !== null)
    : []
  if (typeof value.content === 'string') {
    messages.unshift({
      ...(typeof value.channelId === 'string' ? { channelId: value.channelId } : {}),
      ...(typeof value.buddyId === 'string' ? { buddyId: value.buddyId } : {}),
      content: value.content,
    })
  }
  return {
    ...(typeof value.entryChannelId === 'string' ? { entryChannelId: value.entryChannelId } : {}),
    messages,
  }
}

function resolvePreferredChannelConfigId(
  configSnapshot: unknown,
  preferredChannelName?: string | null,
): string | null {
  const options = shadowobOptions(configSnapshot)
  const servers = Array.isArray(options?.servers) ? options.servers : []
  const channels = servers.flatMap((server) =>
    isRecord(server) && Array.isArray(server.channels) ? server.channels : [],
  )
  const greeting = greetingRuntimeMetadata(configSnapshot)
  const normalizedDefault = normalizeName(
    preferredChannelName ?? greeting.entryChannelId ?? greeting.messages[0]?.channelId,
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
  preferredChannelName?: string | null,
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
  const preferredConfigId = resolvePreferredChannelConfigId(configSnapshot, preferredChannelName)
  const preferredChannelId =
    preferredConfigId && typeof channelMap[preferredConfigId] === 'string'
      ? (channelMap[preferredConfigId] as string)
      : null
  const fallbackChannelId =
    Object.values(channelMap).find((value): value is string => typeof value === 'string') ?? null

  return { serverId, channelId: preferredChannelId ?? fallbackChannelId }
}

export function extractShadowGreetingMessages(configSnapshot: unknown): Array<{
  id: string
  channelConfigId: string
  channelId: string
  buddyConfigId: string | null
  buddyUserId: string
  content: string
}> {
  const { provisionState } = extractCloudSaasRuntime(configSnapshot)
  const shadowob = provisionState?.plugins?.shadowob
  if (!isRecord(shadowob) || !isRecord(shadowob.channels) || !isRecord(shadowob.buddies)) {
    return []
  }

  const channelMap = shadowob.channels
  const buddyEntries = Object.entries(shadowob.buddies).filter(
    (entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]),
  )
  const fallbackBuddy = buddyEntries.find(([, value]) => typeof value.userId === 'string')
  const greeting = greetingRuntimeMetadata(configSnapshot)
  const fallbackChannelConfigId = resolvePreferredChannelConfigId(
    configSnapshot,
    greeting.entryChannelId,
  )

  return greeting.messages.flatMap((message, index) => {
    const channelConfigId = message.channelId ?? fallbackChannelConfigId
    if (!channelConfigId || typeof channelMap[channelConfigId] !== 'string') return []
    const buddyEntry =
      (message.buddyId
        ? buddyEntries.find(([buddyId]) => buddyId === message.buddyId)
        : fallbackBuddy) ?? fallbackBuddy
    const buddyConfigId = buddyEntry?.[0] ?? null
    const buddyUserId = buddyEntry?.[1].userId
    if (typeof buddyUserId !== 'string') return []
    return [
      {
        id: message.id ?? `${channelConfigId}:${buddyConfigId ?? 'buddy'}:${index + 1}`,
        channelConfigId,
        channelId: channelMap[channelConfigId] as string,
        buddyConfigId,
        buddyUserId,
        content: message.content,
      },
    ]
  })
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
