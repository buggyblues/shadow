import { type InfiniteData, type QueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { fetchApi } from '../../../lib/api'
import type { Message, MessagesPage } from './types'

export function useRetryFailedMessage(queryClient: QueryClient) {
  return useCallback(
    (failedMessage: Message) => {
      if (failedMessage.threadId) {
        const threadId = failedMessage.threadId
        queryClient.setQueryData<Message[]>(['thread-messages', threadId], (old) =>
          (old ?? []).filter((message) => message.id !== failedMessage.id),
        )
        const tempId = `temp-${Date.now()}`
        const retryMessage = { ...failedMessage, id: tempId, sendStatus: 'sending' as const }
        queryClient.setQueryData<Message[]>(['thread-messages', threadId], (old) => [
          ...(old ?? []),
          retryMessage,
        ])
        fetchApi<Message>(`/api/threads/${threadId}/messages`, {
          method: 'POST',
          body: JSON.stringify({
            content: failedMessage.content,
            replyToId: failedMessage.replyToId,
          }),
        })
          .then((created) => {
            queryClient.setQueryData<Message[]>(['thread-messages', threadId], (old) =>
              (old ?? []).map((message) => (message.id === tempId ? created : message)),
            )
          })
          .catch(() => {
            queryClient.setQueryData<Message[]>(['thread-messages', threadId], (old) =>
              (old ?? []).map((message) =>
                message.id === tempId ? { ...message, sendStatus: 'failed' as const } : message,
              ),
            )
          })
        return
      }

      const channelId = failedMessage.channelId
      if (!channelId) return
      queryClient.setQueryData<InfiniteData<MessagesPage>>(['messages', channelId], (old) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages.filter((message) => message.id !== failedMessage.id),
          })),
        }
      })
      const tempId = `temp-${Date.now()}`
      const retryMessage = { ...failedMessage, id: tempId, sendStatus: 'sending' as const }
      queryClient.setQueryData<InfiniteData<MessagesPage>>(['messages', channelId], (old) => {
        if (!old || old.pages.length === 0) return old
        const pages = [...old.pages]
        const firstPage = pages[0]!
        pages[0] = { ...firstPage, messages: [...firstPage.messages, retryMessage] }
        return { ...old, pages }
      })
      fetchApi(`/api/channels/${channelId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          content: failedMessage.content,
          replyToId: failedMessage.replyToId,
        }),
      }).catch(() => {
        queryClient.setQueryData<InfiniteData<MessagesPage>>(['messages', channelId], (old) => {
          if (!old) return old
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map((message) =>
                message.id === tempId ? { ...message, sendStatus: 'failed' as const } : message,
              ),
            })),
          }
        })
      })
    },
    [queryClient],
  )
}
