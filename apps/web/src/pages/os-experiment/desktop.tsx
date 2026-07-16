import { cn } from '@shadowob/ui'
import {
  AppWindow,
  Bot,
  Eye,
  EyeOff,
  Globe,
  Hash,
  ImageIcon,
  Keyboard,
  MessageSquare,
  StickyNote,
  Video,
  Youtube,
} from 'lucide-react'
import {
  type DragEvent,
  memo,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { ContextMenu, type ContextMenuGroup } from '../../components/common/context-menu'
import {
  buildWorkspaceContextMenuGroups,
  workspaceContextMenuLabels,
} from '../../components/workspace/WorkspaceContextMenu'
import type { WorkspaceNode } from '../../stores/workspace.store'
import { OsDesktopItemButton } from './components/widgets/desktop-item-button'
import {
  chatInputWidgetFromForm,
  OsChatInputWidget,
  OsChatInputWidgetEditorModal,
} from './desktop/chat-input-widget'
import { desktopItemLabel } from './desktop/desktop-item'
import {
  DESKTOP_DRAG_START_DISTANCE,
  DESKTOP_ICON_HEIGHT,
  DESKTOP_ICON_WIDTH,
  defaultDesktopFilePosition,
  desktopIconCellKey,
  parseWorkspaceDrag,
  snapDesktopIconPoint,
  snapDesktopPoint,
} from './desktop/geometry'
import {
  OsPhotoWidget,
  OsPhotoWidgetEditorModal,
  photoWidgetFromForm,
} from './desktop/photo-widget'
import { OsRemoteWidget } from './desktop/remote-widget'
import { OsStickyNoteWidget } from './desktop/sticky-note-widget'
import {
  OsTypewriterWidget,
  OsTypewriterWidgetEditorModal,
  typewriterWidgetFromForm,
} from './desktop/typewriter-widget'
import {
  OsVideoWidget,
  OsVideoWidgetEditorModal,
  videoWidgetFromForm,
} from './desktop/video-widget'
import {
  OsWebEmbedWidget,
  OsWebEmbedWidgetEditorModal,
  webEmbedWidgetFromForm,
} from './desktop/web-embed-widget'
import type { OsWidgetLayerDirection } from './desktop/widget-controls'
import { type OsWidgetPickerItem, OsWidgetPickerModal } from './desktop/widget-picker-modal'
import type {
  BuddyInboxEntry,
  ChannelMeta,
  OsBuiltinAppKey,
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
  OsStickyNoteMentionContext,
  OsStickyNoteMentionTarget,
  OsVideoWidgetProvider,
} from './types'
import { OS_TOP_BAR_HEIGHT, OS_WORKSPACE_NODE_DRAG_TYPE } from './utils'

export {
  defaultDesktopFilePosition,
  desktopRowsPerColumn,
  snapDesktopIconPoint,
  snapDesktopPoint,
} from './desktop/geometry'

function OsDesktopComponent({
  items,
  widgets,
  widgetCatalog,
  inboxes,
  canEditLayout,
  serverId,
  hasClipboard,
  renamingNodeId,
  mentionContext,
  onOpenWorkspaceNode,
  onOpenBuiltinApp,
  onOpenSpaceApp,
  onOpenChannelWindow,
  onOpenMention,
  onPinWorkspaceNode,
  onMoveItem,
  onHideItem,
  onUploadFiles,
  onStartRename,
  onRenameWorkspaceNode,
  onCopyWorkspaceNode,
  onCutWorkspaceNode,
  onPasteWorkspaceNodes,
  onCloneWorkspaceFile,
  onDeleteWorkspaceNode,
  onSetWorkspaceWallpaper,
  onCreateChannelShortcut,
  onCreateBuddyShortcut,
  onCreateAppShortcut,
  onCreateStickyNote,
  onCreateChatInputWidget,
  onCreateTypewriterWidget,
  onCreatePhotoWidget,
  onCreateVideoWidget,
  onCreateWebEmbedWidget,
  onCreateRemoteWidget,
  onMoveWidget,
  onResizeWidget,
  onRotateWidget,
  onChangeWidgetLayer,
  onUpdateStickyNote,
  onUpdateChatInputWidget,
  onUpdateTypewriterWidget,
  onUpdatePhotoWidget,
  onUpdateVideoWidget,
  onUpdateWebEmbedWidget,
  onUpdateRemoteWidget,
  onDeleteWidget,
  onOpenInboxBubble,
  onOpenWallpaperSettings,
  wallpaperInteractive = false,
}: {
  items: OsDesktopItem[]
  widgets: OsDesktopWidget[]
  widgetCatalog: OsRemoteWidgetCatalogEntry[]
  inboxes: BuddyInboxEntry[]
  canEditLayout: boolean
  serverId: string
  hasClipboard: boolean
  renamingNodeId: string | null
  mentionContext: OsStickyNoteMentionContext
  onOpenWorkspaceNode: (node: WorkspaceNode) => void
  onOpenBuiltinApp: (key: OsBuiltinAppKey) => void
  onOpenSpaceApp: (appKey: string) => void
  onOpenChannelWindow: (channel: ChannelMeta) => void
  onOpenMention: (target: OsStickyNoteMentionTarget) => void
  onPinWorkspaceNode: (node: WorkspaceNode, point?: { x: number; y: number }) => void
  onMoveItem: (
    id: string,
    point: { x: number; y: number },
    options?: { swapWith?: { id: string; point: { x: number; y: number } } },
  ) => void
  onHideItem: (item: OsDesktopItem) => void
  onUploadFiles: (files: globalThis.File[], point: { x: number; y: number }) => void
  onStartRename: (nodeId: string | null) => void
  onRenameWorkspaceNode: (node: WorkspaceNode, name: string) => void
  onCopyWorkspaceNode: (nodeId: string) => void
  onCutWorkspaceNode: (nodeId: string) => void
  onPasteWorkspaceNodes: (targetParentId: string | null) => void
  onCloneWorkspaceFile: (fileId: string) => void
  onDeleteWorkspaceNode: (node: WorkspaceNode) => void
  onSetWorkspaceWallpaper: (node: WorkspaceNode) => void
  onCreateChannelShortcut: (point: { x: number; y: number }) => void
  onCreateBuddyShortcut: (point: { x: number; y: number }) => void
  onCreateAppShortcut: (point: { x: number; y: number }) => void
  onCreateStickyNote: (point: { x: number; y: number }) => void
  onCreateChatInputWidget: (point: { x: number; y: number }) => void
  onCreateTypewriterWidget: (
    point: { x: number; y: number },
    input: Omit<
      OsDesktopTypewriterWidget,
      'id' | 'kind' | 'x' | 'y' | 'widthCells' | 'heightCells' | 'updatedAt'
    >,
  ) => void
  onCreatePhotoWidget: (
    point: { x: number; y: number },
    input: Omit<OsDesktopPhotoWidget, 'id' | 'kind' | 'x' | 'y' | 'widthCells' | 'updatedAt'>,
  ) => void
  onCreateVideoWidget: (
    provider: OsVideoWidgetProvider,
    point: { x: number; y: number },
    input: Omit<
      OsDesktopVideoWidget,
      'id' | 'kind' | 'provider' | 'x' | 'y' | 'widthCells' | 'heightCells' | 'updatedAt'
    >,
  ) => void
  onCreateWebEmbedWidget: (
    point: { x: number; y: number },
    input: Omit<
      OsDesktopWebEmbedWidget,
      'id' | 'kind' | 'x' | 'y' | 'widthCells' | 'heightCells' | 'updatedAt'
    >,
  ) => void
  onCreateRemoteWidget: (point: { x: number; y: number }, entry: OsRemoteWidgetCatalogEntry) => void
  onMoveWidget: (id: string, point: { x: number; y: number }) => void
  onResizeWidget: (id: string, size: { widthCells: number; heightCells: number }) => void
  onRotateWidget: (id: string, rotation: number) => void
  onChangeWidgetLayer: (id: string, direction: OsWidgetLayerDirection) => void
  onUpdateStickyNote: (id: string, content: string) => void
  onUpdateChatInputWidget: (
    id: string,
    input: Partial<
      Pick<
        OsDesktopChatInputWidget,
        'defaultAgentId' | 'inboxViewMode' | 'placeholder' | 'completionItems'
      >
    >,
  ) => void
  onUpdateTypewriterWidget: (
    id: string,
    input: Omit<
      OsDesktopTypewriterWidget,
      'id' | 'kind' | 'x' | 'y' | 'widthCells' | 'heightCells' | 'updatedAt'
    >,
  ) => void
  onUpdatePhotoWidget: (
    id: string,
    input: Omit<OsDesktopPhotoWidget, 'id' | 'kind' | 'x' | 'y' | 'widthCells' | 'updatedAt'>,
  ) => void
  onUpdateVideoWidget: (
    id: string,
    input: Omit<
      OsDesktopVideoWidget,
      'id' | 'kind' | 'provider' | 'x' | 'y' | 'widthCells' | 'heightCells' | 'updatedAt'
    >,
  ) => void
  onUpdateWebEmbedWidget: (
    id: string,
    input: Omit<
      OsDesktopWebEmbedWidget,
      'id' | 'kind' | 'x' | 'y' | 'widthCells' | 'heightCells' | 'updatedAt'
    >,
  ) => void
  onUpdateRemoteWidget: (id: string, options: OsDesktopRemoteWidget['options']) => void
  onDeleteWidget: (id: string) => void
  onOpenInboxBubble: (input: { agentId?: string; channelId?: string }) => void
  onOpenWallpaperSettings: () => void
  wallpaperInteractive?: boolean
}) {
  const { t } = useTranslation()
  const [contextMenu, setContextMenu] = useState<{
    item: OsDesktopItem
    x: number
    y: number
  } | null>(null)
  const [desktopContextMenu, setDesktopContextMenu] = useState<{
    x: number
    y: number
  } | null>(null)
  const [widgetPickerPoint, setWidgetPickerPoint] = useState<{
    x: number
    y: number
  } | null>(null)
  const [chatInputWidgetEditor, setChatInputWidgetEditor] = useState<{
    widget: OsDesktopChatInputWidget
  } | null>(null)
  const [photoWidgetEditor, setPhotoWidgetEditor] = useState<{
    point?: { x: number; y: number }
    widget?: OsDesktopPhotoWidget
  } | null>(null)
  const [typewriterWidgetEditor, setTypewriterWidgetEditor] = useState<{
    point?: { x: number; y: number }
    widget?: OsDesktopTypewriterWidget
  } | null>(null)
  const [videoWidgetEditor, setVideoWidgetEditor] = useState<{
    provider: OsVideoWidgetProvider
    point?: { x: number; y: number }
    widget?: OsDesktopVideoWidget
  } | null>(null)
  const [webEmbedWidgetEditor, setWebEmbedWidgetEditor] = useState<{
    point?: { x: number; y: number }
    widget?: OsDesktopWebEmbedWidget
  } | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const dragRef = useRef<{
    id: string
    lastX: number
    lastY: number
    startX: number
    startY: number
    startClientX: number
    startClientY: number
    offsetX: number
    offsetY: number
    pointerId: number
    isDragging: boolean
  } | null>(null)
  const [dragPreview, setDragPreview] = useState<{
    id: string
    x: number
    y: number
  } | null>(null)

  useEffect(() => {
    const renamingItem = items.find(
      (item): item is OsDesktopWorkspaceItem =>
        item.kind === 'workspace-node' && item.node.id === renamingNodeId,
    )
    if (renamingItem) setRenameDraft(renamingItem.node.name)
  }, [items, renamingNodeId])

  const openItem = useCallback(
    (item: OsDesktopItem) => {
      if (item.kind === 'workspace-node') {
        onOpenWorkspaceNode(item.node)
        return
      }
      if (item.kind === 'builtin-app') {
        onOpenBuiltinApp(item.builtinKey)
        return
      }
      if (item.kind === 'buddy-inbox') {
        onOpenInboxBubble({
          agentId: item.inbox.agent.id,
          channelId: item.inbox.channel?.id,
        })
        return
      }
      if (item.kind === 'channel') {
        onOpenChannelWindow(item.channel)
        return
      }
      onOpenSpaceApp(item.appKey)
    },
    [onOpenBuiltinApp, onOpenChannelWindow, onOpenInboxBubble, onOpenSpaceApp, onOpenWorkspaceNode],
  )

  const submitRename = useCallback(
    (item: OsDesktopWorkspaceItem) => {
      const next = renameDraft.trim()
      if (next && next !== item.node.name) {
        onStartRename(null)
        onRenameWorkspaceNode(item.node, next)
        return
      }
      onStartRename(null)
    },
    [onRenameWorkspaceNode, onStartRename, renameDraft],
  )

  const handleDesktopDragOver = useCallback(
    (event: DragEvent<HTMLElement>) => {
      if (!canEditLayout) return
      const acceptsWorkspace = event.dataTransfer.types.includes(OS_WORKSPACE_NODE_DRAG_TYPE)
      const acceptsFiles = event.dataTransfer.types.includes('Files')
      if (!acceptsWorkspace && !acceptsFiles) return
      event.preventDefault()
      event.dataTransfer.dropEffect = acceptsFiles ? 'copy' : 'move'
    },
    [canEditLayout],
  )

  const handleDesktopDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      if (!canEditLayout) return
      const files = Array.from(event.dataTransfer.files)
      if (files.length > 0) {
        event.preventDefault()
        onUploadFiles(
          files,
          snapDesktopIconPoint({
            x: event.clientX - DESKTOP_ICON_WIDTH / 2,
            y: event.clientY - DESKTOP_ICON_HEIGHT / 2,
          }),
        )
        return
      }

      const node = parseWorkspaceDrag(event)
      if (!node) return
      event.preventDefault()
      onPinWorkspaceNode(
        node,
        snapDesktopIconPoint({
          x: event.clientX - DESKTOP_ICON_WIDTH / 2,
          y: event.clientY - DESKTOP_ICON_HEIGHT / 2,
        }),
      )
    },
    [canEditLayout, onPinWorkspaceNode, onUploadFiles],
  )

  const handlePointerDown = useCallback(
    (item: OsDesktopItem, event: ReactPointerEvent<HTMLDivElement>) => {
      if (!canEditLayout) return
      if (event.button !== 0) return
      if (item.kind === 'workspace-node' && item.node.id === renamingNodeId) return
      const target = event.currentTarget
      target.focus({ preventScroll: true })
      target.setPointerCapture(event.pointerId)
      dragRef.current = {
        id: item.id,
        lastX: item.x,
        lastY: item.y,
        startX: item.x,
        startY: item.y,
        startClientX: event.clientX,
        startClientY: event.clientY,
        offsetX: event.clientX - item.x,
        offsetY: event.clientY - item.y,
        pointerId: event.pointerId,
        isDragging: false,
      }
    },
    [canEditLayout, renamingNodeId],
  )

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const movedDistance = Math.hypot(
      event.clientX - drag.startClientX,
      event.clientY - drag.startClientY,
    )
    if (!drag.isDragging && movedDistance < DESKTOP_DRAG_START_DISTANCE) return
    drag.isDragging = true
    const next = {
      x: Math.max(0, event.clientX - drag.offsetX),
      y: Math.max(OS_TOP_BAR_HEIGHT, event.clientY - drag.offsetY),
    }
    drag.lastX = next.x
    drag.lastY = next.y
    setDragPreview({ id: drag.id, ...next })
  }, [])

  const handlePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      if (!drag.isDragging) {
        setDragPreview(null)
        dragRef.current = null
        return
      }
      const targetPoint = snapDesktopIconPoint({ x: drag.lastX, y: drag.lastY })
      const targetCell = desktopIconCellKey(targetPoint)
      const startCell = desktopIconCellKey({ x: drag.startX, y: drag.startY })
      const swapItem = items.find(
        (item) =>
          item.id !== drag.id && desktopIconCellKey({ x: item.x, y: item.y }) === targetCell,
      )

      setDragPreview(null)
      if (targetCell === startCell) {
        dragRef.current = null
        return
      }
      onMoveItem(
        drag.id,
        targetPoint,
        swapItem
          ? {
              swapWith: {
                id: swapItem.id,
                point: snapDesktopIconPoint({ x: drag.startX, y: drag.startY }),
              },
            }
          : undefined,
      )
      dragRef.current = null
    },
    [items, onMoveItem],
  )

  const contextMenuGroups = useMemo<ContextMenuGroup[]>(() => {
    if (!contextMenu) return []
    const target = contextMenu.item
    if (target.kind === 'workspace-node') {
      return [
        ...buildWorkspaceContextMenuGroups({
          node: target.node,
          serverId,
          hasClipboard,
          onNewFolder: () => undefined,
          onNewFile: () => undefined,
          onUploadTo: () => undefined,
          onRename: onStartRename,
          onCopy: onCopyWorkspaceNode,
          onCut: onCutWorkspaceNode,
          onPaste: onPasteWorkspaceNodes,
          onClone: onCloneWorkspaceFile,
          onDelete: onDeleteWorkspaceNode,
          onOpen: () => onOpenWorkspaceNode(target.node),
          onRefresh: () => undefined,
          onSetWallpaper: canEditLayout ? onSetWorkspaceWallpaper : undefined,
          labels: workspaceContextMenuLabels(t),
          copySuccessMessage: t('common.copied'),
          copyErrorMessage: t('chat.copyFailed'),
          hiddenItems: [
            'copyPath',
            'newFolder',
            'newSubfolder',
            'newFile',
            'uploadHere',
            'downloadZip',
            'refresh',
          ],
        }),
        ...(canEditLayout
          ? [
              {
                items: [
                  {
                    icon: EyeOff,
                    label: t('os.hideFromDesktop'),
                    onClick: () => onHideItem(target),
                  },
                ],
              },
            ]
          : []),
      ]
    }

    return [
      {
        items: [
          {
            icon: Eye,
            label: t('common.open'),
            onClick: () => openItem(target),
          },
          ...(canEditLayout
            ? [
                {
                  icon: EyeOff,
                  label: t('os.hideFromDesktop'),
                  onClick: () => onHideItem(target),
                },
              ]
            : []),
        ],
      },
    ]
  }, [
    canEditLayout,
    contextMenu,
    hasClipboard,
    onCloneWorkspaceFile,
    onCopyWorkspaceNode,
    onCutWorkspaceNode,
    onDeleteWorkspaceNode,
    onHideItem,
    onOpenWorkspaceNode,
    onPasteWorkspaceNodes,
    onSetWorkspaceWallpaper,
    onStartRename,
    serverId,
    t,
  ])

  const desktopContextMenuGroups = useMemo<ContextMenuGroup[]>(() => {
    if (!desktopContextMenu) return []
    const iconPoint = () =>
      snapDesktopIconPoint({
        x: desktopContextMenu.x - DESKTOP_ICON_WIDTH / 2,
        y: desktopContextMenu.y - DESKTOP_ICON_HEIGHT / 2,
      })
    return [
      ...buildWorkspaceContextMenuGroups({
        node: null,
        serverId,
        hasClipboard,
        onNewFolder: () => undefined,
        onNewFile: () => undefined,
        onUploadTo: () => undefined,
        onRename: onStartRename,
        onCopy: onCopyWorkspaceNode,
        onCut: onCutWorkspaceNode,
        onPaste: onPasteWorkspaceNodes,
        onClone: onCloneWorkspaceFile,
        onDelete: onDeleteWorkspaceNode,
        onOpen: () => undefined,
        onRefresh: () => undefined,
        labels: workspaceContextMenuLabels(t),
        copySuccessMessage: t('common.copied'),
        copyErrorMessage: t('chat.copyFailed'),
        hiddenItems: ['newFolder', 'newFile', 'downloadZip', 'refresh', 'copyPath'],
      }),
      ...(canEditLayout
        ? [
            {
              items: [
                {
                  icon: Hash,
                  label: t('os.desktopQuickCreateChannel'),
                  onClick: () => onCreateChannelShortcut(iconPoint()),
                },
                {
                  icon: Bot,
                  label: t('os.desktopQuickCreateBuddy'),
                  onClick: () => onCreateBuddyShortcut(iconPoint()),
                },
                {
                  icon: AppWindow,
                  label: t('os.desktopQuickCreateApp'),
                  onClick: () => onCreateAppShortcut(iconPoint()),
                },
              ],
            },
            {
              items: [
                {
                  icon: StickyNote,
                  label: t('os.addWidget'),
                  onClick: () =>
                    setWidgetPickerPoint(
                      snapDesktopPoint({
                        x: desktopContextMenu.x - DESKTOP_ICON_WIDTH / 2,
                        y: desktopContextMenu.y - DESKTOP_ICON_HEIGHT / 2,
                      }),
                    ),
                },
                {
                  icon: ImageIcon,
                  label: t('os.setWallpaper'),
                  onClick: onOpenWallpaperSettings,
                },
              ],
            },
          ]
        : []),
    ]
  }, [
    canEditLayout,
    desktopContextMenu,
    hasClipboard,
    onCloneWorkspaceFile,
    onCopyWorkspaceNode,
    onCutWorkspaceNode,
    onDeleteWorkspaceNode,
    onCreateAppShortcut,
    onCreateBuddyShortcut,
    onCreateChannelShortcut,
    onOpenWallpaperSettings,
    onPasteWorkspaceNodes,
    onStartRename,
    serverId,
    t,
  ])

  const widgetPickerItems = useMemo<OsWidgetPickerItem[]>(() => {
    if (!widgetPickerPoint) return []
    const systemProvider = {
      id: 'system',
      name: t('os.widgetProviderSystem'),
      iconUrl: null,
    }
    return [
      {
        id: 'system:photo',
        title: t('os.photoWidget'),
        description: t('os.photoWidgetDescription'),
        category: 'media',
        icon: ImageIcon,
        provider: systemProvider,
        onSelect: () => setPhotoWidgetEditor({ point: widgetPickerPoint }),
      },
      {
        id: 'system:sticky-note',
        title: t('os.stickyNoteWidget'),
        description: t('os.stickyNoteWidgetDescription'),
        category: 'productivity',
        icon: StickyNote,
        provider: systemProvider,
        onSelect: () => onCreateStickyNote(widgetPickerPoint),
      },
      {
        id: 'system:chat-input',
        title: t('os.chatInputWidget'),
        description: t('os.chatInputWidgetDescription'),
        category: 'communication',
        icon: MessageSquare,
        provider: systemProvider,
        onSelect: () => onCreateChatInputWidget(widgetPickerPoint),
      },
      {
        id: 'system:typewriter',
        title: t('os.typewriterWidget'),
        description: t('os.typewriterWidgetDescription'),
        category: 'productivity',
        icon: Keyboard,
        provider: systemProvider,
        onSelect: () => setTypewriterWidgetEditor({ point: widgetPickerPoint }),
      },
      {
        id: 'system:bilibili',
        title: t('os.bilibiliVideoWidget'),
        description: t('os.bilibiliVideoWidgetDescription'),
        category: 'media',
        icon: Video,
        provider: systemProvider,
        onSelect: () => setVideoWidgetEditor({ provider: 'bilibili', point: widgetPickerPoint }),
      },
      {
        id: 'system:youtube',
        title: t('os.youtubeVideoWidget'),
        description: t('os.youtubeVideoWidgetDescription'),
        category: 'media',
        icon: Youtube,
        provider: systemProvider,
        onSelect: () => setVideoWidgetEditor({ provider: 'youtube', point: widgetPickerPoint }),
      },
      {
        id: 'system:web-embed',
        title: t('os.webEmbedWidget'),
        description: t('os.webEmbedWidgetDescription'),
        category: 'web',
        icon: Globe,
        provider: systemProvider,
        onSelect: () => setWebEmbedWidgetEditor({ point: widgetPickerPoint }),
      },
      ...widgetCatalog
        .filter(
          (entry) => !entry.definition.surfaces || entry.definition.surfaces.includes('desktop'),
        )
        .map((entry) => ({
          id: entry.sourceId,
          title: entry.definition.title,
          description: entry.definition.description,
          category: entry.definition.category ?? ('other' as const),
          icon: AppWindow,
          provider: entry.provider,
          onSelect: () => onCreateRemoteWidget(widgetPickerPoint, entry),
        })),
    ]
  }, [
    onCreateChatInputWidget,
    onCreateRemoteWidget,
    onCreateStickyNote,
    t,
    widgetCatalog,
    widgetPickerPoint,
  ])

  useEffect(() => {
    if (!wallpaperInteractive) return

    const handleWallpaperContextMenu = (event: MessageEvent) => {
      const data = event.data as
        | { type?: unknown; clientX?: unknown; clientY?: unknown }
        | null
        | undefined
      if (
        !data ||
        data.type !== 'shadow:wallpaper-contextmenu' ||
        typeof data.clientX !== 'number' ||
        typeof data.clientY !== 'number'
      ) {
        return
      }

      setContextMenu(null)
      setDesktopContextMenu({ x: data.clientX, y: data.clientY })
    }

    window.addEventListener('message', handleWallpaperContextMenu)
    return () => window.removeEventListener('message', handleWallpaperContextMenu)
  }, [wallpaperInteractive])

  const handleIconContextMenu = useCallback(
    (item: OsDesktopItem, event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()
      setContextMenu({ item, x: event.clientX, y: event.clientY })
      setDesktopContextMenu(null)
    },
    [],
  )

  const handlePointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setDragPreview(null)
    dragRef.current = null
  }, [])

  const handleItemKeyDown = useCallback(
    (item: OsDesktopItem, event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter') {
        openItem(item)
        return
      }
      if (event.key === 'F2' && item.kind === 'workspace-node') {
        event.preventDefault()
        onStartRename(item.node.id)
      }
    },
    [onStartRename, openItem],
  )

  const cancelRename = useCallback(() => onStartRename(null), [onStartRename])
  const openPhotoWidgetEditor = useCallback(
    (target: OsDesktopPhotoWidget) => setPhotoWidgetEditor({ widget: target }),
    [],
  )
  const openChatInputWidgetEditor = useCallback(
    (target: OsDesktopChatInputWidget) => setChatInputWidgetEditor({ widget: target }),
    [],
  )
  const openTypewriterWidgetEditor = useCallback(
    (target: OsDesktopTypewriterWidget) => setTypewriterWidgetEditor({ widget: target }),
    [],
  )
  const openVideoWidgetEditor = useCallback(
    (target: OsDesktopVideoWidget) =>
      setVideoWidgetEditor({ provider: target.provider, widget: target }),
    [],
  )
  const openWebEmbedWidgetEditor = useCallback(
    (target: OsDesktopWebEmbedWidget) => setWebEmbedWidgetEditor({ widget: target }),
    [],
  )

  return (
    <div
      className={cn(
        'absolute inset-x-0 bottom-[68px] top-10 z-[6] select-none',
        wallpaperInteractive && 'pointer-events-none',
      )}
      onDragOver={handleDesktopDragOver}
      onDrop={handleDesktopDrop}
      onContextMenu={(event) => {
        event.preventDefault()
        setContextMenu(null)
        setDesktopContextMenu({ x: event.clientX, y: event.clientY })
      }}
    >
      {widgets.map((widget) =>
        widget.kind === 'sticky-note' ? (
          <OsStickyNoteWidget
            key={widget.id}
            widget={widget}
            editable={canEditLayout}
            wallpaperInteractive={wallpaperInteractive}
            mentionContext={mentionContext}
            onMove={onMoveWidget}
            onResize={onResizeWidget}
            onRotate={onRotateWidget}
            onUpdate={onUpdateStickyNote}
            onDelete={onDeleteWidget}
            onChangeLayer={onChangeWidgetLayer}
            onOpenMention={onOpenMention}
          />
        ) : widget.kind === 'photo' ? (
          <OsPhotoWidget
            key={widget.id}
            widget={widget}
            serverId={serverId}
            editable={canEditLayout}
            wallpaperInteractive={wallpaperInteractive}
            onMove={onMoveWidget}
            onResize={onResizeWidget}
            onRotate={onRotateWidget}
            onDelete={onDeleteWidget}
            onChangeLayer={onChangeWidgetLayer}
            onEdit={openPhotoWidgetEditor}
          />
        ) : widget.kind === 'chat-input' ? (
          <OsChatInputWidget
            key={widget.id}
            widget={widget}
            serverId={serverId}
            inboxes={inboxes}
            editable={canEditLayout}
            wallpaperInteractive={wallpaperInteractive}
            onMove={onMoveWidget}
            onResize={onResizeWidget}
            onRotate={onRotateWidget}
            onDelete={onDeleteWidget}
            onChangeLayer={onChangeWidgetLayer}
            onEdit={openChatInputWidgetEditor}
            onOpenInboxBubble={onOpenInboxBubble}
          />
        ) : widget.kind === 'typewriter' ? (
          <OsTypewriterWidget
            key={widget.id}
            widget={widget}
            editable={canEditLayout}
            wallpaperInteractive={wallpaperInteractive}
            onMove={onMoveWidget}
            onResize={onResizeWidget}
            onRotate={onRotateWidget}
            onDelete={onDeleteWidget}
            onChangeLayer={onChangeWidgetLayer}
            onEdit={openTypewriterWidgetEditor}
          />
        ) : widget.kind === 'video-player' ? (
          <OsVideoWidget
            key={widget.id}
            widget={widget}
            editable={canEditLayout}
            wallpaperInteractive={wallpaperInteractive}
            onMove={onMoveWidget}
            onResize={onResizeWidget}
            onRotate={onRotateWidget}
            onDelete={onDeleteWidget}
            onChangeLayer={onChangeWidgetLayer}
            onEdit={openVideoWidgetEditor}
          />
        ) : widget.kind === 'web-embed' ? (
          <OsWebEmbedWidget
            key={widget.id}
            widget={widget}
            serverId={serverId}
            editable={canEditLayout}
            wallpaperInteractive={wallpaperInteractive}
            onMove={onMoveWidget}
            onResize={onResizeWidget}
            onRotate={onRotateWidget}
            onDelete={onDeleteWidget}
            onChangeLayer={onChangeWidgetLayer}
            onEdit={openWebEmbedWidgetEditor}
          />
        ) : widget.kind === 'remote-widget' ? (
          <OsRemoteWidget
            key={widget.id}
            widget={widget}
            entry={widgetCatalog.find((entry) => entry.sourceId === widget.sourceId)}
            serverId={serverId}
            editable={canEditLayout}
            wallpaperInteractive={wallpaperInteractive}
            onMove={onMoveWidget}
            onResize={onResizeWidget}
            onRotate={onRotateWidget}
            onUpdate={(id, options) => onUpdateRemoteWidget(id, options)}
            onDelete={onDeleteWidget}
            onChangeLayer={onChangeWidgetLayer}
          />
        ) : null,
      )}
      {items.map((item) => {
        const isRenaming = item.kind === 'workspace-node' && item.node.id === renamingNodeId
        const itemPreview = dragPreview?.id === item.id ? dragPreview : null
        return (
          <OsDesktopItemButton
            key={item.id}
            item={item}
            isRenaming={isRenaming}
            preview={itemPreview}
            renameDraft={isRenaming ? renameDraft : ''}
            wallpaperInteractive={wallpaperInteractive}
            onOpenItem={openItem}
            onItemKeyDown={handleItemKeyDown}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerEnd={handlePointerEnd}
            onPointerCancel={handlePointerCancel}
            onContextMenu={handleIconContextMenu}
            onRenameDraftChange={setRenameDraft}
            onSubmitRename={submitRename}
            onCancelRename={cancelRename}
          />
        )
      })}
      {contextMenu ? (
        <div className="pointer-events-auto">
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            groups={contextMenuGroups}
            onClose={() => setContextMenu(null)}
            minWidth={190}
          />
        </div>
      ) : null}
      {desktopContextMenu ? (
        <div className="pointer-events-auto">
          <ContextMenu
            x={desktopContextMenu.x}
            y={desktopContextMenu.y}
            groups={desktopContextMenuGroups}
            onClose={() => setDesktopContextMenu(null)}
            minWidth={180}
          />
        </div>
      ) : null}
      {widgetPickerPoint ? (
        <OsWidgetPickerModal
          items={widgetPickerItems}
          open
          onClose={() => setWidgetPickerPoint(null)}
        />
      ) : null}
      {chatInputWidgetEditor ? (
        <OsChatInputWidgetEditorModal
          initialValue={chatInputWidgetEditor.widget}
          inboxes={inboxes}
          open
          onClose={() => setChatInputWidgetEditor(null)}
          onSubmit={(values) => {
            onUpdateChatInputWidget(
              chatInputWidgetEditor.widget.id,
              chatInputWidgetFromForm(values),
            )
            setChatInputWidgetEditor(null)
          }}
        />
      ) : null}
      {photoWidgetEditor ? (
        <OsPhotoWidgetEditorModal
          serverId={serverId}
          initialValue={photoWidgetEditor.widget}
          open
          onClose={() => setPhotoWidgetEditor(null)}
          onSubmit={(values) => {
            const input = photoWidgetFromForm(values)
            if (!input) return
            if (photoWidgetEditor.widget) {
              onUpdatePhotoWidget(photoWidgetEditor.widget.id, input)
            } else if (photoWidgetEditor.point) {
              onCreatePhotoWidget(photoWidgetEditor.point, input)
            }
            setPhotoWidgetEditor(null)
          }}
        />
      ) : null}
      {typewriterWidgetEditor ? (
        <OsTypewriterWidgetEditorModal
          initialValue={typewriterWidgetEditor.widget}
          open
          onClose={() => setTypewriterWidgetEditor(null)}
          onSubmit={(values) => {
            const input = typewriterWidgetFromForm(values)
            if (typewriterWidgetEditor.widget) {
              onUpdateTypewriterWidget(typewriterWidgetEditor.widget.id, input)
            } else if (typewriterWidgetEditor.point) {
              onCreateTypewriterWidget(typewriterWidgetEditor.point, input)
            }
            setTypewriterWidgetEditor(null)
          }}
        />
      ) : null}
      {videoWidgetEditor ? (
        <OsVideoWidgetEditorModal
          provider={videoWidgetEditor.provider}
          initialValue={videoWidgetEditor.widget}
          open
          onClose={() => setVideoWidgetEditor(null)}
          onSubmit={(values) => {
            const input = videoWidgetFromForm(videoWidgetEditor.provider, values)
            if (videoWidgetEditor.widget) {
              onUpdateVideoWidget(videoWidgetEditor.widget.id, input)
            } else if (videoWidgetEditor.point) {
              onCreateVideoWidget(videoWidgetEditor.provider, videoWidgetEditor.point, input)
            }
            setVideoWidgetEditor(null)
          }}
        />
      ) : null}
      {webEmbedWidgetEditor ? (
        <OsWebEmbedWidgetEditorModal
          serverId={serverId}
          initialValue={webEmbedWidgetEditor.widget}
          open
          onClose={() => setWebEmbedWidgetEditor(null)}
          onSubmit={(values) => {
            const input = webEmbedWidgetFromForm(values)
            if (!input) return
            if (webEmbedWidgetEditor.widget) {
              onUpdateWebEmbedWidget(webEmbedWidgetEditor.widget.id, input)
            } else if (webEmbedWidgetEditor.point) {
              onCreateWebEmbedWidget(webEmbedWidgetEditor.point, input)
            }
            setWebEmbedWidgetEditor(null)
          }}
        />
      ) : null}
    </div>
  )
}

export const OsDesktop = memo(OsDesktopComponent)
