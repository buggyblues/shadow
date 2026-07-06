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

export type VideoWidgetFormValues = {
  source: string
  title: string
  coverUrl: string
  autoplay: boolean
  muted: boolean
  danmaku: boolean
  showCover: boolean
}

const DEFAULT_VIDEO_WIDGET_FORM: VideoWidgetFormValues = {
  source: '',
  title: '',
  coverUrl: '',
  autoplay: false,
  muted: true,
  danmaku: true,
  showCover: true,
}

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/
const BILIBILI_BVID_PATTERN = /(BV[0-9A-Za-z]{10})/i

function parseUrl(value: string) {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function parseYoutubeVideoId(source: string) {
  const trimmed = source.trim()
  if (YOUTUBE_ID_PATTERN.test(trimmed)) return trimmed
  const url = parseUrl(trimmed)
  if (!url) return null

  const host = url.hostname.replace(/^www\./, '')
  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0]
    return id && YOUTUBE_ID_PATTERN.test(id) ? id : null
  }

  if (host !== 'youtube.com' && host !== 'm.youtube.com' && host !== 'music.youtube.com') {
    return null
  }

  const queryId = url.searchParams.get('v')
  if (queryId && YOUTUBE_ID_PATTERN.test(queryId)) return queryId

  const parts = url.pathname.split('/').filter(Boolean)
  const markerIndex = parts.findIndex((part) => ['embed', 'shorts', 'live'].includes(part))
  const id = markerIndex >= 0 ? parts[markerIndex + 1] : null
  return id && YOUTUBE_ID_PATTERN.test(id) ? id : null
}

function buildYoutubeEmbedUrl(widget: OsDesktopVideoWidget, forceAutoplay = false) {
  const videoId = parseYoutubeVideoId(widget.source)
  if (!videoId) return null
  const url = new URL(`https://www.youtube.com/embed/${videoId}`)
  url.searchParams.set('rel', '0')
  url.searchParams.set('modestbranding', '1')
  url.searchParams.set('playsinline', '1')
  url.searchParams.set('autoplay', widget.autoplay || forceAutoplay ? '1' : '0')
  if (widget.muted) url.searchParams.set('mute', '1')
  return {
    src: url.toString(),
    coverUrl: widget.coverUrl?.trim() || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  }
}

function extractBilibiliPlayerParams(source: string) {
  const trimmed = source.trim()
  const params = new URLSearchParams()
  const url = parseUrl(trimmed)

  if (url) {
    const host = url.hostname.replace(/^www\./, '')
    if (host === 'player.bilibili.com') {
      for (const key of ['bvid', 'aid', 'cid', 'page', 'p']) {
        const value = url.searchParams.get(key)
        if (value) params.set(key, value)
      }
    } else if (host === 'bilibili.com' || host === 'm.bilibili.com') {
      const bvid = url.pathname.match(BILIBILI_BVID_PATTERN)?.[1]
      const aid = url.pathname.match(/\/video\/av(\d+)/i)?.[1]
      if (bvid) params.set('bvid', bvid)
      if (aid) params.set('aid', aid)
      for (const key of ['cid', 'page', 'p']) {
        const value = url.searchParams.get(key)
        if (value) params.set(key, value)
      }
    }
  } else {
    const bvid = trimmed.match(BILIBILI_BVID_PATTERN)?.[1]
    const aid = trimmed.match(/^av?(\d+)$/i)?.[1]
    if (bvid) params.set('bvid', bvid)
    if (aid) params.set('aid', aid)
  }

  if (!params.has('bvid') && !params.has('aid')) return null
  if (!params.has('page') && !params.has('p')) params.set('page', '1')
  return params
}

function buildBilibiliEmbedUrl(widget: OsDesktopVideoWidget, forceAutoplay = false) {
  const params = extractBilibiliPlayerParams(widget.source)
  if (!params) return null
  params.set('isOutside', 'true')
  params.set('high_quality', '1')
  params.set('as_wide', '1')
  params.set('autoplay', widget.autoplay || forceAutoplay ? '1' : '0')
  params.set('danmaku', widget.danmaku === false ? '0' : '1')
  if (widget.muted) params.set('muted', '1')
  return {
    src: `https://player.bilibili.com/player.html?${params.toString()}`,
    coverUrl: widget.coverUrl?.trim() || null,
  }
}

function buildVideoEmbed(widget: OsDesktopVideoWidget, forceAutoplay = false) {
  return widget.provider === 'youtube'
    ? buildYoutubeEmbedUrl(widget, forceAutoplay)
    : buildBilibiliEmbedUrl(widget, forceAutoplay)
}

function videoProviderLabel(provider: OsVideoWidgetProvider) {
  return provider === 'youtube' ? 'YouTube' : 'Bilibili'
}

export function videoWidgetFromForm(
  provider: OsVideoWidgetProvider,
  form: VideoWidgetFormValues,
): Omit<
  OsDesktopVideoWidget,
  'id' | 'kind' | 'provider' | 'x' | 'y' | 'widthCells' | 'heightCells' | 'updatedAt'
> {
  return {
    source: form.source.trim(),
    title: form.title.trim() || undefined,
    coverUrl: form.coverUrl.trim() || null,
    autoplay: form.autoplay,
    muted: form.muted,
    danmaku: provider === 'bilibili' ? form.danmaku : false,
    showCover: form.showCover,
  }
}

function OsVideoWidgetComponent({
  widget,
  editable,
  wallpaperInteractive,
  onMove,
  onResize,
  onRotate,
  onDelete,
  onChangeLayer,
  onEdit,
}: {
  widget: OsDesktopVideoWidget
  editable: boolean
  wallpaperInteractive: boolean
  onMove: (id: string, point: { x: number; y: number }) => void
  onResize: (id: string, size: { widthCells: number; heightCells: number }) => void
  onRotate: (id: string, rotation: number) => void
  onDelete: (id: string) => void
  onChangeLayer: (id: string, direction: OsWidgetLayerDirection) => void
  onEdit: (widget: OsDesktopVideoWidget) => void
}) {
  const { t } = useTranslation()
  const [hovered, setHovered] = useState(false)
  const [coverDismissed, setCoverDismissed] = useState(false)
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
    setCoverDismissed(false)
  }, [widget.autoplay, widget.coverUrl, widget.showCover, widget.source])

  const currentX = preview?.x ?? widget.x
  const currentY = preview?.y ?? widget.y
  const currentWidthCells = preview?.widthCells ?? widget.widthCells
  const currentHeightCells = preview?.heightCells ?? widget.heightCells
  const currentRotation = preview?.rotation ?? widgetRotation(widget)
  const width = currentWidthCells * DESKTOP_CELL_WIDTH - 12
  const height = currentHeightCells * DESKTOP_CELL_HEIGHT - 12
  const embed = buildVideoEmbed(widget, coverDismissed)
  const showCover = Boolean(
    widget.showCover && !widget.autoplay && !coverDismissed && embed?.coverUrl,
  )
  const title = widget.title?.trim() || videoProviderLabel(widget.provider)

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
        className="grid h-full w-full place-items-center overflow-hidden rounded-xl bg-black"
        style={{ contain: 'layout paint style' }}
      >
        {embed ? (
          <div className="relative h-full w-full overflow-hidden rounded-xl bg-black">
            <iframe
              title={widget.title?.trim() || videoProviderLabel(widget.provider)}
              src={embed.src}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              className="absolute inset-0 h-full w-full border-0"
            />
            {showCover ? (
              <button
                type="button"
                className="absolute inset-0 grid place-items-center overflow-hidden bg-black"
                aria-label={t('os.playVideoWidget')}
                onClick={() => setCoverDismissed(true)}
              >
                <img
                  src={embed.coverUrl ?? ''}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <span className="relative grid h-14 w-14 place-items-center rounded-full bg-black/58 text-white shadow-[0_12px_30px_rgba(0,0,0,0.35)] backdrop-blur">
                  <Play size={24} fill="currentColor" className="ml-0.5" />
                </span>
              </button>
            ) : null}
          </div>
        ) : (
          <div className="px-4 text-center text-xs font-bold leading-5 text-white/58">
            {t('os.videoWidgetInvalidSource')}
          </div>
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

export const OsVideoWidget = memo(OsVideoWidgetComponent)

export function OsVideoWidgetEditorModal({
  provider,
  initialValue,
  open,
  onClose,
  onSubmit,
}: {
  provider: OsVideoWidgetProvider
  initialValue?: OsDesktopVideoWidget | null
  open: boolean
  onClose: () => void
  onSubmit: (values: VideoWidgetFormValues) => void
}) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<VideoWidgetFormValues>(DEFAULT_VIDEO_WIDGET_FORM)
  const [sourceTouched, setSourceTouched] = useState(false)

  useEffect(() => {
    if (!open) return
    setDraft(
      initialValue
        ? {
            source: initialValue.source,
            title: initialValue.title ?? '',
            coverUrl: initialValue.coverUrl ?? '',
            autoplay: initialValue.autoplay === true,
            muted: initialValue.muted !== false,
            danmaku: initialValue.danmaku !== false,
            showCover: initialValue.showCover === true,
          }
        : {
            ...DEFAULT_VIDEO_WIDGET_FORM,
            danmaku: provider === 'bilibili',
          },
    )
    setSourceTouched(false)
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [initialValue, open, provider])

  const candidateWidget: OsDesktopVideoWidget = {
    id: initialValue?.id ?? 'preview',
    kind: 'video-player',
    provider,
    x: 0,
    y: 0,
    widthCells: 8,
    heightCells: 6,
    ...videoWidgetFromForm(provider, draft),
  }
  const isValidSource = Boolean(draft.source.trim() && buildVideoEmbed(candidateWidget))
  const showSourceError = sourceTouched && draft.source.trim().length > 0 && !isValidSource

  const submit = () => {
    setSourceTouched(true)
    if (!isValidSource) return
    onSubmit(draft)
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalContent className="z-[900] w-[min(92vw,520px)]">
        <ModalHeader
          icon={provider === 'youtube' ? <Youtube size={18} /> : <Video size={18} />}
          title={
            initialValue
              ? t('os.editVideoWidgetTitle', { provider: videoProviderLabel(provider) })
              : t('os.addVideoWidgetTitle', { provider: videoProviderLabel(provider) })
          }
          closeLabel={t('common.close')}
        />
        <ModalBody className="space-y-4 py-5">
          <Input
            ref={inputRef}
            label={t('os.videoWidgetSource')}
            value={draft.source}
            placeholder={
              provider === 'youtube'
                ? t('os.youtubeVideoWidgetPlaceholder')
                : t('os.bilibiliVideoWidgetPlaceholder')
            }
            onBlur={() => setSourceTouched(true)}
            onChange={(event) => {
              const source = event.target.value
              setDraft((current) => ({ ...current, source }))
            }}
          />
          {showSourceError ? (
            <p className="-mt-2 text-xs font-bold text-danger">
              {t('os.videoWidgetInvalidSource')}
            </p>
          ) : null}
          <Input
            label={t('os.videoWidgetTitle')}
            value={draft.title}
            placeholder={videoProviderLabel(provider)}
            onChange={(event) => {
              const title = event.target.value
              setDraft((current) => ({ ...current, title }))
            }}
          />
          <Input
            label={t('os.videoWidgetCoverUrl')}
            value={draft.coverUrl}
            placeholder={t('os.videoWidgetCoverUrlPlaceholder')}
            onChange={(event) => {
              const coverUrl = event.target.value
              setDraft((current) => ({ ...current, coverUrl }))
            }}
          />
          <div className="grid gap-2 rounded-2xl border border-border-subtle bg-bg-tertiary/70 p-3">
            {[
              {
                key: 'autoplay' as const,
                label: t('os.videoWidgetAutoplay'),
              },
              {
                key: 'muted' as const,
                label: t('os.videoWidgetMuted'),
              },
              {
                key: 'showCover' as const,
                label: t('os.videoWidgetShowCover'),
              },
              ...(provider === 'bilibili'
                ? [
                    {
                      key: 'danmaku' as const,
                      label: t('os.videoWidgetDanmaku'),
                    },
                  ]
                : []),
            ].map((item) => (
              <label
                key={item.key}
                className="flex items-center justify-between gap-4 text-sm font-bold text-text-primary"
              >
                <span>{item.label}</span>
                <Switch
                  checked={draft[item.key]}
                  onCheckedChange={(checked) =>
                    setDraft((current) => ({ ...current, [item.key]: checked }))
                  }
                />
              </label>
            ))}
          </div>
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
  )
}
