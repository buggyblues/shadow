import { extractSlashCommandActions } from '@shadowob/shared'
import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { HermesToolCallList } from './hermes-tool-calls'
import { splitHermesToolCalls } from './hermes-tool-parser'
import { MessageMarkdown } from './markdown'
import type { Message } from './types'
import {
  decodeWalletRechargeMarker,
  stripWalletRechargeMarker,
  WalletRechargeCard,
} from './wallet-recharge-card'

const BUDDY_INTRO_PROMPT_KEY = 'agentMgmt.buddyIntroPrompt'

interface UseMessageRenderingArgs {
  enableSlashCommandActions?: boolean
  isOwn: boolean
  isTaskCardMessage: boolean
  isTaskResultMessage?: boolean
  message: Message
  renderMentions: (children: ReactNode) => ReactNode
}

export function useMessageRendering({
  enableSlashCommandActions,
  isOwn,
  isTaskCardMessage,
  isTaskResultMessage = false,
  message,
  renderMentions,
}: UseMessageRenderingArgs) {
  const { t } = useTranslation()
  const walletRecharge = useMemo(
    () => decodeWalletRechargeMarker(message.content),
    [message.content],
  )
  const markdownContent = useMemo(() => {
    if (isTaskCardMessage || isTaskResultMessage) return ''
    const content = walletRecharge ? stripWalletRechargeMarker(message.content) : message.content
    return content === BUDDY_INTRO_PROMPT_KEY ? t(BUDDY_INTRO_PROMPT_KEY) : content
  }, [isTaskCardMessage, isTaskResultMessage, message.content, t, walletRecharge])
  const { content: visibleMarkdownContent, toolCalls: hermesToolCalls } = useMemo(
    () => splitHermesToolCalls(markdownContent),
    [markdownContent],
  )
  const slashCommandActions = useMemo(
    () =>
      enableSlashCommandActions && !isOwn ? extractSlashCommandActions(visibleMarkdownContent) : [],
    [enableSlashCommandActions, isOwn, visibleMarkdownContent],
  )
  const markdownNode = useMemo(() => {
    if (!visibleMarkdownContent || visibleMarkdownContent === '\u200B') return null
    return <MessageMarkdown content={visibleMarkdownContent} renderMentions={renderMentions} />
  }, [renderMentions, visibleMarkdownContent])

  return {
    hermesToolCalls,
    markdownNode,
    slashCommandActions,
    walletRecharge,
  }
}

export { HermesToolCallList, WalletRechargeCard }
