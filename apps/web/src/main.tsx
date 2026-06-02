import './lib/i18n'
import { QueryClientProvider } from '@tanstack/react-query'
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  redirect,
} from '@tanstack/react-router'
import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { useTranslation } from 'react-i18next'
import { AppLayout } from './components/layout/app-layout'
import { RootLayout } from './components/layout/root-layout'
import { fetchApi } from './lib/api'
import { authenticatedRouterPathFromRedirect, currentAppRedirect } from './lib/auth-redirect'
import {
  ensureAuthenticatedSession,
  installDesktopCommunityAuthStateListener,
} from './lib/auth-session'
import { reloadOnceForChunkError } from './lib/chunk-reload'
import { queryClient } from './lib/query-client'
import { ChannelView } from './pages/channel-view'
import {
  AssetHomePage,
  PersonalShopPage,
  ProductDetailPage,
  PurchaseOrderDetailPage,
} from './pages/commerce'
import { ContractDetailPage } from './pages/contract-detail'
import { CreateListingPage } from './pages/create-listing'
import { DevelopersCloudPage } from './pages/developers-cloud'
import { DiscoverPage } from './pages/discover'
import { DiyCloudPage } from './pages/diy-cloud'
import { DirectChatPage } from './pages/dm-chat'
import { InvitePage } from './pages/invite'
import { LoginPage } from './pages/login'
import { MarketplaceDetailPage } from './pages/marketplace-detail'
import { OAuthAuthorizePage } from './pages/oauth-authorize'
import { OAuthCallbackPage } from './pages/oauth-callback'
import { PlayLaunchPage } from './pages/play-launch'
import { RegisterPage } from './pages/register'
import { ResetPasswordPage } from './pages/reset-password'
import { ServerLayout } from './pages/server'
import { ServerIndexView } from './pages/server-index-view'
import { SettingsPage } from './pages/settings'
import { ShopPageRoute } from './pages/shop'
import { ShopAdminPageRoute } from './pages/shop-admin'
import { ShopTagPage } from './pages/shop-tag'
import { UserProfilePage } from './pages/user-profile'
import { WorkspacePageRoute } from './pages/workspace'
import './styles/globals.css'

installDesktopCommunityAuthStateListener()

const CloudSaasApp = lazy(() =>
  import('@shadowob/cloud-ui/web-saas')
    .then((m) => {
      const fallback = (m as unknown as { default?: unknown }).default
      const Component =
        m.CloudSaasApp ??
        (typeof fallback === 'function'
          ? fallback
          : (fallback as { CloudSaasApp?: typeof m.CloudSaasApp; default?: typeof m.CloudSaasApp })
              ?.CloudSaasApp) ??
        (fallback as { default?: typeof m.CloudSaasApp })?.default
      if (!Component) {
        throw new Error('Cloud SaaS app entry did not export a React component')
      }
      return { default: Component }
    })
    .catch((error) => {
      if (reloadOnceForChunkError(error)) {
        return new Promise<never>(() => {})
      }
      throw error
    }),
)

// Routes
const rootRoute = createRootRoute({
  component: RootLayout,
})

async function requireAuthenticatedRoute() {
  const user = await ensureAuthenticatedSession()
  if (!user) {
    throw redirect({
      to: '/login',
      search: { redirect: currentAppRedirect() },
    })
  }
}

async function redirectIfAuthenticatedRoute() {
  const user = await ensureAuthenticatedSession()
  if (user) {
    const redirectTo = new URLSearchParams(window.location.search).get('redirect')
    throw redirect({ to: authenticatedRouterPathFromRedirect(redirectTo) })
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

function safeDesktopCallbackRedirect(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\r\n\\]/.test(value)) {
    return '/app/discover'
  }
  if (value === '/app') return '/app'
  return value.startsWith('/app/') ? value : `/app${value === '/' ? '' : value}`
}

function DesktopAuthCallbackPage() {
  const { t } = useTranslation()
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const redirect = safeDesktopCallbackRedirect(params.get('redirect'))
    const accessToken = window.localStorage.getItem('accessToken') ?? ''
    const refreshToken = window.localStorage.getItem('refreshToken') ?? ''
    if (!accessToken || !refreshToken) {
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
      window.location.replace(`/app/login?redirect=${encodeURIComponent(current)}`)
      return
    }
    const callbackUrl = new URL('shadow://oauth-callback')
    callbackUrl.searchParams.set('access_token', accessToken)
    callbackUrl.searchParams.set('refresh_token', refreshToken)
    callbackUrl.searchParams.set('redirect', redirect)
    window.location.replace(callbackUrl.toString())
  }, [])

  return (
    <div className="grid min-h-screen place-items-center bg-bg-deep px-6 text-center text-text-primary">
      <p className="text-sm font-semibold text-text-secondary">{t('auth.authenticating')}</p>
    </div>
  )
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SERVER_ROUTE_STALE_MS = 5 * 60 * 1000
const SERVER_ROUTE_GC_MS = 30 * 60 * 1000

type ServerRouteSummary = {
  id: string
  slug?: string | null
}

type ServerRouteBeforeLoadContext = {
  params: {
    serverSlug?: string
  }
  location: {
    pathname: string
    search?: Record<string, unknown>
  }
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

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => null,
  beforeLoad: async () => {
    if (await ensureAuthenticatedSession()) {
      throw redirect({ to: '/discover' })
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

const oauthAuthorizeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/oauth/authorize',
  component: OAuthAuthorizePage,
  beforeLoad: requireAuthenticatedRoute,
})

// Authenticated layout route (pathless — basepath '/app' provides the URL prefix)
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authenticated',
  component: AppLayout,
  beforeLoad: requireAuthenticatedRoute,
})

const playLaunchRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/play/launch',
  component: PlayLaunchPage,
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

const serverAppsRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: '/apps',
  component: EmptyRoute,
})

const serverAppDetailRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: '/apps/$appKey',
  component: EmptyRoute,
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
})

const cloudRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/cloud',
  component: () => (
    <Suspense fallback={null}>
      <CloudSaasApp />
    </Suspense>
  ),
})

const diyCloudRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/cloud/diy',
  component: DiyCloudPage,
})

const cloudSplatRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/cloud/$',
  component: () => (
    <Suspense fallback={null}>
      <CloudSaasApp />
    </Suspense>
  ),
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
  registerRoute,
  resetPasswordRoute,
  inviteRoute,
  oauthCallbackRoute,
  desktopAuthCallbackRoute,
  oauthAuthorizeRoute,
  appRoute.addChildren([
    serverLayoutRoute.addChildren([
      serverIndexRoute,
      channelRoute,
      serverShopAdminRoute,
      serverShopRoute,
      serverWorkspaceRoute,
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
    cloudRoute,
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
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  ReactDOM.createRoot(root).render(
    isDesktopRuntime() ? appTree : <React.StrictMode>{appTree}</React.StrictMode>,
  )
}
