import { fetchApi } from '../../lib/api'

export const CHAT_MESSAGES_PAGE_SIZE = 50
export const CHAT_MESSAGES_STALE_MS = 30_000

export type ChatMessagesPage<TMessage = unknown> = {
  messages: TMessage[]
  hasMore: boolean
}

export function chatMessagesQueryKey(channelId: string | null | undefined) {
  return ['messages', channelId] as const
}

export async function fetchChatMessagesPage<TMessage>(channelId: string, pageParam: string | null) {
  const params = new URLSearchParams({ limit: String(CHAT_MESSAGES_PAGE_SIZE) })
  if (pageParam) params.set('cursor', pageParam)
  return fetchApi<ChatMessagesPage<TMessage>>(`/api/channels/${channelId}/messages?${params}`)
}

export async function fetchChatMessagesAround<TMessage>(channelId: string, messageId: string) {
  const params = new URLSearchParams({ limit: String(CHAT_MESSAGES_PAGE_SIZE) })
  return fetchApi<ChatMessagesPage<TMessage>>(
    `/api/channels/${channelId}/messages/around/${messageId}?${params}`,
  )
}

export function getChatMessagesNextPageParam<TMessage extends { createdAt?: string }>(
  lastPage: ChatMessagesPage<TMessage>,
) {
  if (!lastPage.hasMore || lastPage.messages.length === 0) return undefined
  // Cursor = createdAt of the oldest message in this page (first item, since sorted oldest-to-newest).
  return lastPage.messages[0]?.createdAt
}
