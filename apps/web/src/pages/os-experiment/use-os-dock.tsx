import type { TFunction } from 'i18next'
import { EyeOff, Pin } from 'lucide-react'
import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ContextMenuGroup } from '../../components/common/context-menu'
import { OsBuiltinAppIcon } from './builtin-icons'
import { AppIcon } from './components'
import type { OsDockAppStackEntry } from './dock-stacks'
import type { OsBuiltinAppKey, OsWindowState, ServerAppIntegration } from './types'

type DockIconVisibility = 'hidden' | 'pinned'
type DockIconState = Record<string, DockIconVisibility>
type BuiltinDockApp = {
  key: OsBuiltinAppKey
  label: string
  icon: ReactNode
}

const OS_DOCK_ICON_STATE_STORAGE_KEY = 'shadow:os-dock-icon-state:v1'
const DEFAULT_HIDDEN_DOCK_ICON_KEYS = new Set(['builtin:shop'])

export function builtinDockIconKey(key: OsBuiltinAppKey) {
  return `builtin:${key}`
}

export function appDockIconKey(appKey: string) {
  return `app:${appKey}`
}

function readDockIconState(): DockIconState {
  if (typeof window === 'undefined') return {}
  try {
    const parsed = JSON.parse(window.localStorage.getItem(OS_DOCK_ICON_STATE_STORAGE_KEY) ?? '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, DockIconVisibility] =>
          typeof entry[0] === 'string' && (entry[1] === 'hidden' || entry[1] === 'pinned'),
      ),
    )
  } catch {
    return {}
  }
}

function isDockIconHidden(iconKey: string, state: DockIconState) {
  const explicit = state[iconKey]
  if (explicit) return explicit === 'hidden'
  return DEFAULT_HIDDEN_DOCK_ICON_KEYS.has(iconKey)
}

function dockStackEntriesEqual(left: OsDockAppStackEntry[], right: OsDockAppStackEntry[]) {
  if (left.length !== right.length) return false
  return left.every((entry, index) => {
    const candidate = right[index]
    return (
      candidate &&
      entry.id === candidate.id &&
      entry.label === candidate.label &&
      entry.signature === candidate.signature &&
      entry.active === candidate.active &&
      entry.minimized === candidate.minimized
    )
  })
}

function useStableDockAppStackEntries(entries: OsDockAppStackEntry[]) {
  const ref = useRef(entries)
  if (!dockStackEntriesEqual(ref.current, entries)) {
    ref.current = entries
  }
  return ref.current
}

export function useOsDockState({
  apps,
  builtinDockApps,
  canManageDesktopLayout,
  focusedWindowId,
  t,
  windows,
  onFocusWindow,
  onOpenAppWindow,
  onOpenBuiltinWindow,
  onPinBuiltinAppToDesktop,
  onPinServerAppToDesktop,
}: {
  apps: ServerAppIntegration[]
  builtinDockApps: BuiltinDockApp[]
  canManageDesktopLayout: boolean
  focusedWindowId: string | null
  t: TFunction
  windows: OsWindowState[]
  onFocusWindow: (id: string) => void
  onOpenAppWindow: (app: ServerAppIntegration) => void
  onOpenBuiltinWindow: (key: OsBuiltinAppKey) => void
  onPinBuiltinAppToDesktop: (key: OsBuiltinAppKey, title: string) => void
  onPinServerAppToDesktop: (app: ServerAppIntegration) => void
}) {
  const [dockIconState, setDockIconState] = useState<DockIconState>(() => readDockIconState())
  const [dockIconContextMenu, setDockIconContextMenu] = useState<{
    x: number
    y: number
    target: { iconKey: string; hidden: boolean }
  } | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(OS_DOCK_ICON_STATE_STORAGE_KEY, JSON.stringify(dockIconState))
  }, [dockIconState])

  const setDockIconVisibility = useCallback((iconKey: string, visibility: DockIconVisibility) => {
    setDockIconState((current) => ({ ...current, [iconKey]: visibility }))
  }, [])

  const openDockIconContextMenu = useCallback(
    (event: ReactMouseEvent, iconKey: string) => {
      event.preventDefault()
      event.stopPropagation()
      setDockIconContextMenu({
        x: event.clientX,
        y: event.clientY,
        target: {
          iconKey,
          hidden: isDockIconHidden(iconKey, dockIconState),
        },
      })
    },
    [dockIconState],
  )

  const dockApps = useMemo(() => apps.slice(0, 10), [apps])
  const visibleBuiltinDockApps = useMemo(
    () =>
      builtinDockApps.filter(
        (app) => !isDockIconHidden(builtinDockIconKey(app.key), dockIconState),
      ),
    [builtinDockApps, dockIconState],
  )
  const visibleDockApps = useMemo(
    () => dockApps.filter((app) => !isDockIconHidden(appDockIconKey(app.appKey), dockIconState)),
    [dockApps, dockIconState],
  )
  const builtinWindowByKey = useMemo(
    () =>
      new Map(
        windows
          .filter((item) => item.kind === 'builtin' && item.builtinKey)
          .map((item) => [item.builtinKey, item]),
      ),
    [windows],
  )
  const appWindowByKey = useMemo(
    () =>
      new Map(
        windows
          .filter((item) => item.kind === 'app' && item.appKey)
          .map((item) => [item.appKey, item]),
      ),
    [windows],
  )
  const dockAppStackEntries = useMemo<OsDockAppStackEntry[]>(() => {
    const builtinKeys = new Set<OsBuiltinAppKey>()
    const entries: OsDockAppStackEntry[] = builtinDockApps.map((app) => {
      builtinKeys.add(app.key)
      const window = builtinWindowByKey.get(app.key)
      return {
        id: builtinDockIconKey(app.key),
        label: app.label,
        icon: app.icon,
        signature: builtinDockIconKey(app.key),
        active: Boolean(window && !window.minimized),
        minimized: window?.minimized,
        onSelect: () => onOpenBuiltinWindow(app.key),
        onContextMenu: (event) => openDockIconContextMenu(event, builtinDockIconKey(app.key)),
      }
    })

    const dockAppKeys = new Set<string>()
    for (const app of dockApps) {
      dockAppKeys.add(app.appKey)
      const window = appWindowByKey.get(app.appKey)
      entries.push({
        id: appDockIconKey(app.appKey),
        label: app.name,
        icon: <AppIcon iconUrl={app.iconUrl} className="h-full w-full rounded-lg" />,
        signature: `${appDockIconKey(app.appKey)}:${app.id}:${app.iconUrl ?? ''}`,
        active: Boolean(window && !window.minimized),
        minimized: window?.minimized,
        onSelect: () => onOpenAppWindow(app),
        onContextMenu: (event) => openDockIconContextMenu(event, appDockIconKey(app.appKey)),
      })
    }

    for (const window of windows) {
      if (window.kind === 'builtin' && window.builtinKey && !builtinKeys.has(window.builtinKey)) {
        entries.push({
          id: `window:${window.id}`,
          label: window.title,
          icon: <OsBuiltinAppIcon appKey={window.builtinKey} />,
          signature: `window:${window.id}:${window.builtinKey ?? ''}`,
          active: window.id === focusedWindowId && !window.minimized,
          minimized: window.minimized,
          onSelect: () => onFocusWindow(window.id),
        })
      }
      if (window.kind === 'app' && window.appKey && !dockAppKeys.has(window.appKey)) {
        entries.push({
          id: `window:${window.id}`,
          label: window.title,
          icon: <AppIcon iconUrl={window.iconUrl} className="h-full w-full rounded-lg" />,
          signature: `window:${window.id}:${window.iconUrl ?? ''}`,
          active: window.id === focusedWindowId && !window.minimized,
          minimized: window.minimized,
          onSelect: () => onFocusWindow(window.id),
        })
      }
    }

    return entries
  }, [
    appWindowByKey,
    builtinDockApps,
    builtinWindowByKey,
    dockApps,
    focusedWindowId,
    onFocusWindow,
    onOpenAppWindow,
    onOpenBuiltinWindow,
    openDockIconContextMenu,
    windows,
  ])
  const stableDockAppStackEntries = useStableDockAppStackEntries(dockAppStackEntries)
  const dockIconContextMenuGroups = useMemo<ContextMenuGroup[]>(
    () => [
      {
        title: t('os.dockOptions'),
        items: [
          ...(canManageDesktopLayout
            ? [
                {
                  icon: Pin,
                  label: t('os.pinAppToDesktop'),
                  onClick: () => {
                    const iconKey = dockIconContextMenu?.target.iconKey
                    if (!iconKey) return
                    if (iconKey.startsWith('builtin:')) {
                      const key = iconKey.slice('builtin:'.length) as OsBuiltinAppKey
                      const app = builtinDockApps.find((candidate) => candidate.key === key)
                      if (app) onPinBuiltinAppToDesktop(app.key, app.label)
                      return
                    }
                    if (iconKey.startsWith('app:')) {
                      const appKey = iconKey.slice('app:'.length)
                      const app = apps.find((candidate) => candidate.appKey === appKey)
                      if (app) onPinServerAppToDesktop(app)
                    }
                  },
                },
              ]
            : []),
          {
            icon: dockIconContextMenu?.target.hidden ? Pin : EyeOff,
            label: dockIconContextMenu?.target.hidden ? t('os.pinDockIcon') : t('os.hideDockIcon'),
            onClick: () => {
              const iconKey = dockIconContextMenu?.target.iconKey
              if (!iconKey) return
              setDockIconVisibility(
                iconKey,
                dockIconContextMenu.target.hidden ? 'pinned' : 'hidden',
              )
            },
          },
        ],
      },
    ],
    [
      apps,
      builtinDockApps,
      canManageDesktopLayout,
      dockIconContextMenu,
      onPinBuiltinAppToDesktop,
      onPinServerAppToDesktop,
      setDockIconVisibility,
      t,
    ],
  )

  return {
    dockAppStackEntries: stableDockAppStackEntries,
    dockIconContextMenu,
    dockIconContextMenuGroups,
    openDockIconContextMenu,
    visibleBuiltinDockApps,
    visibleDockApps,
    setDockIconContextMenu,
  }
}
