export type DesktopSettingsTab =
  | 'general'
  | 'connector'
  | 'shortcuts'
  | 'voice'
  | 'pet'
  | 'network'
  | 'about'

export interface DesktopSettingsBridge {
  isDesktop?: boolean
  showSettings?: (tab?: DesktopSettingsTab) => Promise<void>
}

export function getDesktopSettingsBridge(): DesktopSettingsBridge | null {
  if (typeof window === 'undefined') return null
  const api = (window as Window & { desktopAPI?: DesktopSettingsBridge }).desktopAPI
  return api?.isDesktop && api.showSettings ? api : null
}
