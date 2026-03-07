import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '../lib/api'

export function useUnreadCount() {
  const { data } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: () => fetchApi<{ count: number }>('/api/notifications/unread-count'),
    refetchInterval: 30_000,
  })

  return data?.count ?? 0
}
