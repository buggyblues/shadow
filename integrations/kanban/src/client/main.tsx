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
import { authorizeShadowOAuth, getBoard, getOAuthSession } from './api.js'
import { AuthGate, canAuthorizeKanbanOAuth, hasKanbanBoardAccess } from './components/auth-gate.js'
import { BoardView } from './components/board-view.js'
import { CardDetail } from './components/card-detail.js'
import { CoordinatorRequestBar } from './components/coordinator-request-bar.js'
import { t } from './i18n.js'
import { boardQueryKey, inboxQueryKey, oauthQueryKey } from './query-keys.js'
import './styles.css'

const queryClient = new QueryClient()

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
    queryFn: getOAuthSession,
    retry: false,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  })
  const accessReady = hasKanbanBoardAccess(oauthSession.data ?? null)
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
    async (options: { closePopup?: boolean } = {}) => {
      stopOAuthPopupWatcher(options.closePopup === true)
      const session = await queryClient.fetchQuery({
        queryKey: oauthQueryKey,
        queryFn: getOAuthSession,
        staleTime: 0,
      })
      if (hasKanbanBoardAccess(session)) {
        await Promise.all([
          queryClient.fetchQuery({ queryKey: boardQueryKey, queryFn: getBoard, staleTime: 0 }),
          queryClient.invalidateQueries({ queryKey: inboxQueryKey }),
        ])
      }
      return session
    },
    [queryClient, stopOAuthPopupWatcher],
  )

  const refresh = () => {
    void refreshOAuthSession().catch((error: Error) => {
      if (accessReady)
        void board.refetch().catch((boardError: Error) => showToast(boardError.message))
      showToast(error.message)
    })
  }
  const closeDetail = () => {
    void navigate({ to: '/' })
  }
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
    if (accessReady) {
      autoOAuthStartedRef.current = null
      setOauthPromptDismissed(false)
    }
  }, [accessReady])

  useEffect(() => {
    const authorizeUrl = oauthSession.data?.authorizeUrl
    if (
      accessReady ||
      oauthSession.isLoading ||
      oauthPopupOpen ||
      oauthPromptDismissed ||
      !canAuthorizeKanbanOAuth(oauthSession.data) ||
      !authorizeUrl ||
      autoOAuthStartedRef.current === authorizeUrl
    ) {
      return
    }
    autoOAuthStartedRef.current = authorizeUrl
    startOAuth({ automatic: true })
  }, [
    accessReady,
    oauthPopupOpen,
    oauthPromptDismissed,
    oauthSession.data,
    oauthSession.data?.authorizeUrl,
    oauthSession.isLoading,
    startOAuth,
  ])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const data = event.data as { type?: string } | null
      if (data?.type !== 'kanban.oauth.completed') return
      void refreshOAuthSession({ closePopup: true })
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
                onRefresh={refresh}
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
  const [status, setStatus] = useState('manual')
  useEffect(() => {
    if (!enabled) {
      setStatus('manual')
      return
    }
    const eventStream = new URLSearchParams(window.location.search).get('shadow_event_stream')
    if (!eventStream) return
    const source = new EventSource(eventStream)
    source.addEventListener('ready', () => setStatus('live'))
    source.addEventListener(SHADOW_SERVER_APP_COMMAND_COMPLETED_EVENT, (event) => {
      try {
        const payload = JSON.parse(event.data || '{}') as { command?: string }
        if (payload.command === 'boards.get') return
      } catch {
        // Older Shadow servers may omit event details.
      }
      onCommand()
    })
    source.onerror = () => setStatus('reconnecting')
    return () => source.close()
  }, [enabled, onCommand])
  return status
}

const rootElement = document.getElementById('root')

if (rootElement) {
  createRoot(rootElement).render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}
