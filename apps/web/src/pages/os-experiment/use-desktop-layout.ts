import type { QueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useConfirmStore } from '../../components/common/confirm-dialog'
import { fetchApi } from '../../lib/api'
import { setServerWallpaperFromWorkspaceFile } from '../../lib/server-wallpaper'
import { showToast } from '../../lib/toast'
import type { ClipboardPayload, WorkspaceInfo, WorkspaceNode } from '../../stores/workspace.store'
import { defaultDesktopFilePosition, desktopRowsPerColumn } from './desktop'
import {
  buddyInboxDesktopItemId,
  builtinDesktopItemId,
  channelDesktopItemId,
  desktopWidgetId,
  hydrateDesktopLayoutItems,
  nextDesktopPoint,
  nextDesktopWidgetZIndex,
  normalizeDesktopWidgetLayers,
  OS_WIDGET_BASE_Z_INDEX,
  OS_WIDGET_LAYER_STEP,
  spaceAppDesktopItemId,
  workspaceDesktopItemId,
} from './desktop-layout-helpers'
import type {
  BuddyInboxEntry,
  ChannelMeta,
  OsBuiltinAppKey,
  OsDesktopBuddyInboxItem,
  OsDesktopChatInputWidget,
  OsDesktopItem,
  OsDesktopPhotoWidget,
  OsDesktopRemoteWidget,
  OsDesktopTypewriterWidget,
  OsDesktopVideoWidget,
  OsDesktopWebEmbedWidget,
  OsDesktopWidget,
  OsDesktopWorkspaceItem,
  OsRemoteWidgetCatalogEntry,
  ServerEntry,
  SpaceAppInstallation,
} from './types'
import { normalizeOsDesktopLayout, serializeOsDesktopLayout, serverRouteKey } from './utils'

type UseOsDesktopLayoutInput = {
  apps: SpaceAppInstallation[]
  channels: ChannelMeta[]
  inboxes: BuddyInboxEntry[]
  canManageDesktopLayout: boolean
  osWorkspace: WorkspaceInfo | undefined
  queryClient: QueryClient
  selectedServerDesktopLayout: ReturnType<typeof normalizeOsDesktopLayout>
  selectedServerDesktopLayoutKey: string
  selectedServerId: string | null
  selectedServerSlug: string
  setRenamingWorkspaceNodeId: (id: string | null) => void
  setWorkspaceClipboard: (payload: ClipboardPayload | null) => void
  t: TFunction
  workspaceClipboard: ClipboardPayload | null
  workspaceNodeById: Map<string, WorkspaceNode>
  workspaceRootNodes: WorkspaceNode[]
}

export function useOsDesktopLayout({
  apps,
  channels,
  inboxes,
  canManageDesktopLayout,
  osWorkspace,
  queryClient,
  selectedServerDesktopLayout,
  selectedServerDesktopLayoutKey,
  selectedServerId,
  selectedServerSlug,
  setRenamingWorkspaceNodeId,
  setWorkspaceClipboard,
  t,
  workspaceClipboard,
  workspaceNodeById,
  workspaceRootNodes,
}: UseOsDesktopLayoutInput) {
  const [desktopFiles, setDesktopFiles] = useState<OsDesktopItem[]>([])
  const [desktopWidgets, setDesktopWidgets] = useState<OsDesktopWidget[]>([])
  const isRestoringDesktopRef = useRef(false)
  const lastSavedDesktopLayoutRef = useRef<string | null>(null)

  useEffect(() => {
    if (!selectedServerId) return
    const nextFiles = hydrateDesktopLayoutItems({
      layoutItems: selectedServerDesktopLayout.items,
      workspaceNodeById,
      apps,
      channels,
      inboxes,
    })

    if (isRestoringDesktopRef.current) {
      isRestoringDesktopRef.current = false
    }
    isRestoringDesktopRef.current = true
    lastSavedDesktopLayoutRef.current = selectedServerDesktopLayoutKey
    setDesktopFiles(nextFiles)
    setDesktopWidgets(selectedServerDesktopLayout.widgets)
  }, [
    apps,
    channels,
    inboxes,
    selectedServerDesktopLayout,
    selectedServerDesktopLayoutKey,
    selectedServerId,
    workspaceNodeById,
  ])

  useEffect(() => {
    if (!selectedServerSlug) return
    if (!canManageDesktopLayout) return
    if (isRestoringDesktopRef.current) {
      isRestoringDesktopRef.current = false
      return
    }

    const layout = serializeOsDesktopLayout(desktopFiles, desktopWidgets)
    const serialized = JSON.stringify(layout)
    if (serialized === lastSavedDesktopLayoutRef.current) return

    const timeout = window.setTimeout(() => {
      void fetchApi(`/api/servers/${selectedServerSlug}/desktop-layout`, {
        method: 'PATCH',
        body: JSON.stringify(layout),
      })
        .then(() => {
          lastSavedDesktopLayoutRef.current = serialized
          queryClient.setQueryData<ServerEntry[]>(['servers'], (current) =>
            current?.map((entry) =>
              serverRouteKey(entry.server) === selectedServerSlug ||
              entry.server.id === selectedServerId
                ? { ...entry, server: { ...entry.server, desktopLayout: layout } }
                : entry,
            ),
          )
        })
        .catch((error) => {
          showToast(error instanceof Error ? error.message : t('common.unknown'), 'error')
        })
    }, 350)

    return () => window.clearTimeout(timeout)
  }, [
    desktopFiles,
    desktopWidgets,
    canManageDesktopLayout,
    queryClient,
    selectedServerId,
    selectedServerSlug,
    t,
  ])

  const invalidateOsWorkspaceData = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['os-workspace-root', selectedServerSlug] }),
      queryClient.invalidateQueries({ queryKey: ['workspace-tree', selectedServerSlug] }),
      queryClient.invalidateQueries({ queryKey: ['workspace-stats', selectedServerSlug] }),
      queryClient.invalidateQueries({ queryKey: ['workspace-search', selectedServerSlug] }),
    ])
  }, [queryClient, selectedServerSlug])

  const pinWorkspaceFileToDesktop = useCallback(
    (node: WorkspaceNode, point?: { x: number; y: number }) => {
      if (!canManageDesktopLayout) return
      setDesktopFiles((current) => {
        const id = workspaceDesktopItemId(node.id)
        const existingIndex = current.findIndex((item) => item.id === id)
        const position = nextDesktopPoint(current, point, id)
        if (existingIndex >= 0) {
          return current.map((item, index) =>
            index === existingIndex
              ? {
                  id,
                  kind: 'workspace-node',
                  node,
                  source: node.parentId === null ? 'workspace-root' : 'pinned',
                  hidden: false,
                  ...position,
                }
              : item,
          )
        }
        return [
          ...current,
          {
            id,
            kind: 'workspace-node',
            node,
            source: node.parentId === null ? 'workspace-root' : 'pinned',
            hidden: false,
            ...position,
          },
        ]
      })
    },
    [canManageDesktopLayout],
  )

  const moveDesktopFile = useCallback(
    (
      id: string,
      point: { x: number; y: number },
      options?: { swapWith?: { id: string; point: { x: number; y: number } } },
    ) => {
      if (!canManageDesktopLayout) return
      setDesktopFiles((current) => {
        const upsertPosition = (
          items: OsDesktopItem[],
          itemId: string,
          nextPoint: { x: number; y: number },
        ) => {
          const existingIndex = items.findIndex((item) => item.id === itemId)
          if (existingIndex >= 0) {
            return items.map((item, index) =>
              index === existingIndex ? { ...item, ...nextPoint, hidden: false } : item,
            )
          }
          const nodeId = itemId.startsWith('workspace:')
            ? itemId.slice('workspace:'.length)
            : itemId
          const inbox = inboxes.find((entry) => buddyInboxDesktopItemId(entry.agent.id) === itemId)
          if (inbox) {
            return [
              ...items,
              {
                id: buddyInboxDesktopItemId(inbox.agent.id),
                kind: 'buddy-inbox' as const,
                inbox,
                hidden: false,
                ...nextPoint,
              },
            ]
          }
          const channel = channels.find((entry) => channelDesktopItemId(entry.id) === itemId)
          if (channel) {
            return [
              ...items,
              {
                id: channelDesktopItemId(channel.id),
                kind: 'channel' as const,
                channel,
                hidden: false,
                ...nextPoint,
              },
            ]
          }
          const rootNode = workspaceRootNodes.find((node) => node.id === nodeId)
          if (!rootNode) return items
          return [
            ...items,
            {
              id: workspaceDesktopItemId(rootNode.id),
              kind: 'workspace-node' as const,
              node: rootNode,
              source: 'workspace-root' as const,
              hidden: false,
              ...nextPoint,
            },
          ]
        }

        let next = upsertPosition(current, id, point)
        if (options?.swapWith) {
          next = upsertPosition(next, options.swapWith.id, options.swapWith.point)
        }
        return next
      })
    },
    [canManageDesktopLayout, channels, inboxes, workspaceRootNodes],
  )

  const createStickyNoteWidget = useCallback(
    (point: { x: number; y: number }) => {
      if (!canManageDesktopLayout) return
      setDesktopWidgets((current) => [
        ...current,
        {
          id: desktopWidgetId(),
          kind: 'sticky-note',
          ...point,
          zIndex: nextDesktopWidgetZIndex(current),
          widthCells: 6,
          heightCells: 4,
          content: t('os.stickyNoteDefaultContent'),
          updatedAt: new Date().toISOString(),
        },
      ])
    },
    [canManageDesktopLayout, t],
  )

  const createChatInputWidget = useCallback(
    (point: { x: number; y: number }) => {
      if (!canManageDesktopLayout) return
      setDesktopWidgets((current) => [
        ...current,
        {
          id: desktopWidgetId(),
          kind: 'chat-input',
          ...point,
          zIndex: nextDesktopWidgetZIndex(current),
          widthCells: 10,
          heightCells: 2,
          defaultAgentId: null,
          inboxViewMode: 'chat',
          placeholder: undefined,
          completionItems: [],
          updatedAt: new Date().toISOString(),
        },
      ])
    },
    [canManageDesktopLayout],
  )

  const createPhotoWidget = useCallback(
    (
      point: { x: number; y: number },
      input: Omit<OsDesktopPhotoWidget, 'id' | 'kind' | 'x' | 'y' | 'widthCells' | 'updatedAt'>,
    ) => {
      if (!canManageDesktopLayout) return
      setDesktopWidgets((current) => [
        ...current,
        {
          id: desktopWidgetId(),
          kind: 'photo',
          ...point,
          zIndex: nextDesktopWidgetZIndex(current),
          widthCells: 6,
          ...input,
          updatedAt: new Date().toISOString(),
        },
      ])
    },
    [canManageDesktopLayout],
  )

  const createTypewriterWidget = useCallback(
    (
      point: { x: number; y: number },
      input: Omit<
        OsDesktopTypewriterWidget,
        'id' | 'kind' | 'x' | 'y' | 'widthCells' | 'heightCells' | 'updatedAt'
      >,
    ) => {
      if (!canManageDesktopLayout) return
      setDesktopWidgets((current) => [
        ...current,
        {
          id: desktopWidgetId(),
          kind: 'typewriter',
          ...point,
          zIndex: nextDesktopWidgetZIndex(current),
          widthCells: 8,
          heightCells: 6,
          ...input,
          updatedAt: new Date().toISOString(),
        },
      ])
    },
    [canManageDesktopLayout],
  )

  const createVideoWidget = useCallback(
    (
      provider: OsDesktopVideoWidget['provider'],
      point: { x: number; y: number },
      input: Omit<
        OsDesktopVideoWidget,
        'id' | 'kind' | 'provider' | 'x' | 'y' | 'widthCells' | 'heightCells' | 'updatedAt'
      >,
    ) => {
      if (!canManageDesktopLayout) return
      setDesktopWidgets((current) => [
        ...current,
        {
          id: desktopWidgetId(),
          kind: 'video-player',
          provider,
          ...point,
          zIndex: nextDesktopWidgetZIndex(current),
          widthCells: 10,
          heightCells: 6,
          ...input,
          updatedAt: new Date().toISOString(),
        },
      ])
    },
    [canManageDesktopLayout],
  )

  const createWebEmbedWidget = useCallback(
    (
      point: { x: number; y: number },
      input: Omit<
        OsDesktopWebEmbedWidget,
        'id' | 'kind' | 'x' | 'y' | 'widthCells' | 'heightCells' | 'updatedAt'
      >,
    ) => {
      if (!canManageDesktopLayout) return
      setDesktopWidgets((current) => [
        ...current,
        {
          id: desktopWidgetId(),
          kind: 'web-embed',
          ...point,
          zIndex: nextDesktopWidgetZIndex(current),
          widthCells: 10,
          heightCells: 8,
          ...input,
          updatedAt: new Date().toISOString(),
        },
      ])
    },
    [canManageDesktopLayout],
  )

  const createRemoteWidget = useCallback(
    (point: { x: number; y: number }, entry: OsRemoteWidgetCatalogEntry) => {
      if (!canManageDesktopLayout) return
      const size = entry.definition.size.default
      const options = Object.fromEntries(
        (entry.definition.options ?? []).map((option) => [option.key, option.defaultValue]),
      )
      setDesktopWidgets((current) => [
        ...current,
        {
          id: desktopWidgetId(),
          kind: 'remote-widget',
          sourceId: entry.sourceId,
          options,
          ...point,
          zIndex: nextDesktopWidgetZIndex(current),
          widthCells: size.widthCells,
          heightCells: size.heightCells,
          updatedAt: new Date().toISOString(),
        },
      ])
    },
    [canManageDesktopLayout],
  )

  const moveDesktopWidget = useCallback(
    (id: string, point: { x: number; y: number }) => {
      if (!canManageDesktopLayout) return
      setDesktopWidgets((current) =>
        current.map((widget) => (widget.id === id ? { ...widget, ...point } : widget)),
      )
    },
    [canManageDesktopLayout],
  )

  const resizeDesktopWidget = useCallback(
    (id: string, size: { widthCells: number; heightCells: number }) => {
      if (!canManageDesktopLayout) return
      setDesktopWidgets((current) =>
        current.map((widget) => {
          if (widget.id !== id) return widget
          if (widget.kind === 'photo') {
            return {
              ...widget,
              widthCells: Math.min(8, Math.max(4, size.widthCells)),
              updatedAt: new Date().toISOString(),
            }
          }
          if (widget.kind === 'chat-input') {
            return {
              ...widget,
              widthCells: Math.min(16, Math.max(6, size.widthCells)),
              heightCells: Math.min(8, Math.max(2, size.heightCells)),
              updatedAt: new Date().toISOString(),
            }
          }
          if (widget.kind === 'remote-widget') {
            return {
              ...widget,
              widthCells: Math.min(16, Math.max(2, size.widthCells)),
              heightCells: Math.min(12, Math.max(2, size.heightCells)),
              updatedAt: new Date().toISOString(),
            }
          }
          const isFrameWidget = widget.kind === 'video-player' || widget.kind === 'web-embed'
          const isTypewriterWidget = widget.kind === 'typewriter'
          const minWidthCells = isFrameWidget || isTypewriterWidget ? 4 : 2
          const maxWidthCells = isFrameWidget || isTypewriterWidget ? 16 : 12
          const minHeightCells = isFrameWidget ? 4 : 2
          return {
            ...widget,
            widthCells: Math.min(maxWidthCells, Math.max(minWidthCells, size.widthCells)),
            heightCells: Math.min(12, Math.max(minHeightCells, size.heightCells)),
          }
        }),
      )
    },
    [canManageDesktopLayout],
  )

  const updateStickyNoteWidget = useCallback(
    (id: string, content: string) => {
      if (!canManageDesktopLayout) return
      setDesktopWidgets((current) =>
        current.map((widget) =>
          widget.id === id ? { ...widget, content, updatedAt: new Date().toISOString() } : widget,
        ),
      )
    },
    [canManageDesktopLayout],
  )

  const updateChatInputWidget = useCallback(
    (
      id: string,
      input: Partial<
        Pick<
          OsDesktopChatInputWidget,
          'defaultAgentId' | 'inboxViewMode' | 'placeholder' | 'completionItems'
        >
      >,
    ) => {
      if (!canManageDesktopLayout) return
      setDesktopWidgets((current) =>
        current.map((widget) =>
          widget.id === id && widget.kind === 'chat-input'
            ? { ...widget, ...input, updatedAt: new Date().toISOString() }
            : widget,
        ),
      )
    },
    [canManageDesktopLayout],
  )

  const updateTypewriterWidget = useCallback(
    (
      id: string,
      input: Omit<
        OsDesktopTypewriterWidget,
        'id' | 'kind' | 'x' | 'y' | 'widthCells' | 'heightCells' | 'updatedAt'
      >,
    ) => {
      if (!canManageDesktopLayout) return
      setDesktopWidgets((current) =>
        current.map((widget) =>
          widget.id === id && widget.kind === 'typewriter'
            ? { ...widget, ...input, updatedAt: new Date().toISOString() }
            : widget,
        ),
      )
    },
    [canManageDesktopLayout],
  )

  const rotateDesktopWidget = useCallback(
    (id: string, rotation: number) => {
      if (!canManageDesktopLayout) return
      setDesktopWidgets((current) =>
        current.map((widget) =>
          widget.id === id
            ? {
                ...widget,
                rotation: Math.min(45, Math.max(-45, rotation)),
                updatedAt: new Date().toISOString(),
              }
            : widget,
        ),
      )
    },
    [canManageDesktopLayout],
  )

  const changeDesktopWidgetLayer = useCallback(
    (id: string, direction: 'forward' | 'backward') => {
      if (!canManageDesktopLayout) return
      setDesktopWidgets((current) => {
        const normalized = normalizeDesktopWidgetLayers(current)
        const ordered = [...normalized].sort((left, right) => {
          const leftZ = left.zIndex ?? OS_WIDGET_BASE_Z_INDEX
          const rightZ = right.zIndex ?? OS_WIDGET_BASE_Z_INDEX
          if (leftZ !== rightZ) return leftZ - rightZ
          return left.id.localeCompare(right.id)
        })
        const index = ordered.findIndex((widget) => widget.id === id)
        if (index < 0) return current
        const targetIndex = direction === 'forward' ? index + 1 : index - 1
        if (targetIndex < 0 || targetIndex >= ordered.length) return normalized

        const nextOrdered = [...ordered]
        const widget = nextOrdered.splice(index, 1)[0]
        if (!widget) return normalized
        nextOrdered.splice(targetIndex, 0, widget)
        const nextZById = new Map(
          nextOrdered.map(
            (widget, layerIndex) =>
              [widget.id, OS_WIDGET_BASE_Z_INDEX + layerIndex * OS_WIDGET_LAYER_STEP] as const,
          ),
        )

        return normalized.map((widget) => {
          const zIndex = nextZById.get(widget.id) ?? widget.zIndex
          return widget.zIndex === zIndex
            ? widget
            : { ...widget, zIndex, updatedAt: new Date().toISOString() }
        })
      })
    },
    [canManageDesktopLayout],
  )

  const updatePhotoWidget = useCallback(
    (
      id: string,
      input: Omit<OsDesktopPhotoWidget, 'id' | 'kind' | 'x' | 'y' | 'widthCells' | 'updatedAt'>,
    ) => {
      if (!canManageDesktopLayout) return
      setDesktopWidgets((current) =>
        current.map((widget) =>
          widget.id === id && widget.kind === 'photo'
            ? { ...widget, ...input, updatedAt: new Date().toISOString() }
            : widget,
        ),
      )
    },
    [canManageDesktopLayout],
  )

  const updateVideoWidget = useCallback(
    (
      id: string,
      input: Omit<
        OsDesktopVideoWidget,
        'id' | 'kind' | 'provider' | 'x' | 'y' | 'widthCells' | 'heightCells' | 'updatedAt'
      >,
    ) => {
      if (!canManageDesktopLayout) return
      setDesktopWidgets((current) =>
        current.map((widget) =>
          widget.id === id && widget.kind === 'video-player'
            ? { ...widget, ...input, updatedAt: new Date().toISOString() }
            : widget,
        ),
      )
    },
    [canManageDesktopLayout],
  )

  const updateWebEmbedWidget = useCallback(
    (
      id: string,
      input: Omit<
        OsDesktopWebEmbedWidget,
        'id' | 'kind' | 'x' | 'y' | 'widthCells' | 'heightCells' | 'updatedAt'
      >,
    ) => {
      if (!canManageDesktopLayout) return
      setDesktopWidgets((current) =>
        current.map((widget) =>
          widget.id === id && widget.kind === 'web-embed'
            ? { ...widget, ...input, updatedAt: new Date().toISOString() }
            : widget,
        ),
      )
    },
    [canManageDesktopLayout],
  )

  const updateRemoteWidget = useCallback(
    (id: string, options: OsDesktopRemoteWidget['options']) => {
      if (!canManageDesktopLayout) return
      setDesktopWidgets((current) =>
        current.map((widget) =>
          widget.id === id && widget.kind === 'remote-widget'
            ? { ...widget, options, updatedAt: new Date().toISOString() }
            : widget,
        ),
      )
    },
    [canManageDesktopLayout],
  )

  const deleteDesktopWidget = useCallback(
    (id: string) => {
      if (!canManageDesktopLayout) return
      setDesktopWidgets((current) => current.filter((widget) => widget.id !== id))
    },
    [canManageDesktopLayout],
  )

  const hideDesktopItem = useCallback(
    (item: OsDesktopItem) => {
      if (!canManageDesktopLayout) return
      setDesktopFiles((current) => {
        const existingIndex = current.findIndex((stored) => stored.id === item.id)
        if (existingIndex >= 0) {
          return current.map((stored, index) =>
            index === existingIndex ? { ...stored, hidden: true } : stored,
          )
        }
        return [...current, { ...item, hidden: true }]
      })
    },
    [canManageDesktopLayout],
  )

  const pinBuiltinAppToDesktop = useCallback(
    (key: OsBuiltinAppKey, title: string) => {
      if (!canManageDesktopLayout) return
      setDesktopFiles((current) => {
        const id = builtinDesktopItemId(key)
        const existingIndex = current.findIndex((item) => item.id === id)
        const position = nextDesktopPoint(current, undefined, id)
        const item: OsDesktopItem = {
          id,
          kind: 'builtin-app',
          builtinKey: key,
          title,
          hidden: false,
          ...position,
        }
        return existingIndex >= 0
          ? current.map((entry, index) => (index === existingIndex ? item : entry))
          : [...current, item]
      })
    },
    [canManageDesktopLayout],
  )

  const pinSpaceAppToDesktop = useCallback(
    (app: SpaceAppInstallation) => {
      if (!canManageDesktopLayout) return
      setDesktopFiles((current) => {
        const id = spaceAppDesktopItemId(app.appKey)
        const existingIndex = current.findIndex((item) => item.id === id)
        const position = nextDesktopPoint(current, undefined, id)
        const item: OsDesktopItem = {
          id,
          kind: 'space-app',
          appId: app.id,
          appKey: app.appKey,
          title: app.name,
          iconUrl: app.iconUrl,
          hidden: false,
          ...position,
        }
        return existingIndex >= 0
          ? current.map((entry, index) => (index === existingIndex ? item : entry))
          : [...current, item]
      })
    },
    [canManageDesktopLayout],
  )

  const pinBuddyInboxToDesktop = useCallback(
    (entry: BuddyInboxEntry, point?: { x: number; y: number }) => {
      if (!canManageDesktopLayout) return
      setDesktopFiles((current) => {
        const id = buddyInboxDesktopItemId(entry.agent.id)
        const existingIndex = current.findIndex((item) => item.id === id)
        const existing = existingIndex >= 0 ? current[existingIndex] : undefined
        const preferred = point ?? (existing ? { x: existing.x, y: existing.y } : undefined)
        const position = nextDesktopPoint(current, preferred, id)
        const item: OsDesktopItem = {
          id,
          kind: 'buddy-inbox',
          inbox: entry,
          hidden: false,
          ...position,
        }
        return existingIndex >= 0
          ? current.map((candidate, index) => (index === existingIndex ? item : candidate))
          : [...current, item]
      })
    },
    [canManageDesktopLayout],
  )

  const pinChannelToDesktop = useCallback(
    (channel: ChannelMeta, point?: { x: number; y: number }) => {
      if (!canManageDesktopLayout) return
      setDesktopFiles((current) => {
        const id = channelDesktopItemId(channel.id)
        const existingIndex = current.findIndex((item) => item.id === id)
        const existing = existingIndex >= 0 ? current[existingIndex] : undefined
        const preferred = point ?? (existing ? { x: existing.x, y: existing.y } : undefined)
        const position = nextDesktopPoint(current, preferred, id)
        const item: OsDesktopItem = {
          id,
          kind: 'channel',
          channel,
          hidden: false,
          ...position,
        }
        return existingIndex >= 0
          ? current.map((candidate, index) => (index === existingIndex ? item : candidate))
          : [...current, item]
      })
    },
    [canManageDesktopLayout],
  )

  const hideBuddyInboxFromDesktop = useCallback(
    (entry: BuddyInboxEntry) => {
      if (!canManageDesktopLayout) return
      setDesktopFiles((current) => {
        const id = buddyInboxDesktopItemId(entry.agent.id)
        const existingIndex = current.findIndex((item) => item.id === id)
        if (existingIndex >= 0) {
          return current.map((candidate, index) =>
            index === existingIndex
              ? {
                  ...candidate,
                  kind: 'buddy-inbox' as const,
                  inbox: entry,
                  hidden: true,
                }
              : candidate,
          )
        }
        const position = nextDesktopPoint(current, undefined, id)
        return [
          ...current,
          {
            id,
            kind: 'buddy-inbox' as const,
            inbox: entry,
            hidden: true,
            ...position,
          },
        ]
      })
    },
    [canManageDesktopLayout],
  )

  const renameDesktopWorkspaceNode = useCallback(
    async (node: WorkspaceNode, name: string) => {
      try {
        const endpoint =
          node.kind === 'dir'
            ? `/api/servers/${selectedServerSlug}/workspace/folders/${node.id}`
            : `/api/servers/${selectedServerSlug}/workspace/files/${node.id}`
        await fetchApi(endpoint, { method: 'PATCH', body: JSON.stringify({ name }) })
        setRenamingWorkspaceNodeId(null)
        await invalidateOsWorkspaceData()
      } catch (error) {
        showToast(error instanceof Error ? error.message : t('common.unknown'), 'error')
      }
    },
    [invalidateOsWorkspaceData, selectedServerSlug, setRenamingWorkspaceNodeId, t],
  )

  const copyDesktopWorkspaceNode = useCallback(
    (nodeId: string) => {
      if (!osWorkspace) return
      setWorkspaceClipboard({
        mode: 'copy',
        sourceWorkspaceId: osWorkspace.id,
        nodeIds: [nodeId],
        updatedAt: Date.now(),
      })
      showToast(t('workspace.clipboardCopied', { count: 1 }), 'info')
    },
    [osWorkspace, setWorkspaceClipboard, t],
  )

  const cutDesktopWorkspaceNode = useCallback(
    (nodeId: string) => {
      if (!osWorkspace) return
      setWorkspaceClipboard({
        mode: 'cut',
        sourceWorkspaceId: osWorkspace.id,
        nodeIds: [nodeId],
        updatedAt: Date.now(),
      })
      showToast(t('workspace.clipboardCut', { count: 1 }), 'info')
    },
    [osWorkspace, setWorkspaceClipboard, t],
  )

  const pasteDesktopWorkspaceNodes = useCallback(
    async (targetParentId: string | null) => {
      if (!workspaceClipboard || !osWorkspace) return
      try {
        await fetchApi(`/api/servers/${selectedServerSlug}/workspace/nodes/paste`, {
          method: 'POST',
          body: JSON.stringify({
            sourceWorkspaceId: workspaceClipboard.sourceWorkspaceId,
            targetParentId,
            nodeIds: workspaceClipboard.nodeIds,
            mode: workspaceClipboard.mode,
          }),
        })
        setWorkspaceClipboard(null)
        await invalidateOsWorkspaceData()
        showToast(t('workspace.pasteComplete'), 'success')
      } catch (error) {
        showToast(error instanceof Error ? error.message : t('common.unknown'), 'error')
      }
    },
    [
      invalidateOsWorkspaceData,
      osWorkspace,
      selectedServerSlug,
      setWorkspaceClipboard,
      t,
      workspaceClipboard,
    ],
  )

  const cloneDesktopWorkspaceFile = useCallback(
    async (fileId: string) => {
      try {
        await fetchApi(`/api/servers/${selectedServerSlug}/workspace/files/${fileId}/clone`, {
          method: 'POST',
        })
        await invalidateOsWorkspaceData()
        showToast(t('workspace.fileCloned'), 'success')
      } catch (error) {
        showToast(error instanceof Error ? error.message : t('common.unknown'), 'error')
      }
    },
    [invalidateOsWorkspaceData, selectedServerSlug, t],
  )

  const setDesktopWorkspaceWallpaper = useCallback(
    async (node: WorkspaceNode) => {
      try {
        await setServerWallpaperFromWorkspaceFile(selectedServerSlug, node)
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['servers'] }),
          queryClient.invalidateQueries({ queryKey: ['server', selectedServerSlug] }),
          queryClient.invalidateQueries({ queryKey: ['os-workspace-root', selectedServerSlug] }),
          queryClient.invalidateQueries({ queryKey: ['workspace-tree', selectedServerSlug] }),
        ])
        showToast(t('os.wallpaperSaved'), 'success')
      } catch (error) {
        showToast(
          error instanceof Error && error.message !== 'UNSUPPORTED_WALLPAPER_FILE'
            ? error.message
            : t('os.wallpaperUnsupportedFile'),
          'error',
        )
      }
    },
    [queryClient, selectedServerSlug, t],
  )

  const deleteDesktopWorkspaceNode = useCallback(
    async (node: WorkspaceNode) => {
      const ok = await useConfirmStore.getState().confirm({
        title: t('common.delete'),
        message:
          node.kind === 'dir'
            ? t('workspace.deleteFolderMessage', { name: node.name })
            : t('workspace.deleteFileMessage', { name: node.name }),
        confirmLabel: t('common.delete'),
        danger: true,
      })
      if (!ok) return

      try {
        const endpoint =
          node.kind === 'dir'
            ? `/api/servers/${selectedServerSlug}/workspace/folders/${node.id}`
            : `/api/servers/${selectedServerSlug}/workspace/files/${node.id}`
        await fetchApi(endpoint, { method: 'DELETE' })
        setDesktopFiles((current) =>
          current.filter((item) => item.kind !== 'workspace-node' || item.node.id !== node.id),
        )
        await invalidateOsWorkspaceData()
      } catch (error) {
        showToast(error instanceof Error ? error.message : t('common.unknown'), 'error')
      }
    },
    [invalidateOsWorkspaceData, selectedServerSlug, t],
  )

  const uploadDesktopFiles = useCallback(
    async (files: globalThis.File[], point: { x: number; y: number }) => {
      try {
        for (const [index, file] of files.entries()) {
          const form = new FormData()
          form.append('file', file)
          const node = await fetchApi<WorkspaceNode>(
            `/api/servers/${selectedServerSlug}/workspace/upload`,
            {
              method: 'POST',
              body: form,
            },
          )
          pinWorkspaceFileToDesktop(node, {
            x: point.x + Math.floor(index / desktopRowsPerColumn()) * 104,
            y: point.y + (index % desktopRowsPerColumn()) * 112,
          })
        }
        await invalidateOsWorkspaceData()
        showToast(t('workspace.fileUploaded'), 'success')
      } catch (error) {
        showToast(error instanceof Error ? error.message : t('workspace.uploadFailed'), 'error')
      }
    },
    [invalidateOsWorkspaceData, pinWorkspaceFileToDesktop, selectedServerSlug, t],
  )

  const desktopItems = useMemo(() => {
    const storedByNodeId = new Map(
      desktopFiles
        .filter((item): item is OsDesktopWorkspaceItem => item.kind === 'workspace-node')
        .map((item) => [item.node.id, item]),
    )
    const storedByInboxAgentId = new Map(
      desktopFiles
        .filter((item): item is OsDesktopBuddyInboxItem => item.kind === 'buddy-inbox')
        .map((item) => [item.inbox.agent.id, item]),
    )
    const channelById = new Map(channels.map((channel) => [channel.id, channel]))
    const rootIds = new Set(workspaceRootNodes.map((node) => node.id))
    const placedItems: OsDesktopItem[] = []

    for (const item of desktopFiles) {
      if (item.hidden) continue
      if (item.kind === 'workspace-node') {
        const latestNode = workspaceNodeById.get(item.node.id)
        if (!latestNode) continue
        placedItems.push({
          ...item,
          node: latestNode,
          source: rootIds.has(item.node.id) ? 'workspace-root' : 'pinned',
        })
        continue
      }
      if (item.kind === 'buddy-inbox') {
        const latestInbox = inboxes.find((entry) => entry.agent.id === item.inbox.agent.id)
        if (!latestInbox) continue
        placedItems.push({
          ...item,
          inbox: latestInbox,
        })
        continue
      }
      if (item.kind === 'channel') {
        const latestChannel = channelById.get(item.channel.id)
        if (!latestChannel || latestChannel.isArchived === true) continue
        placedItems.push({
          ...item,
          channel: latestChannel,
        })
        continue
      }
      placedItems.push(item)
    }

    for (const [index, node] of workspaceRootNodes.entries()) {
      const stored = storedByNodeId.get(node.id)
      if (stored) continue
      const point = nextDesktopPoint(placedItems, defaultDesktopFilePosition(index))
      placedItems.push({
        id: workspaceDesktopItemId(node.id),
        kind: 'workspace-node' as const,
        node,
        source: 'workspace-root' as const,
        ...point,
      })
    }

    for (const [index, inbox] of inboxes.entries()) {
      const stored = storedByInboxAgentId.get(inbox.agent.id)
      if (stored) continue
      const point = nextDesktopPoint(
        placedItems,
        defaultDesktopFilePosition(workspaceRootNodes.length + index),
      )
      placedItems.push({
        id: buddyInboxDesktopItemId(inbox.agent.id),
        kind: 'buddy-inbox' as const,
        inbox,
        ...point,
      })
    }

    return placedItems
  }, [channels, desktopFiles, inboxes, workspaceNodeById, workspaceRootNodes])

  return {
    desktopItems,
    desktopWidgets,
    pinWorkspaceFileToDesktop,
    moveDesktopFile,
    hideDesktopItem,
    uploadDesktopFiles,
    renameDesktopWorkspaceNode,
    copyDesktopWorkspaceNode,
    cutDesktopWorkspaceNode,
    pasteDesktopWorkspaceNodes,
    cloneDesktopWorkspaceFile,
    deleteDesktopWorkspaceNode,
    setDesktopWorkspaceWallpaper,
    createStickyNoteWidget,
    createChatInputWidget,
    createTypewriterWidget,
    createPhotoWidget,
    createVideoWidget,
    createWebEmbedWidget,
    createRemoteWidget,
    moveDesktopWidget,
    resizeDesktopWidget,
    rotateDesktopWidget,
    changeDesktopWidgetLayer,
    updateStickyNoteWidget,
    updateChatInputWidget,
    updateTypewriterWidget,
    updatePhotoWidget,
    updateVideoWidget,
    updateWebEmbedWidget,
    updateRemoteWidget,
    deleteDesktopWidget,
    pinBuiltinAppToDesktop,
    pinSpaceAppToDesktop,
    pinChannelToDesktop,
    pinBuddyInboxToDesktop,
    hideBuddyInboxFromDesktop,
  }
}
