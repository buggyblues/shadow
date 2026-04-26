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
import { queryClient } from './lib/query-client'
import { AppPageRoute } from './pages/apps'
import { BuddyDashboardPage } from './pages/buddy-dashboard'
import { BuddyManagementPage } from './pages/buddy-management'
import { ChannelView } from './pages/channel-view'
import { ContractDetailPage } from './pages/contract-detail'
import { CreateListingPage } from './pages/create-listing'
import { DevelopersCloudPage } from './pages/developers-cloud'
import { DiscoverPage } from './pages/discover'
import { DmChatPage } from './pages/dm-chat'
import { InvitePage } from './pages/invite'
import { LoginPage } from './pages/login'
import { MarketplaceDetailPage } from './pages/marketplace-detail'
import { MyRentalsPage } from './pages/my-rentals'
import { OAuthAuthorizePage } from './pages/oauth-authorize'
import { OAuthCallbackPage } from './pages/oauth-callback'
import { RegisterPage } from './pages/register'
import { ServerLayout } from './pages/server'
import { ServerHomePage } from './pages/server-home'
import { ServerHomeView } from './pages/server-home-view'
import { SettingsPage } from './pages/settings'
import { ShopPageRoute } from './pages/shop'
import { ShopAdminPageRoute } from './pages/shop-admin'
import { UserProfilePage } from './pages/user-profile'
import { WorkspacePageRoute } from './pages/workspace'
import { useAuthStore } from './stores/auth.store'
import './styles/globals.css'

const CloudSaasApp = lazy(() =>
  import('@shadowob/cloud-ui/web-saas').then((m) => ({ default: m.CloudSaasApp })),
)

// Routes
const rootRoute = createRootRoute({
  component: RootLayout,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => null,
  beforeLoad: () => {
    if (useAuthStore.getState().isAuthenticated) {
      throw redirect({ to: '/settings' })
    }
    throw redirect({ to: '/login' })
  },
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
  beforeLoad: () => {
    if (useAuthStore.getState().isAuthenticated) {
      throw redirect({ to: '/settings' })
    }
  },
})

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/register',
  component: RegisterPage,
  beforeLoad: () => {
    if (useAuthStore.getState().isAuthenticated) {
      throw redirect({ to: '/settings' })
    }
  },
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
  beforeLoad: () => {
    if (!useAuthStore.getState().isAuthenticated) {
      // Preserve the full URL so we redirect back after login
      throw redirect({
        to: '/login',
        search: { redirect: window.location.pathname + window.location.search },
      })
    }
  },
})

// Authenticated layout route (pathless — basepath '/app' provides the URL prefix)
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authenticated',
  component: AppLayout,
  beforeLoad: () => {
    if (!useAuthStore.getState().isAuthenticated) {
      throw redirect({ to: '/login' })
    }
  },
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
  beforeLoad: () => {
    if (!useAuthStore.getState().isAuthenticated) {
      throw redirect({ to: '/login' })
    }
  },
})

const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings',
  component: SettingsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search.tab as string) || undefined,
    dm: (search.dm as string) || undefined,
  }),
})

const settingsSubRoutes = [
  { path: '/settings/quickstart', tab: 'quickstart' },
  { path: '/settings/profile', tab: 'profile' },
  { path: '/settings/account', tab: 'account' },
  { path: '/settings/invite', tab: 'invite' },
  { path: '/settings/tasks', tab: 'tasks' },
  { path: '/settings/buddy', tab: 'buddy' },
  { path: '/settings/appearance', tab: 'appearance' },
  { path: '/settings/notification', tab: 'notification' },
  { path: '/settings/friends', tab: 'friends' },
  { path: '/settings/chat', tab: 'chat' },
].map(({ path, tab }) =>
  createRoute({
    getParentRoute: () => appRoute,
    path: path as '/settings/quickstart',
    component: SettingsPage,
    validateSearch: (search: Record<string, unknown>) => ({
      tab: tab,
      dm: (search.dm as string) || undefined,
    }),
    beforeLoad: () => {
      // Redirect to main settings route with tab parameter for backward compatibility
      throw redirect({
        to: '/settings',
        search: { tab },
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

const buddyDashboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/buddy/$agentId/dashboard',
  component: BuddyDashboardPage,
})

const dmChatRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/dm/$dmChannelId',
  component: DmChatPage,
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
    buddyMgmtRoute,
    discoverRoute,
    myRentalsRoute,
    contractDetailRoute,
    createListingRoute,
    editListingRoute,
    marketplaceDetailRoute,
    userProfileRoute,
    buddyDashboardRoute,
    dmChatRoute,
    cloudRoute,
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
