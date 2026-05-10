import type { ShadowClient, ShadowMessageMention } from '@shadowob/sdk'
import { resolveOutboundMentions } from '../mentions.js'
import { parseTarget } from '../outbound.js'

export async function sendShadowMessage(params: {
  client: ShadowClient
  to: string
  content: string
  threadId?: string
  replyToId?: string
  mentions?: ShadowMessageMention[]
  metadata?: Record<string, unknown>
}) {
  const { channelId, threadId: parsedThreadId } = parseTarget(params.to)
  const threadId = params.threadId ?? parsedThreadId

  if (threadId && channelId) {
    const mentions =
      params.mentions ??
      (await resolveOutboundMentions({
        client: params.client,
        channelId,
        content: params.content,
      }))
    return params.client.sendMessage(channelId, params.content, {
      threadId,
      replyToId: params.replyToId,
      ...(mentions ? { mentions } : {}),
      metadata: params.metadata,
    })
  }

  if (threadId) {
    return params.client.sendToThread(threadId, params.content, {
      ...(params.replyToId ? { replyToId: params.replyToId } : {}),
      metadata: params.metadata,
    })
  }

  if (channelId) {
    const mentions =
      params.mentions ??
      (await resolveOutboundMentions({
        client: params.client,
        channelId,
        content: params.content,
      }))
    return params.client.sendMessage(channelId, params.content, {
      replyToId: params.replyToId,
      ...(mentions ? { mentions } : {}),
      metadata: params.metadata,
    })
  }

  throw new Error('Could not resolve target channel or thread')
}
