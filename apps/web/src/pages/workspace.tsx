import { Spinner } from '@shadowob/ui'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useLayoutEffect } from 'react'
import { WorkspacePage } from '../components/workspace/workspace-page'
import { fetchApi } from '../lib/api'
import { leaveChannel } from '../lib/socket'
import { useChatStore } from '../stores/chat.store'

export function WorkspacePageRoute() {
  const { serverSlug } = useParams({ strict: false }) as { serverSlug: string }
  const navigate = useNavigate()

  // Clear channel state when entering workspace
  useLayoutEffect(() => {
    const prev = useChatStore.getState().activeChannelId
    if (prev) {
      leaveChannel(prev)
      useChatStore.getState().setActiveChannel(null)
    }
  }, [])

  const { data: server } = useQuery({
    queryKey: ['server', serverSlug],
    queryFn: () => fetchApi<{ id: string }>(`/api/servers/${serverSlug}`),
    enabled: !!serverSlug,
  })

  const isServerLoading = !server

  return isServerLoading ? (
    <div className="flex-1 flex items-center justify-center text-text-muted bg-bg-primary">
      <div className="inline-flex items-center gap-2 text-sm">
        <Spinner size="sm" />
        <span>正在加载工作区...</span>
      </div>
    </div>
  ) : (
    <WorkspacePage
      serverId={serverSlug}
      onClose={() => navigate({ to: '/servers/$serverSlug', params: { serverSlug } })}
    />
  )
}
