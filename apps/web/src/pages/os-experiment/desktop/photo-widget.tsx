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

export type PhotoWidgetFormValues = {
  sourceType: OsPhotoWidgetSourceType
  source: string
  title: string
  workspaceFileName: string
  aspectRatio: number
  rotation: number
}

const DEFAULT_PHOTO_WIDGET_FORM: PhotoWidgetFormValues = {
  sourceType: 'url',
  source: '',
  title: '',
  workspaceFileName: '',
  aspectRatio: 1,
  rotation: 0,
}

const PHOTO_WIDGET_EXTENSIONS = ['.avif', '.gif', '.jpeg', '.jpg', '.png', '.webp']

function clampPhotoAspectRatio(value: number) {
  return Math.min(10, Math.max(0.1, Number.isFinite(value) ? value : 1))
}

function clampPhotoRotation(value: number) {
  return Math.min(45, Math.max(-45, Number.isFinite(value) ? value : 0))
}

function randomPhotoRotation() {
  return Math.round((Math.random() * 18 - 9) * 10) / 10
}

function workspaceNodeIsImage(node: WorkspaceNode) {
  const mime = (node.mime ?? '').toLowerCase()
  const ext = (node.ext ?? (node.name.includes('.') ? `.${node.name.split('.').pop()}` : ''))
    .toLowerCase()
    .trim()
  return (
    node.kind === 'file' && (mime.startsWith('image/') || PHOTO_WIDGET_EXTENSIONS.includes(ext))
  )
}

function loadImageAspectRatio(src: string) {
  return new Promise<number>((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        resolve(clampPhotoAspectRatio(image.naturalWidth / image.naturalHeight))
        return
      }
      reject(new Error('Invalid image dimensions'))
    }
    image.onerror = () => reject(new Error('Image failed to load'))
    image.src = src
  })
}

async function fetchWorkspaceFileMediaUrl(serverId: string, fileId: string) {
  const result = await fetchApi<{ url: string }>(
    `/api/servers/${serverId}/workspace/files/${fileId}/media-url?disposition=inline`,
  )
  return result.url
}

export function photoWidgetFromForm(
  form: PhotoWidgetFormValues,
): Omit<OsDesktopPhotoWidget, 'id' | 'kind' | 'x' | 'y' | 'widthCells' | 'updatedAt'> | null {
  const source = form.source.trim()
  if (!source) return null
  return {
    sourceType: form.sourceType,
    source,
    title: form.title.trim() || undefined,
    workspaceFileName: form.workspaceFileName.trim() || null,
    aspectRatio: clampPhotoAspectRatio(form.aspectRatio),
    rotation: clampPhotoRotation(form.rotation),
  }
}

function OsPhotoWidgetComponent({
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
  widget: OsDesktopPhotoWidget
  serverId: string
  editable: boolean
  wallpaperInteractive: boolean
  onMove: (id: string, point: { x: number; y: number }) => void
  onResize: (id: string, size: { widthCells: number; heightCells: number }) => void
  onRotate: (id: string, rotation: number) => void
  onDelete: (id: string) => void
  onChangeLayer: (id: string, direction: OsWidgetLayerDirection) => void
  onEdit: (widget: OsDesktopPhotoWidget) => void
}) {
  const { t } = useTranslation()
  const [hovered, setHovered] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
  const {
    transformEditing,
    beginTransformEdit,
    applyTransformEdit,
    cancelTransformEdit,
    currentX,
    currentY,
    currentWidthCells,
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
  } = useWidgetTransformEditor({
    widget,
    editable,
    onMove,
    onResize,
    onRotate,
    constraints: {
      minWidthCells: 4,
      maxWidthCells: 8,
      minHeightCells: 2,
      maxHeightCells: 2,
    },
  })

  useEffect(() => {
    let cancelled = false
    setImageLoaded(false)
    setImageError(false)

    if (widget.sourceType === 'url') {
      setImageUrl(widget.source)
      return () => {
        cancelled = true
      }
    }

    setImageUrl(null)
    fetchWorkspaceFileMediaUrl(serverId, widget.source)
      .then((url) => {
        if (!cancelled) setImageUrl(url)
      })
      .catch(() => {
        if (!cancelled) setImageError(true)
      })

    return () => {
      cancelled = true
    }
  }, [serverId, widget.source, widget.sourceType])

  const photoWidth = Math.min(320, currentWidthCells * DESKTOP_CELL_WIDTH - 12)
  const aspectRatio = clampPhotoAspectRatio(widget.aspectRatio)
  const photoTitle = widget.title?.trim() || widget.workspaceFileName || t('os.photoWidget')
  const frameStyle = {
    width: '100%',
    maxWidth: 320,
    display: 'block',
    backgroundColor: '#fff',
    padding: '10px 10px 20px',
    boxShadow: hovered ? '10px 25px 40px rgba(0, 0, 0, 0.8)' : '5px 15px 25px rgba(0, 0, 0, 0.5)',
    contain: 'layout paint style',
    transform: `translate(0, 0) scale(${hovered ? 1.14 : 1})`,
    transformOrigin: 'center center',
    transition: 'transform 0.3s ease-out, box-shadow 0.3s ease-out',
    cursor: transformEditing ? 'grab' : 'pointer',
  } satisfies CSSProperties
  const imageAreaStyle = {
    aspectRatio,
    backgroundColor: '#eee',
  } satisfies CSSProperties

  const showLoading = Boolean(imageUrl && !imageLoaded && !imageError)

  return (
    <section
      className={cn(
        'group absolute select-none overflow-visible',
        wallpaperInteractive && 'pointer-events-auto',
      )}
      style={{
        left: currentX,
        top: currentY,
        width: photoWidth,
        zIndex: hovered || transformEditing ? widgetActiveZIndex(widget) : widgetZIndex(widget),
        transform: `rotate(${currentRotation}deg)`,
        transformOrigin: 'center center',
        isolation: 'isolate',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <OsWidgetToolbar
        title={photoTitle}
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

      <div
        className={cn('relative overflow-hidden', transformEditing && 'active:cursor-grabbing')}
        style={frameStyle}
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        <div className="relative overflow-hidden" style={imageAreaStyle}>
          {imageUrl && !imageError ? (
            <img
              src={imageUrl}
              alt={photoTitle}
              loading="eager"
              decoding="async"
              className="absolute inset-0 h-full w-full object-contain"
              style={{ opacity: imageLoaded ? 1 : 0.16 }}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-slate-400">
              <ImageIcon size={28} />
            </div>
          )}
          {showLoading ? (
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-slate-500">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : null}
        </div>
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

export const OsPhotoWidget = memo(OsPhotoWidgetComponent)

export function OsPhotoWidgetEditorModal({
  serverId,
  initialValue,
  open,
  onClose,
  onSubmit,
}: {
  serverId: string
  initialValue?: OsDesktopPhotoWidget | null
  open: boolean
  onClose: () => void
  onSubmit: (values: PhotoWidgetFormValues) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<PhotoWidgetFormValues>(DEFAULT_PHOTO_WIDGET_FORM)
  const [sourceTouched, setSourceTouched] = useState(false)
  const [sourceError, setSourceError] = useState(false)
  const [isResolving, setIsResolving] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setDraft(
      initialValue
        ? {
            sourceType: initialValue.sourceType,
            source: initialValue.source,
            title: initialValue.title ?? '',
            workspaceFileName: initialValue.workspaceFileName ?? '',
            aspectRatio: clampPhotoAspectRatio(initialValue.aspectRatio),
            rotation: clampPhotoRotation(initialValue.rotation),
          }
        : {
            ...DEFAULT_PHOTO_WIDGET_FORM,
            rotation: randomPhotoRotation(),
          },
    )
    setSourceTouched(false)
    setSourceError(false)
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [initialValue, open])

  useEffect(() => {
    if (!open) return
    const source = draft.source.trim()
    if (!source) {
      setPreviewImageUrl(null)
      return
    }

    if (draft.sourceType === 'url') {
      setPreviewImageUrl(source)
      return
    }

    let cancelled = false
    setPreviewImageUrl(null)
    fetchWorkspaceFileMediaUrl(serverId, source)
      .then((url) => {
        if (!cancelled) setPreviewImageUrl(url)
      })
      .catch(() => {
        if (!cancelled) setPreviewImageUrl(null)
      })

    return () => {
      cancelled = true
    }
  }, [draft.source, draft.sourceType, open, serverId])

  const updateSourceType = (sourceType: OsPhotoWidgetSourceType) => {
    setSourceTouched(false)
    setSourceError(false)
    setDraft((current) => ({
      ...current,
      sourceType,
      source: sourceType === current.sourceType ? current.source : '',
      workspaceFileName: sourceType === current.sourceType ? current.workspaceFileName : '',
    }))
    if (sourceType === 'url') {
      window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
    }
  }

  const handlePickerConfirm = async (result: PickerResult) => {
    if (!workspaceNodeIsImage(result.node)) {
      setSourceTouched(true)
      setSourceError(true)
      return
    }

    setIsResolving(true)
    try {
      const mediaUrl = await fetchWorkspaceFileMediaUrl(serverId, result.node.id)
      const aspectRatio = await loadImageAspectRatio(mediaUrl)
      setShowPicker(false)
      setSourceTouched(false)
      setSourceError(false)
      setDraft((current) => ({
        ...current,
        sourceType: 'workspace-file',
        source: result.node.id,
        title: current.title.trim() || result.node.name,
        workspaceFileName: result.node.name,
        aspectRatio,
      }))
    } catch {
      setSourceTouched(true)
      setSourceError(true)
    } finally {
      setIsResolving(false)
    }
  }

  const handleUpload = async (file: File) => {
    const ext = file.name.includes('.') ? `.${file.name.split('.').pop()}`.toLowerCase() : ''
    if (!file.type.startsWith('image/') && !PHOTO_WIDGET_EXTENSIONS.includes(ext)) {
      setSourceTouched(true)
      setSourceError(true)
      return
    }

    setIsResolving(true)
    setSourceError(false)
    const localUrl = URL.createObjectURL(file)
    try {
      const aspectRatio = await loadImageAspectRatio(localUrl)
      const form = new FormData()
      form.set('file', file)
      const node = await fetchApi<WorkspaceNode>(`/api/servers/${serverId}/workspace/upload`, {
        method: 'POST',
        body: form,
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workspace-tree', serverId] }),
        queryClient.invalidateQueries({ queryKey: ['os-workspace-root', serverId] }),
      ])
      setSourceTouched(false)
      setDraft((current) => ({
        ...current,
        sourceType: 'workspace-file',
        source: node.id,
        title: current.title.trim() || node.name,
        workspaceFileName: node.name,
        aspectRatio,
      }))
    } catch {
      setSourceTouched(true)
      setSourceError(true)
    } finally {
      URL.revokeObjectURL(localUrl)
      setIsResolving(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const submit = async () => {
    setSourceTouched(true)
    setSourceError(false)
    const source = draft.source.trim()
    if (!source) {
      setSourceError(true)
      return
    }

    setIsResolving(true)
    try {
      const aspectRatio =
        draft.sourceType === 'url'
          ? await loadImageAspectRatio(source)
          : clampPhotoAspectRatio(draft.aspectRatio)
      onSubmit({ ...draft, source, aspectRatio, rotation: clampPhotoRotation(draft.rotation) })
    } catch {
      setSourceError(true)
    } finally {
      setIsResolving(false)
    }
  }

  const showSourceError = sourceTouched && sourceError

  return (
    <>
      <Modal open={open} onClose={onClose}>
        <ModalContent className="z-[900] w-[min(92vw,520px)]">
          <ModalHeader
            icon={<ImageIcon size={18} />}
            title={initialValue ? t('os.editPhotoWidgetTitle') : t('os.addPhotoWidgetTitle')}
            closeLabel={t('common.close')}
          />
          <ModalBody className="space-y-4 py-5">
            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border-subtle bg-bg-tertiary/70 p-1.5">
              {[
                { type: 'url' as const, label: t('os.photoWidgetSourceUrl'), icon: Globe },
                {
                  type: 'workspace-file' as const,
                  label: t('os.photoWidgetSourceWorkspace'),
                  icon: ImageIcon,
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
                    onClick={() => updateSourceType(item.type)}
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
                label={t('os.photoWidgetImageUrl')}
                value={draft.source}
                placeholder={t('os.photoWidgetImageUrlPlaceholder')}
                onBlur={() => setSourceTouched(true)}
                onChange={(event) => {
                  const source = event.target.value
                  setSourceError(false)
                  setDraft((current) => ({ ...current, source }))
                }}
              />
            ) : (
              <div className="grid gap-2">
                <p className="text-xs font-black uppercase tracking-widest text-text-muted/70">
                  {t('os.photoWidgetWorkspaceFile')}
                </p>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <button
                    type="button"
                    className="flex h-11 min-w-0 items-center gap-3 rounded-xl border border-border-subtle bg-bg-tertiary px-3 text-left text-sm font-bold text-text-primary transition hover:border-primary/40 hover:text-primary"
                    onClick={() => setShowPicker(true)}
                  >
                    <FolderOpen size={16} className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate">
                      {draft.workspaceFileName || t('os.photoWidgetChooseWorkspaceFile')}
                    </span>
                  </button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isResolving}
                    onClick={() => fileInputRef.current?.click()}
                    className="justify-center gap-2 font-bold"
                  >
                    <Upload size={16} />
                    {t('os.photoWidgetUpload')}
                  </Button>
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
              className="hidden"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                if (file) void handleUpload(file)
              }}
            />

            {showSourceError ? (
              <p className="-mt-2 text-xs font-bold text-danger">
                {t('os.photoWidgetInvalidSource')}
              </p>
            ) : null}

            <Input
              label={t('os.photoWidgetTitle')}
              value={draft.title}
              placeholder={t('os.photoWidget')}
              onChange={(event) => {
                const title = event.target.value
                setDraft((current) => ({ ...current, title }))
              }}
            />

            <div className="grid min-h-[190px] place-items-center overflow-hidden rounded-2xl border border-border-subtle bg-bg-tertiary/70 px-4 py-5">
              <div
                className="w-[min(220px,78vw)] bg-white p-[10px] pb-5 shadow-[5px_15px_25px_rgba(0,0,0,0.34)] transition-transform duration-200"
                style={{
                  transform: `rotate(${clampPhotoRotation(draft.rotation)}deg)`,
                }}
              >
                <div
                  className="relative overflow-hidden bg-[#eee]"
                  style={{ aspectRatio: clampPhotoAspectRatio(draft.aspectRatio) }}
                >
                  {previewImageUrl ? (
                    <img
                      src={previewImageUrl}
                      alt=""
                      className="absolute inset-0 h-full w-full object-contain"
                    />
                  ) : (
                    <div className="absolute inset-0 grid place-items-center text-slate-400">
                      <ImageIcon size={26} />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <label className="grid gap-2 rounded-2xl border border-border-subtle bg-bg-tertiary/70 p-3 text-sm font-bold text-text-primary">
              <span className="flex items-center justify-between gap-3">
                <span>{t('os.photoWidgetRotation')}</span>
                <span className="font-mono text-xs text-text-muted">
                  {Math.round(draft.rotation)}°
                </span>
              </span>
              <input
                type="range"
                min={-45}
                max={45}
                step={1}
                value={draft.rotation}
                onChange={(event) => {
                  const rotation = clampPhotoRotation(Number(event.currentTarget.value))
                  setDraft((current) => ({
                    ...current,
                    rotation,
                  }))
                }}
              />
            </label>
          </ModalBody>
          <ModalFooter>
            <ModalButtonGroup>
              <Button type="button" variant="ghost" onClick={onClose} disabled={isResolving}>
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => void submit()}
                loading={isResolving}
              >
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
          title={t('os.photoWidgetWorkspacePickerTitle')}
          accept={PHOTO_WIDGET_EXTENSIONS}
          overlayClassName="z-[940]"
          onConfirm={(result) => void handlePickerConfirm(result)}
          onClose={() => setShowPicker(false)}
        />
      ) : null}
    </>
  )
}
