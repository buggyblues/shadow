import './lib/i18n'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  redirect,
  useNavigate,
} from '@tanstack/react-router'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { useTranslation } from 'react-i18next'
import { AppLayout } from './components/layout/app-layout'
import { RootLayout } from './components/layout/root-layout'
import { AgentManagementPage } from './pages/agent-management'
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
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const navigate = useNavigate()
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted bg-bg-primary h-full">
        <div className="text-center max-w-md">
          <img src="/Logo.svg" alt="Shadow" className="w-20 h-20 mx-auto mb-6 opacity-60" />
          <h2 className="text-2xl font-bold text-text-primary mb-2">{t('common.welcomeTitle')}</h2>
          <p className="text-[#dbdee1] mb-8 text-[15px]">{t('common.welcomeDesc')}</p>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => navigate({ to: '/app/discover' })}
              className="px-6 py-3 bg-[#5865F2] hover:bg-[#4752c4] text-white rounded-xl font-bold transition flex items-center justify-center gap-2 shadow-sm"
            >
              {t('common.welcomeDiscover')}
            </button>
          </div>
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

const agentMgmtRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/agents',
  component: AgentManagementPage,
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
  appRoute.addChildren([appIndexRoute, serverRoute, settingsRoute, agentMgmtRoute, discoverRoute]),
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
