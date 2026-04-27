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
const CHUNK_SIZE = 16000

type ShadowOutboundDeliveryResult = {
  channel: string
  messageId: string
  channelId?: string
  conversationId?: string
  meta?: Record<string, unknown>
}

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
    return {
      channelId: parts[2],
      ...(parts[3] === 'thread' && parts[4] ? { threadId: parts[4] } : {}),
    }
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

async function sendTextChunks(params: {
  client: ShadowClient
  to: string
  text: string
  threadId?: string | number | null
  replyToMessageId?: string | null
}): Promise<{ message: ShadowMessage; channelId?: string; threadId?: string }> {
  const { channelId, threadId: parsedThreadId } = parseTarget(params.to)
  const threadId =
    params.threadId !== undefined && params.threadId !== null
      ? String(params.threadId)
      : parsedThreadId

  const chunks = chunkText(params.text)
  let lastMessage: ShadowMessage | undefined

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!
    const replyTo = i === 0 ? (params.replyToMessageId ?? undefined) : lastMessage?.id
    if (threadId && channelId) {
      lastMessage = await params.client.sendMessage(channelId, chunk, {
        threadId,
        replyToId: replyTo,
      })
    } else if (threadId) {
      lastMessage = await params.client.sendToThread(threadId, chunk)
    } else if (channelId) {
      lastMessage = await params.client.sendMessage(channelId, chunk, {
        replyToId: replyTo,
      })
    } else {
      throw new Error('Could not resolve target channel or thread')
    }
  }

  if (!lastMessage) {
    throw new Error('No message was sent')
  }
  return { message: lastMessage, channelId, threadId }
}

function toDeliveryResult(params: {
  message: ShadowMessage
  channelId?: string
  threadId?: string
}): ShadowOutboundDeliveryResult {
  return {
    channel: 'shadowob',
    messageId: params.message.id,
    channelId: params.channelId ?? params.message.channelId,
    conversationId: params.threadId ?? params.channelId ?? params.message.channelId,
    ...(params.threadId ? { meta: { threadId: params.threadId } } : {}),
  }
}

async function sendMediaToShadow(params: {
  client: ShadowClient
  to: string
  filePath?: string
  mediaUrl?: string
  mediaUrls?: string[]
  text?: string
  threadId?: string | number | null
  replyToMessageId?: string | null
}): Promise<ShadowOutboundDeliveryResult> {
  const mediaUrls = [params.mediaUrl ?? params.filePath, ...(params.mediaUrls ?? [])].filter(
    Boolean,
  ) as string[]
  if (mediaUrls.length === 0) {
    throw new Error('No media URL or file path provided')
  }

  const sent = await sendTextChunks({
    client: params.client,
    to: params.to,
    text: params.text || '\u200B',
    threadId: params.threadId,
    replyToMessageId: params.replyToMessageId,
  })

  let result = toDeliveryResult(sent)
  const uploadErrors: string[] = []

  for (const mediaUrl of mediaUrls) {
    try {
      await params.client.uploadMediaFromUrl(mediaUrl, sent.message.id)
    } catch (err) {
      const fallback = await sendTextChunks({
        client: params.client,
        to: params.to,
        text: mediaUrl,
        threadId: params.threadId,
        replyToMessageId: result.messageId,
      })
      uploadErrors.push(err instanceof Error ? err.message : String(err))
      const fallbackResult = toDeliveryResult(fallback)
      result = {
        ...fallbackResult,
        meta: {
          ...(fallbackResult.meta ?? {}),
          mediaUploadFallback: true,
          mediaUploadErrors: uploadErrors,
        },
      }
    }
  }

  return result
}

/**
 * SDK-compliant outbound adapter.
 *
 * OpenClaw calls the top-level `sendText`/`sendMedia` functions for channel
 * delivery. The legacy `attachedResults` and `base` shapes remain for older
 * runtime builds and tests.
 */
export const shadowOutbound = {
  deliveryMode: 'direct' as const,
  chunker: chunkText,
  textChunkLimit: CHUNK_SIZE,

  sendText: async (params: {
    cfg: OpenClawConfig
    to: string
    text: string
    accountId?: string | null
    replyToId?: string | null
    threadId?: string | number | null
  }): Promise<ShadowOutboundDeliveryResult> => {
    const resolved = resolveClient(params.cfg, params.accountId ?? undefined)
    if (!resolved) throw new Error('Shadow account not configured')

    const sent = await sendTextChunks({
      client: resolved.client,
      to: params.to,
      text: params.text,
      threadId: params.threadId,
      replyToMessageId: params.replyToId,
    })
    return toDeliveryResult(sent)
  },

  sendMedia: async (params: {
    cfg: OpenClawConfig
    to: string
    filePath?: string
    mediaUrl?: string
    mediaUrls?: string[]
    text?: string
    accountId?: string | null
    threadId?: string | number | null
    replyToId?: string | null
  }): Promise<ShadowOutboundDeliveryResult> => {
    const resolved = resolveClient(params.cfg, params.accountId ?? undefined)
    if (!resolved) throw new Error('Shadow account not configured')

    return sendMediaToShadow({
      client: resolved.client,
      to: params.to,
      filePath: params.filePath,
      mediaUrl: params.mediaUrl,
      mediaUrls: params.mediaUrls,
      text: params.text,
      threadId: params.threadId,
      replyToMessageId: params.replyToId,
    })
  },

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

      const sent = await sendTextChunks({
        client: resolved.client,
        to: params.to,
        text: params.text,
        threadId: params.threadId,
        replyToMessageId: params.replyToMessageId,
      })
      return { messageId: sent.message.id }
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

      await sendMediaToShadow({
        client: resolved.client,
        to: params.to,
        filePath: params.filePath,
        mediaUrl: params.mediaUrl,
        mediaUrls: params.mediaUrls,
        text: params.text,
        threadId: params.threadId,
        replyToMessageId: params.replyToMessageId,
      })
    },
  },
}
