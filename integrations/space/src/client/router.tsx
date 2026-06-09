import { shadowServerAppMountedPath } from '@shadowob/sdk/bridge'
import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router'
import { AppShell } from './components/AppShell.js'
import { ArtworkManagePage } from './pages/ArtworkManagePage.js'
import { FavoritesPage } from './pages/FavoritesPage.js'
import { HomePage } from './pages/HomePage.js'
import { PeoplePage } from './pages/PeoplePage.js'
import { PreviewPage } from './pages/PreviewPage.js'
import { ProfilePage } from './pages/ProfilePage.js'
import { UploadPage } from './pages/UploadPage.js'

const rootRoute = createRootRoute({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === 'string' ? search.q : '',
    tag: typeof search.tag === 'string' ? search.tag : '',
    visibility:
      search.visibility === 'public' || search.visibility === 'private' ? search.visibility : 'all',
  }),
  component: HomePage,
})

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profile',
  component: ProfilePage,
})

const uploadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/upload',
  component: UploadPage,
})

const favoritesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/favorites',
  component: FavoritesPage,
})

const peopleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/people',
  component: PeoplePage,
})

const previewSearch = (search: Record<string, unknown>) => ({
  toolbar: search.toolbar === '1' || search.toolbar === 1 ? 1 : undefined,
})

const previewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/preview/$artworkId',
  validateSearch: previewSearch,
  component: PreviewPage,
})

const artworkPreviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/artworks/$artworkId',
  validateSearch: previewSearch,
  component: PreviewPage,
})

const manageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/manage/$artworkId',
  component: ArtworkManagePage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  profileRoute,
  uploadRoute,
  favoritesRoute,
  peopleRoute,
  previewRoute,
  artworkPreviewRoute,
  manageRoute,
])

export const router = createRouter({
  routeTree,
  basepath: shadowServerAppMountedPath('/shadow/server'),
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
