import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Layout } from '@/components/Layout'
import { DeploymentNamespacePage } from '@/pages/DeploymentNamespacePage'
import { DeploymentsPage } from '@/pages/DeploymentsPage'
import { DeploymentTaskPage } from '@/pages/DeploymentTaskPage'
import { DeployWizardPage } from '@/pages/DeployWizardPage'
import { MonitoringPage } from '@/pages/MonitoringPage'
import { MyTemplateDetailPage } from '@/pages/MyTemplateDetailPage'
import { MyTemplatesPage } from '@/pages/MyTemplatesPage'
import { OverviewPage } from '@/pages/OverviewPage'
import { SecretsPage } from '@/pages/SecretsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { StoreDetailPage } from '@/pages/StoreDetailPage'
import { StorePage } from '@/pages/StorePage'
import { ValidatePage } from '@/pages/ValidatePage'

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
    <Layout>
      <Outlet />
    </Layout>
  ),
})

// ── Console ───────────────────────────────────────────────────────────────────

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: withErrorBoundary(OverviewPage),
})

// ── Agent Store ───────────────────────────────────────────────────────────────

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

// ── Deployments (combines clusters + deploy tasks) ────────────────────────────

const deploymentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/deployments',
  component: withErrorBoundary(DeploymentsPage),
})

// Legacy /clusters redirects to /deployments
const clustersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/clusters',
  beforeLoad: () => {
    throw redirect({ to: '/deployments' })
  },
})

const deploymentNamespaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/deployments/$namespace',
  component: withErrorBoundary(DeploymentNamespacePage),
})

const deploymentDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/deployments/$namespace/$id',
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/deployments/$namespace',
      params: { namespace: params.namespace },
    })
  },
})

const deploymentTasksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/deploy-tasks',
  beforeLoad: () => {
    throw redirect({ to: '/deployments' })
  },
})

const deploymentTaskRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/deploy-tasks/$taskId',
  component: withErrorBoundary(DeploymentTaskPage),
})

// ── Configuration ─────────────────────────────────────────────────────────────

// Configuration redirects to My Templates (merged)
const configRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/config',
  beforeLoad: () => {
    throw redirect({ to: '/my-templates' })
  },
})

const validateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/validate',
  component: withErrorBoundary(ValidatePage),
})

// ── Monitoring ────────────────────────────────────────────────────────────────

const monitoringRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/monitoring',
  component: withErrorBoundary(MonitoringPage),
})

// Doctor redirects to Overview (merged)
const doctorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/doctor',
  beforeLoad: () => {
    throw redirect({ to: '/' })
  },
})

// Legacy /templates redirects to /store
const templatesRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/templates',
  beforeLoad: () => {
    throw redirect({ to: '/store' })
  },
})

// ── Operations ────────────────────────────────────────────────────────────────

// Activity redirects to Monitoring (merged)
const activityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/activity',
  beforeLoad: () => {
    throw redirect({ to: '/monitoring' })
  },
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: withErrorBoundary(SettingsPage),
})

const secretsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/secrets',
  component: withErrorBoundary(SecretsPage),
})

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

// ── Router ────────────────────────────────────────────────────────────────────

const routeTree = rootRoute.addChildren([
  indexRoute,
  storeRoute,
  storeDetailRoute,
  deployWizardRoute,
  deploymentsRoute,
  clustersRoute,
  deploymentNamespaceRoute,
  deploymentDetailRoute,
  deploymentTasksRoute,
  deploymentTaskRoute,
  configRoute,
  validateRoute,
  monitoringRoute,
  doctorRoute,
  templatesRedirectRoute,
  activityRoute,
  settingsRoute,
  secretsRoute,
  myTemplatesRoute,
  myTemplateDetailRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
