import type { SlashCommandAction } from '@shadowob/shared'
import { type InfiniteData, type QueryClient } from '@tanstack/react-query'
import { CornerDownRight } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../../lib/api'
import { playSendSound } from '../../../lib/sounds'
import { showToast } from '../../../lib/toast'
import type { Message, MessagesPage } from './types'

function appendCreatedChannelMessage(
  queryClient: QueryClient,
  channelId: string,
  created: Message,
) {
  queryClient.setQueryData<InfiniteData<MessagesPage>>(['messages', channelId], (old) => {
    if (!old || old.pages.length === 0) return old
    if (old.pages.some((page) => page.messages.some((item) => item.id === created.id))) return old
    const pages = [...old.pages]
    const firstPage = pages[0]!
    pages[0] = { ...firstPage, messages: [...firstPage.messages, created] }
    return { ...old, pages }
  })
}

function appendCreatedThreadMessage(queryClient: QueryClient, threadId: string, created: Message) {
  queryClient.setQueryData<Message[]>(['thread-messages', threadId], (old) => {
    const messages = old ?? []
    if (messages.some((item) => item.id === created.id)) return messages
    return [...messages, created]
  })
}

export function useSlashCommandSender({
  channelId,
  queryClient,
  threadId,
}: {
  channelId?: string
  queryClient: QueryClient
  threadId?: string | null
}) {
  const { t } = useTranslation()
  const [sendingSlashCommand, setSendingSlashCommand] = useState<string | null>(null)

  const sendSlashCommand = useCallback(
    async (command: string) => {
      if (sendingSlashCommand) return
      if (!channelId && !threadId) {
        showToast(t('chat.sendSlashCommandFailed'), 'error')
        return
      }

      setSendingSlashCommand(command)
      try {
        const created = await fetchApi<Message>(
          threadId ? `/api/threads/${threadId}/messages` : `/api/channels/${channelId}/messages`,
          {
            method: 'POST',
            body: JSON.stringify({ content: command }),
          },
        )
        if (threadId) {
          appendCreatedThreadMessage(queryClient, threadId, created)
          queryClient.invalidateQueries({ queryKey: ['thread-messages', threadId] })
        } else if (channelId) {
          appendCreatedChannelMessage(queryClient, channelId, created)
          queryClient.invalidateQueries({ queryKey: ['messages', channelId] })
        }
        playSendSound()
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : t('chat.sendSlashCommandFailed'),
          'error',
        )
      } finally {
        setSendingSlashCommand(null)
      }
    },
    [channelId, queryClient, sendingSlashCommand, t, threadId],
  )

  return { sendingSlashCommand, sendSlashCommand }
}

export function SlashCommandActions({
  actions,
  sendingCommand,
  onSend,
}: {
  actions: SlashCommandAction[]
  sendingCommand: string | null
  onSend: (command: string) => void
}) {
  const { t } = useTranslation()

  if (actions.length === 0) return null
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          disabled={sendingCommand !== null}
          className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 font-mono text-[13px] font-semibold text-primary transition hover:border-primary/60 hover:bg-primary/18 disabled:cursor-wait disabled:opacity-60"
          aria-label={t('chat.sendSlashCommand', { command: action.command })}
          onClick={() => onSend(action.command)}
        >
          <CornerDownRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{action.command}</span>
        </button>
      ))}
    </div>
  )
}
