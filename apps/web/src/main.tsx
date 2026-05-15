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
import { AppLayout } from './components/layout/app-layout'
import { RootLayout } from './components/layout/root-layout'
import { authenticatedRouterPathFromRedirect, currentAppRedirect } from './lib/auth-redirect'
import { ensureAuthenticatedSession } from './lib/auth-session'
import { reloadOnceForChunkError } from './lib/chunk-reload'
import { queryClient } from './lib/query-client'
import { ChannelView } from './pages/channel-view'
import { PersonalShopPage, ProductDetailPage } from './pages/commerce'
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
import { ServerLayout } from './pages/server'
import { ServerAppsPageRoute } from './pages/server-apps'
import { ServerHomePage } from './pages/server-home'
import { ServerHomeView } from './pages/server-home-view'
import { SettingsPage } from './pages/settings'
import { ShopPageRoute } from './pages/shop'
import { ShopAdminPageRoute } from './pages/shop-admin'
import { UserProfilePage } from './pages/user-profile'
import { WorkspacePageRoute } from './pages/workspace'
import './styles/globals.css'

const CloudSaasApp = lazy(() =>
  import('@shadowob/cloud-ui/web-saas')
    .then((m) => ({ default: m.CloudSaasApp }))
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
  component: ServerLayout,
})

const serverIndexRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: '/',
  component: ServerHomeView,
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
  component: ServerAppsPageRoute,
})

const serverAppDetailRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: '/apps/$appKey',
  component: ServerAppsPageRoute,
})

const serverHomeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/s/$serverId',
  component: ServerHomePage,
  beforeLoad: requireAuthenticatedRoute,
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
})

const userShopRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/shop/users/$userId',
  component: PersonalShopPage,
})

const productDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/shop/products/$productId',
  component: ProductDetailPage,
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
  inviteRoute,
  oauthCallbackRoute,
  oauthAuthorizeRoute,
  serverHomeRoute,
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
    cloudRoute,
    diyCloudRoute,
    cloudSplatRoute,
    developersCloudRoute,
  ]),
])

const router = createRouter({ routeTree, basepath: '/app' })

// Render
const root = document.getElementById('root')
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </React.StrictMode>,
  )
}
