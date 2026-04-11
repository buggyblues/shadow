import { create } from 'zustand'
import { DEFAULT_BACKGROUND_IMAGE, normalizeBackgroundImageUrl } from '../lib/backgrounds'

type MobileView = 'servers' | 'channels' | 'chat'
export type ThemeMode = 'dark' | 'light' | 'system'

const BACKGROUND_NONE_SENTINEL = '__none__'

interface UIState {
  /** Current mobile navigation view */
  mobileView: MobileView
  /** Whether the mobile server sidebar overlay is open */
  mobileServerSidebarOpen: boolean
  /** Whether the mobile member list overlay is open */
  mobileMemberListOpen: boolean
  /** Whether the file preview panel is open (hides member list on desktop) */
  filePreviewOpen: boolean
  /** Theme mode: dark, light, or system */
  theme: ThemeMode
  /** Custom background image URL */
  backgroundImage: string | null
  /** Whether background movement on mouse move is enabled */
  enableBackgroundMovement: boolean
  /** Pending action for cross-component task triggers (e.g. 'create-server', 'create-buddy') */
  pendingAction: string | null

  setMobileView: (view: MobileView) => void
  openMobileServerSidebar: () => void
  closeMobileServerSidebar: () => void
  toggleMobileMemberList: () => void
  closeMobileMemberList: () => void
  setFilePreviewOpen: (open: boolean) => void
  setTheme: (theme: ThemeMode) => void
  setBackgroundImage: (url: string | null) => void
  setEnableBackgroundMovement: (enabled: boolean) => void
  setPendingAction: (action: string | null) => void
}

/** Apply theme class to document root and persist to localStorage */
function applyTheme(theme: ThemeMode) {
  const root = document.documentElement
  let effective: 'dark' | 'light'
  if (theme === 'system') {
    effective = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } else {
    effective = theme
  }
  root.classList.toggle('light', effective === 'light')
  root.classList.toggle('dark', effective === 'dark')
  localStorage.setItem('shadow-theme', theme)
}

function persistBackgroundImage(url: string | null) {
  localStorage.setItem('shadow-bg-image', url ?? BACKGROUND_NONE_SENTINEL)
}

function readSavedBackgroundImage() {
  const raw = localStorage.getItem('shadow-bg-image')
  if (raw === null) return DEFAULT_BACKGROUND_IMAGE
  if (raw === BACKGROUND_NONE_SENTINEL) return null
  return normalizeBackgroundImageUrl(raw) ?? DEFAULT_BACKGROUND_IMAGE
}

const savedTheme = (localStorage.getItem('shadow-theme') as ThemeMode) || 'dark'
const savedBgImage = readSavedBackgroundImage()
const savedBgMovement = localStorage.getItem('shadow-bg-movement') !== 'false'

export const useUIStore = create<UIState>((set) => ({
  mobileView: 'servers',
  mobileServerSidebarOpen: false,
  mobileMemberListOpen: false,
  filePreviewOpen: false,
  theme: savedTheme,
  backgroundImage: savedBgImage,
  enableBackgroundMovement: savedBgMovement,
  pendingAction: null,

  setMobileView: (view) => set({ mobileView: view, mobileMemberListOpen: false }),
  openMobileServerSidebar: () => set({ mobileServerSidebarOpen: true }),
  closeMobileServerSidebar: () => set({ mobileServerSidebarOpen: false }),
  toggleMobileMemberList: () => set((s) => ({ mobileMemberListOpen: !s.mobileMemberListOpen })),
  closeMobileMemberList: () => set({ mobileMemberListOpen: false }),
  setFilePreviewOpen: (open) => set({ filePreviewOpen: open }),
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
