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
import { ConfirmDialogProvider } from './components/confirm-dialog'
import { DashboardPage } from './pages/dashboard'

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

// Redirect /config and /templates to root (everything is now in the dashboard)
const redirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/$',
  component: () => {
    window.location.replace('/')
    return null
  },
})

const routeTree = rootRoute.addChildren([dashboardRoute, redirectRoute])

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
