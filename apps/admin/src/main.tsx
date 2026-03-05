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

/* ── Routes ──────────────────────────────────────────── */

const rootRoute = createRootRoute({
  component: () => <Outlet />,
})

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DashboardPage,
})

const routeTree = rootRoute.addChildren([dashboardRoute])

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
