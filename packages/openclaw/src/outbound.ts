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

      // For now, embed media URLs in the message text
      const mediaText = [ctx.mediaUrl, ...(ctx.mediaUrls ?? [])]
        .filter(Boolean)
        .join('\n')
      const text = [ctx.text, mediaText].filter(Boolean).join('\n\n')

      if (!text) {
        return { ok: false, error: 'No content to send' }
      }

      const client = new ShadowClient(account.serverUrl, account.token)
      const { channelId, threadId: parsedThreadId } = parseTarget(ctx.to)
      const threadId = ctx.threadId ?? parsedThreadId

      let message
      if (threadId) {
        message = await client.sendToThread(threadId, text)
      } else if (channelId) {
        message = await client.sendMessage(channelId, text, {
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
}
