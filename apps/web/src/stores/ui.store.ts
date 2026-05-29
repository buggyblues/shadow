import {
  applyThemePreference,
  persistThemePreference,
  readThemePreference,
  type ShadowThemePreference,
} from '@shadowob/views/preferences'
import { create } from 'zustand'
import {
  DEFAULT_BACKGROUND_IMAGE,
  getBackgroundOptionIdByUrl,
  normalizeBackgroundImageUrl,
  resolveBackgroundImageUrl,
} from '../lib/backgrounds'

type MobileView = 'servers' | 'channels' | 'chat'
export type ThemeMode = ShadowThemePreference

const BACKGROUND_NONE_SENTINEL = 'none'
const LEGACY_BACKGROUND_NONE_SENTINEL = '__none__'

interface UIState {
  /** Current mobile navigation view */
  mobileView: MobileView
  /** Whether the mobile server sidebar overlay is open */
  mobileServerSidebarOpen: boolean
  /** Whether the mobile member list overlay is open */
  mobileMemberListOpen: boolean
  /** Whether the file preview panel is open (hides member list on desktop) */
  filePreviewOpen: boolean
  /** Whether a right-side auxiliary panel is open (file preview, OAuth preview, thread, etc.) */
  rightPanelOpen: boolean
  /** Theme mode: dark, light, or system */
  theme: ThemeMode
  /** Custom background image URL */
  backgroundImage: string | null
  /** Whether background movement on mouse move is enabled */
  enableBackgroundMovement: boolean
  /** Pending action for cross-component task triggers (e.g. 'create-server', 'create-buddy') */
  pendingAction: string | null
  /** Channel shown beside a server app in Copilot mode */
  copilotChannel: {
    serverSlug: string
    channelId: string
  } | null

  setMobileView: (view: MobileView) => void
  openMobileServerSidebar: () => void
  closeMobileServerSidebar: () => void
  toggleMobileMemberList: () => void
  closeMobileMemberList: () => void
  setFilePreviewOpen: (open: boolean) => void
  setRightPanelOpen: (open: boolean) => void
  setTheme: (theme: ThemeMode) => void
  setBackgroundImage: (url: string | null) => void
  setEnableBackgroundMovement: (enabled: boolean) => void
  setPendingAction: (action: string | null) => void
  openCopilotChannel: (serverSlug: string, channelId: string) => void
  closeCopilotChannel: () => void
}

/** Apply theme class to document root and persist to localStorage */
function applyTheme(theme: ThemeMode) {
  applyThemePreference(theme)
  persistThemePreference(theme)
}

function persistBackgroundImage(url: string | null) {
  const optionId = getBackgroundOptionIdByUrl(url)
  localStorage.setItem('shadow-bg-image', optionId ?? BACKGROUND_NONE_SENTINEL)
}

function readSavedBackgroundImage() {
  const raw = localStorage.getItem('shadow-bg-image')
  if (raw === null) return DEFAULT_BACKGROUND_IMAGE
  if (raw === BACKGROUND_NONE_SENTINEL || raw === LEGACY_BACKGROUND_NONE_SENTINEL) return null
  return (
    resolveBackgroundImageUrl(raw) ?? normalizeBackgroundImageUrl(raw) ?? DEFAULT_BACKGROUND_IMAGE
  )
}

const savedTheme = readThemePreference()
const savedBgImage = readSavedBackgroundImage()
const savedBgMovement = localStorage.getItem('shadow-bg-movement') !== 'false'

export const useUIStore = create<UIState>((set) => ({
  mobileView: 'servers',
  mobileServerSidebarOpen: false,
  mobileMemberListOpen: false,
  filePreviewOpen: false,
  rightPanelOpen: false,
  theme: savedTheme,
  backgroundImage: savedBgImage,
  enableBackgroundMovement: savedBgMovement,
  pendingAction: null,
  copilotChannel: null,

  setMobileView: (view) => set({ mobileView: view, mobileMemberListOpen: false }),
  openMobileServerSidebar: () => set({ mobileServerSidebarOpen: true }),
  closeMobileServerSidebar: () => set({ mobileServerSidebarOpen: false }),
  toggleMobileMemberList: () =>
    set((s) => ({
      mobileMemberListOpen: !s.mobileMemberListOpen,
      rightPanelOpen: s.mobileMemberListOpen ? s.rightPanelOpen : false,
    })),
  closeMobileMemberList: () => set({ mobileMemberListOpen: false }),
  setFilePreviewOpen: (open) => set({ filePreviewOpen: open, rightPanelOpen: open }),
  setRightPanelOpen: (open) =>
    set(open ? { rightPanelOpen: true, mobileMemberListOpen: false } : { rightPanelOpen: false }),
  setTheme: (theme) => {
    applyTheme(theme)
    set({ theme })
  },
  setBackgroundImage: (url) => {
    const normalizedUrl = normalizeBackgroundImageUrl(url)
    persistBackgroundImage(normalizedUrl)
    set({ backgroundImage: normalizedUrl })
  },
  setEnableBackgroundMovement: (enabled) => {
    localStorage.setItem('shadow-bg-movement', String(enabled))
    set({ enableBackgroundMovement: enabled })
  },
  setPendingAction: (action) => set({ pendingAction: action }),
  openCopilotChannel: (serverSlug, channelId) =>
    set({
      copilotChannel: { serverSlug, channelId },
      mobileView: 'chat',
      mobileMemberListOpen: false,
      mobileServerSidebarOpen: false,
    }),
  closeCopilotChannel: () =>
    set({
      copilotChannel: null,
      mobileMemberListOpen: false,
    }),
}))

// Apply theme on load
applyTheme(savedTheme)

// Listen for system theme changes when in "system" mode
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  const currentTheme = useUIStore.getState().theme
  if (currentTheme === 'system') {
    applyTheme('system')
  }
})
