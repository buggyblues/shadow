/**
 * web-saas entry — mounts the Shadow Cloud SaaS interface.
 * Decision 1.D: embedded as /cloud/* route inside apps/web (same SPA).
 * This file is the React subtree root; apps/web imports `CloudSaasApp`
 * and renders it inside a route component.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { useEffect } from 'react'
import '@shadowob/cloud-ui/i18n'
import { setActivityRecordFn } from '@shadowob/cloud-ui/stores/app'
import { applyTheme, useThemeStore } from '@shadowob/cloud-ui/stores/theme'
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

function ThemeSync() {
  const theme = useThemeStore((s) => s.theme)
  useEffect(() => {
    applyTheme(theme)
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme('system')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])
  return null
}

/**
 * CloudSaasApp — exported for use by apps/web as a lazy-loaded route component.
 *
 * Usage in apps/web:
 *   const CloudSaasApp = lazy(() => import('@shadowob/cloud-ui/web-saas'))
 *   // render at /cloud route
 */
export function CloudSaasApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeSync />
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
