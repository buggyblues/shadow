import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '../lib/api'
import { useDeferredQueryEnabled } from './use-deferred-query-enabled'

export function useUnreadCount() {
  const enabled = useDeferredQueryEnabled({ delayMs: 4000 })

  const { data } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: () => fetchApi<{ count: number }>('/api/notifications/unread-count'),
    enabled,
    refetchInterval: 30_000,
  })

  return data?.count ?? 0
}
