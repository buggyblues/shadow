import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { KanbanOAuthSession } from '../api.js'
import { listBuddyInboxes } from '../api.js'
import { buildBuddyDirectory } from '../identity.js'
import { inboxQueryKey } from '../query-keys.js'

export function useBuddyDirectory(
  currentUser?: KanbanOAuthSession['profile'] | null,
  enabled = true,
) {
  const inboxes = useQuery({
    queryKey: inboxQueryKey,
    queryFn: () => listBuddyInboxes(),
    enabled,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  })
  return useMemo(
    () => buildBuddyDirectory(inboxes.data?.inboxes, [currentUser]),
    [currentUser, inboxes.data?.inboxes],
  )
}
