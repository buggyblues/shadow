import { SHADOW_SERVER_APP_COMMAND_COMPLETED_EVENT } from '@shadowob/sdk/server-app'
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  useNavigate,
} from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  authorizeShadowOAuth,
  currentLaunchEventStreamUrl,
  currentServerAppPath,
  getBoard,
  getOAuthSession,
  type KanbanOAuthSession,
  onLaunchContextChange,
  onServerAppRouteNavigate,
  reportServerAppRoute,
  shareCurrentBoard,
} from './api.js'
import {
  AuthGate,
  canAuthorizeKanbanOAuth,
  hasKanbanBoardAccess,
  shouldAutoAuthorizeKanbanOAuth,
} from './components/auth-gate.js'
import { BoardView } from './components/board-view.js'
import { CardDetail } from './components/card-detail.js'
import { CoordinatorRequestBar } from './components/coordinator-request-bar.js'
import { t } from './i18n.js'
import { boardQueryKey, inboxQueryKey, oauthQueryKey } from './query-keys.js'
import './styles.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
})

function IndexRoutePage() {
  return <KanbanApp />
}

function CardRoutePage() {
  const { cardId } = cardRoute.useParams()
  return <KanbanApp selectedCardId={cardId} />
}

const rootRoute = createRootRoute()

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IndexRoutePage,
})

const cardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/cards/$cardId',
  component: CardRoutePage,
})

const routeTree = rootRoute.addChildren([indexRoute, cardRoute])

const router = createRouter({
  routeTree,
  history: createHashHistory(),
})

function isOAuthAccessDenied(error: unknown) {
  return error instanceof Error && error.message === 'access_denied'
}

function oauthAutoStartKey(session: KanbanOAuthSession) {
  if (!shouldAutoAuthorizeKanbanOAuth(session)) return null
  return `${session.launch?.serverId ?? 'unknown'}:${session.subject ?? 'unknown'}:${session.reason}`
}

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

function KanbanApp(props: { selectedCardId?: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const oauthPopupPollRef = useRef<number | null>(null)
  const autoOAuthStartedRef = useRef<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [oauthPopupOpen, setOauthPopupOpen] = useState(false)
  const [oauthPromptDismissed, setOauthPromptDismissed] = useState(false)
  const oauthSession = useQuery({
    queryKey: oauthQueryKey,
    queryFn: () => getOAuthSession(),
    retry: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    staleTime: 15_000,
  })
  const accessReady = hasKanbanBoardAccess(oauthSession.data ?? null)
  const oauthBound = oauthSession.data?.oauthAuthenticated === true
  const board = useQuery({
    queryKey: boardQueryKey,
    queryFn: getBoard,
    enabled: accessReady,
    retry: false,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  })
  const handleCommandEvent = useCallback(() => {
    if (!accessReady) return
    void queryClient.invalidateQueries({ queryKey: boardQueryKey })
  }, [accessReady, queryClient])
  useLiveEvents(handleCommandEvent, accessReady)
  const showToast = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(null), 2600)
  }, [])
  const selectedCard = useMemo(
    () => board.data?.cards.find((card) => card.id === props.selectedCardId) ?? null,
    [board.data, props.selectedCardId],
  )

  const stopOAuthPopupWatcher = useCallback((closePopup: boolean) => {
    if (closePopup) setOauthPopupOpen(false)
    if (oauthPopupPollRef.current === null) return
    window.clearInterval(oauthPopupPollRef.current)
    oauthPopupPollRef.current = null
  }, [])

  const refreshOAuthSession = useCallback(
    async (options: { closePopup?: boolean; force?: boolean } = {}) => {
      stopOAuthPopupWatcher(options.closePopup === true)
      const session = await queryClient.fetchQuery({
        queryKey: oauthQueryKey,
        queryFn: () => getOAuthSession(),
        staleTime: options.force ? 0 : 15_000,
      })
      if (hasKanbanBoardAccess(session)) {
        await Promise.all([
          queryClient.fetchQuery({
            queryKey: boardQueryKey,
            queryFn: getBoard,
            staleTime: options.force ? 0 : 15_000,
          }),
          queryClient.invalidateQueries({ queryKey: inboxQueryKey }),
        ])
      }
      return session
    },
    [queryClient, stopOAuthPopupWatcher],
  )

  const refresh = () => {
    void refreshOAuthSession({ force: true }).catch((error: Error) => {
      if (accessReady)
        void board.refetch().catch((boardError: Error) => showToast(boardError.message))
      showToast(error.message)
    })
  }
  const closeDetail = () => {
    void navigate({ to: '/' })
  }
  const shareBoard = useCallback(() => {
    void shareCurrentBoard({
      title: board.data?.title ?? t('app.title'),
      description: t('app.subtitle'),
    }).catch((error: Error) => {
      if (error.message === 'canceled') return
      showToast(error.message || t('bridge.shareFailed'))
    })
  }, [board.data?.title, showToast])
  const startOAuth = useCallback(
    (options: { automatic?: boolean } = {}) => {
      const authorizeUrl = oauthSession.data?.authorizeUrl
      if (!authorizeUrl || !canAuthorizeKanbanOAuth(oauthSession.data)) {
        showToast(t('toast.oauthUnavailable'))
        return
      }
      if (!options.automatic) setOauthPromptDismissed(false)
      setOauthPopupOpen(true)

      const openInCurrentFrame = () => {
        window.location.assign(authorizeUrl)
      }

      void authorizeShadowOAuth(authorizeUrl)
        .then((result) => {
          if (result.opened) return
          setOauthPopupOpen(false)
          openInCurrentFrame()
        })
        .catch((error: unknown) => {
          setOauthPopupOpen(false)
          if (isOAuthAccessDenied(error)) {
            setOauthPromptDismissed(true)
            showToast(t('toast.oauthDenied'))
            return
          }
          openInCurrentFrame()
        })
    },
    [oauthSession.data, showToast],
  )

  useEffect(() => {
    if (oauthBound) {
      autoOAuthStartedRef.current = null
      setOauthPromptDismissed(false)
    }
  }, [oauthBound])

  useEffect(() => {
    const authorizeUrl = oauthSession.data?.authorizeUrl
    const autoStartKey = oauthSession.data ? oauthAutoStartKey(oauthSession.data) : null
    if (
      oauthBound ||
      oauthSession.isLoading ||
      oauthPopupOpen ||
      oauthPromptDismissed ||
      !shouldAutoAuthorizeKanbanOAuth(oauthSession.data) ||
      !authorizeUrl ||
      !autoStartKey ||
      autoOAuthStartedRef.current === autoStartKey
    ) {
      return
    }
    autoOAuthStartedRef.current = autoStartKey
    startOAuth({ automatic: true })
  }, [
    oauthBound,
    oauthPopupOpen,
    oauthPromptDismissed,
    oauthSession.data,
    oauthSession.data?.authorizeUrl,
    oauthSession.isLoading,
    startOAuth,
  ])

  useEffect(() => {
    reportServerAppRoute()
    const report = () => {
      reportServerAppRoute()
    }
    const unsubscribe = onServerAppRouteNavigate((path) => {
      if (path === currentServerAppPath()) return
      window.location.hash = path
    })
    window.addEventListener('hashchange', report)
    return () => {
      window.removeEventListener('hashchange', report)
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const data = event.data as { type?: string } | null
      if (data?.type !== 'kanban.oauth.completed') return
      void refreshOAuthSession({ closePopup: true, force: true })
        .then(() => showToast(t('toast.shadowAuthorized')))
        .catch((error: Error) => showToast(error.message))
    }
    window.addEventListener('message', handleMessage)
    return () => {
      window.removeEventListener('message', handleMessage)
      if (oauthPopupPollRef.current !== null) {
        window.clearInterval(oauthPopupPollRef.current)
        oauthPopupPollRef.current = null
      }
    }
  }, [refreshOAuthSession, showToast])

  useEffect(() => {
    const syncIfVisible = () => {
      if (document.visibilityState !== 'visible') return
      void refreshOAuthSession().catch(() => undefined)
    }
    const syncOnPageShow = () => {
      void refreshOAuthSession().catch(() => undefined)
    }
    window.addEventListener('focus', syncIfVisible)
    window.addEventListener('pageshow', syncOnPageShow)
    document.addEventListener('visibilitychange', syncIfVisible)
    return () => {
      window.removeEventListener('focus', syncIfVisible)
      window.removeEventListener('pageshow', syncOnPageShow)
      document.removeEventListener('visibilitychange', syncIfVisible)
    }
  }, [refreshOAuthSession])

  return (
    <>
      {!accessReady ? (
        <header>
          <div className="headerTitle">
            <h1>{t('app.title')}</h1>
            <div className="subtitle">{t('app.subtitle')}</div>
          </div>
          <div className="headerControls">
            <button className="refresh" type="button" onClick={refresh}>
              {t('board.refresh')}
            </button>
          </div>
        </header>
      ) : null}
      <main className={accessReady ? 'boardMain' : undefined}>
        {accessReady ? (
          <>
            {board.isLoading ? <div className="emptyState">{t('board.loading')}</div> : null}
            {board.error ? <div className="emptyState">{board.error.message}</div> : null}
            {board.data ? (
              <BoardView
                board={board.data}
                onShare={shareBoard}
                showToast={showToast}
                userProfile={oauthSession.data?.profile ?? null}
                toolbarActions={<CoordinatorRequestBar showToast={showToast} />}
              />
            ) : null}
          </>
        ) : (
          <AuthGate
            error={oauthSession.error instanceof Error ? oauthSession.error.message : null}
            loading={oauthSession.isLoading}
            oauthPopupOpen={oauthPopupOpen}
            session={oauthSession.data ?? null}
            onAuthorize={startOAuth}
            onRefresh={refresh}
          />
        )}
      </main>
      {accessReady ? (
        <CardDetail
          board={board.data ?? null}
          card={selectedCard}
          open={!!props.selectedCardId}
          onClose={closeDetail}
          showToast={showToast}
          userProfile={oauthSession.data?.profile ?? null}
        />
      ) : null}
      <div className={toast ? 'toast show' : 'toast'}>{toast}</div>
    </>
  )
}

function useLiveEvents(onCommand: () => void, enabled: boolean) {
  const [eventStreamUrl, setEventStreamUrl] = useState<string | null>(() =>
    currentLaunchEventStreamUrl(),
  )

  useEffect(() => {
    return onLaunchContextChange((context) => {
      setEventStreamUrl(context.eventStreamUrl ?? context.eventStreamPath ?? null)
    })
  }, [])

  useEffect(() => {
    if (!enabled) return
    if (!eventStreamUrl) return
    const source = new EventSource(eventStreamUrl)
    source.addEventListener(SHADOW_SERVER_APP_COMMAND_COMPLETED_EVENT, (event) => {
      try {
        const payload = JSON.parse(event.data || '{}') as { command?: string }
        if (payload.command === 'boards.get') return
      } catch {
        // Older Shadow servers may omit event details.
      }
      onCommand()
    })
    return () => source.close()
  }, [enabled, eventStreamUrl, onCommand])
}

const rootElement = document.getElementById('root')

if (rootElement) {
  createRoot(rootElement).render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}
