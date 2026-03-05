import './lib/i18n'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  redirect,
} from '@tanstack/react-router'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { useTranslation } from 'react-i18next'
import { AppLayout } from './components/layout/app-layout'
import { RootLayout } from './components/layout/root-layout'
import { AgentMarketPage } from './pages/agents'
import { DiscoverPage } from './pages/discover'
import { DocsPage } from './pages/docs'
import { FeaturesPage } from './pages/features'
import { HomePage } from './pages/home'
import { InvitePage } from './pages/invite'
import { LoginPage } from './pages/login'
import { PricingPage } from './pages/pricing'
import { RegisterPage } from './pages/register'
import { ServerPage } from './pages/server'
import { SettingsPage } from './pages/settings'
import { useAuthStore } from './stores/auth.store'
import './styles/globals.css'

// Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

// Routes
const rootRoute = createRootRoute({
  component: RootLayout,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
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

const agentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/agents',
  component: AgentMarketPage,
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
  component: () => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { t } = useTranslation()
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted">
        <div className="text-center">
          <img src="/Logo.svg" alt="Shadow" className="w-16 h-16 mx-auto mb-4 opacity-40" />
          <p className="text-lg">{t('common.selectServerToChat')}</p>
        </div>
      </div>
    )
  },
})

const serverRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/servers/$serverId',
  component: ServerPage,
})

const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings',
  component: SettingsPage,
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
  agentsRoute,
  pricingRoute,
  docsRoute,
  inviteRoute,
  appRoute.addChildren([appIndexRoute, serverRoute, settingsRoute, discoverRoute]),
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
