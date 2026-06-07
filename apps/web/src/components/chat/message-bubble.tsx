import type { MessageMention, SlashCommandAction } from '@shadowob/shared'
import { extractSlashCommandActions, segmentTextByMentions } from '@shadowob/shared'
import { Button, cn } from '@shadowob/ui'
import { type InfiniteData, useQueryClient } from '@tanstack/react-query'
import { format, formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import {
  BookOpen,
  Check,
  CheckSquare,
  ChevronRight,
  Copy,
  CornerDownRight,
  ExternalLink,
  HandCoins,
  ListChecks,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Reply,
  Smile,
  Terminal,
  Trash2,
  Wrench,
} from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { copyToClipboard } from '../../lib/clipboard'
import { playSendSound } from '../../lib/sounds'
import { showToast } from '../../lib/toast'
import { UserAvatar } from '../common/avatar'
import { useConfirmStore } from '../common/confirm-dialog'
import { EmojiPicker } from '../common/emoji-picker'
import { UserProfileCard } from '../common/user-profile-card'
import { CommunityEconomySendModal } from '../community-economy/community-economy-send-modal'
import { ImageContextMenu } from './image-context-menu'
import { ImageViewer } from './image-viewer'
import { AttachmentView } from './message-bubble/attachments'
import { CommerceProductCardView, PaidFileCardView } from './message-bubble/commerce-cards'
import {
  DATE_FNS_LOCALE_MAP,
  EMPTY_BUDDY_AGENT_ENTRIES,
  EMPTY_MEMBER_ENTRIES,
  quickEmojis,
} from './message-bubble/constants'
import { InteractiveBlockRenderer } from './message-bubble/interactive-block'
import { interactiveResponseEqual } from './message-bubble/interactive-equality'
import { MessageMarkdown } from './message-bubble/markdown'
import { EntityMentionSpan, MentionSpan } from './message-bubble/mentions'
import { MessageReferenceCardsView } from './message-bubble/message-reference-card'
import {
  AttachmentList,
  type AttachmentRenderProps,
  attachmentsEqual,
  MessageAuthorLine,
  MessageEditBox,
  MessageReactions,
  ReplyReference,
  reactionsEqual,
  SelectionControl,
  SendFailureNotice,
} from './message-bubble/pure'
import { ServerAppCardsView } from './message-bubble/server-app-card'
import { isTaskCard, TaskCardsView } from './message-bubble/task-card'
import type {
  Attachment,
  BuddyAgentEntry,
  LegacyChannelEntry,
  LegacyServerEntry,
  MemberEntry,
  Message,
  MessageBubbleProps,
  MessagesPage,
} from './message-bubble/types'
import {
  decodeWalletRechargeMarker,
  stripWalletRechargeMarker,
  WalletRechargeCard,
} from './message-bubble/wallet-recharge-card'
import { OAuthLinkCardView } from './oauth-link-card'

export type {
  Attachment,
  Author,
  InteractiveBlock,
  InteractiveButtonItem,
  InteractiveFormField,
  InteractiveResponseMetadata,
  InteractiveSelectItem,
  InteractiveStateMetadata,
  Message,
  MessageBubbleProps,
  ReactionGroup,
  ThreadPreview,
} from './message-bubble/types'

function lowerText(value: unknown) {
  return typeof value === 'string' ? value.toLocaleLowerCase() : ''
}

const MESSAGE_ACTIONS_ACTIVE_EVENT = 'shadow:message-actions-active'
const BUDDY_INTRO_PROMPT_KEY = 'agentMgmt.buddyIntroPrompt'
type MessageActionsActiveEvent = CustomEvent<{ messageId: string }>
type HermesToolCallDisplay = {
  id: string
  name: string
  value: string
  kind: 'browser' | 'file' | 'skill' | 'terminal' | 'todo' | 'tool'
  count: number
}

const HERMES_TOOL_CALL_RE =
  /(?:^|[\s\n])(?:[^\w\s:"]+\s*)?([A-Za-z][A-Za-z0-9_.-]*)\s*:\s*"((?:\\.|[^"\\])*)"/g
const KNOWN_HERMES_TOOL_PREFIX_RE =
  /^(execute_code|terminal|shell|bash|python|node|skill|skill_view|todo|tool|mcp|shadowob|read|write|edit|file|browser)/i

function decodeHermesToolValue(value: string): string {
  return value.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\').trim()
}

function classifyHermesToolCall(name: string): HermesToolCallDisplay['kind'] {
  if (/terminal|shell|bash|exec|execute_code|command|python|node/i.test(name)) return 'terminal'
  if (/todo|plan|task/i.test(name)) return 'todo'
  if (/skill/i.test(name)) return 'skill'
  if (/browser|chrome|web/i.test(name)) return 'browser'
  if (/read|write|edit|file/i.test(name)) return 'file'
  return 'tool'
}

function getHermesToolIcon(kind: HermesToolCallDisplay['kind']) {
  if (kind === 'terminal') return Terminal
  if (kind === 'todo') return ListChecks
  if (kind === 'skill') return BookOpen
  return Wrench
}

function compactHermesToolText(value: string, fallback: string, maxLength = 72) {
  const text = (value || fallback)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[`"'\s]+|[`"'\s]+$/g, '')
    .trim()
  if (!text) return fallback
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function hasCompleteHermesToolValue(call: HermesToolCallDisplay) {
  const value = call.value.trim()
  if (!value) return false
  return !/(?:\.{3}|…)\s*$/u.test(value)
}

function hasExpandableHermesToolValue(call: HermesToolCallDisplay) {
  if (!hasCompleteHermesToolValue(call)) return false
  return /[\r\n]/u.test(call.value) || call.value.length > 96
}

function appendHermesToolCall(toolCalls: HermesToolCallDisplay[], call: HermesToolCallDisplay) {
  const duplicate = toolCalls.find((item) => item.name === call.name && item.value === call.value)
  if (duplicate) {
    duplicate.count += 1
    return
  }
  toolCalls.push(call)
}

function splitHermesToolCalls(content: string): {
  content: string
  toolCalls: HermesToolCallDisplay[]
} {
  const matches = Array.from(content.matchAll(HERMES_TOOL_CALL_RE))
  if (matches.length === 0) return { content, toolCalls: [] }
  const recognized = matches.filter((match) => KNOWN_HERMES_TOOL_PREFIX_RE.test(match[1] ?? ''))
  if (recognized.length === 0) return { content, toolCalls: [] }

  const toolCalls: HermesToolCallDisplay[] = []
  let cleaned = ''
  let lastIndex = 0
  matches.forEach((match, index) => {
    const name = match[1] ?? 'tool'
    if (!KNOWN_HERMES_TOOL_PREFIX_RE.test(name)) return

    cleaned += content.slice(lastIndex, match.index)
    lastIndex = (match.index ?? 0) + match[0].length
    appendHermesToolCall(toolCalls, {
      id: `${name}-${index}-${match.index}`,
      name,
      value: decodeHermesToolValue(match[2] ?? ''),
      kind: classifyHermesToolCall(name),
      count: 1,
    })
  })
  cleaned += content.slice(lastIndex)

  return {
    content: cleaned
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
    toolCalls,
  }
}

function HermesToolCallList({ toolCalls }: { toolCalls: HermesToolCallDisplay[] }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(true)
  const [expandedCallIds, setExpandedCallIds] = useState<Set<string>>(() => new Set())
  const [countBumpKey, setCountBumpKey] = useState(0)
  const previousTotalRef = useRef(0)
  const totalSteps = toolCalls.length

  useEffect(() => {
    if (toolCalls.length > 0) setExpanded(true)
  }, [toolCalls.length])

  useEffect(() => {
    setExpandedCallIds((previous) => {
      const ids = new Set(
        toolCalls.filter((call) => hasExpandableHermesToolValue(call)).map((call) => call.id),
      )
      const next = new Set([...previous].filter((id) => ids.has(id)))
      for (const call of toolCalls) {
        if (hasExpandableHermesToolValue(call)) {
          next.add(call.id)
        }
      }
      return next
    })
  }, [toolCalls])

  useEffect(() => {
    const previousTotal = previousTotalRef.current
    previousTotalRef.current = totalSteps
    if (previousTotal > 0 && totalSteps !== previousTotal) {
      setCountBumpKey((value) => value + 1)
    }
    return undefined
  }, [totalSteps])

  if (toolCalls.length === 0) return null
  const latest = toolCalls[toolCalls.length - 1]!
  const LatestIcon = getHermesToolIcon(latest.kind)
  const latestText = compactHermesToolText(latest.value, latest.name)

  return (
    <div className="mt-2 max-w-[min(44rem,100%)] rounded-xl border border-primary/20 bg-bg-secondary/30 p-1.5 shadow-sm shadow-primary/5">
      <button
        type="button"
        className="group/thought flex w-full min-w-0 items-center gap-2 rounded-lg border border-border-subtle/70 bg-bg-primary/35 px-2.5 py-2 text-xs font-semibold leading-5 text-text-secondary transition hover:border-primary/35 hover:bg-bg-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/25"
        aria-expanded={expanded}
        aria-label={t('chat.thoughtProcessToggle', { count: totalSteps })}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/12 text-primary">
          <LatestIcon className="h-3 w-3" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 truncate">
          <span>{t('chat.thoughtProcessLabel')}</span>
          <span className="mx-1 text-text-muted/70">·</span>
          <span className="font-mono text-text-muted" title={latest.value || latest.name}>
            {latestText}
          </span>
        </span>
        <span
          key={countBumpKey}
          className={cn(
            'inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10 px-1.5 font-mono text-[10px] leading-none text-primary',
            countBumpKey > 0 && 'thought-process-count-bump',
          )}
        >
          {totalSteps}
        </span>
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-text-muted transition-transform group-hover/thought:text-primary',
            expanded && 'rotate-90',
          )}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <ol className="mt-2 ml-3 flex flex-col gap-2 border-primary/25 border-l pl-4">
          {toolCalls.map((call, index) => {
            const Icon = getHermesToolIcon(call.kind)
            const text = compactHermesToolText(call.value, call.name, 88)
            const isExpandable = hasExpandableHermesToolValue(call)
            const isCallExpanded = expandedCallIds.has(call.id)
            return (
              <li key={call.id} className="relative">
                <span className="absolute -left-[1.75rem] top-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-primary/40 bg-bg-primary px-1 font-mono text-[10px] font-semibold leading-none text-primary shadow-sm shadow-primary/10">
                  {index + 1}
                </span>
                <div className="min-w-0 overflow-hidden rounded-lg border border-border-subtle/60 bg-bg-primary/25">
                  {isExpandable ? (
                    <button
                      type="button"
                      className="group/call flex w-full min-w-0 items-center gap-2 px-2.5 py-2 text-left text-xs leading-5 transition hover:bg-bg-secondary/35 focus:outline-none focus:ring-2 focus:ring-primary/20"
                      aria-expanded={isCallExpanded}
                      aria-label={t('chat.thoughtProcessToggle', { count: index + 1 })}
                      onClick={() =>
                        setExpandedCallIds((previous) => {
                          const next = new Set(previous)
                          if (next.has(call.id)) {
                            next.delete(call.id)
                          } else {
                            next.add(call.id)
                          }
                          return next
                        })
                      }
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 text-primary/85" aria-hidden="true" />
                      <span className="shrink-0 truncate font-mono font-semibold text-primary">
                        {call.name}
                      </span>
                      {call.count > 1 && (
                        <span className="shrink-0 rounded-full border border-border-subtle px-1.5 font-mono text-[10px] leading-4 text-text-muted">
                          x{call.count}
                        </span>
                      )}
                      <span
                        className="min-w-0 flex-1 truncate font-mono text-text-muted"
                        title={call.value}
                      >
                        {text}
                      </span>
                      <ChevronRight
                        className={cn(
                          'h-3.5 w-3.5 shrink-0 text-text-muted transition-transform group-hover/call:text-primary',
                          isCallExpanded && 'rotate-90',
                        )}
                        aria-hidden="true"
                      />
                    </button>
                  ) : (
                    <div className="flex min-w-0 items-center gap-2 px-2.5 py-2 text-xs leading-5">
                      <Icon className="h-3.5 w-3.5 shrink-0 text-primary/85" aria-hidden="true" />
                      <span className="shrink-0 truncate font-mono font-semibold text-primary">
                        {call.name}
                      </span>
                      {call.count > 1 && (
                        <span className="shrink-0 rounded-full border border-border-subtle px-1.5 font-mono text-[10px] leading-4 text-text-muted">
                          x{call.count}
                        </span>
                      )}
                      <span
                        className="min-w-0 flex-1 truncate font-mono text-text-muted"
                        title={call.value}
                      >
                        {text}
                      </span>
                    </div>
                  )}
                  {isExpandable && isCallExpanded && (
                    <pre className="m-0 mr-2 mb-2 ml-7 max-h-80 overflow-auto rounded-md border border-border-subtle/60 bg-bg-secondary/35 px-3 py-2 font-mono text-xs leading-5 text-text-secondary whitespace-pre-wrap break-words">
                      {call.value}
                    </pre>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

function SlashCommandActions({
  actions,
  sendingCommand,
  onSend,
}: {
  actions: SlashCommandAction[]
  sendingCommand: string | null
  onSend: (command: string) => void
}) {
  const { t } = useTranslation()

  if (actions.length === 0) return null
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          disabled={sendingCommand !== null}
          className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 font-mono text-[13px] font-semibold text-primary transition hover:border-primary/60 hover:bg-primary/18 disabled:cursor-wait disabled:opacity-60"
          title={t('chat.sendSlashCommand', { command: action.command })}
          aria-label={t('chat.sendSlashCommand', { command: action.command })}
          onClick={() => onSend(action.command)}
        >
          <CornerDownRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{action.command}</span>
        </button>
      ))}
    </div>
  )
}

function appendCreatedChannelMessage(
  queryClient: ReturnType<typeof useQueryClient>,
  channelId: string,
  created: Message,
) {
  queryClient.setQueryData<InfiniteData<MessagesPage>>(['messages', channelId], (old) => {
    if (!old || old.pages.length === 0) return old
    if (old.pages.some((page) => page.messages.some((item) => item.id === created.id))) return old
    const pages = [...old.pages]
    const firstPage = pages[0]!
    pages[0] = { ...firstPage, messages: [...firstPage.messages, created] }
    return { ...old, pages }
  })
}

function appendCreatedThreadMessage(
  queryClient: ReturnType<typeof useQueryClient>,
  threadId: string,
  created: Message,
) {
  queryClient.setQueryData<Message[]>(['thread-messages', threadId], (old) => {
    const messages = old ?? []
    if (messages.some((item) => item.id === created.id)) return messages
    return [...messages, created]
  })
}

function MessageBubbleInner({
  message,
  currentUserId,
  serverId,
  onReply,
  onReact,
  onMessageUpdate,
  onMessageDelete,
  onOpenThread,
  onPreviewFile,
  onPreviewOAuthLink,
  onSaveToWorkspace,
  editApi,
  deleteApi,
  highlight,
  replyToMessage,
  taskReplies,
  hasThread,
  thread,
  selectionMode,
  isSelected,
  selectionAnchorId,
  submittedInteractiveResponse,
  enableSlashCommandActions = false,
  onToggleSelect,
  onEnterSelectionMode,
  onSelectRangeTo,
  isGrouped = false,
}: MessageBubbleProps) {
  const { t, i18n } = useTranslation()
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showFullPicker, setShowFullPicker] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [showTipModal, setShowTipModal] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [copied, setCopied] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const editInputRef = useRef<HTMLTextAreaElement>(null)
  const avatarRef = useRef<HTMLDivElement>(null)
  const messageRef = useRef<HTMLDivElement>(null)
  const [avatarHover, setAvatarHover] = useState(false)
  const [avatarPinned, setAvatarPinned] = useState(false)
  const [avatarCardPos, setAvatarCardPos] = useState<{ left: number; top: number } | null>(null)
  const [avatarContextMenu, setAvatarContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [imageContextMenu, setImageContextMenu] = useState<{
    x: number
    y: number
    att: Attachment
  } | null>(null)
  const [imageViewer, setImageViewer] = useState<{
    src: string
    filename?: string
    size?: number
  } | null>(null)
  const avatarHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const actionsRef = useRef<HTMLDivElement>(null)
  const isTaskCardMessage = useMemo(
    () => (message.metadata?.cards ?? []).some((card) => isTaskCard(card)),
    [message.metadata?.cards],
  )
  const renderGrouped = isGrouped && !isTaskCardMessage
  const canSelectRangeTo =
    selectionMode && Boolean(onSelectRangeTo) && selectionAnchorId !== message.id
  const showActions = isHovered && (!selectionMode || canSelectRangeTo)

  const closeFloatingActions = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    setIsHovered(false)
    setShowEmojiPicker(false)
    setShowFullPicker(false)
    setShowMoreMenu(false)
  }, [])

  // Close all menus on scroll (find nearest scrollable ancestor)
  useEffect(() => {
    if (!showActions && !showEmojiPicker && !showFullPicker && !showMoreMenu) return
    const scrollParent = messageRef.current?.closest(
      '[class*="overflow-y-auto"]',
    ) as HTMLElement | null
    if (!scrollParent) return
    const handleScroll = () => closeFloatingActions()
    scrollParent.addEventListener('scroll', handleScroll, { passive: true })
    return () => scrollParent.removeEventListener('scroll', handleScroll)
  }, [closeFloatingActions, showActions, showEmojiPicker, showFullPicker, showMoreMenu])

  useEffect(() => {
    const handleActiveMessageActions = (event: Event) => {
      const activeMessageId = (event as MessageActionsActiveEvent).detail?.messageId
      if (!activeMessageId || activeMessageId === message.id) return
      closeFloatingActions()
    }
    window.addEventListener(MESSAGE_ACTIONS_ACTIVE_EVENT, handleActiveMessageActions)
    return () => {
      window.removeEventListener(MESSAGE_ACTIONS_ACTIVE_EVENT, handleActiveMessageActions)
    }
  }, [closeFloatingActions, message.id])

  useEffect(() => {
    if (!showActions && !showEmojiPicker && !showFullPicker && !showMoreMenu) return
    const handleDocumentMouseLeave = (event: MouseEvent) => {
      if (!event.relatedTarget) closeFloatingActions()
    }
    window.addEventListener('blur', closeFloatingActions)
    document.addEventListener('mouseleave', handleDocumentMouseLeave)
    return () => {
      window.removeEventListener('blur', closeFloatingActions)
      document.removeEventListener('mouseleave', handleDocumentMouseLeave)
    }
  }, [closeFloatingActions, showActions, showEmojiPicker, showFullPicker, showMoreMenu])

  const activateHover = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    window.dispatchEvent(
      new CustomEvent(MESSAGE_ACTIONS_ACTIVE_EVENT, { detail: { messageId: message.id } }),
    )
    setIsHovered(true)
  }, [message.id])

  const deactivateHover = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    hoverTimeoutRef.current = setTimeout(() => {
      closeFloatingActions()
    }, 150)
  }, [closeFloatingActions])

  const isOwn = message.authorId === currentUserId
  const getFloatingControlsStyle = useCallback(
    (offsetTop: number, estimatedWidth: number): React.CSSProperties | null => {
      if (typeof window === 'undefined') return null
      const rect = messageRef.current?.getBoundingClientRect()
      if (!rect) return null

      const floatingBounds = messageRef.current
        ?.closest('.chat-scroll-surface, .chat-panel')
        ?.getBoundingClientRect()
      const bounds = floatingBounds ?? {
        top: 0,
        right: window.innerWidth,
        bottom: window.innerHeight,
        left: 0,
      }
      const minTop = bounds.top + 8
      const maxTop = Math.max(minTop, bounds.bottom - 56)
      const minLeft = bounds.left + 8
      const maxLeft = Math.max(minLeft, bounds.right - estimatedWidth - 8)
      const desiredLeft = rect.right - estimatedWidth - 16

      return {
        top: Math.min(Math.max(minTop, rect.top - offsetTop), maxTop),
        left: Math.min(Math.max(minLeft, desiredLeft), maxLeft),
      }
    },
    [],
  )
  const queryClient = useQueryClient()
  const [sendingSlashCommand, setSendingSlashCommand] = useState<string | null>(null)
  const author = message.author
  const canSendEconomyAction = Boolean(author && !isOwn && !author.isBot)
  const handleEditContentChange = useCallback((value: string) => {
    setEditContent(value)
  }, [])

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false)
  }, [])

  const handleEdit = useCallback(() => {
    setEditContent(message.content)
    setIsEditing(true)
    setShowMoreMenu(false)
    setTimeout(() => editInputRef.current?.focus(), 50)
  }, [message.content])

  const handleSaveEdit = useCallback(async () => {
    if (!editContent.trim() || editContent.trim() === message.content) {
      setIsEditing(false)
      return
    }
    try {
      const updated = editApi
        ? await editApi(message.id, editContent.trim())
        : await fetchApi<Message>(`/api/messages/${message.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ content: editContent.trim() }),
          })
      onMessageUpdate?.(updated)
      setIsEditing(false)
    } catch {
      /* keep editing on error */
    }
  }, [editContent, message.id, message.content, onMessageUpdate, editApi])

  const handleDelete = useCallback(async () => {
    setShowMoreMenu(false)
    const ok = await useConfirmStore.getState().confirm({
      title: t('chat.deleteMessage'),
      message: t('chat.deleteConfirm'),
    })
    if (!ok) return
    try {
      if (deleteApi) {
        await deleteApi(message.id)
      } else {
        await fetchApi(`/api/messages/${message.id}`, { method: 'DELETE' })
      }
      onMessageDelete?.(message.id)
    } catch {
      /* ignore */
    }
  }, [message.id, onMessageDelete, deleteApi, t])

  const handleCopy = useCallback(async () => {
    const didCopy = await copyToClipboard(message.content, {
      successMessage: t('common.copied'),
      errorMessage: t('chat.copyFailed'),
    })
    if (!didCopy) return
    setCopied(true)
    setShowMoreMenu(false)
    setTimeout(() => setCopied(false), 2000)
  }, [message.content, t])

  const handleShareLink = useCallback(async () => {
    const url = `${window.location.origin}${window.location.pathname}?msg=${message.id}`
    const didCopy = await copyToClipboard(url, {
      successMessage: t('common.copied'),
      errorMessage: t('chat.copyFailed'),
    })
    if (!didCopy) return
    setCopied(true)
    setShowMoreMenu(false)
    setTimeout(() => setCopied(false), 2000)
  }, [message.id, t])

  // Avatar hover handlers
  const handleAvatarMouseEnter = useCallback(() => {
    if (avatarPinned) return
    if (avatarHoverTimerRef.current) clearTimeout(avatarHoverTimerRef.current)
    avatarHoverTimerRef.current = setTimeout(() => {
      if (avatarRef.current) {
        const rect = avatarRef.current.getBoundingClientRect()
        setAvatarCardPos({
          left: rect.right + 12,
          top: Math.max(8, Math.min(rect.top, window.innerHeight - 280)),
        })
        setAvatarHover(true)
      }
    }, 350)
  }, [avatarPinned])

  const handleAvatarMouseLeave = useCallback(() => {
    if (avatarPinned) return
    if (avatarHoverTimerRef.current) clearTimeout(avatarHoverTimerRef.current)
    avatarHoverTimerRef.current = setTimeout(() => setAvatarHover(false), 200)
  }, [avatarPinned])

  const handleAvatarClick = useCallback(() => {
    if (author) {
      setAvatarPinned(true)
      setAvatarHover(true)
      if (avatarRef.current) {
        const rect = avatarRef.current.getBoundingClientRect()
        setAvatarCardPos({
          left: rect.right + 12,
          top: Math.max(8, Math.min(rect.top, window.innerHeight - 280)),
        })
      }
    }
  }, [author])

  const handleAvatarContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setAvatarContextMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const closeAvatarCard = useCallback(() => {
    setAvatarPinned(false)
    setAvatarHover(false)
  }, [])

  // Look up server member info from cache for role/buddy metadata.
  const membersList = serverId
    ? (queryClient.getQueryData<MemberEntry[]>(['members', serverId]) ?? EMPTY_MEMBER_ENTRIES)
    : EMPTY_MEMBER_ENTRIES
  const authorMember = membersList.find((m: MemberEntry) => m.userId === author?.id)
  const buddyAgentsList = serverId
    ? (queryClient.getQueryData<BuddyAgentEntry[]>(['members-buddy-agents', serverId]) ??
      EMPTY_BUDDY_AGENT_ENTRIES)
    : EMPTY_BUDDY_AGENT_ENTRIES
  const buddyAgent = author?.isBot
    ? buddyAgentsList.find((a: BuddyAgentEntry) => a.botUser?.id === author.id)
    : undefined
  const currentMember = membersList.find((m: MemberEntry) => m.userId === currentUserId)
  const canKick = !!serverId && (currentMember?.role === 'owner' || currentMember?.role === 'admin')
  // Allow deletion for own messages OR messages from a bot owned by the current user
  const canDelete = isOwn || (author?.isBot && buddyAgent?.ownerId === currentUserId)

  const time = useMemo(
    () =>
      formatDistanceToNow(new Date(message.createdAt), {
        locale: DATE_FNS_LOCALE_MAP[i18n.language] ?? zhCN,
        addSuffix: true,
      }),
    [i18n.language, message.createdAt],
  )
  const editedTitle = useMemo(() => {
    if (!message.isEdited) return ''
    return format(new Date(message.updatedAt ?? message.createdAt), 'PPpp', {
      locale: DATE_FNS_LOCALE_MAP[i18n.language] ?? zhCN,
    })
  }, [i18n.language, message.createdAt, message.isEdited, message.updatedAt])

  const resolveMentionLabel = useCallback(
    (mention: string) => {
      if (!mention.startsWith('@')) return mention
      const username = mention.slice(1)
      const member = membersList.find(
        (m: MemberEntry) => m.user?.username === username || m.user?.displayName === username,
      )
      const display = member?.user?.displayName ?? member?.user?.username
      return display ? `@${display}` : mention
    },
    [membersList],
  )

  const structuredMentions = useMemo(() => {
    return Array.isArray(message.metadata?.mentions)
      ? (message.metadata.mentions as MessageMention[]).filter((mention) => mention.token)
      : []
  }, [message.metadata])

  const resolveLegacyEntityMention = useCallback(
    (token: string): MessageMention | null => {
      const key = token.slice(1).toLocaleLowerCase()
      if (!key) return null

      if (token.startsWith('@')) {
        const hasUserMatch = membersList.some((member) => {
          const username = member.user?.username?.toLocaleLowerCase()
          const displayName = member.user?.displayName?.toLocaleLowerCase()
          return username === key || displayName === key
        })
        if (hasUserMatch) return null

        const serverRows = queryClient.getQueriesData<LegacyServerEntry[]>({
          queryKey: ['servers'],
        })
        const servers = serverRows.flatMap(([, data]) => (Array.isArray(data) ? data : []))
        const server = servers.find((candidate) => {
          const slug = lowerText(candidate.slug)
          const name = lowerText(candidate.name)
          return slug === key || name === key
        })
        if (!server) return null
        const serverName = typeof server.name === 'string' && server.name.trim() ? server.name : key
        return {
          kind: 'server',
          targetId: server.id,
          token,
          sourceToken: token,
          label: `@${serverName}`,
          serverId: server.id,
          serverSlug: server.slug,
          serverName,
        }
      }

      if (!token.startsWith('#')) return null
      const channelRows = queryClient.getQueriesData<LegacyChannelEntry[]>({
        queryKey: ['channels'],
      })
      const channels = channelRows.flatMap(([, data]) => (Array.isArray(data) ? data : []))
      const channel = channels.find((candidate) => lowerText(candidate.name) === key)
      if (!channel || !serverId) return null
      const channelName =
        typeof channel.name === 'string' && channel.name.trim() ? channel.name : key

      return {
        kind: 'channel',
        targetId: channel.id,
        token,
        sourceToken: token,
        label: `#${channelName}`,
        channelId: channel.id,
        channelName,
        serverId,
        isPrivate: channel.isPrivate,
      }
    },
    [membersList, queryClient, serverId],
  )

  /**
   * Process react children to highlight structured mentions and legacy @username patterns.
   */
  const renderMentions = useCallback(
    (children: React.ReactNode): React.ReactNode => {
      if (!children) return children
      const childArray = Array.isArray(children) ? children : [children]
      return childArray.map((child, idx) => {
        if (typeof child !== 'string') return child
        const structuredSegments = segmentTextByMentions(child, structuredMentions)
        const hasStructuredMention = structuredSegments.some(
          (segment) => segment.type === 'mention',
        )
        const parts = hasStructuredMention
          ? structuredSegments
          : [{ type: 'text' as const, text: child }]

        return parts.flatMap((part, pi) => {
          if (part.type === 'mention') {
            const structuredMention = part.mention
            if (structuredMention.kind === 'user' || structuredMention.kind === 'buddy') {
              return [
                <MentionSpan
                  key={`${idx}-${pi}`}
                  mention={part.text}
                  label={structuredMention.label}
                  structuredMention={structuredMention}
                />,
              ]
            }
            return [<EntityMentionSpan key={`${idx}-${pi}`} mention={structuredMention} />]
          }

          const legacyParts = part.text.split(/([@#][\p{L}\p{N}_-]+)/gu).filter(Boolean)
          if (legacyParts.length === 1) return [part.text]
          return legacyParts.map((legacyPart, legacyIndex) => {
            const legacyEntity = resolveLegacyEntityMention(legacyPart)
            if (legacyEntity) {
              return (
                <EntityMentionSpan key={`${idx}-${pi}-${legacyIndex}`} mention={legacyEntity} />
              )
            }
            if (/^@[\p{L}\p{N}_-]+$/u.test(legacyPart)) {
              return (
                <MentionSpan
                  key={`${idx}-${pi}-${legacyIndex}`}
                  mention={legacyPart}
                  label={resolveMentionLabel(legacyPart)}
                />
              )
            }
            return legacyPart
          })
        })
      })
    },
    [resolveLegacyEntityMention, resolveMentionLabel, structuredMentions],
  )

  const walletRecharge = useMemo(
    () => decodeWalletRechargeMarker(message.content),
    [message.content],
  )
  const markdownContent = useMemo(() => {
    if (isTaskCardMessage) return ''
    const content = walletRecharge ? stripWalletRechargeMarker(message.content) : message.content
    return content === BUDDY_INTRO_PROMPT_KEY
      ? t(BUDDY_INTRO_PROMPT_KEY, '你好，请介绍一下你自己，并告诉我你能帮我做什么。')
      : content
  }, [isTaskCardMessage, message.content, t, walletRecharge])
  const { content: visibleMarkdownContent, toolCalls: hermesToolCalls } = useMemo(
    () => splitHermesToolCalls(markdownContent),
    [markdownContent],
  )
  const slashCommandActions = useMemo(
    () =>
      enableSlashCommandActions && !isOwn ? extractSlashCommandActions(visibleMarkdownContent) : [],
    [enableSlashCommandActions, isOwn, visibleMarkdownContent],
  )
  const handleSendSlashCommand = useCallback(
    async (command: string) => {
      if (sendingSlashCommand) return
      const channelId = message.channelId
      const threadId = message.threadId
      if (!channelId && !threadId) {
        showToast(t('chat.sendSlashCommandFailed'), 'error')
        return
      }

      setSendingSlashCommand(command)
      try {
        const created = await fetchApi<Message>(
          threadId ? `/api/threads/${threadId}/messages` : `/api/channels/${channelId}/messages`,
          {
            method: 'POST',
            body: JSON.stringify({ content: command }),
          },
        )
        if (threadId) {
          appendCreatedThreadMessage(queryClient, threadId, created)
          queryClient.invalidateQueries({ queryKey: ['thread-messages', threadId] })
        } else if (channelId) {
          appendCreatedChannelMessage(queryClient, channelId, created)
          queryClient.invalidateQueries({ queryKey: ['messages', channelId] })
        }
        playSendSound()
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : t('chat.sendSlashCommandFailed'),
          'error',
        )
      } finally {
        setSendingSlashCommand(null)
      }
    },
    [message.channelId, message.threadId, queryClient, sendingSlashCommand, t],
  )
  const markdownNode = useMemo(() => {
    if (!visibleMarkdownContent || visibleMarkdownContent === '\u200B') return null

    return <MessageMarkdown content={visibleMarkdownContent} renderMentions={renderMentions} />
  }, [visibleMarkdownContent, renderMentions])

  const handleImageContextMenu = useCallback((event: React.MouseEvent, attachment: Attachment) => {
    event.preventDefault()
    setImageContextMenu({ x: event.clientX, y: event.clientY, att: attachment })
  }, [])

  const handleOpenImage = useCallback((attachment: Attachment, src: string) => {
    setImageViewer({
      src,
      filename: attachment.filename,
      size: attachment.size,
    })
  }, [])

  const renderAttachment = useCallback(
    ({
      attachment,
      onImageContextMenu,
      onOpenImage,
      onPreviewFile,
      onSaveToWorkspace,
    }: AttachmentRenderProps) => (
      <AttachmentView
        key={attachment.id}
        attachment={attachment}
        isOwn={isOwn}
        onPreviewFile={onPreviewFile}
        onSaveToWorkspace={onSaveToWorkspace}
        onImageContextMenu={onImageContextMenu}
        onOpenImage={onOpenImage}
      />
    ),
    [isOwn],
  )

  const handleRetrySend = useCallback(
    (failedMessage: Message) => {
      if (failedMessage.threadId) {
        const threadId = failedMessage.threadId
        queryClient.setQueryData<Message[]>(['thread-messages', threadId], (old) =>
          (old ?? []).filter((m) => m.id !== failedMessage.id),
        )
        const tempId = `temp-${Date.now()}`
        const retryMsg = { ...failedMessage, id: tempId, sendStatus: 'sending' as const }
        queryClient.setQueryData<Message[]>(['thread-messages', threadId], (old) => [
          ...(old ?? []),
          retryMsg,
        ])
        fetchApi<Message>(`/api/threads/${threadId}/messages`, {
          method: 'POST',
          body: JSON.stringify({
            content: failedMessage.content,
            replyToId: failedMessage.replyToId,
          }),
        })
          .then((created) => {
            queryClient.setQueryData<Message[]>(['thread-messages', threadId], (old) =>
              (old ?? []).map((m) => (m.id === tempId ? created : m)),
            )
          })
          .catch(() => {
            queryClient.setQueryData<Message[]>(['thread-messages', threadId], (old) =>
              (old ?? []).map((m) =>
                m.id === tempId ? { ...m, sendStatus: 'failed' as const } : m,
              ),
            )
          })
        return
      }

      const channelId = failedMessage.channelId
      if (!channelId) return
      queryClient.setQueryData<InfiniteData<MessagesPage>>(['messages', channelId], (old) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages.filter((m) => m.id !== failedMessage.id),
          })),
        }
      })
      const tempId = `temp-${Date.now()}`
      const retryMsg = { ...failedMessage, id: tempId, sendStatus: 'sending' as const }
      queryClient.setQueryData<InfiniteData<MessagesPage>>(['messages', channelId], (old) => {
        if (!old || old.pages.length === 0) return old
        const pages = [...old.pages]
        const firstPage = pages[0]!
        pages[0] = { ...firstPage, messages: [...firstPage.messages, retryMsg] }
        return { ...old, pages }
      })
      fetchApi(`/api/channels/${channelId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          content: failedMessage.content,
          replyToId: failedMessage.replyToId,
        }),
      }).catch(() => {
        queryClient.setQueryData<InfiniteData<MessagesPage>>(['messages', channelId], (old) => {
          if (!old) return old
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map((m) =>
                m.id === tempId ? { ...m, sendStatus: 'failed' as const } : m,
              ),
            })),
          }
        })
      })
    },
    [queryClient],
  )

  return (
    <div
      ref={messageRef}
      id={`msg-${message.id}`}
      data-message-id={message.id}
      className={cn(
        'group relative mx-1 flex gap-3 px-3 sm:gap-4 sm:px-4',
        [
          renderGrouped ? 'py-0.5 pl-[64px] sm:pl-[72px]' : 'py-2',
          'message-row hover:bg-bg-tertiary/20',
        ],
        highlight ? 'bg-primary/10 animate-pulse' : 'mt-[2px]',
        isSelected && 'bg-primary/10',
        selectionMode && 'cursor-pointer select-none',
      )}
      onMouseEnter={activateHover}
      onMouseLeave={deactivateHover}
      onClick={
        selectionMode
          ? (event) => {
              if (event.shiftKey && canSelectRangeTo) {
                onSelectRangeTo?.(message.id)
                return
              }
              onToggleSelect?.(message.id)
            }
          : undefined
      }
      onTouchStart={() => {
        longPressTimerRef.current = setTimeout(() => {
          activateHover()
        }, 500)
      }}
      onTouchEnd={() => {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current)
          longPressTimerRef.current = null
        }
      }}
      onTouchMove={() => {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current)
          longPressTimerRef.current = null
        }
      }}
    >
      {/* Selection checkbox */}
      {selectionMode && <SelectionControl isSelected={isSelected} />}
      {/* Avatar container — hidden in grouped mode */}
      {!renderGrouped && (
        <div
          ref={avatarRef}
          className={`flex-shrink-0 ${replyToMessage ? 'mt-6' : 'mt-0.5'} cursor-pointer`}
          onMouseEnter={handleAvatarMouseEnter}
          onMouseLeave={handleAvatarMouseLeave}
          onClick={handleAvatarClick}
          onContextMenu={handleAvatarContextMenu}
        >
          <UserAvatar
            userId={author?.id}
            avatarUrl={author?.avatarUrl}
            displayName={author?.displayName ?? author?.username}
            size="md"
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Reply reference */}
        {replyToMessage && <ReplyReference replyToMessage={replyToMessage} t={t} />}
        {/* Author line — hidden in grouped mode */}
        {!renderGrouped && (
          <MessageAuthorLine
            author={author}
            editedTitle={editedTitle}
            isEdited={message.isEdited}
            t={t}
            time={time}
          />
        )}

        {/* Inline edit mode */}
        {isEditing ? (
          <MessageEditBox
            editContent={editContent}
            inputRef={editInputRef}
            onCancel={handleCancelEdit}
            onChange={handleEditContentChange}
            onSave={handleSaveEdit}
            t={t}
          />
        ) : (
          markdownNode
        )}
        {!isEditing && (
          <SlashCommandActions
            actions={slashCommandActions}
            sendingCommand={sendingSlashCommand}
            onSend={handleSendSlashCommand}
          />
        )}
        {!isEditing && <HermesToolCallList toolCalls={hermesToolCalls} />}

        {walletRecharge && <WalletRechargeCard data={walletRecharge} />}

        <TaskCardsView
          cards={message.metadata?.cards}
          messageId={message.id}
          channelId={message.channelId}
          replies={taskReplies}
        />

        <ServerAppCardsView cards={message.metadata?.cards} />

        <MessageReferenceCardsView cards={message.metadata?.cards} />

        {message.metadata?.commerceCards && message.metadata.commerceCards.length > 0 && (
          <div className="flex flex-col gap-2 mt-2">
            {message.metadata.commerceCards.map((card) => (
              <CommerceProductCardView
                key={card.id}
                card={card}
                messageId={message.id}
                onPreviewFile={onPreviewFile}
              />
            ))}
          </div>
        )}

        {message.metadata?.paidFileCards && message.metadata.paidFileCards.length > 0 && (
          <div className="flex flex-col gap-2 mt-2">
            {message.metadata.paidFileCards.map((card) => (
              <PaidFileCardView key={card.id} card={card} onPreviewFile={onPreviewFile} />
            ))}
          </div>
        )}

        {message.metadata?.oauthLinkCards && message.metadata.oauthLinkCards.length > 0 && (
          <div className="flex flex-col gap-2 mt-2">
            {message.metadata.oauthLinkCards.map((card) => (
              <OAuthLinkCardView
                key={card.id}
                card={card}
                messageId={message.id}
                channelId={message.channelId}
                onPreview={onPreviewOAuthLink ?? (() => undefined)}
              />
            ))}
          </div>
        )}

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <AttachmentList
            attachments={message.attachments}
            onPreviewFile={onPreviewFile}
            onSaveToWorkspace={onSaveToWorkspace}
            onImageContextMenu={handleImageContextMenu}
            onOpenImage={handleOpenImage}
            renderAttachment={renderAttachment}
          />
        )}
        {imageContextMenu &&
          createPortal(
            <ImageContextMenu
              x={imageContextMenu.x}
              y={imageContextMenu.y}
              attachment={imageContextMenu.att}
              onClose={() => setImageContextMenu(null)}
              onSaveToWorkspace={
                onSaveToWorkspace ? () => onSaveToWorkspace(imageContextMenu.att) : undefined
              }
            />,
            document.body,
          )}
        {imageViewer &&
          createPortal(
            <ImageViewer
              src={imageViewer.src}
              filename={imageViewer.filename}
              size={imageViewer.size}
              onClose={() => setImageViewer(null)}
            />,
            document.body,
          )}

        {/* Interactive block (Phase 2 POC — buttons / select) */}
        {message.metadata?.interactive && (
          <InteractiveBlockRenderer
            block={message.metadata.interactive}
            messageId={message.id}
            disabled={message.sendStatus === 'sending'}
            submittedResponse={submittedInteractiveResponse}
          />
        )}

        {thread && !message.threadId && onOpenThread && (
          <div className="relative mt-2 max-w-[34rem]">
            <div
              aria-hidden="true"
              className="absolute -left-8 -top-2 h-[calc(50%+8px)] w-8 rounded-bl-xl border-b-2 border-l-2 border-border-subtle/70 sm:-left-9 sm:w-9"
            />
            <button
              type="button"
              onClick={() => onOpenThread(message.id)}
              className="group/thread flex w-full min-w-0 items-center gap-2 rounded-lg border border-border-subtle bg-bg-secondary/45 px-3 py-2 text-left transition hover:border-primary/35 hover:bg-primary/8 focus:outline-none focus:ring-2 focus:ring-primary/35"
              title={t('chat.openThread')}
              aria-label={t('chat.openThread')}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <MessageSquare size={15} strokeWidth={2.3} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-black text-text-primary">
                  {thread.name || t('chat.threadDefaultName')}
                </span>
                <span className="block truncate text-xs font-semibold text-text-muted">
                  {t('chat.viewThread')}
                </span>
              </span>
              <ChevronRight
                size={16}
                className="shrink-0 text-text-muted transition group-hover/thread:text-primary"
              />
            </button>
          </div>
        )}

        {/* Reactions */}
        {message.reactions && message.reactions.length > 0 && (
          <MessageReactions
            currentUserId={currentUserId}
            messageId={message.id}
            onReact={onReact}
            reactions={message.reactions}
          />
        )}

        {/* Send status indicator — only show on failure */}
        {message.sendStatus === 'failed' && (
          <SendFailureNotice message={message} onRetry={handleRetrySend} t={t} />
        )}
      </div>

      {/* Hover actions */}
      {showActions &&
        messageRef.current &&
        (() => {
          const floatingStyle = getFloatingControlsStyle(
            16,
            selectionMode ? 132 : canSendEconomyAction ? 218 : 150,
          )
          if (!floatingStyle) return null
          return createPortal(
            <div
              ref={actionsRef}
              className="fixed flex items-center bg-white/90 dark:bg-[#1A1D24]/90 backdrop-blur-xl rounded-[14px] border border-black/5 dark:border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.4)] p-0.5 z-[65] transition-all"
              style={floatingStyle}
              onMouseEnter={activateHover}
              onMouseLeave={deactivateHover}
            >
              {selectionMode ? (
                <Button
                  variant="ghost"
                  size="sm"
                  data-selection-drag-ignore="true"
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelectRangeTo?.(message.id)
                  }}
                  className="!h-8 !rounded-[10px] !px-2.5 !font-semibold !normal-case !tracking-normal text-primary hover:bg-primary/10 transition-colors"
                >
                  <CornerDownRight size={15} strokeWidth={2.2} className="mr-1.5" />
                  {t('chat.selectToHere')}
                </Button>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="!w-8 !h-8 !p-0 !rounded-[10px] !font-normal !normal-case !tracking-normal text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                    title={t('chat.addEmoji')}
                  >
                    <Smile size={18} strokeWidth={2} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => onReply?.(message.id)}
                    className="!w-8 !h-8 !p-0 !rounded-[10px] !font-normal !normal-case !tracking-normal text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                    title={t('chat.reply')}
                  >
                    <Reply size={18} strokeWidth={2} />
                  </Button>
                  {onOpenThread && !message.threadId && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => onOpenThread(message.id)}
                      className="!w-8 !h-8 !p-0 !rounded-[10px] !font-normal !normal-case !tracking-normal text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                      title={t(hasThread ? 'chat.openThread' : 'chat.startThread')}
                    >
                      <MessageSquare size={18} strokeWidth={2} />
                    </Button>
                  )}
                  {canSendEconomyAction && (
                    <>
                      <div className="mx-0.5 h-5 w-px bg-black/5 dark:bg-white/10" />
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => {
                          setShowMoreMenu(false)
                          setShowTipModal(true)
                        }}
                        className="!w-8 !h-8 !p-0 !rounded-[10px] !font-normal !normal-case !tracking-normal text-text-secondary hover:text-primary hover:bg-primary/10 transition-colors"
                        title={t('communityEconomy.supportMessage')}
                      >
                        <HandCoins size={18} strokeWidth={2} />
                      </Button>
                    </>
                  )}
                  <div className="relative">
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setShowMoreMenu(!showMoreMenu)}
                      className={`!w-8 !h-8 !p-0 !rounded-[10px] !font-normal !normal-case !tracking-normal transition-colors ${showMoreMenu ? 'bg-black/5 dark:bg-white/10 text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/10'}`}
                      title={t('chat.more')}
                    >
                      <MoreHorizontal size={18} strokeWidth={2} />
                    </Button>
                    {/* More dropdown menu */}
                    {showMoreMenu && (
                      <div className="absolute top-[calc(100%+4px)] right-0 origin-top-right bg-white/95 dark:bg-[#1A1D24]/95 backdrop-blur-2xl rounded-[16px] border border-black/5 dark:border-white/10 shadow-[0_12px_48px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_48px_rgba(0,0,0,0.5)] py-2 min-w-[180px] z-50 flex flex-col gap-0.5 px-1.5 animate-in fade-in zoom-in-95 duration-100">
                        {isOwn && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleEdit}
                            className="!w-full !justify-start !rounded-[10px] !font-medium !normal-case !tracking-normal !px-3 !py-2.5 !text-[14px] !h-auto text-text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                          >
                            <Pencil size={16} strokeWidth={2} className="mr-1.5 opacity-70" />
                            {t('chat.editMessage')}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCopy}
                          className="!w-full !justify-start !rounded-[10px] !font-medium !normal-case !tracking-normal !px-3 !py-2.5 !text-[14px] !h-auto text-text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                        >
                          <Copy size={16} strokeWidth={2} className="mr-1.5 opacity-70" />
                          {copied ? t('common.copied') : t('chat.copyMessage')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleShareLink}
                          className="!w-full !justify-start !rounded-[10px] !font-medium !normal-case !tracking-normal !px-3 !py-2.5 !text-[14px] !h-auto text-text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                        >
                          <ExternalLink size={16} strokeWidth={2} className="mr-1.5 opacity-70" />
                          {t('chat.shareLink')}
                        </Button>
                        {canSendEconomyAction && (
                          <>
                            <div className="h-px bg-black/5 dark:bg-white/10 mx-2 my-1" />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setShowMoreMenu(false)
                                setShowTipModal(true)
                              }}
                              className="!w-full !justify-start !rounded-[10px] !font-medium !normal-case !tracking-normal !px-3 !py-2.5 !text-[14px] !h-auto text-text-primary hover:bg-primary/10 hover:text-primary transition-colors"
                            >
                              <HandCoins size={16} strokeWidth={2} className="mr-1.5 opacity-70" />
                              {t('communityEconomy.supportMessage')}
                            </Button>
                          </>
                        )}
                        {onEnterSelectionMode && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setShowMoreMenu(false)
                              onEnterSelectionMode(message.id)
                            }}
                            className="!w-full !justify-start !rounded-[10px] !font-medium !normal-case !tracking-normal !px-3 !py-2.5 !text-[14px] !h-auto text-text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                          >
                            <CheckSquare size={16} strokeWidth={2} className="mr-1.5 opacity-70" />
                            {t('chat.selectMessages')}
                          </Button>
                        )}
                        {canDelete && (
                          <>
                            <div className="h-px bg-black/5 dark:bg-white/10 mx-2 my-1" />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={handleDelete}
                              className="!w-full !justify-start !rounded-[10px] !font-medium !normal-case !tracking-normal !px-3 !py-2.5 !text-[14px] !h-auto text-danger hover:!bg-danger/10 hover:text-danger transition-colors group"
                            >
                              <Trash2
                                size={16}
                                strokeWidth={2}
                                className="mr-1.5 opacity-80 group-hover:opacity-100"
                              />
                              {t('chat.deleteMessage')}
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>,
            document.body,
          )
        })()}

      {/* Quick emoji picker */}
      {showEmojiPicker &&
        messageRef.current &&
        (() => {
          const floatingStyle = getFloatingControlsStyle(44, 284)
          if (!floatingStyle) return null
          return createPortal(
            <div
              className="fixed flex items-center bg-white/90 dark:bg-[#1A1D24]/90 backdrop-blur-xl rounded-[14px] border border-black/5 dark:border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.4)] p-0.5 z-[66] transition-all"
              style={floatingStyle}
              onMouseEnter={activateHover}
              onMouseLeave={deactivateHover}
            >
              {quickEmojis.map((emoji) => (
                <Button
                  variant="ghost"
                  size="xs"
                  key={emoji}
                  onClick={() => {
                    onReact?.(message.id, emoji)
                    setShowEmojiPicker(false)
                  }}
                  className="!w-8 !h-8 !rounded-[10px] !px-0 !font-normal !normal-case !tracking-normal text-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                >
                  {emoji}
                </Button>
              ))}
              <div className="w-px h-5 bg-black/5 dark:bg-white/10 mx-0.5 shrink-0" />
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  setShowEmojiPicker(false)
                  setShowFullPicker(true)
                }}
                className="!w-8 !h-8 !rounded-[10px] !px-0 !font-normal !normal-case !tracking-normal text-sm text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                title={t('chat.addEmoji')}
              >
                +
              </Button>
            </div>,
            document.body,
          )
        })()}

      {/* Full emoji picker — still needs portal due to size and overflow */}
      {showFullPicker &&
        messageRef.current &&
        createPortal(
          (() => {
            const fullPickerPosStyle = getFloatingControlsStyle(440, 352)
            if (!fullPickerPosStyle) return null
            return (
              <div
                className="fixed z-[70]"
                style={fullPickerPosStyle}
                onMouseEnter={activateHover}
                onMouseLeave={deactivateHover}
              >
                <EmojiPicker
                  onSelect={(emoji) => {
                    onReact?.(message.id, emoji)
                  }}
                  onClose={() => setShowFullPicker(false)}
                  position="bottom"
                />
              </div>
            )
          })(),
          document.body,
        )}

      {/* Avatar hover card (portal) */}
      {avatarHover &&
        !avatarPinned &&
        author &&
        avatarCardPos &&
        createPortal(
          <div
            className="fixed z-[80]"
            style={{ left: avatarCardPos.left, top: avatarCardPos.top }}
            onMouseEnter={() => {
              if (avatarHoverTimerRef.current) clearTimeout(avatarHoverTimerRef.current)
            }}
            onMouseLeave={handleAvatarMouseLeave}
          >
            <UserProfileCard
              user={author}
              role={(authorMember?.role as 'owner' | 'admin' | 'member') ?? null}
              ownerName={buddyAgent?.owner?.displayName ?? buddyAgent?.owner?.username}
              description={
                typeof buddyAgent?.config?.description === 'string'
                  ? buddyAgent.config.description
                  : undefined
              }
            />
          </div>,
          document.body,
        )}

      {/* Avatar pinned card (modal overlay) */}
      {avatarPinned &&
        avatarHover &&
        author &&
        createPortal(
          <div
            className="fixed inset-0 bg-bg-deep/60 flex items-center justify-center z-50"
            onClick={closeAvatarCard}
          >
            <div onClick={(e) => e.stopPropagation()}>
              <UserProfileCard
                user={author}
                role={(authorMember?.role as 'owner' | 'admin' | 'member') ?? null}
                ownerName={buddyAgent?.owner?.displayName ?? buddyAgent?.owner?.username}
                description={
                  typeof buddyAgent?.config?.description === 'string'
                    ? buddyAgent.config.description
                    : undefined
                }
              />
            </div>
          </div>,
          document.body,
        )}

      {/* Avatar right-click context menu */}
      {avatarContextMenu &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[60]"
              onClick={() => setAvatarContextMenu(null)}
              onContextMenu={(e) => {
                e.preventDefault()
                setAvatarContextMenu(null)
              }}
            />
            <div
              className="fixed z-[61] bg-bg-primary/95 backdrop-blur-xl rounded-[24px] border border-border-subtle shadow-[0_16px_64px_rgba(0,0,0,0.4)] py-1.5 min-w-[160px]"
              style={{ left: avatarContextMenu.x, top: avatarContextMenu.y }}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAvatarContextMenu(null)
                  handleAvatarClick()
                }}
                className="!w-full !justify-start !rounded-none !font-normal !normal-case !tracking-normal !px-3 !py-2 !text-sm !h-auto text-text-secondary hover:text-text-primary"
              >
                {t('member.viewProfile')}
              </Button>
              {canKick && author?.id !== currentUserId && authorMember?.role !== 'owner' && (
                <>
                  <div className="h-px bg-border-subtle my-1" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      const name = author?.displayName ?? author?.username
                      const confirmKey = author?.isBot
                        ? 'member.removeBuddyConfirm'
                        : 'member.kickConfirm'
                      const titleKey = author?.isBot ? 'member.removeBuddy' : 'member.kickMember'
                      const ok = await useConfirmStore.getState().confirm({
                        title: t(titleKey),
                        message: t(confirmKey, { name }),
                      })
                      if (ok && serverId) {
                        fetchApi(`/api/servers/${serverId}/members/${author?.id}`, {
                          method: 'DELETE',
                        }).then(() => {
                          queryClient.invalidateQueries({
                            queryKey: ['members', serverId],
                          })
                        })
                      }
                      setAvatarContextMenu(null)
                    }}
                    className="!w-full !justify-start !rounded-none !font-normal !normal-case !tracking-normal !px-3 !py-2 !text-sm !h-auto text-danger hover:!bg-danger/10"
                  >
                    {author?.isBot ? t('member.removeBuddy') : t('member.kickMember')}
                  </Button>
                </>
              )}
            </div>
          </>,
          document.body,
        )}
      {author && canSendEconomyAction && (
        <CommunityEconomySendModal
          open={showTipModal}
          mode="tip"
          recipient={{
            id: author.id,
            username: author.username,
            displayName: author.displayName,
            avatarUrl: author.avatarUrl,
          }}
          context={{ kind: 'message', id: message.id }}
          onClose={() => setShowTipModal(false)}
        />
      )}
    </div>
  )
}

/** Memoized MessageBubble — prevents unnecessary re-renders when props haven't changed. */
export const MessageBubble = React.memo(MessageBubbleInner, (prev, next) => {
  // Shallow compare all props. For stable references from parent (useCallback),
  // this prevents re-rendering when sibling messages update.
  if (prev.message.id !== next.message.id) return false
  if (prev.message.content !== next.message.content) return false
  if (prev.message.isEdited !== next.message.isEdited) return false
  if (prev.message.sendStatus !== next.message.sendStatus) return false
  if (prev.message.updatedAt !== next.message.updatedAt) return false
  if (prev.currentUserId !== next.currentUserId) return false
  if (prev.serverId !== next.serverId) return false
  if (prev.highlight !== next.highlight) return false
  if (prev.hasThread !== next.hasThread) return false
  if (prev.thread?.id !== next.thread?.id) return false
  if (prev.thread?.name !== next.thread?.name) return false
  if (prev.isGrouped !== next.isGrouped) return false
  if (prev.selectionMode !== next.selectionMode) return false
  if (prev.isSelected !== next.isSelected) return false
  if (prev.selectionAnchorId !== next.selectionAnchorId) return false
  if (prev.enableSlashCommandActions !== next.enableSlashCommandActions) return false
  if (
    !interactiveResponseEqual(prev.submittedInteractiveResponse, next.submittedInteractiveResponse)
  ) {
    return false
  }

  // Deep compare reactions (frequently updated via WS)
  if (!reactionsEqual(prev.message.reactions, next.message.reactions, true)) return false

  // Deep compare replyToMessage
  if (prev.replyToMessage?.id !== next.replyToMessage?.id) return false
  if (prev.replyToMessage?.content !== next.replyToMessage?.content) return false
  if (prev.taskReplies?.length !== next.taskReplies?.length) return false
  for (let index = 0; index < (prev.taskReplies?.length ?? 0); index += 1) {
    const prevReply = prev.taskReplies?.[index]
    const nextReply = next.taskReplies?.[index]
    if (prevReply?.id !== nextReply?.id) return false
    if (prevReply?.content !== nextReply?.content) return false
    if (prevReply?.updatedAt !== nextReply?.updatedAt) return false
  }

  // Deep compare attachments
  if (!attachmentsEqual(prev.message.attachments, next.message.attachments)) return false

  return true
})

MessageBubble.displayName = 'MessageBubble'
