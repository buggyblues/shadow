/** @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render } from '@testing-library/react'
import type React from 'react'
import { vi } from 'vitest'

export const fetchApiMock = vi.fn()
export const showToastMock = vi.fn()

;(globalThis as { __SHADOW_FETCH_API_MOCK__?: typeof fetchApiMock }).__SHADOW_FETCH_API_MOCK__ = (
  path: string,
  options?: RequestInit,
) => fetchApiMock(path, options)
;(globalThis as { __SHADOW_SHOW_TOAST_MOCK__?: typeof showToastMock }).__SHADOW_SHOW_TOAST_MOCK__ =
  (message: string, type?: 'error' | 'success' | 'info') => showToastMock(message, type)

vi.mock('../../../src/lib/api', () => ({
  fetchApi: (path: string, options?: RequestInit) => fetchApiMock(path, options),
}))

vi.mock('../../../src/lib/toast', () => ({
  showToast: (message: string, type?: 'error' | 'success' | 'info') => showToastMock(message, type),
}))

export function renderWithQuery(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <>{ui}</>,
  })
  const routeTree = rootRoute.addChildren([indexRoute])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

export const serverId = '550e8400-e29b-41d4-a716-446655440000'

export function resetMocks() {
  fetchApiMock.mockReset()
  showToastMock.mockReset()
}
