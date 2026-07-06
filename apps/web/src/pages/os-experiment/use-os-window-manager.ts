import { useCallback, useEffect, useRef, useState } from 'react'
import type { ResizeMode } from './components'
import type { ChannelMeta, OsChannelTab, OsWindowKind, OsWindowState } from './types'
import {
  clampWindowPosition,
  clampWindowResize,
  loadOsServerWindowState,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  saveOsServerWindowState,
  windowKey,
} from './utils'

const OS_WINDOW_BASE_Z_INDEX = 20

type OpenWindowInput = {
  kind: OsWindowKind
  targetId: string
  title: string
  subtitle: string
  channelId?: string
  appKey?: string
  builtinKey?: OsWindowState['builtinKey']
  workspaceNode?: OsWindowState['workspaceNode']
  attachment?: OsWindowState['attachment']
  profileUserId?: string
  settingsTab?: OsWindowState['settingsTab']
  iconUrl?: string | null
}

function normalizeWindowZOrder<T extends { id: string; z: number }>(windows: T[]): T[] {
  let changed = false
  const zByWindowId = new Map(
    [...windows]
      .sort((a, b) => {
        const zA = Number.isFinite(a.z) ? a.z : OS_WINDOW_BASE_Z_INDEX
        const zB = Number.isFinite(b.z) ? b.z : OS_WINDOW_BASE_Z_INDEX
        if (zA !== zB) return zA - zB
        return a.id.localeCompare(b.id)
      })
      .map((item, index) => [item.id, OS_WINDOW_BASE_Z_INDEX + index]),
  )

  const next = windows.map((item) => {
    const z = zByWindowId.get(item.id) ?? OS_WINDOW_BASE_Z_INDEX
    if (item.z === z) return item
    changed = true
    return { ...item, z }
  })

  return changed ? next : windows
}

function focusWindowInStack(windows: OsWindowState[], id: string) {
  const normalized = normalizeWindowZOrder(windows)
  const target = normalized.find((item) => item.id === id)
  if (!target) return normalized === windows ? windows : normalized

  const nextTarget = target.minimized ? { ...target, minimized: false } : target
  const ordered = [...normalized]
    .sort((a, b) => {
      if (a.z !== b.z) return a.z - b.z
      return a.id.localeCompare(b.id)
    })
    .filter((item) => item.id !== id)
  ordered.push(nextTarget)

  const zByWindowId = new Map(
    ordered.map((item, index) => [item.id, OS_WINDOW_BASE_Z_INDEX + index]),
  )
  let changed = normalized !== windows || nextTarget !== target

  const next = normalized.map((item) => {
    const source = item.id === id ? nextTarget : item
    const z = zByWindowId.get(source.id) ?? source.z
    if (source === item && source.z === z) return item
    changed = true
    return source.z === z ? source : { ...source, z }
  })

  return changed ? next : windows
}

function findSemanticWindow(windows: OsWindowState[], id: string, input: OpenWindowInput) {
  return windows.find((item) => {
    if (item.id === id) return true
    if (input.kind === 'channel')
      return item.kind === 'channel' && item.channelId === input.channelId
    if (input.kind === 'app') return item.kind === 'app' && item.appKey === input.appKey
    if (input.kind === 'builtin') {
      return (
        item.kind === 'builtin' &&
        item.builtinKey === input.builtinKey &&
        (input.builtinKey !== 'profile' || item.profileUserId === input.profileUserId)
      )
    }
    if (input.kind === 'workspace-file') {
      return item.kind === 'workspace-file' && item.workspaceNode?.id === input.workspaceNode?.id
    }
    if (input.kind === 'chat-file') {
      return item.kind === 'chat-file' && item.attachment?.id === input.attachment?.id
    }
    return false
  })
}

type UseOsWindowManagerInput = {
  selectedServerId: string | null
  setActiveServer: (serverId: string | null) => void
  setLocalMessageUnread: React.Dispatch<React.SetStateAction<Record<string, number>>>
}

export function useOsWindowManager({
  selectedServerId,
  setActiveServer,
  setLocalMessageUnread,
}: UseOsWindowManagerInput) {
  const [windows, setWindows] = useState<OsWindowState[]>([])
  const [openChannelTabs, setOpenChannelTabs] = useState<Omit<OsChannelTab, 'active'>[]>([])
  const [activeChannelTabId, setActiveChannelTabId] = useState<string | null>(null)
  const [channelBubbleRequest, setChannelBubbleRequest] = useState<{
    channelId: string
    nonce: number
  } | null>(null)
  const [focusedWindowId, setFocusedWindowId] = useState<string | null>(null)
  const windowsRef = useRef(windows)
  const focusedWindowIdRef = useRef(focusedWindowId)
  const openChannelTabsRef = useRef(openChannelTabs)
  const activeChannelTabIdRef = useRef(activeChannelTabId)
  const selectedServerIdRef = useRef<string | null>(null)
  const resizeSessionRef = useRef<{ id: string; windows: OsWindowState[] } | null>(null)
  const isRestoringWindowsRef = useRef(false)

  useEffect(() => {
    windowsRef.current = windows
  }, [windows])

  useEffect(() => {
    openChannelTabsRef.current = openChannelTabs
  }, [openChannelTabs])

  useEffect(() => {
    activeChannelTabIdRef.current = activeChannelTabId
  }, [activeChannelTabId])

  useEffect(() => {
    setWindows((current) => {
      const next = current.filter((item) => item.kind !== 'channel' && item.kind !== 'inbox')
      return next.length === current.length ? current : next
    })
  }, [])

  useEffect(() => {
    focusedWindowIdRef.current = focusedWindowId
  }, [focusedWindowId])

  useEffect(() => {
    if (!selectedServerId) {
      const previousServerId = selectedServerIdRef.current
      if (previousServerId) {
        saveOsServerWindowState(previousServerId, {
          windows: windowsRef.current,
          focusedWindowId: focusedWindowIdRef.current,
          channelTabs: openChannelTabsRef.current,
          activeChannelTabId: activeChannelTabIdRef.current,
        })
      }
      selectedServerIdRef.current = null
      setActiveServer(null)
      setOpenChannelTabs([])
      setActiveChannelTabId(null)
      setChannelBubbleRequest(null)
      setLocalMessageUnread({})
      setWindows([])
      setFocusedWindowId(null)
      return
    }
    setActiveServer(selectedServerId)
    const previousServerId = selectedServerIdRef.current
    if (previousServerId && previousServerId !== selectedServerId) {
      saveOsServerWindowState(previousServerId, {
        windows: windowsRef.current,
        focusedWindowId: focusedWindowIdRef.current,
        channelTabs: openChannelTabsRef.current,
        activeChannelTabId: activeChannelTabIdRef.current,
      })
    }
    selectedServerIdRef.current = selectedServerId
    const restored = loadOsServerWindowState(selectedServerId)
    const restoredKeys = new Set<string>()
    const restoredWindows = (restored?.windows ?? [])
      .filter((item) => {
        if (item.kind === 'inbox' || item.kind === 'channel') return false
        const key =
          item.kind === 'app' && item.appKey
            ? `app:${item.appKey}`
            : item.kind === 'builtin' && item.builtinKey
              ? `builtin:${item.builtinKey}:${item.profileUserId ?? ''}`
              : item.kind === 'workspace-file' && item.workspaceNode
                ? `workspace-file:${item.workspaceNode.id}`
                : item.kind === 'chat-file' && item.attachment
                  ? `chat-file:${item.attachment.id}`
                  : item.id
        if (restoredKeys.has(key)) return false
        restoredKeys.add(key)
        return true
      })
      .map((item) =>
        item.kind === 'builtin' && item.builtinKey === 'server-settings'
          ? { ...item, maximized: item.minimized ? item.maximized : true }
          : item,
      )
    const restoredTabs = (restored?.channelTabs ?? []).filter(
      (tab) =>
        tab &&
        typeof tab.id === 'string' &&
        typeof tab.channelId === 'string' &&
        typeof tab.title === 'string',
    )
    const visibleRestoredTabs = restoredTabs.slice(-8)
    setOpenChannelTabs(visibleRestoredTabs)
    setActiveChannelTabId(
      visibleRestoredTabs.some((tab) => tab.id === restored?.activeChannelTabId)
        ? (restored?.activeChannelTabId ?? null)
        : (visibleRestoredTabs.at(-1)?.id ?? null),
    )
    setChannelBubbleRequest(null)
    setLocalMessageUnread({})
    isRestoringWindowsRef.current = true
    const normalizedRestoredWindows = normalizeWindowZOrder(restoredWindows)
    setWindows(normalizedRestoredWindows)
    setFocusedWindowId(
      normalizedRestoredWindows.some((item) => item.id === restored?.focusedWindowId)
        ? (restored?.focusedWindowId ?? null)
        : null,
    )
  }, [selectedServerId, setActiveServer])

  useEffect(() => {
    if (!selectedServerId) return
    if (isRestoringWindowsRef.current) {
      isRestoringWindowsRef.current = false
      return
    }
    saveOsServerWindowState(selectedServerId, {
      windows,
      focusedWindowId,
      channelTabs: openChannelTabs,
      activeChannelTabId,
    })
  }, [activeChannelTabId, focusedWindowId, openChannelTabs, selectedServerId, windows])

  const focusWindow = useCallback((id: string) => {
    setWindows((current) => focusWindowInStack(current, id))
    setFocusedWindowId((current) => (current === id ? current : id))
  }, [])

  const moveWindow = useCallback(
    (id: string, rect: { x: number; y: number; width: number; height: number }) => {
      setWindows((current) => {
        let changed = false
        const nextWindows = current.map((item) => {
          if (item.id !== id) return item
          const next = clampWindowPosition(rect)
          if (
            item.x === next.x &&
            item.y === next.y &&
            item.width === next.width &&
            item.height === next.height &&
            !item.maximized
          ) {
            return item
          }
          changed = true
          return { ...item, ...next, maximized: false }
        })
        return changed ? nextWindows : current
      })
    },
    [],
  )

  const restoreWindowForDrag = useCallback(
    (id: string, rect: { x: number; y: number; width: number; height: number }) => {
      setWindows((current) =>
        current.map((item) =>
          item.id === id
            ? { ...item, ...clampWindowPosition(rect), maximized: false, minimized: false }
            : item,
        ),
      )
    },
    [],
  )

  const resizeWindow = useCallback(
    (
      id: string,
      rect: { x: number; y: number; width: number; height: number },
      mode: ResizeMode,
      phase: 'preview' | 'commit',
    ) => {
      setWindows((current) => {
        const session =
          resizeSessionRef.current?.id === id ? resizeSessionRef.current : { id, windows: current }
        if (phase === 'preview' && resizeSessionRef.current?.id !== id) {
          resizeSessionRef.current = session
        }
        const baseline = session.windows
        const source = baseline.find((item) => item.id === id)
        if (!source) return current
        const next = clampWindowResize({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        })
        const tolerance = 2
        const oldLeft = source.x
        const oldTop = source.y
        const oldRight = source.x + source.width
        const oldBottom = source.y + source.height
        const newLeft = next.x
        const newTop = next.y
        const newRight = next.x + next.width
        const newBottom = next.y + next.height
        const sourceHorizontalStart = source.x
        const sourceHorizontalEnd = source.x + source.width
        const sourceVerticalStart = source.y
        const sourceVerticalEnd = source.y + source.height

        const resized = current.map((item) => {
          if (item.id === id) return { ...item, ...next }
          const baselineItem = baseline.find((candidate) => candidate.id === item.id) ?? item
          if (baselineItem.minimized || baselineItem.maximized) return item

          const verticalOverlap =
            Math.max(sourceVerticalStart, baselineItem.y) <
            Math.min(sourceVerticalEnd, baselineItem.y + baselineItem.height)
          const horizontalOverlap =
            Math.max(sourceHorizontalStart, baselineItem.x) <
            Math.min(sourceHorizontalEnd, baselineItem.x + baselineItem.width)
          let linked = item

          if (
            mode.includes('right') &&
            verticalOverlap &&
            Math.abs(baselineItem.x - oldRight) <= tolerance
          ) {
            const fixedRight = baselineItem.x + baselineItem.width
            const width = fixedRight - newRight
            if (width >= MIN_WINDOW_WIDTH) linked = { ...linked, x: newRight, width }
          }

          if (
            mode.includes('left') &&
            verticalOverlap &&
            Math.abs(baselineItem.x + baselineItem.width - oldLeft) <= tolerance
          ) {
            const width = newLeft - baselineItem.x
            if (width >= MIN_WINDOW_WIDTH) linked = { ...linked, width }
          }

          if (
            mode.includes('bottom') &&
            horizontalOverlap &&
            Math.abs(baselineItem.y - oldBottom) <= tolerance
          ) {
            const fixedBottom = baselineItem.y + baselineItem.height
            const height = fixedBottom - newBottom
            if (height >= MIN_WINDOW_HEIGHT) linked = { ...linked, y: newBottom, height }
          }

          if (
            mode.includes('top') &&
            horizontalOverlap &&
            Math.abs(baselineItem.y + baselineItem.height - oldTop) <= tolerance
          ) {
            const height = newTop - baselineItem.y
            if (height >= MIN_WINDOW_HEIGHT) linked = { ...linked, height }
          }

          return linked
        })
        if (phase === 'commit' && resizeSessionRef.current?.id === id) {
          resizeSessionRef.current = null
        }
        return resized
      })
    },
    [],
  )

  const openWindow = useCallback(
    (input: OpenWindowInput) => {
      const id = windowKey(input.kind, input.targetId)
      const existingWindow = findSemanticWindow(windowsRef.current, id, input)
      if (existingWindow) {
        if (input.kind === 'builtin') {
          setWindows((current) =>
            current.map((item) =>
              item.id === existingWindow.id
                ? {
                    ...item,
                    workspaceNode:
                      input.builtinKey === 'workspace' ? input.workspaceNode : item.workspaceNode,
                    settingsTab:
                      input.builtinKey === 'settings' ? input.settingsTab : item.settingsTab,
                  }
                : item,
            ),
          )
        }
        focusWindow(existingWindow.id)
        return
      }
      setWindows((current) => {
        const existing = findSemanticWindow(current, id, input)
        const normalized = normalizeWindowZOrder(current)
        const topZ = OS_WINDOW_BASE_Z_INDEX + normalized.length
        if (existing) {
          return normalized.map((item) =>
            item.id === existing.id
              ? {
                  ...item,
                  workspaceNode:
                    input.kind === 'builtin' && input.builtinKey === 'workspace'
                      ? input.workspaceNode
                      : item.workspaceNode,
                  settingsTab:
                    input.kind === 'builtin' && input.builtinKey === 'settings'
                      ? input.settingsTab
                      : item.settingsTab,
                  minimized: false,
                  z: topZ,
                }
              : item,
          )
        }
        const offset = (normalized.length % 5) * 28
        const size =
          input.kind === 'builtin'
            ? input.builtinKey === 'workspace'
              ? { width: 1080, height: 700 }
              : input.builtinKey === 'discover'
                ? { width: 1180, height: 740 }
                : input.builtinKey === 'shadow-cloud'
                  ? { width: 1180, height: 740 }
                  : input.builtinKey === 'cloud-computers'
                    ? { width: 1180, height: 740 }
                    : input.builtinKey === 'my-buddies'
                      ? { width: 1060, height: 690 }
                      : input.builtinKey === 'server-settings'
                        ? { width: 1160, height: 720 }
                        : input.builtinKey === 'tasks' || input.builtinKey === 'wallet'
                          ? { width: 980, height: 680 }
                          : { width: 980, height: 660 }
            : input.kind === 'chat-file'
              ? { width: 920, height: 680 }
              : input.kind === 'workspace-file'
                ? { width: 920, height: 680 }
                : input.kind === 'app'
                  ? { width: 760, height: 660 }
                  : input.kind === 'inbox'
                    ? { width: 760, height: 600 }
                    : { width: 820, height: 600 }
        const position = clampWindowPosition({
          x: 92 + offset,
          y: 92 + offset,
          ...size,
        })
        return [
          ...normalized,
          {
            id,
            kind: input.kind,
            title: input.title,
            subtitle: input.subtitle,
            channelId: input.channelId,
            appKey: input.appKey,
            builtinKey: input.builtinKey,
            appPath: input.kind === 'app' ? '/' : undefined,
            workspaceNode: input.workspaceNode,
            attachment: input.attachment,
            profileUserId: input.profileUserId,
            settingsTab: input.settingsTab,
            iconUrl: input.iconUrl,
            ...position,
            z: topZ,
            minimized: false,
            maximized: false,
          },
        ]
      })
      setFocusedWindowId(id)
    },
    [focusWindow],
  )

  const openChannelWindow = useCallback((channel: ChannelMeta) => {
    const id = windowKey('channel', channel.id)
    const title = channel.name
    setLocalMessageUnread((current) => {
      if (!current[channel.id]) return current
      const next = { ...current }
      delete next[channel.id]
      return next
    })
    setOpenChannelTabs((current) => {
      const existing = current.find((item) => item.channelId === channel.id)
      if (existing) {
        return current.map((item) =>
          item.id === existing.id
            ? { ...item, title, type: channel.type, topic: channel.topic ?? null }
            : item,
        )
      }
      return [
        ...current,
        {
          channelId: channel.id,
          id,
          title,
          type: channel.type,
          topic: channel.topic ?? null,
        },
      ].slice(-8)
    })
    setActiveChannelTabId(id)
    setChannelBubbleRequest({ channelId: channel.id, nonce: Date.now() })
  }, [])

  const updateAppWindowRoute = useCallback((id: string, appPath: string) => {
    setWindows((current) =>
      current.map((item) => (item.id === id && item.kind === 'app' ? { ...item, appPath } : item)),
    )
  }, [])

  const closeWindow = useCallback((id: string) => {
    setWindows((current) => current.filter((item) => item.id !== id))
    setFocusedWindowId((current) => (current === id ? null : current))
  }, [])

  const minimizeWindow = useCallback((id: string) => {
    setWindows((current) =>
      current.map((item) => (item.id === id ? { ...item, minimized: true } : item)),
    )
  }, [])

  const focusChannelTab = useCallback((id: string | null) => {
    if (!id) {
      setActiveChannelTabId((current) => (current === null ? current : null))
      return
    }
    const tab = openChannelTabsRef.current.find((item) => item.id === id)
    if (!tab) return
    setActiveChannelTabId((current) => (current === id ? current : id))
  }, [])

  const closeChannelTab = useCallback((id: string) => {
    setOpenChannelTabs((current) => {
      const next = current.filter((item) => item.id !== id)
      if (activeChannelTabIdRef.current === id) {
        setActiveChannelTabId(null)
        setChannelBubbleRequest(null)
      }
      return next
    })
  }, [])

  const reorderChannelTab = useCallback((sourceId: string, targetId: string) => {
    setOpenChannelTabs((current) => {
      const sourceIndex = current.findIndex((item) => item.id === sourceId)
      const targetIndex = current.findIndex((item) => item.id === targetId)
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return current
      const next = [...current]
      const [source] = next.splice(sourceIndex, 1)
      if (!source) return current
      next.splice(targetIndex, 0, source)
      return next
    })
  }, [])

  const toggleMaximizeWindow = useCallback(
    (id: string) => {
      setWindows((current) =>
        current.map((item) =>
          item.id === id ? { ...item, maximized: !item.maximized, minimized: false } : item,
        ),
      )
      focusWindow(id)
    },
    [focusWindow],
  )

  return {
    activeChannelTabId,
    channelBubbleRequest,
    closeChannelTab,
    closeWindow,
    focusChannelTab,
    focusedWindowId,
    focusWindow,
    minimizeWindow,
    moveWindow,
    openChannelTabs,
    openChannelWindow,
    openWindow,
    reorderChannelTab,
    resizeWindow,
    restoreWindowForDrag,
    toggleMaximizeWindow,
    updateAppWindowRoute,
    windows,
  }
}
