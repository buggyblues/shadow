/**
 * Shadow outbound adapter — sends messages & media to Shadow channels.
 *
 * Uses the Shadow REST API via ShadowClient to deliver outbound messages.
 */

import { getAccountConfig, DEFAULT_ACCOUNT_ID } from './config.js'
import { ShadowClient } from './shadow-client.js'
import type {
  ChannelOutboundAdapter,
  ChannelOutboundContext,
  OutboundDeliveryResult,
} from './types.js'

/** Parse a Shadow target string like "shadow:channel:<channelId>" */
function parseTarget(to: string): { channelId?: string; threadId?: string } {
  // "shadow:channel:<id>" or "shadow:thread:<id>"
  const parts = to.split(':')
  if (parts[0] === 'shadow' && parts[1] === 'channel' && parts[2]) {
    return { channelId: parts[2] }
  }
  if (parts[0] === 'shadow' && parts[1] === 'thread' && parts[2]) {
    return { threadId: parts[2] }
  }
  // Fallback: treat as channel ID
  return { channelId: to }
}

export const shadowOutbound: ChannelOutboundAdapter = {
  deliveryMode: 'direct',
  chunker: null,
  textChunkLimit: 4000,

  sendText: async (ctx: ChannelOutboundContext): Promise<OutboundDeliveryResult> => {
    try {
      const account = getAccountConfig(ctx.cfg, ctx.accountId ?? DEFAULT_ACCOUNT_ID)
      if (!account) {
        return { ok: false, error: 'Shadow account not configured' }
      }

      const client = new ShadowClient(account.serverUrl, account.token)
      const { channelId, threadId: parsedThreadId } = parseTarget(ctx.to)
      const threadId = ctx.threadId ?? parsedThreadId

      if (!ctx.text) {
        return { ok: false, error: 'No text to send' }
      }

      let message
      if (threadId) {
        message = await client.sendToThread(threadId, ctx.text)
      } else if (channelId) {
        message = await client.sendMessage(channelId, ctx.text, {
          replyToId: ctx.replyToMessageId,
        })
      } else {
        return { ok: false, error: 'Could not resolve target channel or thread' }
      }

      return { ok: true, messageId: message.id }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  },

  sendMedia: async (ctx: ChannelOutboundContext): Promise<OutboundDeliveryResult> => {
    try {
      const account = getAccountConfig(ctx.cfg, ctx.accountId ?? DEFAULT_ACCOUNT_ID)
      if (!account) {
        return { ok: false, error: 'Shadow account not configured' }
      }

      const client = new ShadowClient(account.serverUrl, account.token)
      const { channelId, threadId: parsedThreadId } = parseTarget(ctx.to)
      const threadId = ctx.threadId ?? parsedThreadId

      // Send text message first (if any)
      let message
      const text = ctx.text ?? ''
      if (text) {
        if (threadId) {
          message = await client.sendToThread(threadId, text)
        } else if (channelId) {
          message = await client.sendMessage(channelId, text, {
            replyToId: ctx.replyToMessageId,
          })
        } else {
          return { ok: false, error: 'Could not resolve target channel or thread' }
        }
      }

      // Upload media files and attach to the message
      const mediaUrls = [ctx.mediaUrl, ...(ctx.mediaUrls ?? [])].filter(Boolean) as string[]
      for (const mediaUrl of mediaUrls) {
        try {
          await client.uploadMediaFromUrl(mediaUrl, message?.id)
        } catch {
          // Fallback: if upload fails, send the URL as text
          const fallbackText = mediaUrl
          if (threadId) {
            await client.sendToThread(threadId, fallbackText)
          } else if (channelId) {
            await client.sendMessage(channelId, fallbackText)
          }
        }
      }

      // If no text was sent but we had media, we still need to send something
      if (!text && mediaUrls.length === 0) {
        return { ok: false, error: 'No content to send' }
      }

      return { ok: true, messageId: message?.id }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  },
}
