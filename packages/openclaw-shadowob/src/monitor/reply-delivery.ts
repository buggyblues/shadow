import type { ShadowClient, ShadowMessage } from '@shadowob/sdk'
import type { AgentChainMetadata, ReplyPayload, ShadowRuntimeLogger } from '../types.js'

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
      if (threadId) {
        sentMessage = await client.sendToThread(threadId, contentToSend, {
          metadata: newAgentChain ? { agentChain: newAgentChain } : undefined,
        })
      } else {
        sentMessage = await client.sendMessage(channelId, contentToSend, {
          replyToId,
          metadata: newAgentChain ? { agentChain: newAgentChain } : undefined,
        })
      }
      runtime.log?.(
        `[reply] Message created (${sentMessage.id})${text ? '' : ' [media-only placeholder]'}${newAgentChain ? ` [chain depth: ${newAgentChain.depth}]` : ''}`,
      )
    }

    if (mediaUrls.length > 0) {
      const messageId = sentMessage?.id
      for (const mediaUrl of mediaUrls) {
        runtime.log?.(`[reply] Uploading media: ${mediaUrl}`)
        await client.uploadMediaFromUrl(mediaUrl, messageId)
        runtime.log?.('[reply] Media uploaded successfully')
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
      sentMessage = await client.sendDmMessage(dmChannelId, contentToSend, {
        replyToId,
        metadata: newAgentChain ? { agentChain: newAgentChain } : undefined,
      })
      runtime.log?.(
        `[dm-reply] DM message created (${sentMessage.id})${text ? '' : ' [media-only placeholder]'}${newAgentChain ? ` [chain depth: ${newAgentChain.depth}]` : ''}`,
      )
    }

    if (mediaUrls.length > 0) {
      const messageId = sentMessage?.id
      for (const mediaUrl of mediaUrls) {
        runtime.log?.(`[dm-reply] Uploading media: ${mediaUrl}`)
        await client.uploadMediaFromUrl(mediaUrl, messageId)
        runtime.log?.('[dm-reply] Media uploaded successfully')
      }
    }

    runtime.log?.('[dm-reply] DM reply delivered successfully')
  } catch (err) {
    runtime.error?.(`[dm-reply] Failed to send DM reply: ${String(err)}`)
    throw err
  }
}
