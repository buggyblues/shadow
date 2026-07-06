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

export type ChatInputWidgetFormValues = {
  defaultAgentId: string
  inboxViewMode: OsChatInputWidgetMode
  placeholder: string
  completionItems: string[]
}

export function chatInputWidgetFormFromWidget(
  widget: OsDesktopChatInputWidget | null | undefined,
): ChatInputWidgetFormValues {
  return {
    defaultAgentId: widget?.defaultAgentId ?? '',
    inboxViewMode: widget?.inboxViewMode === 'tasks' ? 'tasks' : 'chat',
    placeholder: widget?.placeholder ?? '',
    completionItems: Array.isArray(widget?.completionItems)
      ? widget.completionItems
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim().slice(0, 200))
          .filter(Boolean)
          .slice(0, 12)
      : [],
  }
}

export function chatInputWidgetFromForm(
  form: ChatInputWidgetFormValues,
): Partial<
  Pick<
    OsDesktopChatInputWidget,
    'defaultAgentId' | 'inboxViewMode' | 'placeholder' | 'completionItems'
  >
> {
  const completionItems = form.completionItems
    .map((item) => item.trim().slice(0, 200))
    .filter(Boolean)
    .slice(0, 12)
  return {
    defaultAgentId: form.defaultAgentId || null,
    inboxViewMode: form.inboxViewMode,
    placeholder: form.placeholder.trim() || undefined,
    completionItems: completionItems.length ? completionItems : undefined,
  }
}

function OsChatInputWidgetComponent({
  widget,
  serverId,
  inboxes,
  editable,
  wallpaperInteractive,
  onMove,
  onResize,
  onRotate,
  onDelete,
  onChangeLayer,
  onEdit,
  onOpenInboxBubble,
}: {
  widget: OsDesktopChatInputWidget
  serverId: string
  inboxes: BuddyInboxEntry[]
  editable: boolean
  wallpaperInteractive: boolean
  onMove: (id: string, point: { x: number; y: number }) => void
  onResize: (id: string, size: { widthCells: number; heightCells: number }) => void
  onRotate: (id: string, rotation: number) => void
  onDelete: (id: string) => void
  onChangeLayer: (id: string, direction: OsWidgetLayerDirection) => void
  onEdit: (widget: OsDesktopChatInputWidget) => void
  onOpenInboxBubble: (input: { agentId?: string; channelId?: string }) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [hovered, setHovered] = useState(false)
  const [resolvedChannel, setResolvedChannel] = useState<ChannelMeta | null>(null)
  const [ensuringAgentId, setEnsuringAgentId] = useState<string | null>(null)
  const [ensureError, setEnsureError] = useState(false)
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
  const compactComposer = currentHeightCells <= 2
  const width = currentWidthCells * DESKTOP_CELL_WIDTH - 12
  const height = currentHeightCells * DESKTOP_CELL_HEIGHT - 12
  const activeAgentId =
    (widget.defaultAgentId && inboxes.some((entry) => entry.agent.id === widget.defaultAgentId)
      ? widget.defaultAgentId
      : null) ??
    inboxes[0]?.agent.id ??
    null
  const inboxViewMode = widget.inboxViewMode === 'tasks' ? 'tasks' : 'chat'
  const selectedEntry = inboxes.find((entry) => entry.agent.id === activeAgentId) ?? null
  const selectedBuddyName = selectedEntry
    ? buddyDisplayName(selectedEntry)
    : t('os.chatInputNoBuddy')
  const messagePlaceholder =
    widget.placeholder?.trim() || t('os.chatInputPlaceholder', { buddy: selectedBuddyName })
  const composerTextareaHeight = compactComposer
    ? Math.max(24, Math.min(42, height - 58))
    : Math.max(52, Math.min(360, height - 84))

  useEffect(() => {
    if (!selectedEntry) {
      setResolvedChannel(null)
      setEnsuringAgentId(null)
      setEnsureError(false)
      return
    }
    if (selectedEntry.channel) {
      setResolvedChannel(selectedEntry.channel)
      setEnsuringAgentId(null)
      setEnsureError(false)
      return
    }

    let cancelled = false
    setResolvedChannel(null)
    setEnsuringAgentId(selectedEntry.agent.id)
    setEnsureError(false)
    fetchApi<{ channel: ChannelMeta }>(
      `/api/servers/${serverId}/inboxes/${selectedEntry.agent.id}`,
      { method: 'POST' },
    )
      .then(async (result) => {
        if (cancelled) return
        setResolvedChannel(result.channel)
        setEnsuringAgentId(null)
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['os-server-inboxes', serverId] }),
          queryClient.invalidateQueries({ queryKey: ['buddy-inboxes', serverId] }),
          queryClient.invalidateQueries({ queryKey: ['channels', serverId] }),
        ])
      })
      .catch(() => {
        if (cancelled) return
        setEnsuringAgentId(null)
        setEnsureError(true)
      })

    return () => {
      cancelled = true
    }
  }, [queryClient, selectedEntry, serverId])

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
        6,
        Math.round(resize.startWidthCells + (event.clientX - resize.startX) / DESKTOP_CELL_WIDTH),
      ),
    )
    const heightCells = Math.min(
      8,
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
        'group absolute z-10 select-none overflow-visible rounded-2xl bg-transparent text-text-primary',
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
        title={t('os.chatInputWidget')}
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
          className="pointer-events-auto absolute inset-0 z-30 cursor-grab rounded-2xl bg-transparent active:cursor-grabbing"
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
        />
      ) : null}
      <div
        className="flex h-full min-h-0 flex-col overflow-visible rounded-2xl"
        style={{ contain: 'layout paint style' }}
      >
        <div className="min-h-0 flex-1 overflow-visible [&>section]:h-full">
          {!selectedEntry ? (
            <div className="grid h-full place-items-center px-4 text-center text-sm font-bold text-text-muted">
              {t('os.chatInputNoBuddy')}
            </div>
          ) : ensuringAgentId === selectedEntry.agent.id ? (
            <div className="grid h-full place-items-center text-text-muted">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : ensureError || !resolvedChannel ? (
            <div className="grid h-full place-items-center px-4 text-center text-sm font-bold text-danger">
              {t('os.chatInputChannelUnavailable')}
            </div>
          ) : (
            <MessageInput
              channelId={resolvedChannel.id}
              channelName={selectedBuddyName}
              placeholder={messagePlaceholder}
              enableTaskCards
              inboxViewMode={inboxViewMode}
              onMessageSent={() => {
                queryClient.invalidateQueries({ queryKey: ['os-server-inboxes', serverId] })
                queryClient.invalidateQueries({ queryKey: ['buddy-inboxes', serverId] })
                onOpenInboxBubble({
                  agentId: selectedEntry.agent.id,
                  channelId: resolvedChannel.id,
                })
              }}
              compactComposer={compactComposer}
              edgeToEdgeComposer
              composerTextareaHeight={composerTextareaHeight}
              completionItems={widget.completionItems}
              highContrastSurface
            />
          )}
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

export const OsChatInputWidget = memo(OsChatInputWidgetComponent)

export function OsChatInputWidgetEditorModal({
  initialValue,
  inboxes,
  open,
  onClose,
  onSubmit,
}: {
  initialValue: OsDesktopChatInputWidget
  inboxes: BuddyInboxEntry[]
  open: boolean
  onClose: () => void
  onSubmit: (values: ChatInputWidgetFormValues) => void
}) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<ChatInputWidgetFormValues>(() =>
    chatInputWidgetFormFromWidget(initialValue),
  )

  useEffect(() => {
    if (!open) return
    setDraft(chatInputWidgetFormFromWidget(initialValue))
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [initialValue, open])

  const modeOptions: Array<{ value: OsChatInputWidgetMode; label: string }> = [
    { value: 'chat', label: t('os.chatInputModeChat') },
    { value: 'tasks', label: t('os.chatInputModeTasks') },
  ]
  const updateCompletionItem = (index: number, value: string) => {
    setDraft((current) => ({
      ...current,
      completionItems: current.completionItems.map((item, itemIndex) =>
        itemIndex === index ? value.slice(0, 200) : item,
      ),
    }))
  }
  const moveCompletionItem = (index: number, direction: -1 | 1) => {
    setDraft((current) => {
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= current.completionItems.length) return current
      const completionItems = [...current.completionItems]
      const [item] = completionItems.splice(index, 1)
      if (!item) return current
      completionItems.splice(nextIndex, 0, item)
      return { ...current, completionItems }
    })
  }
  const removeCompletionItem = (index: number) => {
    setDraft((current) => ({
      ...current,
      completionItems: current.completionItems.filter((_, itemIndex) => itemIndex !== index),
    }))
  }
  const addCompletionItem = () => {
    setDraft((current) => {
      if (current.completionItems.length >= 12) return current
      return { ...current, completionItems: [...current.completionItems, ''] }
    })
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalContent className="z-[900] w-[min(92vw,520px)]">
        <ModalHeader
          icon={<MessageSquare size={18} />}
          title={t('os.editChatInputWidgetTitle')}
          closeLabel={t('common.close')}
        />
        <ModalBody className="space-y-4 py-5">
          <label className="grid gap-2">
            <span className="text-xs font-black uppercase tracking-widest text-text-muted/70">
              {t('os.chatInputDefaultBuddyLabel')}
            </span>
            <select
              value={draft.defaultAgentId}
              className="h-11 w-full rounded-xl border border-border-subtle bg-bg-tertiary px-3 text-sm font-bold text-text-primary outline-none transition hover:border-primary/35 focus:border-primary/70"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  defaultAgentId: event.currentTarget.value,
                }))
              }
            >
              <option value="">{t('os.chatInputDefaultBuddyAuto')}</option>
              {inboxes.map((entry) => (
                <option key={entry.agent.id} value={entry.agent.id} className="bg-bg-primary">
                  {buddyDisplayName(entry)}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-2">
            <p className="text-xs font-black uppercase tracking-widest text-text-muted/70">
              {t('os.chatInputDefaultModeLabel')}
            </p>
            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border-subtle bg-bg-tertiary/70 p-1.5">
              {modeOptions.map((option) => {
                const active = draft.inboxViewMode === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={cn(
                      'flex h-9 items-center justify-center rounded-xl text-sm font-black transition',
                      active
                        ? 'bg-bg-primary text-text-primary shadow-sm'
                        : 'text-text-muted hover:bg-bg-primary/55 hover:text-text-primary',
                    )}
                    onClick={() =>
                      setDraft((current) => ({ ...current, inboxViewMode: option.value }))
                    }
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>

          <Input
            ref={inputRef}
            label={t('os.chatInputPlaceholderLabel')}
            value={draft.placeholder}
            placeholder={t('os.chatInputPlaceholderSettingPlaceholder')}
            maxLength={240}
            onChange={(event) => {
              const placeholder = event.target.value.slice(0, 240)
              setDraft((current) => ({ ...current, placeholder }))
            }}
          />

          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-widest text-text-muted/70">
                  {t('os.chatInputCompletionsLabel')}
                </p>
                <p className="mt-1 text-xs font-semibold leading-5 text-text-muted">
                  {t('os.chatInputCompletionsHelp')}
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="shrink-0 gap-2"
                disabled={draft.completionItems.length >= 12}
                onClick={addCompletionItem}
              >
                <Plus size={15} />
                {t('os.chatInputAddCompletion')}
              </Button>
            </div>
            <div className="grid max-h-64 gap-2 overflow-y-auto rounded-2xl border border-border-subtle bg-bg-tertiary/70 p-2">
              {draft.completionItems.length > 0 ? (
                draft.completionItems.map((item, index) => (
                  <div key={index} className="flex min-w-0 items-center gap-2">
                    <input
                      value={item}
                      maxLength={200}
                      placeholder={t('os.chatInputCompletionPlaceholder', {
                        index: index + 1,
                      })}
                      className="h-10 min-w-0 flex-1 rounded-xl border border-border-subtle bg-bg-primary/78 px-3 text-sm font-semibold text-text-primary outline-none transition placeholder:text-text-muted/50 focus:border-primary/55 focus:ring-2 focus:ring-primary/10"
                      onChange={(event) => updateCompletionItem(index, event.currentTarget.value)}
                    />
                    <button
                      type="button"
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-text-muted transition hover:bg-bg-primary/70 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-35"
                      disabled={index === 0}
                      title={t('os.chatInputMoveCompletionUp')}
                      aria-label={t('os.chatInputMoveCompletionUp')}
                      onClick={() => moveCompletionItem(index, -1)}
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      type="button"
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-text-muted transition hover:bg-bg-primary/70 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-35"
                      disabled={index === draft.completionItems.length - 1}
                      title={t('os.chatInputMoveCompletionDown')}
                      aria-label={t('os.chatInputMoveCompletionDown')}
                      onClick={() => moveCompletionItem(index, 1)}
                    >
                      <ArrowDown size={15} />
                    </button>
                    <button
                      type="button"
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-text-muted transition hover:bg-danger/12 hover:text-danger"
                      title={t('os.chatInputRemoveCompletion')}
                      aria-label={t('os.chatInputRemoveCompletion')}
                      onClick={() => removeCompletionItem(index)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))
              ) : (
                <p className="px-3 py-5 text-center text-sm font-semibold text-text-muted">
                  {t('os.chatInputCompletionsEmpty')}
                </p>
              )}
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <ModalButtonGroup>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="button" variant="primary" onClick={() => onSubmit(draft)}>
              {t('common.save')}
            </Button>
          </ModalButtonGroup>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
