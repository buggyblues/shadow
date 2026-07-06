import './lib/i18n'
import type { AppNavigationTarget } from '@shadowob/cloud-ui/lib/app-navigation'
import { serverAppPathFromSearch } from '@shadowob/shared'
import { QueryClientProvider } from '@tanstack/react-query'
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  redirect,
  useNavigate,
} from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import React, { Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { useTranslation } from 'react-i18next'
import { InviteCodeGateProvider } from './components/auth/invite-code-gate'
import { AppLayout } from './components/layout/app-layout'
import { OsAppLayout } from './components/layout/os-app-layout'
import { RootLayout } from './components/layout/root-layout'
import { fetchApi } from './lib/api'
import {
  authenticatedRouterPathFromRedirect,
  currentAppRedirect,
  defaultAuthenticatedRouterPath,
} from './lib/auth-redirect'
import {
  ensureAuthenticatedSession,
  hasStoredAuthSession,
  installDesktopCommunityAuthStateListener,
  isAuthSessionUnavailableError,
} from './lib/auth-session'
import { CloudSaasApp } from './lib/cloud-saas-app'
import { queryClient } from './lib/query-client'
import { AuthModalPage } from './pages/auth-modal'
import { AuthStatusPage } from './pages/auth-status'
import { ChannelView } from './pages/channel-view'
import { CloudComputersPage } from './pages/cloud-computers'
import {
  AssetHomePage,
  PersonalShopPage,
  ProductDetailPage,
  PurchaseOrderDetailPage,
} from './pages/commerce'
import { ContractDetailPage } from './pages/contract-detail'
import { CreateListingPage } from './pages/create-listing'
import { CreateSpacePage } from './pages/create-space'
import { DevelopersCloudPage } from './pages/developers-cloud'
import { DiscoverPage } from './pages/discover'
import { DiyCloudPage } from './pages/diy-cloud'
import { DirectChatPage } from './pages/dm-chat'
import { InvitePage } from './pages/invite'
import { LoginPage } from './pages/login'
import { MarketplaceDetailPage } from './pages/marketplace-detail'
import { OAuthAuthorizePage } from './pages/oauth-authorize'
import { OAuthCallbackPage } from './pages/oauth-callback'
import { OsDesktopPage } from './pages/os-experiment'
import { PlayLaunchPage } from './pages/play-launch'
import { RegisterPage } from './pages/register'
import { ResetPasswordPage } from './pages/reset-password'
import { ServerLayout } from './pages/server'
import { ServerAppDirectoryDetailPage } from './pages/server-app-directory-detail'
import { ServerAppSharePage } from './pages/server-apps'
import { ServerIndexView } from './pages/server-index-view'
import { ServerMembersPageRoute } from './pages/server-members'
import { SettingsPage } from './pages/settings'
import { ShopPageRoute } from './pages/shop'
import { ShopAdminPageRoute } from './pages/shop-admin'
import { ShopTagPage } from './pages/shop-tag'
import { UserProfilePage } from './pages/user-profile'
import { WorkspacePageRoute } from './pages/workspace'
import './styles/globals.css'

installDesktopCommunityAuthStateListener()

function CloudRouteFallback() {
  const { t } = useTranslation()

  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center rounded-[24px] border border-border-subtle bg-bg-primary text-text-muted">
      <div className="inline-flex items-center gap-2 text-sm font-semibold">
        <Loader2 size={16} className="animate-spin" />
        {t('common.loading')}
      </div>
    </div>
  )
}

function CloudSaasRoute() {
  const navigate = useNavigate()
  const appNavigate = React.useCallback(
    (target: AppNavigationTarget) => {
      if (target.kind === 'settings-wallet') {
        navigate({ to: '/settings/wallet' })
        return
      }
      navigate({
        to: '/servers/$serverSlug',
        params: { serverSlug: target.serverSlug },
      })
    },
    [navigate],
  )

  return (
    <Suspense fallback={<CloudRouteFallback />}>
      <CloudSaasApp appNavigate={appNavigate} />
    </Suspense>
  )
}

// Routes
const rootRoute = createRootRoute({
  component: RootLayout,
})

async function requireAuthenticatedRoute() {
  const user = await ensureAuthenticatedSession().catch((error) => {
    if (isAuthSessionUnavailableError(error) && hasStoredAuthSession()) return null
    throw error
  })
  if (!user && hasStoredAuthSession()) return
  if (!user) {
    throw redirect({
      to: '/login',
      search: { redirect: currentAppRedirect() },
    })
  }
}

async function redirectIfAuthenticatedRoute() {
  const user = await ensureAuthenticatedSession().catch((error) => {
    if (isAuthSessionUnavailableError(error) && hasStoredAuthSession()) {
      return { unavailable: true }
    }
    throw error
  })
  if (user) {
    const redirectTo = new URLSearchParams(window.location.search).get('redirect')
    const routerRedirect = authenticatedRouterPathFromRedirect(redirectTo)
    throw redirect({ to: routerRedirect })
  }
}

function marketplaceSearch(search: Record<string, unknown>) {
  return {
    q: (search.q as string) || undefined,
    device: (search.device as string) || undefined,
    os: (search.os as string) || undefined,
    sort: (search.sort as string) || undefined,
  }
}

function marketplaceDetailSearch(search: Record<string, unknown>) {
  return {
    from: search.from === 'discover' ? 'discover' : undefined,
  }
}

function serverAppRouteSearch(search: Record<string, unknown>) {
  return {
    appPath: serverAppPathFromSearch(search) ?? undefined,
    copilot: typeof search.copilot === 'string' ? search.copilot : undefined,
  }
}

function safeDesktopCallbackRedirect(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\r\n\\]/.test(value)) {
    return '/app/discover'
  }
  if (value === '/app') return '/app'
  return value.startsWith('/app/') ? value : `/app${value === '/' ? '' : value}`
}

function DesktopAuthCallbackPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      const params = new URLSearchParams(window.location.search)
      const redirect = safeDesktopCallbackRedirect(params.get('redirect'))
      let accessToken = window.localStorage.getItem('accessToken') ?? ''
      let refreshToken = window.localStorage.getItem('refreshToken') ?? ''
      if ((!accessToken || !refreshToken) && (refreshToken || isDesktopRuntime())) {
        await ensureAuthenticatedSession().catch((error) => {
          if (isAuthSessionUnavailableError(error)) return null
          throw error
        })
        accessToken = window.localStorage.getItem('accessToken') ?? ''
        refreshToken = window.localStorage.getItem('refreshToken') ?? ''
      }
      if (cancelled) return
      if (!accessToken || !refreshToken) {
        const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
        navigate({
          to: '/login',
          search: { redirect: current },
          replace: true,
        })
        return
      }
      const callbackUrl = new URL('shadow://oauth-callback')
      callbackUrl.searchParams.set('access_token', accessToken)
      callbackUrl.searchParams.set('refresh_token', refreshToken)
      callbackUrl.searchParams.set('redirect', redirect)
      window.location.replace(callbackUrl.toString())
    })()
    return () => {
      cancelled = true
    }
  }, [navigate])

  return (
    <div className="grid min-h-[100dvh] place-items-center bg-bg-deep px-6 text-center text-text-primary">
      <p className="text-sm font-semibold text-text-secondary">{t('auth.authenticating')}</p>
    </div>
  )
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SERVER_ROUTE_STALE_MS = 5 * 60 * 1000
const SERVER_ROUTE_GC_MS = 30 * 60 * 1000
const LAST_OS_SPACE_STORAGE_KEY = 'shadow:last-os-space'

type ServerRouteSummary = {
  id: string
  slug?: string | null
}

type SpaceRouteServerEntry = {
  server: ServerRouteSummary
}

type OsRouteSearch = {
  app?: string
  builtin?: string
  channel?: string
  server?: string
  tour?: 'space-setup'
}

type ServerRouteBeforeLoadContext = {
  params: {
    serverSlug?: string
    serverIdOrSlug?: string
  }
  location: {
    pathname: string
    search?: Record<string, unknown>
  }
}

function osRouteSearch(search: Record<string, unknown>): OsRouteSearch {
  return {
    app: typeof search.app === 'string' ? search.app : undefined,
    builtin: typeof search.builtin === 'string' ? search.builtin : undefined,
    channel: typeof search.channel === 'string' ? search.channel : undefined,
    server: typeof search.server === 'string' ? search.server : undefined,
    tour: search.tour === 'space-setup' ? 'space-setup' : undefined,
  }
}

function osContextSearch(search: OsRouteSearch) {
  return {
    ...(search.app ? { app: search.app } : {}),
    ...(search.builtin ? { builtin: search.builtin } : {}),
    ...(search.channel ? { channel: search.channel } : {}),
    ...(search.tour ? { tour: search.tour } : {}),
  }
}

function spaceRouteKey(server?: ServerRouteSummary | null) {
  return server?.slug ?? server?.id ?? ''
}

function readLastOsSpaceRouteKey() {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(LAST_OS_SPACE_STORAGE_KEY)
  } catch {
    return null
  }
}

async function resolvePreferredSpaceRouteKey() {
  const servers = await queryClient.fetchQuery({
    queryKey: ['servers'],
    queryFn: () => fetchApi<SpaceRouteServerEntry[]>('/api/servers'),
    staleTime: SERVER_ROUTE_STALE_MS,
    gcTime: SERVER_ROUTE_GC_MS,
  })
  if (servers.length === 0) return null

  const lastRouteKey = readLastOsSpaceRouteKey()
  const lastServer = lastRouteKey
    ? servers.find(
        (entry) =>
          entry.server.id === lastRouteKey ||
          entry.server.slug === lastRouteKey ||
          spaceRouteKey(entry.server) === lastRouteKey,
      )
    : null
  return spaceRouteKey(lastServer?.server ?? servers[0]?.server)
}

async function redirectToPreferredSpace(search: OsRouteSearch = {}) {
  const routeKey = search.server?.trim() || (await resolvePreferredSpaceRouteKey())
  if (!routeKey) {
    throw redirect({ to: '/discover/browse' })
  }
  throw redirect({
    to: '/spaces/$serverIdOrSlug',
    params: { serverIdOrSlug: routeKey },
    search: osContextSearch(search),
  })
}

function serverChildPathFromLocation(pathname: string, serverSlug: string) {
  const encodedSlug = encodeURIComponent(serverSlug)
  const bases = [
    `/app/servers/${serverSlug}`,
    `/servers/${serverSlug}`,
    `/app/servers/${encodedSlug}`,
    `/servers/${encodedSlug}`,
  ]
  const base = bases.find((candidate) => pathname.startsWith(candidate))
  return base ? pathname.slice(base.length) : ''
}

function canonicalServerChildRoute(childPath: string, serverSlug: string) {
  if (childPath.startsWith('/shop/admin')) {
    return {
      to: '/servers/$serverSlug/shop/admin' as const,
      params: { serverSlug },
    }
  }
  if (childPath.startsWith('/shop')) {
    return {
      to: '/servers/$serverSlug/shop' as const,
      params: { serverSlug },
    }
  }
  if (childPath.startsWith('/workspace')) {
    return {
      to: '/servers/$serverSlug/workspace' as const,
      params: { serverSlug },
    }
  }
  if (childPath.startsWith('/members')) {
    return {
      to: '/servers/$serverSlug/members' as const,
      params: { serverSlug },
    }
  }
  const channelMatch = childPath.match(/^\/channels\/([^/?#]+)/u)
  if (channelMatch?.[1]) {
    return {
      to: '/servers/$serverSlug/channels/$channelId' as const,
      params: { serverSlug, channelId: decodeURIComponent(channelMatch[1]) },
    }
  }
  const appMatch = childPath.match(/^\/apps\/([^/?#]+)/u)
  if (appMatch?.[1]) {
    return {
      to: '/servers/$serverSlug/apps/$appKey' as const,
      params: { serverSlug, appKey: decodeURIComponent(appMatch[1]) },
    }
  }
  if (childPath.startsWith('/apps')) {
    return {
      to: '/servers/$serverSlug/apps' as const,
      params: { serverSlug },
    }
  }
  return {
    to: '/servers/$serverSlug' as const,
    params: { serverSlug },
  }
}

function EmptyRoute() {
  return null
}

async function canonicalizeServerRoute({ params, location }: ServerRouteBeforeLoadContext) {
  const serverSlug = params.serverSlug
  if (!serverSlug || !UUID_RE.test(serverSlug)) return
  const server = await queryClient.fetchQuery({
    queryKey: ['server', serverSlug],
    queryFn: () => fetchApi<ServerRouteSummary>(`/api/servers/${encodeURIComponent(serverSlug)}`),
    staleTime: SERVER_ROUTE_STALE_MS,
    gcTime: SERVER_ROUTE_GC_MS,
  })
  if (!server.slug || server.slug === serverSlug) return

  const childPath = serverChildPathFromLocation(location.pathname, serverSlug)
  const target = canonicalServerChildRoute(childPath, server.slug)
  throw redirect({
    ...target,
    search: location.search,
  })
}

async function canonicalizeSpaceRoute({ params, location }: ServerRouteBeforeLoadContext) {
  const serverIdOrSlug = params.serverIdOrSlug
  if (!serverIdOrSlug || !UUID_RE.test(serverIdOrSlug)) return
  const server = await queryClient.fetchQuery({
    queryKey: ['server', serverIdOrSlug],
    queryFn: () =>
      fetchApi<ServerRouteSummary>(`/api/servers/${encodeURIComponent(serverIdOrSlug)}`),
    staleTime: SERVER_ROUTE_STALE_MS,
    gcTime: SERVER_ROUTE_GC_MS,
  })
  if (!server.slug || server.slug === serverIdOrSlug) return

  throw redirect({
    to: '/spaces/$serverIdOrSlug',
    params: { serverIdOrSlug: server.slug },
    search: location.search,
  })
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => null,
  beforeLoad: async () => {
    const user = await ensureAuthenticatedSession().catch((error) => {
      if (isAuthSessionUnavailableError(error) && hasStoredAuthSession()) {
        return { unavailable: true }
      }
      throw error
    })
    if (user) {
      throw redirect({ to: defaultAuthenticatedRouterPath() })
    }
    throw redirect({ to: '/login' })
  },
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
  beforeLoad: redirectIfAuthenticatedRoute,
})

const authModalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/modal',
  component: AuthModalPage,
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
    origin: typeof search.origin === 'string' ? search.origin : undefined,
    lang: typeof search.lang === 'string' ? search.lang : undefined,
  }),
})

const authStatusRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/status',
  component: AuthStatusPage,
  validateSearch: (search: Record<string, unknown>) => ({
    origin: typeof search.origin === 'string' ? search.origin : undefined,
  }),
})

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/register',
  component: RegisterPage,
  beforeLoad: redirectIfAuthenticatedRoute,
})

const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reset-password',
  component: ResetPasswordPage,
})

const inviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/invite/$code',
  component: InvitePage,
})

const oauthCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/oauth-callback',
  component: OAuthCallbackPage,
})

const desktopAuthCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/desktop-auth-callback',
  component: DesktopAuthCallbackPage,
})

function DesktopDownloadRedirect() {
  React.useEffect(() => {
    const target = window.location.pathname.replace(/^\/app(?=\/|$)/, '') + window.location.search
    window.location.replace(target)
  }, [])
  return null
}

const desktopDownloadRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/desktop/download/$platform',
  component: DesktopDownloadRedirect,
})

const desktopReleaseRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/desktop/releases/latest',
  component: DesktopDownloadRedirect,
})

const oauthAuthorizeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/oauth/authorize',
  component: OAuthAuthorizePage,
  beforeLoad: requireAuthenticatedRoute,
})

const serverAppShareRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/share/server-app/$serverSlug/$appKey',
  component: ServerAppSharePage,
  beforeLoad: requireAuthenticatedRoute,
  validateSearch: serverAppRouteSearch,
})

// Authenticated layout route (pathless — basepath '/app' provides the URL prefix)
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authenticated',
  component: AppLayout,
  beforeLoad: requireAuthenticatedRoute,
})

const osAppRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authenticated-os',
  component: OsAppLayout,
  beforeLoad: requireAuthenticatedRoute,
})

const playLaunchRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/play/launch',
  component: PlayLaunchPage,
})

const osSpaceRoute = createRoute({
  getParentRoute: () => osAppRoute,
  path: '/spaces/$serverIdOrSlug',
  beforeLoad: canonicalizeSpaceRoute,
  validateSearch: osRouteSearch,
  component: OsDesktopPage,
})

const createSpaceRoute = createRoute({
  getParentRoute: () => osAppRoute,
  path: '/create-space',
  component: CreateSpacePage,
})

const spaceFallbackRoute = createRoute({
  getParentRoute: () => osAppRoute,
  path: '/space',
  validateSearch: osRouteSearch,
  beforeLoad: ({ search }) => redirectToPreferredSpace(search as OsRouteSearch),
  component: EmptyRoute,
})

const spacesFallbackRoute = createRoute({
  getParentRoute: () => osAppRoute,
  path: '/spaces',
  validateSearch: osRouteSearch,
  beforeLoad: ({ search }) => redirectToPreferredSpace(search as OsRouteSearch),
  component: EmptyRoute,
})

const osLegacyRoute = createRoute({
  getParentRoute: () => osAppRoute,
  path: '/os',
  validateSearch: osRouteSearch,
  beforeLoad: ({ search }) => redirectToPreferredSpace(search as OsRouteSearch),
  component: EmptyRoute,
})

// --- Server layout with nested child routes ---
const serverLayoutRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/servers/$serverSlug',
  beforeLoad: canonicalizeServerRoute,
  component: ServerLayout,
})

const serverIndexRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: '/',
  component: ServerIndexView,
})

const channelRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: '/channels/$channelId',
  component: ChannelView,
})

const serverShopRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: '/shop',
  component: ShopPageRoute,
  validateSearch: (search: Record<string, unknown>) => ({
    product: typeof search.product === 'string' ? search.product : undefined,
  }),
})

const serverShopAdminRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: '/shop/admin',
  component: ShopAdminPageRoute,
})

const serverWorkspaceRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: '/workspace',
  component: WorkspacePageRoute,
})

const serverMembersRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: '/members',
  component: ServerMembersPageRoute,
})

const serverAppsRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: '/apps',
  component: EmptyRoute,
  validateSearch: serverAppRouteSearch,
})

const serverAppDetailRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: '/apps/$appKey',
  component: EmptyRoute,
  validateSearch: serverAppRouteSearch,
})

const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings',
  beforeLoad: ({ search }: { search: Record<string, unknown> }) => {
    const legacyTab = search.tab as string | undefined
    if (
      legacyTab &&
      ['developer', 'profile', 'account', 'appearance', 'notification'].includes(legacyTab)
    ) {
      throw redirect({ to: '/settings/buddy', search: { tab: legacyTab } })
    }
    throw redirect({ to: '/settings/buddy' })
  },
  component: SettingsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    dm: (search.dm as string) || undefined,
    view: (search.view as string) || undefined,
    agent: (search.agent as string) || undefined,
    agentId: (search.agentId as string) || undefined,
    tab: (search.tab as string) || undefined,
  }),
})

const settingsSubRoutes = [
  { path: '/settings/quickstart' },
  { path: '/settings/profile' },
  { path: '/settings/account' },
  { path: '/settings/invite' },
  { path: '/settings/tasks' },
  { path: '/settings/wallet' },
  { path: '/settings/entitlements' },
  { path: '/settings/wallet/entitlements' },
  { path: '/settings/wallet/assets' },
  { path: '/settings/wallet/settlements' },
  { path: '/settings/wallet/actions' },
  { path: '/settings/shop' },
  { path: '/settings/shop/orders' },
  { path: '/settings/appearance' },
  { path: '/settings/notification' },
  { path: '/settings/friends' },
].map(({ path }) =>
  createRoute({
    getParentRoute: () => appRoute,
    path: path as '/settings/quickstart',
    component: SettingsPage,
    validateSearch: (search: Record<string, unknown>) => ({
      dm: (search.dm as string) || undefined,
      view: (search.view as string) || undefined,
      agent: (search.agent as string) || undefined,
      agentId: (search.agentId as string) || undefined,
      tab: (search.tab as string) || undefined,
    }),
  }),
)

const settingsDmRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings/dm',
  component: SettingsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    dm: (search.dm as string) || undefined,
    view: (search.view as string) || undefined,
    agent: (search.agent as string) || undefined,
    agentId: (search.agentId as string) || undefined,
  }),
})

// Buddy settings aliases as first-class routes (to keep state in pathname)
const settingsBuddyRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings/buddy',
  component: SettingsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    dm: (search.dm as string) || undefined,
    view: (search.view as string) || undefined,
    agent: (search.agent as string) || undefined,
    agentId: (search.agentId as string) || undefined,
  }),
})

const settingsBuddyMarketRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings/buddy/market',
  component: SettingsPage,
  beforeLoad: ({ search }) => {
    const staleSectionState = search.view || search.agent || search.agentId
    if (staleSectionState) {
      throw redirect({
        to: '/settings/buddy/market',
        search: marketplaceSearch(search as Record<string, unknown>),
      })
    }
  },
  validateSearch: (search: Record<string, unknown>) => ({
    dm: (search.dm as string) || undefined,
    view: (search.view as string) || undefined,
    agent: (search.agent as string) || undefined,
    agentId: (search.agentId as string) || undefined,
    ...marketplaceSearch(search),
  }),
})

const settingsBuddyCreateRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings/buddy/create',
  component: SettingsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    dm: (search.dm as string) || undefined,
    agent: (search.agent as string) || undefined,
    agentId: (search.agentId as string) || undefined,
  }),
})

const settingsBuddyDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings/buddy/detail',
  component: SettingsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    dm: (search.dm as string) || undefined,
    agent: (search.agent as string) || undefined,
    agentId: (search.agentId as string) || undefined,
  }),
})

const buddyMgmtRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/buddies',
  beforeLoad: () => {
    throw redirect({ to: '/settings/buddy' })
  },
  component: () => null,
})

const discoverRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/discover',
  component: DiscoverPage,
})

const discoverBrowseRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/discover/browse',
  component: DiscoverPage,
})

const discoverExploreRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/discover/explore',
  component: DiscoverPage,
})

const discoverMarketRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/discover/market',
  component: DiscoverPage,
})

const discoverAppsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/discover/apps',
  component: DiscoverPage,
})

const discoverAppDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/discover/apps/$appKey',
  component: ServerAppDirectoryDetailPage,
})

const discoverCloudRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/discover/cloud',
  component: DiscoverPage,
})

const marketplaceRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/marketplace',
  validateSearch: marketplaceSearch,
  beforeLoad: ({ search }) => {
    throw redirect({
      to: '/settings/buddy/market',
      search,
    })
  },
  component: () => null,
})

const marketplaceDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/marketplace/$listingId',
  validateSearch: marketplaceDetailSearch,
  component: MarketplaceDetailPage,
})

const myRentalsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/marketplace/my-rentals',
  beforeLoad: () => {
    throw redirect({
      to: '/settings/buddy/market',
      search: {},
    })
  },
  component: () => null,
})

const contractDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/marketplace/contracts/$contractId',
  component: ContractDetailPage,
})

const createListingRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/marketplace/create',
  component: CreateListingPage,
})

const editListingRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/marketplace/edit/$listingId',
  component: CreateListingPage,
})

const userProfileRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/profile/$userId',
  component: UserProfilePage,
})

const dmChatRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/dm/$dmChannelId',
  component: DirectChatPage,
})

const personalShopRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/shop/me',
  component: PersonalShopPage,
  validateSearch: (search: Record<string, unknown>) => ({
    view: (search.view as string) || undefined,
  }),
})

const userShopRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/shop/users/$userId',
  component: PersonalShopPage,
  validateSearch: (search: Record<string, unknown>) => ({
    view: (search.view as string) || undefined,
  }),
})

const productDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/shop/products/$productId',
  component: ProductDetailPage,
})

const shopTagRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/shop/tags/$tag',
  component: ShopTagPage,
})

const assetHomeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/assets/$assetId',
  component: AssetHomePage,
})

const purchaseOrderDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings/wallet/orders/$entitlementId',
  component: PurchaseOrderDetailPage,
  validateSearch: (search: Record<string, unknown>) => ({
    by: typeof search.by === 'string' ? search.by : undefined,
    open: search.open,
  }),
})

const cloudRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/cloud',
  component: CloudSaasRoute,
})

const cloudComputersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/cloud-computers',
  component: CloudComputersPage,
})

function CloudComputerDetailRoute() {
  const params = cloudComputerDetailRoute.useParams()
  return <CloudComputersPage initialComputerId={params.computerId} />
}

const cloudComputerDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/cloud-computers/$computerId',
  component: CloudComputerDetailRoute,
})

function CloudComputerAppRoute() {
  const params = cloudComputerAppRoute.useParams()
  const appKey = [
    'files',
    'browser',
    'terminal',
    'desktop',
    'buddies',
    'backups',
    'settings',
  ].includes(params.appKey)
    ? (params.appKey as
        | 'files'
        | 'browser'
        | 'terminal'
        | 'desktop'
        | 'buddies'
        | 'backups'
        | 'settings')
    : undefined
  return <CloudComputersPage initialComputerId={params.computerId} initialApp={appKey} />
}

const cloudComputerAppRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/cloud-computers/$computerId/$appKey',
  component: CloudComputerAppRoute,
})

const diyCloudRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/cloud/diy',
  component: DiyCloudPage,
})

const cloudSplatRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/cloud/$',
  component: CloudSaasRoute,
})

const cloudStoreRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/cloud/store',
  component: CloudSaasRoute,
})

const cloudStoreDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/cloud/store/$name',
  component: CloudSaasRoute,
})

const cloudStoreDeployRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/cloud/store/$name/deploy',
  component: CloudSaasRoute,
})

const developersCloudRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/developers/cloud',
  component: DevelopersCloudPage,
})

// Router
const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  authModalRoute,
  authStatusRoute,
  registerRoute,
  resetPasswordRoute,
  inviteRoute,
  oauthCallbackRoute,
  desktopAuthCallbackRoute,
  desktopDownloadRedirectRoute,
  desktopReleaseRedirectRoute,
  oauthAuthorizeRoute,
  serverAppShareRoute,
  osAppRoute.addChildren([
    createSpaceRoute,
    osSpaceRoute,
    spaceFallbackRoute,
    spacesFallbackRoute,
    osLegacyRoute,
  ]),
  appRoute.addChildren([
    serverLayoutRoute.addChildren([
      serverIndexRoute,
      channelRoute,
      serverShopAdminRoute,
      serverShopRoute,
      serverWorkspaceRoute,
      serverMembersRoute,
      serverAppsRoute,
      serverAppDetailRoute,
    ]),
    settingsRoute,
    ...settingsSubRoutes,
    playLaunchRoute,
    settingsBuddyRoute,
    settingsBuddyMarketRoute,
    settingsBuddyCreateRoute,
    settingsBuddyDetailRoute,
    settingsDmRoute,
    buddyMgmtRoute,
    discoverRoute,
    discoverBrowseRoute,
    discoverExploreRoute,
    discoverMarketRoute,
    discoverAppsRoute,
    discoverAppDetailRoute,
    discoverCloudRoute,
    marketplaceRoute,
    myRentalsRoute,
    contractDetailRoute,
    createListingRoute,
    editListingRoute,
    marketplaceDetailRoute,
    userProfileRoute,
    dmChatRoute,
    personalShopRoute,
    userShopRoute,
    productDetailRoute,
    shopTagRoute,
    assetHomeRoute,
    purchaseOrderDetailRoute,
    cloudComputersRoute,
    cloudComputerDetailRoute,
    cloudComputerAppRoute,
    cloudRoute,
    cloudStoreRoute,
    cloudStoreDetailRoute,
    cloudStoreDeployRoute,
    diyCloudRoute,
    cloudSplatRoute,
    developersCloudRoute,
  ]),
])

const router = createRouter({ routeTree, basepath: '/app' })

function isDesktopRuntime(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean((window as Window & { desktopAPI?: { isDesktop?: boolean } }).desktopAPI?.isDesktop)
  )
}

// Render
const root = document.getElementById('root')
if (root) {
  const appTree = (
    <QueryClientProvider client={queryClient}>
      <InviteCodeGateProvider>
        <RouterProvider router={router} />
      </InviteCodeGateProvider>
    </QueryClientProvider>
  )
  ReactDOM.createRoot(root).render(
    isDesktopRuntime() ? appTree : <React.StrictMode>{appTree}</React.StrictMode>,
  )
}
