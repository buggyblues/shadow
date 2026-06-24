import type { WorkspaceNode } from '../../stores/workspace.store'
import type {
  BuddyInboxEntry,
  ChannelMeta,
  LaunchContext,
  OsChannelTab,
  OsDesktopItem,
  OsDesktopLayout,
  OsDesktopLayoutItem,
  OsDesktopWidget,
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

const OS_WINDOW_STORAGE_KEY = 'shadow:os-windows:v2'
const OS_DESKTOP_STORAGE_KEY = 'shadow:os-desktop-files:v1'
export const EMPTY_OS_DESKTOP_LAYOUT: OsDesktopLayout = { version: 1, items: [], widgets: [] }
export const OS_WORKSPACE_NODE_DRAG_TYPE = 'application/x-shadow-workspace-node'
export const OS_SNAP_DWELL_MS = 120

interface StoredOsServerWindowState {
  windows: OsWindowState[]
  focusedWindowId: string | null
  channelTabs: Array<Omit<OsChannelTab, 'active'>>
  activeChannelTabId: string | null
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
    return raw ? (JSON.parse(raw) as Record<string, OsDesktopItem[]>) : {}
  } catch {
    return {}
  }
}

function isFiniteDesktopNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function normalizeDesktopLayoutItem(value: unknown): OsDesktopLayoutItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const item = value as Partial<OsDesktopLayoutItem>
  const x = item.x
  const y = item.y
  if (typeof item.id !== 'string' || !isFiniteDesktopNumber(x) || !isFiniteDesktopNumber(y)) {
    return null
  }

  if (item.kind === 'workspace-node' && typeof item.workspaceNodeId === 'string') {
    return {
      id: item.id,
      kind: 'workspace-node',
      workspaceNodeId: item.workspaceNodeId,
      source: item.source === 'workspace-root' ? 'workspace-root' : 'pinned',
      hidden: item.hidden === true,
      x,
      y,
    }
  }
  if (item.kind === 'builtin-app' && typeof item.builtinKey === 'string') {
    return {
      id: item.id,
      kind: 'builtin-app',
      builtinKey: item.builtinKey,
      title: typeof item.title === 'string' ? item.title : item.builtinKey,
      hidden: item.hidden === true,
      x,
      y,
    }
  }
  if (item.kind === 'server-app' && typeof item.appKey === 'string') {
    return {
      id: item.id,
      kind: 'server-app',
      appKey: item.appKey,
      appId: typeof item.appId === 'string' ? item.appId : undefined,
      title: typeof item.title === 'string' ? item.title : item.appKey,
      iconUrl: typeof item.iconUrl === 'string' ? item.iconUrl : null,
      hidden: item.hidden === true,
      x,
      y,
    }
  }
  return null
}

function normalizeDesktopWidget(value: unknown): OsDesktopWidget | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const widget = value as Partial<OsDesktopWidget>
  const x = widget.x
  const y = widget.y
  const widthCells = widget.widthCells
  const heightCells = widget.heightCells
  if (
    typeof widget.id !== 'string' ||
    !isFiniteDesktopNumber(x) ||
    !isFiniteDesktopNumber(y) ||
    !isFiniteDesktopNumber(widthCells) ||
    !isFiniteDesktopNumber(heightCells)
  ) {
    return null
  }

  const normalizedBase = {
    id: widget.id,
    x,
    y,
    widthCells: Math.min(8, Math.max(1, Math.round(widthCells))),
    heightCells: Math.min(6, Math.max(1, Math.round(heightCells))),
    updatedAt: typeof widget.updatedAt === 'string' ? widget.updatedAt : undefined,
  }

  if (widget.kind === 'sticky-note') {
    return {
      ...normalizedBase,
      kind: 'sticky-note',
      widthCells: Math.min(6, normalizedBase.widthCells),
      content: typeof widget.content === 'string' ? widget.content : '',
    }
  }

  if (
    widget.kind === 'video-player' &&
    (widget.provider === 'bilibili' || widget.provider === 'youtube') &&
    typeof widget.source === 'string'
  ) {
    return {
      ...normalizedBase,
      kind: 'video-player',
      provider: widget.provider,
      source: widget.source,
      title: typeof widget.title === 'string' ? widget.title : undefined,
      coverUrl: typeof widget.coverUrl === 'string' ? widget.coverUrl : null,
      autoplay: widget.autoplay === true,
      muted: widget.muted === true,
      danmaku: widget.danmaku !== false,
      showCover: widget.showCover === true,
    }
  }

  if (
    widget.kind === 'web-embed' &&
    (widget.sourceType === 'url' || widget.sourceType === 'workspace-file') &&
    typeof widget.source === 'string'
  ) {
    return {
      ...normalizedBase,
      kind: 'web-embed',
      widthCells: Math.max(2, normalizedBase.widthCells),
      heightCells: Math.max(2, normalizedBase.heightCells),
      sourceType: widget.sourceType,
      source: widget.source,
      title: typeof widget.title === 'string' ? widget.title : undefined,
      workspaceFileName:
        typeof widget.workspaceFileName === 'string' ? widget.workspaceFileName : null,
    }
  }

  return null
}

export function normalizeOsDesktopLayout(value: unknown): OsDesktopLayout {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return EMPTY_OS_DESKTOP_LAYOUT
  const layout = value as Partial<OsDesktopLayout>
  return {
    version: 1,
    items: Array.isArray(layout.items)
      ? layout.items
          .map(normalizeDesktopLayoutItem)
          .filter((item): item is OsDesktopLayoutItem => item !== null)
      : [],
    widgets: Array.isArray(layout.widgets)
      ? layout.widgets
          .map(normalizeDesktopWidget)
          .filter((widget): widget is OsDesktopWidget => widget !== null)
      : [],
  }
}

export function serializeOsDesktopLayout(
  items: OsDesktopItem[],
  widgets: OsDesktopWidget[],
): OsDesktopLayout {
  return {
    version: 1,
    items: items.map((item): OsDesktopLayoutItem => {
      if (item.kind === 'workspace-node') {
        return {
          id: item.id,
          kind: 'workspace-node',
          workspaceNodeId: item.node.id,
          source: item.source,
          hidden: item.hidden,
          x: item.x,
          y: item.y,
        }
      }
      if (item.kind === 'builtin-app') {
        return {
          id: item.id,
          kind: 'builtin-app',
          builtinKey: item.builtinKey,
          title: item.title,
          hidden: item.hidden,
          x: item.x,
          y: item.y,
        }
      }
      return {
        id: item.id,
        kind: 'server-app',
        appKey: item.appKey,
        appId: item.appId,
        title: item.title,
        iconUrl: item.iconUrl,
        hidden: item.hidden,
        x: item.x,
        y: item.y,
      }
    }),
    widgets,
  }
}

function normalizeStoredDesktopItem(value: unknown): OsDesktopItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const item = value as Partial<OsDesktopItem> & { node?: unknown }
  const { id, x, y } = item
  if (typeof id !== 'string' || typeof x !== 'number' || typeof y !== 'number') return null
  if ((item.kind === undefined || item.kind === 'workspace-node') && item.node) {
    const node = item.node as { id?: unknown; kind?: unknown }
    if (typeof node.id !== 'string' || (node.kind !== 'file' && node.kind !== 'dir')) return null
    const source = (item as { source?: unknown }).source
    return {
      ...item,
      id: id.startsWith('workspace:') ? id : `workspace:${node.id}`,
      kind: 'workspace-node',
      node: item.node as WorkspaceNode,
      source: source === 'workspace-root' ? 'workspace-root' : 'pinned',
      hidden: item.hidden === true,
      x,
      y,
    }
  }
  if (item.kind === 'builtin-app' && typeof item.builtinKey === 'string') {
    return {
      id,
      kind: 'builtin-app',
      builtinKey: item.builtinKey,
      title: typeof item.title === 'string' ? item.title : item.builtinKey,
      x,
      y,
      hidden: item.hidden === true,
    } as OsDesktopItem
  }
  if (item.kind === 'server-app' && typeof item.appKey === 'string') {
    return {
      id,
      kind: 'server-app',
      appKey: item.appKey,
      appId: typeof item.appId === 'string' ? item.appId : undefined,
      title: typeof item.title === 'string' ? item.title : item.appKey,
      iconUrl: typeof item.iconUrl === 'string' ? item.iconUrl : null,
      x,
      y,
      hidden: item.hidden === true,
    } as OsDesktopItem
  }
  return null
}

export function loadOsDesktopFiles(serverId: string): OsDesktopItem[] {
  const files = readDesktopStorage()[serverId]
  return Array.isArray(files)
    ? files.map(normalizeStoredDesktopItem).filter((item): item is OsDesktopItem => item !== null)
    : []
}

export function saveOsDesktopFiles(serverId: string, files: OsDesktopItem[]) {
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
  return state && Array.isArray(state.windows) && Array.isArray(state.channelTabs) ? state : null
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

function normalizeAppPath(value: string | null | undefined) {
  if (typeof value !== 'string') return null
  const input = value.trim()
  if (!input) return null
  const prefixed = input.startsWith('/') ? input : `/${input}`
  return prefixed.replace(/\/{2,}/g, '/')
}

export function withLaunchParams(
  entry: string,
  launch: LaunchContext | undefined,
  appPath?: string | null,
) {
  if (!launch?.launchToken) return entry
  const url = new URL(entry, window.location.origin)
  url.searchParams.set('shadow_launch', launch.launchToken)
  if (launch.eventStreamPath) {
    url.searchParams.set(
      'shadow_event_stream',
      new URL(launch.eventStreamPath, window.location.origin).toString(),
    )
  }
  const normalizedAppPath = normalizeAppPath(appPath)
  if (normalizedAppPath && normalizedAppPath !== '/') url.hash = normalizedAppPath
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
  const maxY = Math.max(
    OS_TOP_BAR_HEIGHT,
    window.innerHeight - height - DOCK_RESERVED_HEIGHT - DESKTOP_EDGE_PADDING,
  )
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
