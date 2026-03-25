/**
 * Shadow outbound adapter — sends messages & media to Shadow channels.
 *
 * Conforms to the OpenClaw SDK outbound pattern:
 *   - outbound.attachedResults.sendText  — send text and return messageId
 *   - outbound.base.sendMedia            — send media files
 */

import type { ShadowMessage } from '@shadowob/sdk'
import { ShadowClient } from '@shadowob/sdk'
import type { OpenClawConfig } from 'openclaw/plugin-sdk/core'
import { DEFAULT_ACCOUNT_ID, getAccountConfig } from './config.js'
import type { ShadowAccountConfig } from './types.js'

/** Parse a Shadow target string like "shadowob:channel:<channelId>" */
export function parseTarget(to: string): { channelId?: string; threadId?: string } {
  const parts = to.split(':')
  const prefix = parts[0]
  if (
    (prefix === 'shadowob' || prefix === 'openclaw-shadowob' || prefix === 'shadow') &&
    parts[1] === 'channel' &&
    parts[2]
  ) {
    return { channelId: parts[2] }
  }
  if (
    (prefix === 'shadowob' || prefix === 'openclaw-shadowob' || prefix === 'shadow') &&
    parts[1] === 'thread' &&
    parts[2]
  ) {
    return { threadId: parts[2] }
  }
  // Fallback: treat as channel ID
  return { channelId: to }
}

function resolveClient(
  cfg: OpenClawConfig,
  accountId?: string,
): { client: ShadowClient; account: ShadowAccountConfig } | null {
  const account = getAccountConfig(cfg, accountId ?? DEFAULT_ACCOUNT_ID)
  if (!account) return null
  return { client: new ShadowClient(account.serverUrl, account.token), account }
}

/**
 * SDK-compliant outbound adapter.
 *
 * Uses the `attachedResults` pattern for sendText (returns messageId)
 * and `base` pattern for sendMedia.
 */
export const shadowOutbound = {
  deliveryMode: 'direct' as const,
  chunker: null,
  textChunkLimit: 4000,

  attachedResults: {
    sendText: async (params: {
      cfg: OpenClawConfig
      to: string
      text: string
      accountId?: string
      replyToMessageId?: string
      threadId?: string
    }): Promise<{ messageId: string }> => {
      const resolved = resolveClient(params.cfg, params.accountId)
      if (!resolved) throw new Error('Shadow account not configured')

      const { client } = resolved
      const { channelId, threadId: parsedThreadId } = parseTarget(params.to)
      const threadId = params.threadId ?? parsedThreadId

      let message: ShadowMessage
      if (threadId) {
        message = await client.sendToThread(threadId, params.text)
      } else if (channelId) {
        message = await client.sendMessage(channelId, params.text, {
          replyToId: params.replyToMessageId,
        })
      } else {
        throw new Error('Could not resolve target channel or thread')
      }

      return { messageId: message.id }
    },
  },

  base: {
    sendMedia: async (params: {
      cfg: OpenClawConfig
      to: string
      filePath?: string
      mediaUrl?: string
      mediaUrls?: string[]
      text?: string
      accountId?: string
      threadId?: string
      replyToMessageId?: string
    }): Promise<void> => {
      const resolved = resolveClient(params.cfg, params.accountId)
      if (!resolved) throw new Error('Shadow account not configured')

      const { client } = resolved
      const { channelId, threadId: parsedThreadId } = parseTarget(params.to)
      const threadId = params.threadId ?? parsedThreadId

      // Collect all media URLs
      const mediaUrls = [params.mediaUrl ?? params.filePath, ...(params.mediaUrls ?? [])].filter(
        Boolean,
      ) as string[]

      // Create a message to attach media to
      const content = params.text || '\u200B'
      let message: ShadowMessage
      if (threadId) {
        message = await client.sendToThread(threadId, content)
      } else if (channelId) {
        message = await client.sendMessage(channelId, content, {
          replyToId: params.replyToMessageId,
        })
      } else {
        throw new Error('Could not resolve target channel or thread')
      }

      // Upload each media URL, fallback to sending URL as text on failure
      for (const mediaUrl of mediaUrls) {
        try {
          await client.uploadMediaFromUrl(mediaUrl, message.id)
        } catch {
          // Fallback: send the URL as text
          if (threadId) {
            await client.sendToThread(threadId, mediaUrl)
          } else if (channelId) {
            await client.sendMessage(channelId, mediaUrl)
          }
        }
      }
    },
  },
}
