import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useLayoutEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { RouteQueryState } from '../components/common/route-query-state'
import { WorkspacePage } from '../components/workspace/workspace-page'
import { fetchApi } from '../lib/api'
import { leaveChannel } from '../lib/socket'
import { useChatStore } from '../stores/chat.store'

export function WorkspacePageRoute() {
  const { t } = useTranslation()
  const { serverSlug } = useParams({ strict: false }) as { serverSlug: string }
  const search = useSearch({ strict: false }) as {
    workspaceNodeId?: unknown
    workspacePath?: unknown
    workspaceUri?: unknown
  }
  const navigate = useNavigate()

  // Clear channel state when entering workspace
  useLayoutEffect(() => {
    const prev = useChatStore.getState().activeChannelId
    if (prev) {
      leaveChannel(prev)
      useChatStore.getState().setActiveChannel(null)
    }
  }, [])

  const {
    data: server,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['server', serverSlug],
    queryFn: () => fetchApi<{ id: string }>(`/api/servers/${serverSlug}`),
    enabled: !!serverSlug,
  })

  if (isLoading) {
    return <RouteQueryState variant="loading" title={t('workspace.loadingTitle')} />
  }

  if (isError) {
    return (
      <RouteQueryState
        variant="error"
        title={t('workspace.loadFailedTitle')}
        description={t('workspace.loadFailedDesc')}
        onRetry={() => void refetch()}
      />
    )
  }

  if (!server) {
    return (
      <RouteQueryState
        variant="not-found"
        title={t('workspace.notFoundTitle')}
        description={t('workspace.notFoundDesc')}
      />
    )
  }

  return (
    <WorkspacePage
      serverId={serverSlug}
      initialNodeId={typeof search.workspaceNodeId === 'string' ? search.workspaceNodeId : null}
      initialPath={typeof search.workspacePath === 'string' ? search.workspacePath : null}
      initialUri={typeof search.workspaceUri === 'string' ? search.workspaceUri : null}
      onClose={() => navigate({ to: '/servers/$serverSlug', params: { serverSlug } })}
    />
  )
}
