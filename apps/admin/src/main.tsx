import './styles/globals.css'
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { DashboardPage } from './pages/dashboard'
import { ConfigManagementPage } from './pages/config-management'
import { ConfirmDialogProvider } from './components/confirm-dialog'

/* ── Routes ──────────────────────────────────────────── */

const rootRoute = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <ConfirmDialogProvider />
    </>
  ),
})

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DashboardPage,
})

const configRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/config',
  component: ConfigManagementPage,
})

const routeTree = rootRoute.addChildren([dashboardRoute, configRoute])

const router = createRouter({ routeTree })

/* ── Mount ───────────────────────────────────────────── */

const root = document.getElementById('root')
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <RouterProvider router={router} />
    </React.StrictMode>,
  )
}
