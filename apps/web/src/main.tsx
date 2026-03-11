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
import { DiscoverPage } from './pages/discover'
import { DocsPage } from './pages/docs'
import { FeaturesPage } from './pages/features'
import { HomePage } from './pages/home'
import { InvitePage } from './pages/invite'
import { LoginPage } from './pages/login'
import { PricingPage } from './pages/pricing'
import { RegisterPage } from './pages/register'
import { ServerPage } from './pages/server'
import { ServerHomePage } from './pages/server-home'
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

const serverRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/servers/$serverId',
  component: ServerPage,
})

const serverChannelRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/servers/$serverId/$channelName',
  component: ServerPage,
})

const serverShopRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/servers/$serverId/shop',
  component: ShopPageRoute,
})

const serverShopAdminRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/servers/$serverId/shop/admin',
  component: ShopAdminPageRoute,
})

const serverWorkspaceRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/servers/$serverId/workspace',
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
  serverHomeRoute,
  appRoute.addChildren([
    appIndexRoute,
    serverRoute,
    serverShopAdminRoute,
    serverShopRoute,
    serverWorkspaceRoute,
    serverChannelRoute,
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
