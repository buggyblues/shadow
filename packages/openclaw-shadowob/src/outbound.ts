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

/** Max single-message content length (matches server LIMITS.MESSAGE_CONTENT_MAX) */
const CHUNK_SIZE = 4000

/**
 * Split text into chunks that fit within the server's message length limit.
 * Prefers breaking at paragraph boundaries (\n\n), then line breaks (\n),
 * then sentence-ending punctuation, with a hard fallback at exact byte offset.
 */
export function chunkText(text: string, maxLen: number = CHUNK_SIZE): string[] {
  if (text.length <= maxLen) return [text]

  const chunks: string[] = []
  let remaining = text

  while (remaining.length > maxLen) {
    let splitAt = maxLen

    // 1. Paragraph boundary (\n\n)
    const paraIdx = remaining.lastIndexOf('\n\n', maxLen)
    if (paraIdx > maxLen * 0.5) {
      splitAt = paraIdx + 2
    } else {
      // 2. Line break (\n)
      const lineIdx = remaining.lastIndexOf('\n', maxLen)
      if (lineIdx > maxLen * 0.6) {
        splitAt = lineIdx + 1
      } else {
        // 3. Sentence-ending punctuation
        const head = remaining.slice(0, maxLen)
        const sentenceRe = /[。！？.!?][\s\u200B]*$/
        const m = head.match(sentenceRe)
        if (m && m.index !== undefined && m.index > maxLen * 0.4) {
          splitAt = m.index + m[0].length
        }
      }
    }

    chunks.push(remaining.slice(0, splitAt).trimEnd())
    remaining = remaining.slice(splitAt).trimStart()
  }

  if (remaining.length > 0) {
    chunks.push(remaining)
  }

  return chunks
}

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
  chunker: chunkText,
  textChunkLimit: CHUNK_SIZE,

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

      const chunks = chunkText(params.text)
      let lastMessageId: string | undefined

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]!
        // First chunk uses the original replyToId; subsequent chunks reply to the previous one
        const replyTo = i === 0 ? params.replyToMessageId : lastMessageId
        let message: ShadowMessage
        if (threadId) {
          message = await client.sendToThread(threadId, chunk)
        } else if (channelId) {
          message = await client.sendMessage(channelId, chunk, {
            replyToId: replyTo,
          })
        } else {
          throw new Error('Could not resolve target channel or thread')
        }
        lastMessageId = message.id
      }

      return { messageId: lastMessageId! }
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

      // Create a message to attach media to (chunk text if it exceeds limit)
      const content = params.text || '\u200B'
      const contentChunks = chunkText(content)
      let message: ShadowMessage | undefined

      for (let i = 0; i < contentChunks.length; i++) {
        const chunk = contentChunks[i]!
        const replyTo = i === 0 ? params.replyToMessageId : message?.id
        if (threadId) {
          message = await client.sendToThread(threadId, chunk)
        } else if (channelId) {
          message = await client.sendMessage(channelId, chunk, {
            replyToId: replyTo,
          })
        } else {
          throw new Error('Could not resolve target channel or thread')
        }
      }

      // Upload each media URL, fallback to sending URL as text on failure
      for (const mediaUrl of mediaUrls) {
        try {
          await client.uploadMediaFromUrl(mediaUrl, message!.id)
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
