import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Modal,
  ModalBody,
  ModalButtonGroup,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Switch,
} from '@shadowob/ui'
import { useQueryClient } from '@tanstack/react-query'
import DOMPurify from 'dompurify'
import {
  AppWindow,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  FileText,
  Folder,
  FolderOpen,
  Globe,
  ImageIcon,
  Keyboard,
  Loader2,
  Maximize2,
  MessageSquare,
  Play,
  Plus,
  RotateCw,
  StickyNote,
  Trash2,
  Upload,
  Video,
  X,
  Youtube,
} from 'lucide-react'
import { marked } from 'marked'
import {
  type CSSProperties,
  type DragEvent,
  memo,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { MessageInput } from '../../../components/chat/message-input'
import { ContextMenu, type ContextMenuGroup } from '../../../components/common/context-menu'
import { getFileTypeVisual } from '../../../components/common/file-type-visual'
import {
  buildWorkspaceContextMenuGroups,
  workspaceContextMenuLabels,
} from '../../../components/workspace/WorkspaceContextMenu'
import {
  type PickerResult,
  WorkspaceFilePicker,
} from '../../../components/workspace/WorkspaceFilePicker'
import { fetchApi } from '../../../lib/api'
import type { WorkspaceNode } from '../../../stores/workspace.store'
import { OsBuiltinAppIcon } from '../builtin-icons'
import { AppIcon } from '../components'
import { OsHtmlWallpaperFrame } from '../html-wallpaper-frame'
import type {
  BuddyInboxEntry,
  ChannelMeta,
  OsBuiltinAppKey,
  OsChatInputWidgetMode,
  OsDesktopChatInputWidget,
  OsDesktopItem,
  OsDesktopPhotoWidget,
  OsDesktopTypewriterWidget,
  OsDesktopVideoWidget,
  OsDesktopWebEmbedWidget,
  OsDesktopWidget,
  OsDesktopWorkspaceItem,
  OsPhotoWidgetSourceType,
  OsStickyNoteMentionContext,
  OsStickyNoteMentionTarget,
  OsTypewriterWidgetFontFamily,
  OsTypewriterWidgetTextShadow,
  OsVideoWidgetProvider,
  OsWebEmbedWidgetSourceType,
} from '../types'
import { buddyDisplayName, OS_TOP_BAR_HEIGHT, OS_WORKSPACE_NODE_DRAG_TYPE } from '../utils'
import {
  DESKTOP_CELL_HEIGHT,
  DESKTOP_CELL_WIDTH,
  DESKTOP_WIDGET_DEFAULT_Z_INDEX,
  snapDesktopPoint,
} from './geometry'
import { renderStickyNoteMarkdown, STICKY_NOTE_MARKDOWN_STYLE } from './sticky-note-markdown'
import {
  type OsWidgetLayerDirection,
  OsWidgetResizeHandle,
  OsWidgetRotateHandle,
  OsWidgetToolbar,
  rotateFromPointerDelta,
  useWidgetTransformEditor,
  widgetActiveZIndex,
  widgetHeightCells,
  widgetRotation,
  widgetZIndex,
} from './widget-controls'

function OsStickyNoteWidgetComponent({
  widget,
  editable,
  wallpaperInteractive,
  mentionContext,
  onMove,
  onResize,
  onRotate,
  onUpdate,
  onDelete,
  onChangeLayer,
  onOpenMention,
}: {
  widget: Extract<OsDesktopWidget, { kind: 'sticky-note' }>
  editable: boolean
  wallpaperInteractive: boolean
  mentionContext: OsStickyNoteMentionContext
  onMove: (id: string, point: { x: number; y: number }) => void
  onResize: (id: string, size: { widthCells: number; heightCells: number }) => void
  onRotate: (id: string, rotation: number) => void
  onUpdate: (id: string, content: string) => void
  onDelete: (id: string) => void
  onChangeLayer: (id: string, direction: OsWidgetLayerDirection) => void
  onOpenMention: (target: OsStickyNoteMentionTarget) => void
}) {
  const { t } = useTranslation()
  const [hovered, setHovered] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(widget.content)
  const dragRef = useRef<{
    pointerId: number
    offsetX: number
    offsetY: number
    lastX: number
    lastY: number
  } | null>(null)
  const resizeRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    startWidthCells: number
    startHeightCells: number
    lastWidthCells: number
    lastHeightCells: number
  } | null>(null)
  const rotateRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    startRotation: number
    lastRotation: number
  } | null>(null)
  const [preview, setPreview] = useState<{
    x?: number
    y?: number
    widthCells?: number
    heightCells?: number
    rotation?: number
  } | null>(null)
  const { transformEditing, beginTransformEdit, applyTransformEdit, cancelTransformEdit } =
    useWidgetTransformEditor({
      widget,
      editable,
      onMove,
      onResize,
      onRotate,
    })

  useEffect(() => {
    if (!editing) setDraft(widget.content)
  }, [editing, widget.content])

  const currentX = preview?.x ?? widget.x
  const currentY = preview?.y ?? widget.y
  const currentWidthCells = preview?.widthCells ?? widget.widthCells
  const currentHeightCells = preview?.heightCells ?? widget.heightCells
  const currentRotation = preview?.rotation ?? widgetRotation(widget)
  const width = currentWidthCells * DESKTOP_CELL_WIDTH - 12
  const height = currentHeightCells * DESKTOP_CELL_HEIGHT - 12
  const renderedMarkdown = useMemo(
    () => renderStickyNoteMarkdown(widget.content, mentionContext, t('os.stickyNotePlaceholder')),
    [mentionContext, t, widget.content],
  )

  const commitDraft = () => {
    setEditing(false)
    if (draft !== widget.content) onUpdate(widget.id, draft)
  }

  const handleRenderedMarkdownClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null
    const button = target?.closest<HTMLButtonElement>('[data-shadow-mention-key]')
    const mentionKey = button?.dataset.shadowMentionKey
    const mention = mentionKey ? renderedMarkdown.targets.get(mentionKey) : null
    if (!mention) return
    event.preventDefault()
    event.stopPropagation()
    onOpenMention(mention)
  }

  const handleDragStart = (event: ReactPointerEvent<HTMLElement>) => {
    if (!transformEditing) return
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - currentX,
      offsetY: event.clientY - currentY,
      lastX: currentX,
      lastY: currentY,
    }
  }

  const handleDragMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const next = {
      x: Math.max(0, event.clientX - drag.offsetX),
      y: Math.max(OS_TOP_BAR_HEIGHT, event.clientY - drag.offsetY),
    }
    drag.lastX = next.x
    drag.lastY = next.y
    setPreview((current) => ({ ...current, ...next }))
  }

  const handleDragEnd = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    onMove(widget.id, snapDesktopPoint({ x: drag.lastX, y: drag.lastY }))
    dragRef.current = null
    setPreview(null)
  }

  const handleResizeStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!transformEditing) return
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    resizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startWidthCells: currentWidthCells,
      startHeightCells: currentHeightCells,
      lastWidthCells: currentWidthCells,
      lastHeightCells: currentHeightCells,
    }
  }

  const handleResizeMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    const widthCells = Math.min(
      12,
      Math.max(
        2,
        Math.round(resize.startWidthCells + (event.clientX - resize.startX) / DESKTOP_CELL_WIDTH),
      ),
    )
    const heightCells = Math.min(
      12,
      Math.max(
        2,
        Math.round(resize.startHeightCells + (event.clientY - resize.startY) / DESKTOP_CELL_HEIGHT),
      ),
    )
    resize.lastWidthCells = widthCells
    resize.lastHeightCells = heightCells
    setPreview((current) => ({ ...current, widthCells, heightCells }))
  }

  const handleResizeEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    onResize(widget.id, {
      widthCells: resize.lastWidthCells,
      heightCells: resize.lastHeightCells,
    })
    resizeRef.current = null
    setPreview(null)
  }

  const handleRotateStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!transformEditing) return
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    rotateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startRotation: currentRotation,
      lastRotation: currentRotation,
    }
  }

  const handleRotateMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const rotate = rotateRef.current
    if (!rotate || rotate.pointerId !== event.pointerId) return
    const rotation = rotateFromPointerDelta(
      rotate.startRotation,
      rotate.startX,
      rotate.startY,
      event,
    )
    rotate.lastRotation = rotation
    setPreview((current) => ({ ...current, rotation }))
  }

  const handleRotateEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const rotate = rotateRef.current
    if (!rotate || rotate.pointerId !== event.pointerId) return
    onRotate(widget.id, rotate.lastRotation)
    rotateRef.current = null
    setPreview(null)
  }

  return (
    <section
      className={cn(
        'group absolute z-10 select-none overflow-visible',
        wallpaperInteractive && 'pointer-events-auto',
      )}
      style={{
        left: currentX,
        top: currentY,
        zIndex: hovered || transformEditing ? widgetActiveZIndex(widget) : widgetZIndex(widget),
        width,
        height,
        transform: `rotate(${currentRotation}deg)`,
        transformOrigin: 'center center',
        isolation: 'isolate',
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <OsWidgetToolbar
        title={t('os.stickyNoteWidget')}
        editable={editable}
        transformEditing={transformEditing}
        onBeginTransformEdit={beginTransformEdit}
        onApplyTransformEdit={applyTransformEdit}
        onCancelTransformEdit={cancelTransformEdit}
        onChangeLayer={(direction) => onChangeLayer(widget.id, direction)}
        actions={[
          {
            label: t('common.delete'),
            onClick: () => onDelete(widget.id),
            danger: true,
          },
        ]}
      />
      <style>{STICKY_NOTE_MARKDOWN_STYLE}</style>
      <div
        className={cn(
          'flex h-full flex-col overflow-hidden bg-[#ffeb3b] px-5 py-4 text-[#333] shadow-[4px_6px_15px_rgba(0,0,0,0.16)]',
          transformEditing && 'cursor-grab active:cursor-grabbing',
        )}
        style={{ borderRadius: '2px 2px 20px 2px', contain: 'layout paint style' }}
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        {editing ? (
          <textarea
            autoFocus
            value={draft}
            placeholder={t('os.stickyNotePlaceholder')}
            className="h-full min-h-[96px] w-full flex-1 resize-none border-0 bg-transparent font-['Courier_New',Courier,monospace] text-[14px] leading-[1.55] text-[#333] outline-none placeholder:text-[#8d821e]/70"
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onBlur={commitDraft}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                setDraft(widget.content)
                setEditing(false)
              }
            }}
          />
        ) : (
          <div
            className="os-sticky-note-markdown min-h-0 flex-1 cursor-pointer overflow-y-auto"
            onClick={handleRenderedMarkdownClick}
            onDoubleClick={() => {
              if (editable && !transformEditing) setEditing(true)
            }}
            dangerouslySetInnerHTML={{ __html: renderedMarkdown.html }}
          />
        )}
      </div>
      <OsWidgetResizeHandle
        editable={transformEditing}
        label={t('os.resizeWidget')}
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
        onPointerCancel={handleResizeEnd}
      />
      <OsWidgetRotateHandle
        editable={transformEditing}
        label={t('os.rotateWidget')}
        onPointerDown={handleRotateStart}
        onPointerMove={handleRotateMove}
        onPointerUp={handleRotateEnd}
        onPointerCancel={handleRotateEnd}
      />
    </section>
  )
}

export const OsStickyNoteWidget = memo(OsStickyNoteWidgetComponent)
