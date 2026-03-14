import { create } from 'zustand'

type MobileView = 'servers' | 'channels' | 'chat'
export type ThemeMode = 'dark' | 'light' | 'system'

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
  /** Pending action for cross-component task triggers (e.g. 'create-server', 'create-buddy') */
  pendingAction: string | null

  setMobileView: (view: MobileView) => void
  openMobileServerSidebar: () => void
  closeMobileServerSidebar: () => void
  toggleMobileMemberList: () => void
  closeMobileMemberList: () => void
  setFilePreviewOpen: (open: boolean) => void
  setTheme: (theme: ThemeMode) => void
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

const savedTheme = (localStorage.getItem('shadow-theme') as ThemeMode) || 'dark'

export const useUIStore = create<UIState>((set) => ({
  mobileView: 'servers',
  mobileServerSidebarOpen: false,
  mobileMemberListOpen: false,
  filePreviewOpen: false,
  theme: savedTheme,
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
