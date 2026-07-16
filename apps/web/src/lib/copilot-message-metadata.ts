import { buildMessageCopilotContextMetadata } from '@shadowob/shared'

export interface BuildCopilotMessageMetadataInput {
  appKey?: string | null
  spaceAppId?: string | null
  appName?: string | null
  serverId?: string | null
  serverSlug?: string | null
  channelId?: string | null
  channelKind?: string | null
}

function optionalMetadataString(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed || null
}

export function buildCopilotMessageMetadata(input: BuildCopilotMessageMetadataInput) {
  const appKey = input.appKey?.trim()
  if (!appKey) return undefined
  return buildMessageCopilotContextMetadata({
    kind: 'space_app_copilot',
    appKey,
    spaceAppId: optionalMetadataString(input.spaceAppId),
    appName: optionalMetadataString(input.appName),
    serverId: optionalMetadataString(input.serverId),
    serverSlug: optionalMetadataString(input.serverSlug),
    channelId: optionalMetadataString(input.channelId),
    channelKind: optionalMetadataString(input.channelKind),
  })
}
