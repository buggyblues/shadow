import './lib/i18n'
import { QueryClientProvider } from '@tanstack/react-query'
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  redirect,
} from '@tanstack/react-router'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { AppLayout } from './components/layout/app-layout'
import { RootLayout } from './components/layout/root-layout'
import { queryClient } from './lib/query-client'
import { BuddyMarketPage } from './pages/buddies'
import { BuddyContractPage } from './pages/buddy-contract'
import { BuddyManagementPage } from './pages/buddy-management'
import { ChannelView } from './pages/channel-view'
import { DiscoverPage } from './pages/discover'
import { DocsPage } from './pages/docs'
import { FeaturesPage } from './pages/features'
import { HomePage } from './pages/home'
import { InvitePage } from './pages/invite'
import { LoginPage } from './pages/login'
import { OAuthAuthorizePage } from './pages/oauth-authorize'
import { OAuthCallbackPage } from './pages/oauth-callback'
import { PricingPage } from './pages/pricing'
import { RegisterPage } from './pages/register'
import { ServerLayout } from './pages/server'
import { ServerHomePage } from './pages/server-home'
import { ServerHomeView } from './pages/server-home-view'
import { SettingsPage } from './pages/settings'
import { ShopPageRoute } from './pages/shop'
import { ShopAdminPageRoute } from './pages/shop-admin'
import { WorkspacePageRoute } from './pages/workspace'
import { useAuthStore } from './stores/auth.store'
import './styles/globals.css'

// Routes
const rootRoute = createRootRoute({
  component: RootLayout,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
  beforeLoad: () => {
    if (useAuthStore.getState().isAuthenticated) {
      throw redirect({ to: '/app' })
    }
  },
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
  beforeLoad: () => {
    if (useAuthStore.getState().isAuthenticated) {
      throw redirect({ to: '/app' })
    }
  },
})

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/register',
  component: RegisterPage,
  beforeLoad: () => {
    if (useAuthStore.getState().isAuthenticated) {
      throw redirect({ to: '/app' })
    }
  },
})

const featuresRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/features',
  component: FeaturesPage,
})

const buddiesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/buddies',
  component: BuddyMarketPage,
})

const buddyContractRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/buddies/$buddyId/contract',
  component: BuddyContractPage,
})

const pricingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pricing',
  component: PricingPage,
})

const docsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/docs',
  component: DocsPage,
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

// Authenticated layout route
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app',
  component: AppLayout,
  beforeLoad: () => {
    if (!useAuthStore.getState().isAuthenticated) {
      throw redirect({ to: '/login' })
    }
  },
})

const appIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/app/settings' })
  },
  component: () => null,
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
})

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

// Router
const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  registerRoute,
  featuresRoute,
  buddiesRoute,
  buddyContractRoute,
  pricingRoute,
  docsRoute,
  inviteRoute,
  oauthCallbackRoute,
  oauthAuthorizeRoute,
  serverHomeRoute,
  appRoute.addChildren([
    appIndexRoute,
    serverLayoutRoute.addChildren([
      serverIndexRoute,
      channelRoute,
      serverShopAdminRoute,
      serverShopRoute,
      serverWorkspaceRoute,
    ]),
    settingsRoute,
    buddyMgmtRoute,
    discoverRoute,
  ]),
])

const router = createRouter({ routeTree })

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
