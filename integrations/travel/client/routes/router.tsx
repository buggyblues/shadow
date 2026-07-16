import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Navigate,
  Outlet,
  useRouterState,
} from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { type TravelNavId, TravelShell } from '../layouts/travel-shell.js'
import { travelPageLoaders } from './page-loaders.js'

const JourneyPage = lazyRouteComponent(travelPageLoaders.workspace, 'JourneyPage')
const FinancePage = lazyRouteComponent(travelPageLoaders.workspace, 'FinancePage')
const TeamPage = lazyRouteComponent(travelPageLoaders.workspace, 'TeamPage')
const PlacesPage = lazyRouteComponent(travelPageLoaders.places, 'PlacesPage')
const TripManagerPage = lazyRouteComponent(travelPageLoaders.tripManager, 'TripManagerPage')

export function TravelRouteFallback() {
  const { t } = useTranslation()
  return (
    <div aria-busy="true" className="relative min-h-0 flex-1 overflow-hidden p-3 sm:p-4 xl:p-5">
      <div className="grid h-full min-h-0 gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="animate-pulse rounded-[22px] bg-white/80 p-4">
          <div className="h-10 w-44 rounded-xl bg-paper" />
          <div className="mt-4 grid gap-2">
            {[0, 1, 2, 3].map((item) => (
              <div className="h-16 rounded-[16px] bg-paper/80" key={item} />
            ))}
          </div>
        </div>
        <div className="hidden animate-pulse rounded-[22px] bg-white/65 p-4 xl:block">
          <div className="h-32 rounded-[16px] bg-paper/80" />
          <div className="mt-3 h-24 rounded-[16px] bg-paper/70" />
        </div>
      </div>
      <div className="absolute inset-0 grid place-items-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-line/70 bg-white/96 px-4 py-2 font-bold text-[12px] text-ink shadow-[0_14px_40px_rgba(34,55,48,0.14)] backdrop-blur">
          <span className="size-4 animate-spin rounded-full border-2 border-sage border-t-olive" />
          {t('common.loading')}
        </div>
      </div>
    </div>
  )
}

function routePath(pathname: string) {
  return pathname.replace(/^\/shadow\/server(?=\/|$)/, '') || '/'
}

function activeNavForPath(pathname: string): TravelNavId {
  const path = routePath(pathname)
  if (path === '/map') return 'places'
  if (path === '/expenses' || path === '/budget') return 'expenses'
  if (path === '/share' || path === '/packing') return 'share'
  return 'trips'
}

function TravelAppLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const path = routePath(pathname)
  return (
    <TravelShell
      activeNav={activeNavForPath(pathname)}
      context={path === '/manage-trips' ? 'management' : 'trip'}
    >
      <Outlet />
    </TravelShell>
  )
}

const rootRoute = createRootRoute({
  component: TravelAppLayout,
  notFoundComponent: () => <Navigate replace to="/" />,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: JourneyPage,
})

const tripsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/trips',
  component: JourneyPage,
})

const mapRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/map',
  component: PlacesPage,
})

const manageTripsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/manage-trips',
  component: TripManagerPage,
})

const flashRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/flash',
  component: JourneyPage,
})

const transportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/transport',
  component: JourneyPage,
})

const bookingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/bookings',
  component: JourneyPage,
})

const budgetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/budget',
  component: FinancePage,
})

const expensesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/expenses',
  component: FinancePage,
})

const packingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/packing',
  component: TeamPage,
})

const shareRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/share',
  component: TeamPage,
})

export const router = createRouter({
  basepath:
    typeof window !== 'undefined' && window.location.pathname.startsWith('/shadow/server')
      ? '/shadow/server'
      : '/',
  defaultPendingComponent: TravelRouteFallback,
  defaultPendingMinMs: 180,
  defaultPendingMs: 0,
  defaultPreload: 'intent',
  defaultPreloadDelay: 40,
  routeTree: rootRoute.addChildren([
    indexRoute,
    tripsRoute,
    mapRoute,
    manageTripsRoute,
    flashRoute,
    transportRoute,
    bookingsRoute,
    budgetRoute,
    expensesRoute,
    packingRoute,
    shareRoute,
  ]),
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
