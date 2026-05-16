import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { fetchApi } from '../lib/api'

export function useUnreadCount() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    const id = setTimeout(() => setEnabled(true), 1200)
    return () => clearTimeout(id)
  }, [])

  const { data } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: () => fetchApi<{ count: number }>('/api/notifications/unread-count'),
    enabled,
    refetchInterval: 30_000,
  })

  return data?.count ?? 0
}
