import type { ShadowClient } from '@shadowob/sdk'
import { parseTarget } from '../outbound.js'

export async function sendShadowMessage(params: {
  client: ShadowClient
  to: string
  content: string
  threadId?: string
  replyToId?: string
  metadata?: Record<string, unknown>
}) {
  const { channelId, threadId: parsedThreadId } = parseTarget(params.to)
  const threadId = params.threadId ?? parsedThreadId

  if (threadId && channelId) {
    return params.client.sendMessage(channelId, params.content, {
      threadId,
      replyToId: params.replyToId,
      metadata: params.metadata,
    })
  }

  if (threadId) {
    return params.client.sendToThread(threadId, params.content, {
      metadata: params.metadata,
    })
  }

  if (channelId) {
    return params.client.sendMessage(channelId, params.content, {
      replyToId: params.replyToId,
      metadata: params.metadata,
    })
  }

  throw new Error('Could not resolve target channel or thread')
}
