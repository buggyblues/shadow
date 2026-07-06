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

export interface WebEmbedWidgetFormValues {
  sourceType: OsWebEmbedWidgetSourceType
  source: string
  title: string
  workspaceFileName: string
}

const DEFAULT_WEB_EMBED_WIDGET_FORM: WebEmbedWidgetFormValues = {
  sourceType: 'url',
  source: '',
  title: '',
  workspaceFileName: '',
}

function normalizeWebEmbedUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString()
  } catch {
    return null
  }
}

export function webEmbedWidgetFromForm(
  form: WebEmbedWidgetFormValues,
): Omit<
  OsDesktopWebEmbedWidget,
  'id' | 'kind' | 'x' | 'y' | 'widthCells' | 'heightCells' | 'updatedAt'
> | null {
  if (form.sourceType === 'url') {
    const url = normalizeWebEmbedUrl(form.source)
    if (!url) return null
    return {
      sourceType: 'url',
      source: url,
      title: form.title.trim() || undefined,
      workspaceFileName: null,
    }
  }

  const fileId = form.source.trim()
  if (!fileId) return null
  return {
    sourceType: 'workspace-file',
    source: fileId,
    title: form.title.trim() || form.workspaceFileName.trim() || undefined,
    workspaceFileName: form.workspaceFileName.trim() || null,
  }
}

function OsWebEmbedWidgetContent({
  widget,
  serverId,
}: {
  widget: OsDesktopWebEmbedWidget
  serverId: string
}) {
  const { t } = useTranslation()
  const [workspaceUrl, setWorkspaceUrl] = useState<string | null>(null)
  const [workspaceError, setWorkspaceError] = useState(false)

  useEffect(() => {
    if (widget.sourceType !== 'workspace-file') return
    let cancelled = false
    setWorkspaceUrl(null)
    setWorkspaceError(false)

    fetchApi<{ url: string }>(
      `/api/servers/${serverId}/workspace/files/${widget.source}/media-url?disposition=inline`,
    )
      .then((result) => {
        if (!cancelled) setWorkspaceUrl(result.url)
      })
      .catch(() => {
        if (!cancelled) setWorkspaceError(true)
      })

    return () => {
      cancelled = true
    }
  }, [serverId, widget.source, widget.sourceType])

  if (widget.sourceType === 'url') {
    const src = normalizeWebEmbedUrl(widget.source)
    if (!src) {
      return (
        <div className="grid h-full place-items-center px-4 text-center text-xs font-bold leading-5 text-white/58">
          {t('os.webEmbedInvalidSource')}
        </div>
      )
    }
    return (
      <iframe
        title={widget.title?.trim() || t('os.webEmbedWidget')}
        src={src}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-downloads"
        className="h-full w-full border-0 bg-white"
      />
    )
  }

  if (workspaceError) {
    return (
      <div className="grid h-full place-items-center px-4 text-center text-xs font-bold leading-5 text-white/58">
        {t('os.webEmbedMissingWorkspaceFile')}
      </div>
    )
  }

  if (!workspaceUrl) {
    return (
      <div className="grid h-full place-items-center text-white/58">
        <Loader2 size={18} className="animate-spin" />
      </div>
    )
  }

  return (
    <OsHtmlWallpaperFrame
      title={widget.title?.trim() || widget.workspaceFileName || t('os.webEmbedWidget')}
      src={workspaceUrl}
      className="h-full w-full border-0 bg-black"
    />
  )
}

function OsWebEmbedWidgetComponent({
  widget,
  serverId,
  editable,
  wallpaperInteractive,
  onMove,
  onResize,
  onRotate,
  onDelete,
  onChangeLayer,
  onEdit,
}: {
  widget: OsDesktopWebEmbedWidget
  serverId: string
  editable: boolean
  wallpaperInteractive: boolean
  onMove: (id: string, point: { x: number; y: number }) => void
  onResize: (id: string, size: { widthCells: number; heightCells: number }) => void
  onRotate: (id: string, rotation: number) => void
  onDelete: (id: string) => void
  onChangeLayer: (id: string, direction: OsWidgetLayerDirection) => void
  onEdit: (widget: OsDesktopWebEmbedWidget) => void
}) {
  const { t } = useTranslation()
  const [hovered, setHovered] = useState(false)
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

  const currentX = preview?.x ?? widget.x
  const currentY = preview?.y ?? widget.y
  const currentWidthCells = preview?.widthCells ?? widget.widthCells
  const currentHeightCells = preview?.heightCells ?? widget.heightCells
  const currentRotation = preview?.rotation ?? widgetRotation(widget)
  const width = currentWidthCells * DESKTOP_CELL_WIDTH - 12
  const height = currentHeightCells * DESKTOP_CELL_HEIGHT - 12
  const title =
    widget.title?.trim() ||
    (widget.sourceType === 'workspace-file' ? widget.workspaceFileName : null) ||
    t('os.webEmbedWidget')

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
      16,
      Math.max(
        4,
        Math.round(resize.startWidthCells + (event.clientX - resize.startX) / DESKTOP_CELL_WIDTH),
      ),
    )
    const heightCells = Math.min(
      12,
      Math.max(
        4,
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
        'group absolute z-10 select-none overflow-visible rounded-xl bg-black text-white shadow-[0_18px_48px_rgba(0,0,0,0.38)]',
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
        title={title}
        editable={editable}
        transformEditing={transformEditing}
        onBeginTransformEdit={beginTransformEdit}
        onApplyTransformEdit={applyTransformEdit}
        onCancelTransformEdit={cancelTransformEdit}
        onChangeLayer={(direction) => onChangeLayer(widget.id, direction)}
        actions={[
          {
            label: t('os.customizeWidget'),
            onClick: () => onEdit(widget),
          },
          {
            label: t('common.delete'),
            onClick: () => onDelete(widget.id),
            danger: true,
          },
        ]}
      />
      {transformEditing ? (
        <div
          className="absolute inset-0 z-20 cursor-grab rounded-xl bg-transparent active:cursor-grabbing"
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
        />
      ) : null}
      <div
        className="h-full w-full overflow-hidden rounded-xl bg-black"
        style={{ contain: 'layout paint style' }}
      >
        <OsWebEmbedWidgetContent widget={widget} serverId={serverId} />
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

export const OsWebEmbedWidget = memo(OsWebEmbedWidgetComponent)

export function OsWebEmbedWidgetEditorModal({
  serverId,
  initialValue,
  open,
  onClose,
  onSubmit,
}: {
  serverId: string
  initialValue?: OsDesktopWebEmbedWidget | null
  open: boolean
  onClose: () => void
  onSubmit: (values: WebEmbedWidgetFormValues) => void
}) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<WebEmbedWidgetFormValues>(DEFAULT_WEB_EMBED_WIDGET_FORM)
  const [sourceTouched, setSourceTouched] = useState(false)
  const [showPicker, setShowPicker] = useState(false)

  useEffect(() => {
    if (!open) return
    setDraft(
      initialValue
        ? {
            sourceType: initialValue.sourceType,
            source: initialValue.source,
            title: initialValue.title ?? '',
            workspaceFileName: initialValue.workspaceFileName ?? '',
          }
        : DEFAULT_WEB_EMBED_WIDGET_FORM,
    )
    setSourceTouched(false)
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [initialValue, open])

  const isValidSource =
    draft.sourceType === 'url'
      ? Boolean(normalizeWebEmbedUrl(draft.source))
      : draft.source.trim().length > 0
  const showSourceError = sourceTouched && !isValidSource

  const submit = () => {
    setSourceTouched(true)
    if (!isValidSource) return
    onSubmit(draft)
  }

  const handlePickerConfirm = (result: PickerResult) => {
    setShowPicker(false)
    setSourceTouched(false)
    setDraft((current) => ({
      ...current,
      sourceType: 'workspace-file',
      source: result.node.id,
      title: current.title.trim() || result.node.name,
      workspaceFileName: result.node.name,
    }))
  }

  return (
    <>
      <Modal open={open} onClose={onClose}>
        <ModalContent className="z-[900] w-[min(92vw,520px)]">
          <ModalHeader
            icon={<Globe size={18} />}
            title={initialValue ? t('os.editWebEmbedWidgetTitle') : t('os.addWebEmbedWidgetTitle')}
            closeLabel={t('common.close')}
          />
          <ModalBody className="space-y-4 py-5">
            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border-subtle bg-bg-tertiary/70 p-1.5">
              {[
                { type: 'url' as const, label: t('os.webEmbedSourceUrl'), icon: Globe },
                {
                  type: 'workspace-file' as const,
                  label: t('os.webEmbedSourceWorkspace'),
                  icon: FileText,
                },
              ].map((item) => {
                const Icon = item.icon
                const active = draft.sourceType === item.type
                return (
                  <button
                    key={item.type}
                    type="button"
                    className={cn(
                      'flex h-9 items-center justify-center gap-2 rounded-xl text-sm font-black transition',
                      active
                        ? 'bg-bg-primary text-text-primary shadow-sm'
                        : 'text-text-muted hover:bg-bg-primary/55 hover:text-text-primary',
                    )}
                    onClick={() => {
                      setSourceTouched(false)
                      setDraft((current) => ({
                        ...current,
                        sourceType: item.type,
                        source: item.type === current.sourceType ? current.source : '',
                        workspaceFileName:
                          item.type === current.sourceType ? current.workspaceFileName : '',
                      }))
                      if (item.type === 'url') {
                        window.requestAnimationFrame(() =>
                          inputRef.current?.focus({ preventScroll: true }),
                        )
                      }
                    }}
                  >
                    <Icon size={15} />
                    <span className="truncate">{item.label}</span>
                  </button>
                )
              })}
            </div>

            {draft.sourceType === 'url' ? (
              <Input
                ref={inputRef}
                label={t('os.webEmbedUrl')}
                value={draft.source}
                placeholder={t('os.webEmbedUrlPlaceholder')}
                onBlur={() => setSourceTouched(true)}
                onChange={(event) => {
                  const source = event.target.value
                  setDraft((current) => ({ ...current, source }))
                }}
              />
            ) : (
              <div className="grid gap-2">
                <p className="text-xs font-black uppercase tracking-widest text-text-muted/70">
                  {t('os.webEmbedWorkspaceFile')}
                </p>
                <button
                  type="button"
                  className="flex h-11 items-center gap-3 rounded-xl border border-border-subtle bg-bg-tertiary px-3 text-left text-sm font-bold text-text-primary transition hover:border-primary/40 hover:text-primary"
                  onClick={() => setShowPicker(true)}
                >
                  <FolderOpen size={16} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">
                    {draft.workspaceFileName || t('os.webEmbedChooseWorkspaceFile')}
                  </span>
                </button>
              </div>
            )}

            {showSourceError ? (
              <p className="-mt-2 text-xs font-bold text-danger">{t('os.webEmbedInvalidSource')}</p>
            ) : null}

            <Input
              label={t('os.webEmbedTitle')}
              value={draft.title}
              placeholder={t('os.webEmbedWidget')}
              onChange={(event) => {
                const title = event.target.value
                setDraft((current) => ({ ...current, title }))
              }}
            />
          </ModalBody>
          <ModalFooter>
            <ModalButtonGroup>
              <Button type="button" variant="ghost" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button type="button" variant="primary" onClick={submit}>
                {initialValue ? t('common.save') : t('common.add')}
              </Button>
            </ModalButtonGroup>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {showPicker ? (
        <WorkspaceFilePicker
          serverId={serverId}
          mode="select-file"
          title={t('os.webEmbedWorkspacePickerTitle')}
          accept={['.html', '.htm']}
          overlayClassName="z-[940]"
          onConfirm={handlePickerConfirm}
          onClose={() => setShowPicker(false)}
        />
      ) : null}
    </>
  )
}
