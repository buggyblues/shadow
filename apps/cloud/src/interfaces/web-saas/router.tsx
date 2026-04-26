/**
 * web-saas router — wraps routes that share pages from @/pages/* (packages/ui)
 * and injects the SaaS API adapter via ApiClientContext.
 *
 * LOCAL-ONLY pages (doctor, validate, config editor, images, runtimes, deploy-tasks)
 * are NOT included — they don't apply in SaaS mode.
 */

import { ErrorBoundary } from '@shadowob/cloud-ui/components/ErrorBoundary'
import { Layout } from '@shadowob/cloud-ui/components/Layout'
import { ApiClientContext } from '@shadowob/cloud-ui/lib/api-context'
import { DeploymentNamespacePage } from '@shadowob/cloud-ui/pages/DeploymentNamespacePage'
import { DeploymentsPage } from '@shadowob/cloud-ui/pages/DeploymentsPage'
import { DeployWizardPage } from '@shadowob/cloud-ui/pages/DeployWizardPage'
import { MonitoringPage } from '@shadowob/cloud-ui/pages/MonitoringPage'
import { MyTemplateDetailPage } from '@shadowob/cloud-ui/pages/MyTemplateDetailPage'
import { MyTemplatesPage } from '@shadowob/cloud-ui/pages/MyTemplatesPage'
import { ProviderProfilesPage } from '@shadowob/cloud-ui/pages/ProviderProfilesPage'
import { SecretsPage } from '@shadowob/cloud-ui/pages/SecretsPage'
import { StoreDetailPage } from '@shadowob/cloud-ui/pages/StoreDetailPage'
import { StorePage } from '@shadowob/cloud-ui/pages/StorePage'
import { WalletPage } from '@shadowob/cloud-ui/pages/WalletPage'
import {
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router'
import React from 'react'
import { saasApiAdapter } from './api-adapter'

function withErrorBoundary(Page: React.ComponentType) {
  return function WrappedPage() {
    return (
      <ErrorBoundary>
        <Page />
      </ErrorBoundary>
    )
  }
}

const rootRoute = createRootRoute({
  component: () => (
    // Inject SaaS API client — all child pages call useApiClient() to get it
    <ApiClientContext.Provider value={saasApiAdapter}>
      <Layout>
        <Outlet />
      </Layout>
    </ApiClientContext.Provider>
  ),
})

// ── Default redirect ───────────────────────────────────────────────────────

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/store' })
  },
})

// ── Template Store ─────────────────────────────────────────────────────────

const storeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/store',
  component: withErrorBoundary(StorePage),
})

const storeDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/store/$name',
  component: withErrorBoundary(StoreDetailPage),
})

const deployWizardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/store/$name/deploy',
  component: withErrorBoundary(DeployWizardPage),
})

// ── My Deployments ─────────────────────────────────────────────────────────

const deploymentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/deployments',
  component: withErrorBoundary(DeploymentsPage),
})

const deploymentNamespaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/deployments/$namespace',
  component: withErrorBoundary(DeploymentNamespacePage),
})

// ── Monitoring ─────────────────────────────────────────────────────────────

const monitoringRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/monitoring',
  component: withErrorBoundary(MonitoringPage),
})

// ── My Templates ───────────────────────────────────────────────────────────

const myTemplatesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/my-templates',
  component: withErrorBoundary(MyTemplatesPage),
})

const myTemplateDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/my-templates/$name',
  component: withErrorBoundary(MyTemplateDetailPage),
})

// ── Secrets ────────────────────────────────────────────────────────────────

const secretsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/secrets',
  component: withErrorBoundary(SecretsPage),
})

const providersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/providers',
  component: withErrorBoundary(ProviderProfilesPage),
})

// ── Wallet / Billing ───────────────────────────────────────────────────────

const walletRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/wallet',
  component: withErrorBoundary(WalletPage),
})

// ── Route tree ─────────────────────────────────────────────────────────────

const routeTree = rootRoute.addChildren([
  indexRoute,
  storeRoute,
  storeDetailRoute,
  deployWizardRoute,
  deploymentsRoute,
  deploymentNamespaceRoute,
  monitoringRoute,
  myTemplatesRoute,
  myTemplateDetailRoute,
  providersRoute,
  secretsRoute,
  walletRoute,
])

// Use browser history with explicit basepath so every SaaS page has a real URL:
// /app/cloud/store, /app/cloud/deployments/$namespace, etc.
const browserHistory = createBrowserHistory()

export const router = createRouter({
  routeTree,
  history: browserHistory,
  basepath: '/app/cloud',
})
