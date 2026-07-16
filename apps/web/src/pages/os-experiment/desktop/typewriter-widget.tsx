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

export type TypewriterWidgetFormValues = {
  content: string
  speedMs: number
  pauseMs: number
  loop: boolean
  cursor: boolean
  fontFamily: OsTypewriterWidgetFontFamily
  fontSize: number
  color: string
  textShadow: OsTypewriterWidgetTextShadow
  textStrokeWidth: number
  textStrokeColor: string
}

const TYPEWRITER_FONT_FAMILIES: OsTypewriterWidgetFontFamily[] = [
  'system',
  'serif',
  'mono',
  'handwriting',
]
const TYPEWRITER_TEXT_SHADOWS: OsTypewriterWidgetTextShadow[] = ['none', 'soft', 'glow', 'strong']

function clampTypewriterSpeedMs(value: number) {
  return Math.min(240, Math.max(15, Number.isFinite(value) ? Math.round(value) : 160))
}

function clampTypewriterPauseMs(value: number) {
  return Math.min(8000, Math.max(500, Number.isFinite(value) ? Math.round(value) : 1800))
}

function clampTypewriterFontSize(value: number) {
  return Math.min(96, Math.max(12, Number.isFinite(value) ? Math.round(value) : 32))
}

function clampTypewriterStrokeWidth(value: number) {
  return Math.min(8, Math.max(0, Number.isFinite(value) ? Math.round(value) : 0))
}

function normalizeTypewriterColor(value: string, fallback: string) {
  return /^#[\da-f]{6}$/i.test(value) ? value : fallback
}

function hexToRgba(value: string, alpha: number) {
  const color = normalizeTypewriterColor(value, '#ffffff').slice(1)
  const red = Number.parseInt(color.slice(0, 2), 16)
  const green = Number.parseInt(color.slice(2, 4), 16)
  const blue = Number.parseInt(color.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function typewriterFontFamilyCss(fontFamily: OsTypewriterWidgetFontFamily) {
  if (fontFamily === 'serif') return 'Georgia, "Times New Roman", serif'
  if (fontFamily === 'mono') return '"SFMono-Regular", Consolas, "Liberation Mono", monospace'
  if (fontFamily === 'handwriting')
    return '"Apple Chancery", "Snell Roundhand", "Bradley Hand", "Segoe Script", cursive'
  return 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
}

function typewriterTextShadowCss(shadow: OsTypewriterWidgetTextShadow, color: string) {
  if (shadow === 'none') return 'none'
  if (shadow === 'glow') {
    return `0 0 8px ${hexToRgba(color, 0.72)}, 0 0 22px ${hexToRgba(color, 0.45)}`
  }
  if (shadow === 'strong') {
    return '0 3px 0 rgba(0,0,0,0.45), 0 10px 22px rgba(0,0,0,0.42)'
  }
  return '0 2px 8px rgba(0,0,0,0.36)'
}

export function typewriterWidgetFromForm(
  form: TypewriterWidgetFormValues,
): Omit<
  OsDesktopTypewriterWidget,
  'id' | 'kind' | 'x' | 'y' | 'widthCells' | 'heightCells' | 'updatedAt'
> {
  const color = normalizeTypewriterColor(form.color, '#ffffff')
  const textStrokeColor = normalizeTypewriterColor(form.textStrokeColor, '#000000')
  return {
    content: form.content,
    speedMs: clampTypewriterSpeedMs(form.speedMs),
    pauseMs: clampTypewriterPauseMs(form.pauseMs),
    loop: form.loop,
    cursor: form.cursor,
    fontFamily: form.fontFamily,
    fontSize: clampTypewriterFontSize(form.fontSize),
    color,
    textShadow: form.textShadow,
    textStrokeWidth: clampTypewriterStrokeWidth(form.textStrokeWidth),
    textStrokeColor,
  }
}

function OsTypewriterWidgetComponent({
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
  widget: OsDesktopTypewriterWidget
  editable: boolean
  wallpaperInteractive: boolean
  onMove: (id: string, point: { x: number; y: number }) => void
  onResize: (id: string, size: { widthCells: number; heightCells: number }) => void
  onRotate: (id: string, rotation: number) => void
  onDelete: (id: string) => void
  onChangeLayer: (id: string, direction: OsWidgetLayerDirection) => void
  onEdit: (widget: OsDesktopTypewriterWidget) => void
}) {
  const { t } = useTranslation()
  const [hovered, setHovered] = useState(false)
  const textRef = useRef<HTMLSpanElement | null>(null)
  const {
    transformEditing,
    beginTransformEdit,
    applyTransformEdit,
    cancelTransformEdit,
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
  } = useWidgetTransformEditor({
    widget,
    editable,
    onMove,
    onResize,
    onRotate,
    constraints: {
      minWidthCells: 4,
      maxWidthCells: 16,
      minHeightCells: 2,
      maxHeightCells: 12,
    },
  })

  const width = currentWidthCells * DESKTOP_CELL_WIDTH - 12
  const height = currentHeightCells * DESKTOP_CELL_HEIGHT - 12
  const content = widget.content || t('os.typewriterWidgetDefaultContent')
  const speedMs = clampTypewriterSpeedMs(widget.speedMs)
  const pauseMs = clampTypewriterPauseMs(widget.pauseMs)
  const color = normalizeTypewriterColor(widget.color, '#ffffff')
  const textStrokeColor = normalizeTypewriterColor(widget.textStrokeColor, '#000000')
  const textStrokeWidth = clampTypewriterStrokeWidth(widget.textStrokeWidth)
  const textStyle = {
    color,
    fontFamily: typewriterFontFamilyCss(widget.fontFamily),
    fontSize: clampTypewriterFontSize(widget.fontSize),
    lineHeight: 1.24,
    contain: 'layout paint style',
    transform: 'translateZ(0)',
    backfaceVisibility: 'hidden',
    willChange: 'contents',
    textShadow: typewriterTextShadowCss(widget.textShadow, color),
    WebkitTextStrokeWidth: textStrokeWidth ? `${textStrokeWidth}px` : undefined,
    WebkitTextStrokeColor: textStrokeWidth ? textStrokeColor : undefined,
  } satisfies CSSProperties

  useEffect(() => {
    let visibleLength = 0
    let timeoutId: number | null = null
    const writeText = () => {
      if (textRef.current) textRef.current.textContent = content.slice(0, visibleLength)
    }
    const scheduleNextFrame = () => {
      if (visibleLength < content.length) {
        timeoutId = window.setTimeout(() => {
          visibleLength = Math.min(content.length, visibleLength + 1)
          writeText()
          scheduleNextFrame()
        }, speedMs)
        return
      }
      if (!widget.loop) return
      timeoutId = window.setTimeout(() => {
        visibleLength = 0
        writeText()
        scheduleNextFrame()
      }, pauseMs)
    }

    writeText()
    scheduleNextFrame()
    return () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId)
    }
  }, [content, pauseMs, speedMs, widget.loop])

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
        title={t('os.typewriterWidget')}
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
        className={cn(
          'h-full w-full overflow-hidden whitespace-pre-wrap break-words',
          transformEditing && 'cursor-grab active:cursor-grabbing',
        )}
        style={textStyle}
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        <span ref={textRef} />
        {widget.cursor ? (
          <span
            aria-hidden="true"
            className="ml-0.5 inline-block h-[1.05em] translate-y-[0.14em] border-r-2 border-current animate-pulse"
          />
        ) : null}
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

export const OsTypewriterWidget = memo(OsTypewriterWidgetComponent)

export function OsTypewriterWidgetEditorModal({
  initialValue,
  open,
  onClose,
  onSubmit,
}: {
  initialValue?: OsDesktopTypewriterWidget | null
  open: boolean
  onClose: () => void
  onSubmit: (values: TypewriterWidgetFormValues) => void
}) {
  const { t } = useTranslation()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [draft, setDraft] = useState<TypewriterWidgetFormValues>({
    content: '',
    speedMs: 160,
    pauseMs: 1800,
    loop: true,
    cursor: true,
    fontFamily: 'handwriting',
    fontSize: 64,
    color: '#ffffff',
    textShadow: 'soft',
    textStrokeWidth: 0,
    textStrokeColor: '#000000',
  })

  useEffect(() => {
    if (!open) return
    setDraft(
      initialValue
        ? {
            content: initialValue.content,
            speedMs: clampTypewriterSpeedMs(initialValue.speedMs),
            pauseMs: clampTypewriterPauseMs(initialValue.pauseMs),
            loop: initialValue.loop !== false,
            cursor: initialValue.cursor !== false,
            fontFamily: initialValue.fontFamily,
            fontSize: clampTypewriterFontSize(initialValue.fontSize),
            color: normalizeTypewriterColor(initialValue.color, '#ffffff'),
            textShadow: initialValue.textShadow,
            textStrokeWidth: clampTypewriterStrokeWidth(initialValue.textStrokeWidth),
            textStrokeColor: normalizeTypewriterColor(initialValue.textStrokeColor, '#000000'),
          }
        : {
            content: t('os.typewriterWidgetDefaultContent'),
            speedMs: 160,
            pauseMs: 1800,
            loop: true,
            cursor: true,
            fontFamily: 'handwriting',
            fontSize: 64,
            color: '#ffffff',
            textShadow: 'soft',
            textStrokeWidth: 0,
            textStrokeColor: '#000000',
          },
    )
    const frame = window.requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [initialValue, open, t])

  const submit = () => {
    onSubmit({
      ...draft,
      speedMs: clampTypewriterSpeedMs(draft.speedMs),
      pauseMs: clampTypewriterPauseMs(draft.pauseMs),
    })
  }

  const updateNumber = (
    key: 'speedMs' | 'pauseMs' | 'fontSize' | 'textStrokeWidth',
    value: number,
  ) => {
    setDraft((current) => ({
      ...current,
      [key]:
        key === 'speedMs'
          ? clampTypewriterSpeedMs(value)
          : key === 'pauseMs'
            ? clampTypewriterPauseMs(value)
            : key === 'fontSize'
              ? clampTypewriterFontSize(value)
              : clampTypewriterStrokeWidth(value),
    }))
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalContent className="z-[900] w-[min(92vw,560px)]">
        <ModalHeader
          icon={<Keyboard size={18} />}
          title={
            initialValue ? t('os.editTypewriterWidgetTitle') : t('os.addTypewriterWidgetTitle')
          }
          closeLabel={t('common.close')}
        />
        <ModalBody className="space-y-4 py-5">
          <label className="grid gap-2 text-sm font-bold text-text-primary">
            <span>{t('os.typewriterWidgetContent')}</span>
            <textarea
              ref={textareaRef}
              value={draft.content}
              placeholder={t('os.typewriterWidgetContentPlaceholder')}
              maxLength={4000}
              className="min-h-[150px] resize-y rounded-xl border border-border-subtle bg-bg-tertiary px-3 py-2 font-mono text-sm leading-6 text-text-primary outline-none transition placeholder:text-text-muted/70 focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
              onChange={(event) => {
                const content = event.currentTarget.value
                setDraft((current) => ({ ...current, content }))
              }}
            />
          </label>

          <div className="grid gap-3 rounded-2xl border border-border-subtle bg-bg-tertiary/70 p-3">
            <p className="text-xs font-black uppercase tracking-widest text-text-muted/70">
              {t('os.typewriterWidgetTypography')}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {TYPEWRITER_FONT_FAMILIES.map((fontFamily) => {
                const active = draft.fontFamily === fontFamily
                return (
                  <button
                    key={fontFamily}
                    type="button"
                    className={cn(
                      'h-9 rounded-xl px-2 text-sm font-black transition',
                      active
                        ? 'bg-bg-primary text-text-primary shadow-sm'
                        : 'text-text-muted hover:bg-bg-primary/55 hover:text-text-primary',
                    )}
                    onClick={() => setDraft((current) => ({ ...current, fontFamily }))}
                  >
                    {t(
                      `os.typewriterWidgetFont${fontFamily.charAt(0).toUpperCase()}${fontFamily.slice(1)}`,
                    )}
                  </button>
                )
              })}
            </div>
            <label className="grid gap-2 text-sm font-bold text-text-primary">
              <span className="flex items-center justify-between gap-3">
                <span>{t('os.typewriterWidgetFontSize')}</span>
                <span className="font-mono text-xs text-text-muted">{draft.fontSize}px</span>
              </span>
              <input
                type="range"
                min={12}
                max={96}
                step={1}
                value={draft.fontSize}
                onChange={(event) => updateNumber('fontSize', Number(event.currentTarget.value))}
              />
            </label>
          </div>

          <div className="grid gap-3 rounded-2xl border border-border-subtle bg-bg-tertiary/70 p-3">
            <p className="text-xs font-black uppercase tracking-widest text-text-muted/70">
              {t('os.typewriterWidgetStyle')}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-bold text-text-primary">
                <span>{t('os.typewriterWidgetColor')}</span>
                <input
                  type="color"
                  value={draft.color}
                  className="h-10 w-full cursor-pointer rounded-xl border border-border-subtle bg-bg-primary p-1"
                  onChange={(event) => {
                    const color = event.currentTarget.value
                    setDraft((current) => ({ ...current, color }))
                  }}
                />
              </label>
              <label className="grid gap-2 text-sm font-bold text-text-primary">
                <span>{t('os.typewriterWidgetStrokeColor')}</span>
                <input
                  type="color"
                  value={draft.textStrokeColor}
                  className="h-10 w-full cursor-pointer rounded-xl border border-border-subtle bg-bg-primary p-1"
                  onChange={(event) => {
                    const textStrokeColor = event.currentTarget.value
                    setDraft((current) => ({
                      ...current,
                      textStrokeColor,
                    }))
                  }}
                />
              </label>
            </div>
            <label className="grid gap-2 text-sm font-bold text-text-primary">
              <span className="flex items-center justify-between gap-3">
                <span>{t('os.typewriterWidgetStrokeWidth')}</span>
                <span className="font-mono text-xs text-text-muted">{draft.textStrokeWidth}px</span>
              </span>
              <input
                type="range"
                min={0}
                max={8}
                step={1}
                value={draft.textStrokeWidth}
                onChange={(event) =>
                  updateNumber('textStrokeWidth', Number(event.currentTarget.value))
                }
              />
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {TYPEWRITER_TEXT_SHADOWS.map((textShadow) => {
                const active = draft.textShadow === textShadow
                return (
                  <button
                    key={textShadow}
                    type="button"
                    className={cn(
                      'h-9 rounded-xl px-2 text-sm font-black transition',
                      active
                        ? 'bg-bg-primary text-text-primary shadow-sm'
                        : 'text-text-muted hover:bg-bg-primary/55 hover:text-text-primary',
                    )}
                    onClick={() => setDraft((current) => ({ ...current, textShadow }))}
                  >
                    {t(
                      `os.typewriterWidgetShadow${textShadow.charAt(0).toUpperCase()}${textShadow.slice(1)}`,
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid gap-3 rounded-2xl border border-border-subtle bg-bg-tertiary/70 p-3">
            <label className="grid gap-2 text-sm font-bold text-text-primary">
              <span className="flex items-center justify-between gap-3">
                <span>{t('os.typewriterWidgetSpeed')}</span>
                <span className="font-mono text-xs text-text-muted">{draft.speedMs}ms</span>
              </span>
              <input
                type="range"
                min={15}
                max={240}
                step={5}
                value={draft.speedMs}
                onChange={(event) => updateNumber('speedMs', Number(event.currentTarget.value))}
              />
            </label>
            <label className="grid gap-2 text-sm font-bold text-text-primary">
              <span className="flex items-center justify-between gap-3">
                <span>{t('os.typewriterWidgetPause')}</span>
                <span className="font-mono text-xs text-text-muted">{draft.pauseMs}ms</span>
              </span>
              <input
                type="range"
                min={500}
                max={8000}
                step={100}
                value={draft.pauseMs}
                onChange={(event) => updateNumber('pauseMs', Number(event.currentTarget.value))}
              />
            </label>
          </div>

          <div className="grid gap-2 rounded-2xl border border-border-subtle bg-bg-tertiary/70 p-3">
            {[
              {
                key: 'loop' as const,
                label: t('os.typewriterWidgetLoop'),
              },
              {
                key: 'cursor' as const,
                label: t('os.typewriterWidgetCursor'),
              },
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
