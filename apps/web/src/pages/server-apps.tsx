import { GlassPanel, Spinner } from '@shadowob/ui'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { AppWindow } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../lib/api'
import { leaveChannel } from '../lib/socket'
import { useChatStore } from '../stores/chat.store'

interface ServerAppIntegration {
  id: string
  serverId: string
  appKey: string
  name: string
  description?: string | null
  iconUrl: string | null
  iframeEntry?: string | null
}

interface LaunchContext {
  iframeEntry: string | null
  launchToken: string
  eventStreamPath: string
  expiresIn: number
}

function withLaunchParams(entry: string, launch: LaunchContext | undefined) {
  if (!launch?.launchToken) return entry
  const url = new URL(entry, window.location.origin)
  url.searchParams.set('shadow_launch', launch.launchToken)
  if (launch.eventStreamPath) {
    url.searchParams.set(
      'shadow_event_stream',
      new URL(launch.eventStreamPath, window.location.origin).toString(),
    )
  }
  return url.toString()
}

export function ServerAppsPageRoute() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { serverSlug, appKey } = useParams({ strict: false }) as {
    serverSlug: string
    appKey?: string
  }

  useLayoutEffect(() => {
    const prev = useChatStore.getState().activeChannelId
    if (prev) {
      leaveChannel(prev)
      useChatStore.getState().setActiveChannel(null)
    }
  }, [])

  const { data: apps = [], isLoading } = useQuery({
    queryKey: ['server-apps', serverSlug],
    queryFn: () => fetchApi<ServerAppIntegration[]>(`/api/servers/${serverSlug}/apps`),
    enabled: !!serverSlug,
  })

  const activeApp = useMemo(() => apps.find((app) => app.appKey === appKey) ?? null, [appKey, apps])

  useEffect(() => {
    if (!serverSlug || appKey || isLoading || !apps[0]?.appKey) return
    navigate({
      to: '/servers/$serverSlug/apps/$appKey',
      params: { serverSlug, appKey: apps[0].appKey },
      replace: true,
    })
  }, [appKey, apps, isLoading, navigate, serverSlug])

  const { data: launch, isLoading: isLaunchLoading } = useQuery({
    queryKey: ['server-app-launch', serverSlug, activeApp?.appKey],
    queryFn: () =>
      fetchApi<LaunchContext>(`/api/servers/${serverSlug}/apps/${activeApp!.appKey}/launch`, {
        method: 'POST',
      }),
    enabled: !!serverSlug && !!activeApp?.appKey && !!activeApp.iframeEntry,
  })

  const iframeSrc =
    activeApp?.iframeEntry && launch ? withLaunchParams(activeApp.iframeEntry, launch) : null

  if (isLoading || (!appKey && apps.length > 0)) {
    return (
      <GlassPanel className="flex flex-1 items-center justify-center text-text-muted">
        <Spinner size="sm" />
      </GlassPanel>
    )
  }

  if (!activeApp) {
    return (
      <GlassPanel className="flex flex-1 items-center justify-center px-6 text-center text-sm text-text-muted">
        <div className="flex flex-col items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-bg-tertiary/60">
            <AppWindow size={20} />
          </div>
          <span>
            {apps.length === 0 ? t('serverApps.noInstalled') : t('serverApps.selectFromSidebar')}
          </span>
        </div>
      </GlassPanel>
    )
  }

  return (
    <GlassPanel className="flex flex-1 min-w-0 overflow-hidden">
      {isLaunchLoading && activeApp.iframeEntry ? (
        <div className="grid flex-1 place-items-center text-text-muted">
          <Spinner size="sm" />
        </div>
      ) : iframeSrc ? (
        <iframe
          title={activeApp.name}
          src={iframeSrc}
          className="h-full w-full border-0"
          sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
        />
      ) : (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-text-muted">
          {t('serverApps.noIframe')}
        </div>
      )}
    </GlassPanel>
  )
}
