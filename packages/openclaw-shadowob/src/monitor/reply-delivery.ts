import { randomUUID } from 'node:crypto'
import type { ShadowClient, ShadowMessage } from '@shadowob/sdk'
import { resolveOutboundMentions } from '../mentions.js'
import type { BuddyCollaborationMetadata, ReplyPayload, ShadowRuntimeLogger } from '../types.js'

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
  collaboration?: BuddyCollaborationMetadata
  replyToId?: string
}): Record<string, unknown> {
  return {
    ...(params.collaboration ? { collaboration: params.collaboration } : {}),
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
  deliveryId: string
}): Promise<ShadowMessage | null> {
  const messages = (await params.client.getMessages(params.channelId, 20)).messages
  return messages.find((message) => messageDeliveryId(message) === params.deliveryId) ?? null
}

async function findDeliveredThreadMessage(params: {
  client: ShadowClient
  threadId: string
  deliveryId: string
}): Promise<ShadowMessage | null> {
  const messages = await params.client.getThreadMessages(params.threadId, 20)
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
  target?: 'main' | 'thread'
  client: ShadowClient
  runtime: ShadowRuntimeLogger
  collaboration?: BuddyCollaborationMetadata
  agentId: string | null
  buddyUserId: string
}): Promise<void> {
  const { payload, channelId, replyToId, client, runtime, collaboration } = params
  const deliveryTarget = params.target ?? 'main'
  const targetThreadId = deliveryTarget === 'thread' ? params.threadId : undefined

  try {
    if (!payload.text && !(payload.mediaUrl || payload.mediaUrls?.length)) {
      runtime.error?.('[reply] No text or media in reply payload')
      return
    }

    const text = payload.text ?? ''
    runtime.log?.(`[reply] Sending reply to channel ${channelId}: "${text.slice(0, 80)}"`)

    const mediaUrls = [payload.mediaUrl, ...(payload.mediaUrls ?? [])].filter(Boolean) as string[]
    let sentMessage: ShadowMessage | null = null
    if (text || mediaUrls.length > 0) {
      const contentToSend = text || '\u200B'
      const deliveryId = randomUUID()
      const metadata = replyMetadata({
        deliveryId,
        collaboration,
        replyToId,
      })
      const mentions = await resolveOutboundMentions({
        client,
        channelId,
        content: contentToSend,
        runtime,
      })
      sentMessage = await withDeliveryRetry({
        label: 'reply',
        runtime,
        operation: () =>
          targetThreadId
            ? client.sendToThread(targetThreadId, contentToSend, {
                replyToId,
                metadata,
                ...(mentions ? { mentions } : {}),
              })
            : client.sendMessage(channelId, contentToSend, {
                replyToId,
                metadata,
                ...(mentions ? { mentions } : {}),
              }),
        recover: () =>
          targetThreadId
            ? findDeliveredThreadMessage({ client, threadId: targetThreadId, deliveryId })
            : findDeliveredChannelMessage({ client, channelId, deliveryId }),
      })
      runtime.log?.(
        `[reply] Message created (${sentMessage.id})${text ? '' : ' [media-only placeholder]'}`,
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
            operation: () => client.uploadMediaFromUrl(mediaUrl, { messageId }),
          })
          runtime.log?.('[reply] Media uploaded successfully')
        } catch (err) {
          runtime.error?.(
            `[reply] Media upload failed for ${mediaUrl}; sending URL fallback: ${String(err)}`,
          )
          const deliveryId = randomUUID()
          const metadata = replyMetadata({
            deliveryId,
            collaboration,
            replyToId: fallbackReplyToId,
          })
          const mentions = await resolveOutboundMentions({
            client,
            channelId,
            content: mediaUrl,
            runtime,
          })
          const fallbackMessage = await withDeliveryRetry({
            label: 'reply-media-fallback',
            runtime,
            operation: () =>
              targetThreadId
                ? client.sendToThread(targetThreadId, mediaUrl, {
                    replyToId: fallbackReplyToId,
                    metadata,
                    ...(mentions ? { mentions } : {}),
                  })
                : client.sendMessage(channelId, mediaUrl, {
                    replyToId: fallbackReplyToId,
                    metadata,
                    ...(mentions ? { mentions } : {}),
                  }),
            recover: () =>
              targetThreadId
                ? findDeliveredThreadMessage({ client, threadId: targetThreadId, deliveryId })
                : findDeliveredChannelMessage({ client, channelId, deliveryId }),
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
