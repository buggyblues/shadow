// Desktop renderer entry — loads the web app with desktop enhancements
import './styles/globals.css'
import '@web/lib/i18n'
import { QueryClientProvider } from '@tanstack/react-query'
import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  redirect,
} from '@tanstack/react-router'
import { AppLayout } from '@web/components/layout/app-layout'
import { RootLayout } from '@web/components/layout/root-layout'
import { queryClient } from '@web/lib/query-client'
import { AppPageRoute } from '@web/pages/apps'
import { BuddyManagementPage } from '@web/pages/buddy-management'
import { ChannelView } from '@web/pages/channel-view'
import { ContractDetailPage } from '@web/pages/contract-detail'
import { CreateListingPage } from '@web/pages/create-listing'
import { DiscoverPage } from '@web/pages/discover'
import { DmChatPage } from '@web/pages/dm-chat'

import { InvitePage } from '@web/pages/invite'
import { LoginPage } from '@web/pages/login'
import { MarketplaceDetailPage } from '@web/pages/marketplace-detail'
import { MyRentalsPage } from '@web/pages/my-rentals'
import { OAuthAuthorizePage } from '@web/pages/oauth-authorize'
import { OAuthCallbackPage } from '@web/pages/oauth-callback'

import { RegisterPage } from '@web/pages/register'
import { ServerLayout } from '@web/pages/server'
import { ServerHomePage } from '@web/pages/server-home'
import { ServerHomeView } from '@web/pages/server-home-view'
import { SettingsPage } from '@web/pages/settings'
import { ShopPageRoute } from '@web/pages/shop'
import { ShopAdminPageRoute } from '@web/pages/shop-admin'
import { UserProfilePage } from '@web/pages/user-profile'
import { WorkspacePageRoute } from '@web/pages/workspace'
import { useAuthStore } from '@web/stores/auth.store'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { useDesktopNotifications } from './hooks/use-desktop-notifications'
import { DesktopSettingsPage } from './pages/desktop-settings'
import { OpenClawPage } from './pages/openclaw'
import { DesktopOnboardPage } from './pages/openclaw/desktop-onboard'

// --- Desktop-specific enhancements ---

// Set platform CSS classes for desktop-specific styling (before React render)
if ('desktopAPI' in window) {
  const api = (window as Record<string, unknown>).desktopAPI as { platform: string }
  document.documentElement.classList.add('desktop-app', `desktop-${api.platform}`)
}

function setupDesktopIntegration() {
  if (!('desktopAPI' in window)) return

  const api = (window as Record<string, unknown>).desktopAPI as {
    onNavigateToChannel?: (cb: (channelId: string) => void) => () => void
  }

  api.onNavigateToChannel?.((channelId: string) => {
    router.navigate({ to: '/servers/default/channels/$channelId', params: { channelId } })
  })
}

// Desktop app route — wraps AppLayout with native integrations
function DesktopAppRoute() {
  useDesktopNotifications()
  const isWin32 =
    'desktopAPI' in window &&
    ((window as Record<string, unknown>).desktopAPI as { platform: string }).platform === 'win32'
  return (
    <>
      <AppLayout />
      {/* Windows: drag region spacer for title bar overlay buttons */}
      {isWin32 && (
        <div
          className="fixed top-0 right-0 z-[10000]"
          style={{ width: '140px', height: '48px', WebkitAppRegion: 'drag' } as React.CSSProperties}
        />
      )}
    </>
  )
}

// Routes (mirroring web app)
const rootRoute = createRootRoute({
  component: RootLayout,
})

// Onboarding route - standalone, no auth required
const onboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/onboard',
  component: DesktopOnboardPage,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => null,
  beforeLoad: () => {
    // Desktop: always go to /settings (authenticated) or /login (unauthenticated)
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

const marketplaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/marketplace',
  beforeLoad: () => {
    throw redirect({ to: '/buddies' })
  },
  component: () => null,
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
      throw redirect({
        to: '/login',
      })
    }
  },
})

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authenticated',
  component: DesktopAppRoute,
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
    throw redirect({ to: '/settings' })
  },
  component: () => null,
})

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
})

const desktopSettingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/desktop-settings',
  component: () => {
    const navigate = router.navigate
    return <DesktopSettingsPage onBack={() => navigate({ to: '/settings' })} />
  },
})

const openclawRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/openclaw',
  component: OpenClawPage,
})

const dmChatRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/dm/$dmChannelId',
  component: DmChatPage,
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

const routeTree = rootRoute.addChildren([
  onboardRoute,
  indexRoute,
  loginRoute,
  registerRoute,
  inviteRoute,
  marketplaceRoute,
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
      serverAppsRoute,
    ]),
    settingsRoute,
    desktopSettingsRoute,
    openclawRoute,
    dmChatRoute,
    buddyMgmtRoute,
    discoverRoute,
    myRentalsRoute,
    contractDetailRoute,
    createListingRoute,
    editListingRoute,
    marketplaceDetailRoute,
    userProfileRoute,
  ]),
])

// Use hash-based routing for Electron (file:// protocol doesn't support browser history)
const hashHistory = createHashHistory()
const router = createRouter({ routeTree, history: hashHistory, basepath: '/app' })

// Initialize desktop integration
setupDesktopIntegration()

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
