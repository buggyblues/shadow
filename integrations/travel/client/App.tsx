import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { TravelAuthGate } from './components/auth-gate.js'
import { router } from './routes/router.js'
import { TravelPreferencesProvider } from './store/preferences.js'

const queryClient = new QueryClient()

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TravelPreferencesProvider>
        <TravelAuthGate>
          <RouterProvider router={router} />
        </TravelAuthGate>
      </TravelPreferencesProvider>
    </QueryClientProvider>
  )
}
