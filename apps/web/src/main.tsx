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
import { AppPageRoute } from './pages/apps'
import { BuddyManagementPage } from './pages/buddy-management'
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
import { MyRentalsPage } from './pages/my-rentals'
import { OAuthAuthorizePage } from './pages/oauth-authorize'
import { OAuthCallbackPage } from './pages/oauth-callback'
import { PlayLaunchPage } from './pages/play-launch'
import { RegisterPage } from './pages/register'
import { ServerLayout } from './pages/server'
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
  component: AppPageRoute,
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
  component: SettingsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search.tab as string) || undefined,
    dm: (search.dm as string) || undefined,
    section: (search.section as string) || undefined,
  }),
})

const settingsSubRoutes = [
  { path: '/settings/quickstart', tab: 'quickstart' },
  { path: '/settings/profile', tab: 'profile' },
  { path: '/settings/account', tab: 'account' },
  { path: '/settings/invite', tab: 'tasks', section: 'invite' },
  { path: '/settings/tasks', tab: 'tasks' },
  { path: '/settings/buddy', tab: 'buddy' },
  { path: '/settings/appearance', tab: 'appearance' },
  { path: '/settings/notification', tab: 'notification' },
  { path: '/settings/friends', tab: 'friends' },
  { path: '/settings/chat', tab: 'chat' },
].map(({ path, tab, section }) =>
  createRoute({
    getParentRoute: () => appRoute,
    path: path as '/settings/quickstart',
    component: SettingsPage,
    validateSearch: (search: Record<string, unknown>) => ({
      tab: tab,
      dm: (search.dm as string) || undefined,
      section,
    }),
    beforeLoad: () => {
      // Redirect to main settings route with tab parameter for backward compatibility
      throw redirect({
        to: '/settings',
        search: { tab, ...(section ? { section } : {}) },
      })
    },
  }),
)

const buddyMgmtRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/buddies',
  component: BuddyManagementPage,
})

const discoverRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/discover',
  component: DiscoverPage,
})

const marketplaceDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/marketplace/$listingId',
  component: MarketplaceDetailPage,
})

const myRentalsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/marketplace/my-rentals',
  component: MyRentalsPage,
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

const entitlementsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings/entitlements',
  component: SettingsPage,
  beforeLoad: () => {
    throw redirect({
      to: '/settings',
      search: { tab: 'wallet', section: 'entitlements' },
    })
  },
})

const shopOrdersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/shop/orders',
  component: SettingsPage,
  beforeLoad: () => {
    throw redirect({
      to: '/settings',
      search: { tab: 'shop', section: 'orders' },
    })
  },
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
    ]),
    settingsRoute,
    ...settingsSubRoutes,
    playLaunchRoute,
    buddyMgmtRoute,
    discoverRoute,
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
    entitlementsRoute,
    shopOrdersRoute,
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
