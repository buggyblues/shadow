const workspacePage = () => import('../features/plan/components/workspace-page.js')
const placesPage = () => import('../features/plan/components/places-page.js')
const tripManagerPage = () => import('../features/plan/components/trip-manager-page.js')

export const travelPageLoaders = {
  places: placesPage,
  tripManager: tripManagerPage,
  workspace: workspacePage,
}
