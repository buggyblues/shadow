/**
 * web-saas entry — mounts the Shadow Cloud SaaS interface.
 * Decision 1.D: embedded as /cloud/* route inside apps/web (same SPA).
 * This file is the React subtree root; apps/web imports `CloudSaasApp`
 * and renders it inside a route component.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import '@shadowob/cloud-ui/i18n'
import { setActivityRecordFn } from '@shadowob/cloud-ui/stores/app'
import { router } from './router'
import '@shadowob/cloud-ui/styles/globals.css'

// Suppress local /api/activity calls — SaaS server records activity internally
setActivityRecordFn(() => Promise.resolve({ success: true }))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
})

/**
 * CloudSaasApp — exported for use by apps/web as a lazy-loaded route component.
 *
 * Theme + i18n are intentionally NOT re-initialized here: the host apps/web
 * already owns the document root's theme class and the global i18next
 * instance. Cloud-UI's i18n bundle attaches to the existing i18next on load
 * (see packages/ui/src/i18n/index.ts).
 *
 * Usage in apps/web:
 *   const CloudSaasApp = lazy(() => import('@shadowob/cloud-ui/web-saas'))
 *   // render at /cloud route
 */
export function CloudSaasApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
