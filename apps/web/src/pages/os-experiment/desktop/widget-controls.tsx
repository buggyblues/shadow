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
  DESKTOP_WIDGET_MAX_Z_INDEX,
  snapDesktopPoint,
  WIDGET_ROTATION_SNAP_DEGREES,
} from './geometry'

export type OsWidgetToolbarAction = {
  label: string
  onClick: () => void
  danger?: boolean
}

export type OsWidgetLayerDirection = 'forward' | 'backward'

export type OsWidgetTransformSnapshot = {
  x: number
  y: number
  widthCells: number
  heightCells: number
  rotation: number
}

export type OsWidgetTransformConstraints = {
  minWidthCells?: number
  maxWidthCells?: number
  minHeightCells?: number
  maxHeightCells?: number
}

export type OsWidgetMenuSide = 'top' | 'bottom' | 'left'

export function widgetZIndex(widget: { zIndex?: number }) {
  return typeof widget.zIndex === 'number' && Number.isFinite(widget.zIndex)
    ? Math.min(DESKTOP_WIDGET_MAX_Z_INDEX, Math.max(0, Math.round(widget.zIndex)))
    : DESKTOP_WIDGET_DEFAULT_Z_INDEX
}

export function widgetActiveZIndex(widget: { zIndex?: number }) {
  return widgetZIndex(widget) + DESKTOP_WIDGET_MAX_Z_INDEX
}

function clampWidgetRotation(value: number) {
  return Math.min(45, Math.max(-45, value))
}

export function widgetRotation(widget: { rotation?: number }) {
  return clampWidgetRotation(typeof widget.rotation === 'number' ? widget.rotation : 0)
}

export function widgetHeightCells(widget: OsDesktopWidget | { heightCells?: number }) {
  return 'heightCells' in widget && typeof widget.heightCells === 'number' ? widget.heightCells : 1
}

export function rotateFromPointerDelta(
  startRotation: number,
  startX: number,
  startY: number,
  event: { clientX: number; clientY: number; shiftKey?: boolean },
) {
  const rotation = clampWidgetRotation(
    startRotation + (event.clientX - startX + startY - event.clientY) * 0.35,
  )
  if (!event.shiftKey) return rotation
  return clampWidgetRotation(
    Math.round(rotation / WIDGET_ROTATION_SNAP_DEGREES) * WIDGET_ROTATION_SNAP_DEGREES,
  )
}

export function resolveWidgetMenuSide(trigger: HTMLButtonElement | null): OsWidgetMenuSide {
  if (typeof window === 'undefined' || !trigger) return 'top'
  const widgetElement = trigger.closest('section')
  const rect = widgetElement?.getBoundingClientRect() ?? trigger.getBoundingClientRect()
  const menuWidth = 208
  const menuHeight = 186
  const gap = 10
  const topLimit = OS_TOP_BAR_HEIGHT + gap

  if (rect.bottom + menuHeight + gap <= window.innerHeight) return 'bottom'
  if (rect.top - menuHeight - gap >= topLimit) return 'top'
  if (rect.left - menuWidth - gap >= 0) return 'left'
  return 'bottom'
}

export function useWidgetTransformEditor({
  widget,
  editable,
  onMove,
  onResize,
  onRotate,
  constraints,
}: {
  widget: OsDesktopWidget
  editable: boolean
  onMove: (id: string, point: { x: number; y: number }) => void
  onResize: (id: string, size: { widthCells: number; heightCells: number }) => void
  onRotate: (id: string, rotation: number) => void
  constraints?: OsWidgetTransformConstraints
}) {
  const [active, setActive] = useState(false)
  const [preview, setPreview] = useState<Partial<OsWidgetTransformSnapshot> | null>(null)
  const snapshotRef = useRef<OsWidgetTransformSnapshot | null>(null)
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

  const currentX = preview?.x ?? widget.x
  const currentY = preview?.y ?? widget.y
  const currentWidthCells = preview?.widthCells ?? widget.widthCells
  const currentHeightCells = preview?.heightCells ?? widgetHeightCells(widget)
  const currentRotation = preview?.rotation ?? widgetRotation(widget)

  useEffect(() => {
    if (!editable) {
      setActive(false)
      setPreview(null)
      snapshotRef.current = null
      dragRef.current = null
      resizeRef.current = null
      rotateRef.current = null
    }
  }, [editable])

  const begin = () => {
    if (!editable) return
    snapshotRef.current = {
      x: widget.x,
      y: widget.y,
      widthCells: widget.widthCells,
      heightCells: widgetHeightCells(widget),
      rotation: widgetRotation(widget),
    }
    setActive(true)
  }

  const apply = () => {
    snapshotRef.current = null
    setPreview(null)
    setActive(false)
  }

  const cancel = () => {
    const snapshot = snapshotRef.current
    snapshotRef.current = null
    dragRef.current = null
    resizeRef.current = null
    rotateRef.current = null
    setPreview(null)
    setActive(false)
    if (!snapshot) return
    onMove(widget.id, { x: snapshot.x, y: snapshot.y })
    onResize(widget.id, {
      widthCells: snapshot.widthCells,
      heightCells: snapshot.heightCells,
    })
    onRotate(widget.id, snapshot.rotation)
  }

  const handleDragStart = (event: ReactPointerEvent<HTMLElement>) => {
    if (!active || event.button !== 0) return
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
    if (!active || event.button !== 0) return
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
      constraints?.maxWidthCells ?? 16,
      Math.max(
        constraints?.minWidthCells ?? 2,
        Math.round(resize.startWidthCells + (event.clientX - resize.startX) / DESKTOP_CELL_WIDTH),
      ),
    )
    const heightCells = Math.min(
      constraints?.maxHeightCells ?? 12,
      Math.max(
        constraints?.minHeightCells ?? 2,
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
    if (!active || event.button !== 0) return
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

  return {
    transformEditing: editable && active,
    beginTransformEdit: begin,
    applyTransformEdit: apply,
    cancelTransformEdit: cancel,
    currentX,
    currentY,
    currentWidthCells,
    currentHeightCells,
    currentRotation,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    handleResizeStart,
    handleResizeMove,
    handleResizeEnd,
    handleRotateStart,
    handleRotateMove,
    handleRotateEnd,
  }
}

export function OsWidgetToolbar({
  title,
  editable,
  transformEditing = false,
  onBeginTransformEdit,
  onApplyTransformEdit,
  onCancelTransformEdit,
  onChangeLayer,
  actions,
}: {
  title: string
  editable: boolean
  transformEditing?: boolean
  onBeginTransformEdit?: () => void
  onApplyTransformEdit?: () => void
  onCancelTransformEdit?: () => void
  onChangeLayer?: (direction: OsWidgetLayerDirection) => void
  actions: OsWidgetToolbarAction[]
}) {
  const { t } = useTranslation()
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [menuSide, setMenuSide] = useState<OsWidgetMenuSide>('bottom')

  if (!editable) return null

  return (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[-46px] left-[-48px] top-[-12px] z-20 w-12 opacity-0 group-hover:pointer-events-auto group-focus-within:pointer-events-auto"
      />
      <DropdownMenu
        onOpenChange={(open) => {
          if (open) setMenuSide(resolveWidgetMenuSide(triggerRef.current))
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            className={cn(
              'group/widget-menu-trigger pointer-events-none absolute left-[-38px] top-0 z-[90] grid h-7 w-7 origin-center scale-75 place-items-center rounded-full border border-white/18 bg-black/52 text-white opacity-0 shadow-[0_8px_20px_rgba(0,0,0,0.24)] backdrop-blur-xl transition duration-200 ease-out group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 hover:scale-100 hover:border-white/28 hover:bg-black/78 hover:text-white hover:shadow-[0_10px_24px_rgba(0,0,0,0.34)] active:scale-95 data-[state=open]:pointer-events-auto data-[state=open]:scale-100 data-[state=open]:border-white/28 data-[state=open]:bg-black/78 data-[state=open]:text-white data-[state=open]:opacity-100 data-[state=open]:shadow-[0_10px_24px_rgba(0,0,0,0.34)]',
              transformEditing &&
                'pointer-events-auto scale-100 border-white/28 bg-black/78 text-white opacity-100 shadow-[0_10px_24px_rgba(0,0,0,0.34)] ring-2 ring-primary/40',
            )}
            aria-label={title}
            title={title}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <ChevronDown
              size={14}
              aria-hidden="true"
              className="transition-transform duration-200 ease-out group-data-[state=open]/widget-menu-trigger:rotate-180"
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={menuSide === 'left' ? 'start' : 'end'}
          avoidCollisions={false}
          side={menuSide}
          sideOffset={10}
          className="z-[2147482000] w-36 !min-w-[9rem] select-none border-white/12 bg-bg-secondary/96 p-1.5 text-text-primary shadow-[0_20px_64px_rgba(0,0,0,0.42)] backdrop-blur-2xl"
        >
          {onBeginTransformEdit ? (
            <DropdownMenuItem
              className="normal-case tracking-normal"
              disabled={transformEditing}
              onSelect={onBeginTransformEdit}
            >
              <span className="min-w-0 flex-1 truncate">{t('os.editWidgetLayout')}</span>
            </DropdownMenuItem>
          ) : null}
          {actions.map((action) => (
            <DropdownMenuItem
              key={action.label}
              className={cn(
                'normal-case tracking-normal',
                action.danger && 'text-danger focus:text-danger',
              )}
              onSelect={action.onClick}
            >
              <span className="min-w-0 flex-1 truncate">{action.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {transformEditing ? (
        <div className="pointer-events-auto absolute left-[-38px] top-9 z-50 flex flex-col gap-1">
          <button
            type="button"
            className="grid h-7 w-7 place-items-center rounded-full border border-emerald-100/45 bg-emerald-500/72 text-white shadow-[0_8px_20px_rgba(16,185,129,0.35)] backdrop-blur-xl transition duration-200 ease-out hover:scale-110 hover:bg-emerald-500/88 active:scale-95"
            aria-label={t('common.confirm')}
            title={t('common.confirm')}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onApplyTransformEdit}
          >
            <Check size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="grid h-7 w-7 place-items-center rounded-full border border-rose-100/45 bg-rose-500/72 text-white shadow-[0_8px_20px_rgba(244,63,94,0.35)] backdrop-blur-xl transition duration-200 ease-out hover:scale-110 hover:bg-rose-500/88 active:scale-95"
            aria-label={t('common.cancel')}
            title={t('common.cancel')}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onCancelTransformEdit}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      {transformEditing && onChangeLayer ? (
        <div className="pointer-events-auto absolute bottom-[-38px] left-1/2 z-50 flex -translate-x-1/2 gap-1">
          <button
            type="button"
            className="grid h-7 w-7 place-items-center rounded-full border border-white/24 bg-black/58 text-white/82 shadow-[0_8px_20px_rgba(0,0,0,0.3)] backdrop-blur-xl transition duration-200 ease-out hover:scale-110 hover:bg-black/78 hover:text-white active:scale-95"
            aria-label={t('os.sendWidgetBackward')}
            title={t('os.sendWidgetBackward')}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onChangeLayer('backward')}
          >
            <ArrowDown size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="grid h-7 w-7 place-items-center rounded-full border border-white/24 bg-black/58 text-white/82 shadow-[0_8px_20px_rgba(0,0,0,0.3)] backdrop-blur-xl transition duration-200 ease-out hover:scale-110 hover:bg-black/78 hover:text-white active:scale-95"
            aria-label={t('os.bringWidgetForward')}
            title={t('os.bringWidgetForward')}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onChangeLayer('forward')}
          >
            <ArrowUp size={15} aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </>
  )
}

export function OsWidgetResizeHandle({
  editable,
  label,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  editable: boolean
  label: string
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => void
}) {
  if (!editable) return null

  return (
    <button
      type="button"
      className={cn(
        'absolute z-40 grid h-7 w-7 cursor-nwse-resize place-items-center rounded-full border border-white/35 bg-black/52 text-white/80 opacity-0 shadow-[0_8px_20px_rgba(0,0,0,0.3)] backdrop-blur-xl transition duration-200 ease-out hover:scale-110 hover:bg-black/72 hover:text-white active:scale-95 group-hover:opacity-100 group-focus-within:opacity-100',
        'bottom-[-28px] right-[-28px]',
      )}
      aria-label={label}
      title={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <Maximize2 size={14} strokeWidth={2.35} aria-hidden="true" className="-scale-x-100" />
    </button>
  )
}

export function OsWidgetRotateHandle({
  editable,
  label,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  editable: boolean
  label: string
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => void
}) {
  if (!editable) return null

  return (
    <button
      type="button"
      className="absolute left-1/2 top-[-34px] z-40 grid h-7 w-7 -translate-x-1/2 cursor-move place-items-center rounded-full border border-white/35 bg-black/58 text-white/86 opacity-0 shadow-[0_8px_20px_rgba(0,0,0,0.3)] backdrop-blur-xl transition duration-200 ease-out hover:scale-110 hover:bg-black/78 hover:text-white active:scale-95 group-hover:opacity-100 group-focus-within:opacity-100"
      aria-label={label}
      title={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <RotateCw size={13} />
    </button>
  )
}
