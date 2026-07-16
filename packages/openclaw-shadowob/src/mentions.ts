import type { ShadowClient, ShadowMessage, ShadowMessageMention } from '@shadowob/sdk'
import type { ShadowRuntimeLogger } from './types.js'

type MentionMetadata = {
  mentions?: ShadowMessageMention[]
}

function isMentionMetadata(value: unknown): value is MentionMetadata {
  return !!value && typeof value === 'object'
}

export function getShadowMessageMentions(message: ShadowMessage): ShadowMessageMention[] {
  const metadata = message.metadata
  if (!isMentionMetadata(metadata) || !Array.isArray(metadata.mentions)) return []
  return metadata.mentions.filter((mention) => mention && typeof mention.token === 'string')
}

export function mentionTargetsBuddy(params: {
  mentions: ShadowMessageMention[]
  buddyUserId: string
  buddyUsername: string
}): boolean {
  const buddyUsername = params.buddyUsername.toLowerCase()
  return params.mentions.some((mention) => {
    if (mention.kind !== 'user' && mention.kind !== 'buddy') return false
    if (mention.userId === params.buddyUserId || mention.targetId === params.buddyUserId)
      return true
    return mention.username?.toLowerCase() === buddyUsername
  })
}

export function mentionsTargetSpaceApp(mentions: ShadowMessageMention[]): boolean {
  return mentions.some(
    (mention) => mention.kind === 'space_app' && (mention.appKey || mention.targetId),
  )
}

export function mentionedBuddyIds(mentions: ShadowMessageMention[]): string[] {
  const ids = new Set<string>()
  for (const mention of mentions) {
    if (mention.kind !== 'buddy' && !(mention.kind === 'user' && mention.isBot)) continue
    const id = mention.userId ?? mention.targetId
    if (id) ids.add(id)
  }
  return [...ids]
}

export function hasMultipleBuddyMentions(mentions: ShadowMessageMention[]): boolean {
  return mentionedBuddyIds(mentions).length >= 2
}

export function formatShadowMentionsForAgent(mentions: ShadowMessageMention[]): string {
  if (mentions.length === 0) return ''

  const lines = mentions.map((mention) => {
    const label = mention.label || mention.sourceToken || mention.token
    if (mention.kind === 'channel') {
      return `- ${label} [channel] channelId=${mention.channelId ?? mention.targetId} serverId=${mention.serverId ?? ''} server=${mention.serverName ?? ''}`
    }
    if (mention.kind === 'server') {
      return `- ${label} [server] serverId=${mention.serverId ?? mention.targetId} slug=${mention.serverSlug ?? ''}`
    }
    if (mention.kind === 'space_app') {
      return `- ${label} [space-app] appKey=${mention.appKey ?? mention.targetId} appId=${mention.appId ?? mention.targetId} serverId=${mention.serverId ?? ''} server=${mention.serverName ?? ''}`
    }
    if (mention.kind === 'user' || mention.kind === 'buddy') {
      return `- ${label} [${mention.kind}] userId=${mention.userId ?? mention.targetId} username=${mention.username ?? ''}`
    }
    return `- ${label} [${mention.kind}] serverId=${mention.serverId ?? mention.targetId}`
  })

  return [
    'Shadow mentions:',
    ...lines,
    'To mention a Shadow entity in a reply, write its visible handle (for example @username or #channel); Shadow will resolve it before delivery.',
    mentionsTargetSpaceApp(mentions)
      ? 'If a Space App is mentioned, operate it through the Shadow CLI only: first run `shadowob space-app discover --server "<serverId-or-slug>" --json`, then run `shadowob space-app call "<appKey>" <command> --server "<serverId-or-slug>" --json-input \'<raw-command-input-json>\' --json`. Do not use curl, fetch, raw HTTP routes, or the JavaScript SDK for Space App commands. Use the mentioned appKey/serverId; do not ask the user to describe the CLI path.'
      : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export function mentionContextFields(mentions: ShadowMessageMention[]) {
  if (mentions.length === 0) return {}
  return {
    Mentions: mentions,
    MentionSummary: mentions
      .map(
        (mention) => `${mention.label || mention.sourceToken || mention.token} (${mention.kind})`,
      )
      .join(', '),
    MentionedUsers: mentions
      .filter((mention) => mention.kind === 'user' || mention.kind === 'buddy')
      .map((mention) => ({
        userId: mention.userId ?? mention.targetId,
        username: mention.username,
        displayName: mention.displayName,
        isBot: mention.isBot,
      })),
    MentionedChannels: mentions
      .filter((mention) => mention.kind === 'channel')
      .map((mention) => ({
        channelId: mention.channelId ?? mention.targetId,
        channelName: mention.channelName,
        serverId: mention.serverId,
        serverName: mention.serverName,
      })),
    MentionedServers: mentions
      .filter((mention) => mention.kind === 'server')
      .map((mention) => ({
        serverId: mention.serverId ?? mention.targetId,
        serverSlug: mention.serverSlug,
        serverName: mention.serverName,
      })),
    MentionedApps: mentions
      .filter((mention) => mention.kind === 'space_app')
      .map((mention) => ({
        appId: mention.appId ?? mention.targetId,
        appKey: mention.appKey,
        appName: mention.appName,
        serverId: mention.serverId,
        serverSlug: mention.serverSlug,
        serverName: mention.serverName,
      })),
  }
}

export async function resolveOutboundMentions(params: {
  client: ShadowClient
  channelId?: string
  content: string
  runtime?: ShadowRuntimeLogger
}): Promise<ShadowMessageMention[] | undefined> {
  if (!params.channelId) return undefined
  if (!/[@#]|<[@#!][^>\s]+>/u.test(params.content)) return undefined

  try {
    const resolved = await params.client.resolveMentions({
      channelId: params.channelId,
      content: params.content,
    })
    return resolved.mentions.length > 0 ? resolved.mentions : undefined
  } catch (err) {
    params.runtime?.error?.(`[mention] Failed to resolve outbound mentions: ${String(err)}`)
    return undefined
  }
}
