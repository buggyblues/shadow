import type {
  BuddyInboxEntry,
  ChannelMeta,
  LaunchContext,
  OsDesktopFile,
  OsWindowKind,
  OsWindowState,
  ServerEntry,
} from './types'

export const OS_STALE_MS = 5 * 60 * 1000
export const OS_GC_MS = 30 * 60 * 1000
export const DESKTOP_EDGE_PADDING = 0
export const OS_TOP_BAR_HEIGHT = 40
export const DOCK_RESERVED_HEIGHT = 56
export const MIN_WINDOW_WIDTH = 420
export const MIN_WINDOW_HEIGHT = 320
const OS_SNAP_THRESHOLD = 48

export function serverRouteKey(server?: ServerEntry['server'] | null) {
  return server?.slug ?? server?.id ?? ''
}

export function channelSort(left: ChannelMeta, right: ChannelMeta) {
  return (left.position ?? 0) - (right.position ?? 0) || left.name.localeCompare(right.name)
}

export function windowKey(kind: OsWindowKind, id: string) {
  return `${kind}:${id}`
}

const OS_WINDOW_STORAGE_KEY = 'shadow:os-windows:v1'
const OS_DESKTOP_STORAGE_KEY = 'shadow:os-desktop-files:v1'
export const OS_WORKSPACE_NODE_DRAG_TYPE = 'application/x-shadow-workspace-node'
export const OS_SNAP_DWELL_MS = 120

interface StoredOsServerWindowState {
  windows: OsWindowState[]
  focusedWindowId: string | null
}

function readWindowStorage() {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(OS_WINDOW_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, StoredOsServerWindowState>) : {}
  } catch {
    return {}
  }
}

function readDesktopStorage() {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(OS_DESKTOP_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, OsDesktopFile[]>) : {}
  } catch {
    return {}
  }
}

export function loadOsDesktopFiles(serverId: string): OsDesktopFile[] {
  const files = readDesktopStorage()[serverId]
  return Array.isArray(files) ? files : []
}

export function saveOsDesktopFiles(serverId: string, files: OsDesktopFile[]) {
  if (typeof window === 'undefined') return
  try {
    const storage = readDesktopStorage()
    storage[serverId] = files
    window.localStorage.setItem(OS_DESKTOP_STORAGE_KEY, JSON.stringify(storage))
  } catch {
    // Best-effort desktop restoration; ignore quota or serialization failures.
  }
}

export function loadOsServerWindowState(serverId: string): StoredOsServerWindowState | null {
  const state = readWindowStorage()[serverId]
  return state && Array.isArray(state.windows) ? state : null
}

export function saveOsServerWindowState(serverId: string, state: StoredOsServerWindowState) {
  if (typeof window === 'undefined') return
  try {
    const storage = readWindowStorage()
    storage[serverId] = state
    window.localStorage.setItem(OS_WINDOW_STORAGE_KEY, JSON.stringify(storage))
  } catch {
    // Best-effort UI restoration; ignore quota or serialization failures.
  }
}

export function withLaunchParams(entry: string, launch: LaunchContext | undefined) {
  if (!launch?.launchToken) return entry
  const url = new URL(entry, window.location.origin)
  url.searchParams.set('shadow_launch', launch.launchToken)
  if (launch.eventStreamPath) {
    url.searchParams.set(
      'shadow_event_stream',
      new URL(launch.eventStreamPath, window.location.origin).toString(),
    )
  }
  return url.toString()
}

export function clampWindowPosition(next: Pick<OsWindowState, 'x' | 'y' | 'width' | 'height'>) {
  if (typeof window === 'undefined') return next
  const maxWidth = Math.max(MIN_WINDOW_WIDTH, window.innerWidth - DESKTOP_EDGE_PADDING * 2)
  const maxHeight = Math.max(
    MIN_WINDOW_HEIGHT,
    window.innerHeight - OS_TOP_BAR_HEIGHT - DOCK_RESERVED_HEIGHT - DESKTOP_EDGE_PADDING,
  )
  const width = Math.min(Math.max(MIN_WINDOW_WIDTH, next.width), maxWidth)
  const height = Math.min(Math.max(MIN_WINDOW_HEIGHT, next.height), maxHeight)
  const maxX = Math.max(DESKTOP_EDGE_PADDING, window.innerWidth - width - DESKTOP_EDGE_PADDING)
  const maxY = Math.max(OS_TOP_BAR_HEIGHT, window.innerHeight - OS_TOP_BAR_HEIGHT)
  return {
    width,
    height,
    x: Math.min(Math.max(DESKTOP_EDGE_PADDING, next.x), maxX),
    y: Math.min(Math.max(OS_TOP_BAR_HEIGHT, next.y), maxY),
  }
}

function osWorkArea() {
  if (typeof window === 'undefined') {
    return {
      x: DESKTOP_EDGE_PADDING,
      y: OS_TOP_BAR_HEIGHT,
      width: MIN_WINDOW_WIDTH,
      height: MIN_WINDOW_HEIGHT,
    }
  }
  return {
    x: DESKTOP_EDGE_PADDING,
    y: OS_TOP_BAR_HEIGHT,
    width: Math.max(MIN_WINDOW_WIDTH, window.innerWidth - DESKTOP_EDGE_PADDING * 2),
    height: Math.max(
      MIN_WINDOW_HEIGHT,
      window.innerHeight - OS_TOP_BAR_HEIGHT - DOCK_RESERVED_HEIGHT - DESKTOP_EDGE_PADDING,
    ),
  }
}

export function snapWindowToEdge(next: Pick<OsWindowState, 'x' | 'y' | 'width' | 'height'>) {
  if (typeof window === 'undefined') return next
  const rect = clampWindowPosition(next)
  const area = osWorkArea()
  const nearLeft = rect.x - area.x <= OS_SNAP_THRESHOLD
  const nearTop = rect.y - area.y <= OS_SNAP_THRESHOLD
  const nearRight = area.x + area.width - (rect.x + rect.width) <= OS_SNAP_THRESHOLD
  const nearBottom = area.y + area.height - (rect.y + rect.height) <= OS_SNAP_THRESHOLD
  const halfWidth = Math.round(area.width / 2)
  const halfHeight = Math.round(area.height / 2)

  if (nearLeft && nearTop) {
    return clampWindowPosition({ x: area.x, y: area.y, width: halfWidth, height: halfHeight })
  }
  if (nearRight && nearTop) {
    return clampWindowPosition({
      x: area.x + halfWidth,
      y: area.y,
      width: area.width - halfWidth,
      height: halfHeight,
    })
  }
  if (nearLeft && nearBottom) {
    return clampWindowPosition({
      x: area.x,
      y: area.y + halfHeight,
      width: halfWidth,
      height: area.height - halfHeight,
    })
  }
  if (nearRight && nearBottom) {
    return clampWindowPosition({
      x: area.x + halfWidth,
      y: area.y + halfHeight,
      width: area.width - halfWidth,
      height: area.height - halfHeight,
    })
  }
  if (nearLeft) {
    return clampWindowPosition({ x: area.x, y: area.y, width: halfWidth, height: area.height })
  }
  if (nearRight) {
    return clampWindowPosition({
      x: area.x + halfWidth,
      y: area.y,
      width: area.width - halfWidth,
      height: area.height,
    })
  }
  if (nearBottom) {
    return clampWindowPosition({
      x: area.x,
      y: area.y + halfHeight,
      width: area.width,
      height: area.height - halfHeight,
    })
  }
  return rect
}

export function snapWindowToPointer(
  next: Pick<OsWindowState, 'x' | 'y' | 'width' | 'height'>,
  pointer: { x: number; y: number },
) {
  if (typeof window === 'undefined') return next
  const rect = clampWindowPosition(next)
  const area = osWorkArea()
  const nearLeft = pointer.x <= area.x + OS_SNAP_THRESHOLD
  const nearTop = pointer.y <= area.y + OS_SNAP_THRESHOLD
  const nearRight = pointer.x >= area.x + area.width - OS_SNAP_THRESHOLD
  const nearBottom = pointer.y >= area.y + area.height - OS_SNAP_THRESHOLD
  const halfWidth = Math.round(area.width / 2)
  const halfHeight = Math.round(area.height / 2)

  if (nearLeft && nearTop) {
    return clampWindowPosition({ x: area.x, y: area.y, width: halfWidth, height: halfHeight })
  }
  if (nearRight && nearTop) {
    return clampWindowPosition({
      x: area.x + halfWidth,
      y: area.y,
      width: area.width - halfWidth,
      height: halfHeight,
    })
  }
  if (nearLeft && nearBottom) {
    return clampWindowPosition({
      x: area.x,
      y: area.y + halfHeight,
      width: halfWidth,
      height: area.height - halfHeight,
    })
  }
  if (nearRight && nearBottom) {
    return clampWindowPosition({
      x: area.x + halfWidth,
      y: area.y + halfHeight,
      width: area.width - halfWidth,
      height: area.height - halfHeight,
    })
  }
  if (nearLeft) {
    return clampWindowPosition({ x: area.x, y: area.y, width: halfWidth, height: area.height })
  }
  if (nearRight) {
    return clampWindowPosition({
      x: area.x + halfWidth,
      y: area.y,
      width: area.width - halfWidth,
      height: area.height,
    })
  }
  if (nearBottom) {
    return clampWindowPosition({
      x: area.x,
      y: area.y + halfHeight,
      width: area.width,
      height: area.height - halfHeight,
    })
  }
  return rect
}

export function clampWindowResize(next: Pick<OsWindowState, 'x' | 'y' | 'width' | 'height'>) {
  if (typeof window === 'undefined') return next
  const x = Math.max(DESKTOP_EDGE_PADDING, next.x)
  const y = Math.max(OS_TOP_BAR_HEIGHT, next.y)
  const maxWidth = Math.max(MIN_WINDOW_WIDTH, window.innerWidth - x - DESKTOP_EDGE_PADDING)
  const maxHeight = Math.max(
    MIN_WINDOW_HEIGHT,
    window.innerHeight - y - DOCK_RESERVED_HEIGHT - DESKTOP_EDGE_PADDING,
  )
  const width = Math.min(Math.max(MIN_WINDOW_WIDTH, next.width), maxWidth)
  const height = Math.min(Math.max(MIN_WINDOW_HEIGHT, next.height), maxHeight)
  const maxX = Math.max(DESKTOP_EDGE_PADDING, window.innerWidth - width - DESKTOP_EDGE_PADDING)

  return {
    width,
    height,
    x: Math.min(x, maxX),
    y,
  }
}

export function buddyDisplayName(entry: BuddyInboxEntry) {
  return entry.agent.user.displayName?.trim() || entry.agent.user.username || entry.agent.id
}
