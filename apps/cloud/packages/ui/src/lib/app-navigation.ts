import { createContext, useContext } from 'react'

export type AppNavigationTarget =
  | { kind: 'settings-wallet' }
  | { kind: 'server'; serverSlug: string }

export type AppNavigate = (target: AppNavigationTarget) => void

export const AppNavigationContext = createContext<AppNavigate | null>(null)

export function useAppNavigation() {
  return useContext(AppNavigationContext)
}
