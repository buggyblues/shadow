import { randomUUID } from 'node:crypto'
import type { ShadowClient, ShadowMessage } from '@shadowob/sdk'
import type { AgentChainMetadata, ReplyPayload, ShadowRuntimeLogger } from '../types.js'

const DELIVERY_RETRY_DELAYS_MS = [500, 1000, 2000]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableDeliveryError(err: unknown): boolean {
  const message = String(err)
  return (
    message.includes('fetch failed') ||
    message.includes('ECONNRESET') ||
    message.includes('ETIMEDOUT') ||
    message.includes('AbortError') ||
    /failed \((408|429|5\d\d)\)/.test(message)
  )
}

function replyMetadata(params: {
  deliveryId: string
  agentChain?: AgentChainMetadata
  replyToId?: string
}): Record<string, unknown> {
  return {
    ...(params.agentChain ? { agentChain: params.agentChain } : {}),
    shadowDelivery: {
      id: params.deliveryId,
      source: 'openclaw-shadowob',
      replyToId: params.replyToId,
    },
  }
}

function messageDeliveryId(message: ShadowMessage): string | null {
  const metadata = message.metadata
  if (!metadata || typeof metadata !== 'object') return null
  const delivery = (metadata as Record<string, unknown>).shadowDelivery
  if (!delivery || typeof delivery !== 'object') return null
  const id = (delivery as Record<string, unknown>).id
  return typeof id === 'string' ? id : null
}

async function findDeliveredChannelMessage(params: {
  client: ShadowClient
  channelId: string
  threadId?: string
  deliveryId: string
}): Promise<ShadowMessage | null> {
  const messages = params.threadId
    ? await params.client.getThreadMessages(params.threadId, 20)
    : (await params.client.getMessages(params.channelId, 20)).messages
  return messages.find((message) => messageDeliveryId(message) === params.deliveryId) ?? null
}

async function findDeliveredDmMessage(params: {
  client: ShadowClient
  dmChannelId: string
  deliveryId: string
}): Promise<ShadowMessage | null> {
  const messages = await params.client.getDmMessages(params.dmChannelId, 20)
  return messages.find((message) => messageDeliveryId(message) === params.deliveryId) ?? null
}

async function withDeliveryRetry<T>(params: {
  label: string
  runtime: ShadowRuntimeLogger
  operation: () => Promise<T>
  recover?: () => Promise<T | null>
}): Promise<T> {
  for (let attempt = 0; attempt <= DELIVERY_RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await params.operation()
    } catch (err) {
      const recovered = await params.recover?.().catch((recoverErr) => {
        params.runtime.error?.(
          `[${params.label}] Delivery recovery check failed: ${String(recoverErr)}`,
        )
        return null
      })
      if (recovered) {
        params.runtime.log?.(`[${params.label}] Recovered delivered message after retryable error`)
        return recovered
      }

      const delay = DELIVERY_RETRY_DELAYS_MS[attempt]
      if (!delay || !isRetryableDeliveryError(err)) throw err

      params.runtime.error?.(
        `[${params.label}] Delivery attempt ${attempt + 1} failed: ${String(err)}; retrying in ${delay}ms`,
      )
      await sleep(delay)
    }
  }

  throw new Error(`[${params.label}] Delivery retry exhausted`)
}

export async function deliverShadowReply(params: {
  payload: ReplyPayload
  channelId: string
  threadId?: string
  replyToId?: string
  client: ShadowClient
  runtime: ShadowRuntimeLogger
  agentChain?: AgentChainMetadata
  agentId: string | null
  botUserId: string
}): Promise<void> {
  const {
    payload,
    channelId,
    threadId,
    replyToId,
    client,
    runtime,
    agentChain,
    agentId,
    botUserId,
  } = params

  try {
    if (!payload.text && !(payload.mediaUrl || payload.mediaUrls?.length)) {
      runtime.error?.('[reply] No text or media in reply payload')
      return
    }

    const text = payload.text ?? ''
    runtime.log?.(`[reply] Sending reply to channel ${channelId}: "${text.slice(0, 80)}"`)

    const mediaUrls = [payload.mediaUrl, ...(payload.mediaUrls ?? [])].filter(Boolean) as string[]
    const newAgentChain: AgentChainMetadata | undefined = agentId
      ? {
          agentId,
          depth: (agentChain?.depth ?? 0) + 1,
          participants: [...(agentChain?.participants ?? []), botUserId].filter(
            Boolean,
          ) as string[],
          startedAt: agentChain?.startedAt ?? Date.now(),
          rootMessageId: agentChain?.rootMessageId ?? replyToId,
        }
      : undefined

    let sentMessage: ShadowMessage | null = null
    if (text || mediaUrls.length > 0) {
      const contentToSend = text || '\u200B'
      const deliveryId = randomUUID()
      const metadata = replyMetadata({ deliveryId, agentChain: newAgentChain, replyToId })
      if (threadId) {
        sentMessage = await withDeliveryRetry({
          label: 'reply',
          runtime,
          operation: () => client.sendToThread(threadId, contentToSend, { metadata }),
          recover: () => findDeliveredChannelMessage({ client, channelId, threadId, deliveryId }),
        })
      } else {
        sentMessage = await withDeliveryRetry({
          label: 'reply',
          runtime,
          operation: () => client.sendMessage(channelId, contentToSend, { replyToId, metadata }),
          recover: () => findDeliveredChannelMessage({ client, channelId, deliveryId }),
        })
      }
      runtime.log?.(
        `[reply] Message created (${sentMessage.id})${text ? '' : ' [media-only placeholder]'}${newAgentChain ? ` [chain depth: ${newAgentChain.depth}]` : ''}`,
      )
    }

    if (mediaUrls.length > 0) {
      const messageId = sentMessage?.id
      let fallbackReplyToId = sentMessage?.id ?? replyToId
      for (const mediaUrl of mediaUrls) {
        runtime.log?.(`[reply] Uploading media: ${mediaUrl}`)
        try {
          await withDeliveryRetry({
            label: 'reply-media',
            runtime,
            operation: () => client.uploadMediaFromUrl(mediaUrl, messageId),
          })
          runtime.log?.('[reply] Media uploaded successfully')
        } catch (err) {
          runtime.error?.(
            `[reply] Media upload failed for ${mediaUrl}; sending URL fallback: ${String(err)}`,
          )
          const deliveryId = randomUUID()
          const metadata = replyMetadata({
            deliveryId,
            agentChain: newAgentChain,
            replyToId: fallbackReplyToId,
          })
          const fallbackMessage = threadId
            ? await withDeliveryRetry({
                label: 'reply-media-fallback',
                runtime,
                operation: () => client.sendToThread(threadId, mediaUrl, { metadata }),
                recover: () =>
                  findDeliveredChannelMessage({ client, channelId, threadId, deliveryId }),
              })
            : await withDeliveryRetry({
                label: 'reply-media-fallback',
                runtime,
                operation: () =>
                  client.sendMessage(channelId, mediaUrl, {
                    replyToId: fallbackReplyToId,
                    metadata,
                  }),
                recover: () => findDeliveredChannelMessage({ client, channelId, deliveryId }),
              })
          fallbackReplyToId = fallbackMessage.id
        }
      }
    }

    runtime.log?.('[reply] Reply delivered successfully')
  } catch (err) {
    runtime.error?.(`[reply] Failed to send reply: ${String(err)}`)
    throw err
  }
}

export async function deliverShadowDmReply(params: {
  payload: ReplyPayload
  dmChannelId: string
  replyToId?: string
  client: ShadowClient
  runtime: ShadowRuntimeLogger
  agentChain?: AgentChainMetadata
  agentId: string | null
  botUserId: string
}): Promise<void> {
  const { payload, dmChannelId, replyToId, client, runtime, agentChain, agentId, botUserId } =
    params

  try {
    if (!payload.text && !(payload.mediaUrl || payload.mediaUrls?.length)) {
      runtime.error?.('[dm-reply] No text or media in DM reply payload')
      return
    }

    const text = payload.text ?? ''
    runtime.log?.(`[dm-reply] Sending DM reply to channel ${dmChannelId}: "${text.slice(0, 80)}"`)

    const mediaUrls = [payload.mediaUrl, ...(payload.mediaUrls ?? [])].filter(Boolean) as string[]
    const newAgentChain: AgentChainMetadata | undefined = agentId
      ? {
          agentId,
          depth: (agentChain?.depth ?? 0) + 1,
          participants: [...(agentChain?.participants ?? []), botUserId].filter(
            Boolean,
          ) as string[],
          startedAt: agentChain?.startedAt ?? Date.now(),
          rootMessageId: agentChain?.rootMessageId ?? replyToId,
        }
      : undefined

    let sentMessage: ShadowMessage | null = null
    if (text || mediaUrls.length > 0) {
      const contentToSend = text || '\u200B'
      const deliveryId = randomUUID()
      const metadata = replyMetadata({ deliveryId, agentChain: newAgentChain, replyToId })
      sentMessage = await withDeliveryRetry({
        label: 'dm-reply',
        runtime,
        operation: () => client.sendDmMessage(dmChannelId, contentToSend, { replyToId, metadata }),
        recover: () => findDeliveredDmMessage({ client, dmChannelId, deliveryId }),
      })
      runtime.log?.(
        `[dm-reply] DM message created (${sentMessage.id})${text ? '' : ' [media-only placeholder]'}${newAgentChain ? ` [chain depth: ${newAgentChain.depth}]` : ''}`,
      )
    }

    if (mediaUrls.length > 0) {
      const messageId = sentMessage?.id
      let fallbackReplyToId = sentMessage?.id ?? replyToId
      for (const mediaUrl of mediaUrls) {
        runtime.log?.(`[dm-reply] Uploading media: ${mediaUrl}`)
        try {
          await withDeliveryRetry({
            label: 'dm-reply-media',
            runtime,
            operation: () =>
              client.uploadMediaFromUrl(
                mediaUrl,
                messageId ? { dmMessageId: messageId } : undefined,
              ),
          })
          runtime.log?.('[dm-reply] Media uploaded successfully')
        } catch (err) {
          runtime.error?.(
            `[dm-reply] Media upload failed for ${mediaUrl}; sending URL fallback: ${String(err)}`,
          )
          const deliveryId = randomUUID()
          const metadata = replyMetadata({
            deliveryId,
            agentChain: newAgentChain,
            replyToId: fallbackReplyToId,
          })
          const fallbackMessage = await withDeliveryRetry({
            label: 'dm-reply-media-fallback',
            runtime,
            operation: () =>
              client.sendDmMessage(dmChannelId, mediaUrl, {
                replyToId: fallbackReplyToId,
                metadata,
              }),
            recover: () => findDeliveredDmMessage({ client, dmChannelId, deliveryId }),
          })
          fallbackReplyToId = fallbackMessage.id
        }
      }
    }

    runtime.log?.('[dm-reply] DM reply delivered successfully')
  } catch (err) {
    runtime.error?.(`[dm-reply] Failed to send DM reply: ${String(err)}`)
    throw err
  }
}
