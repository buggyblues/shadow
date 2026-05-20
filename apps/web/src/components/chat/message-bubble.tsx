import type { MessageMention } from '@shadowob/shared'
import { segmentTextByMentions } from '@shadowob/shared'
import { Button, cn } from '@shadowob/ui'
import { type InfiniteData, useQueryClient } from '@tanstack/react-query'
import { format, formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import {
  Check,
  CheckSquare,
  Copy,
  ExternalLink,
  HandCoins,
  MoreHorizontal,
  Pencil,
  Reply,
  Smile,
  Trash2,
} from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
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
} from './message-bubble/types'

function lowerText(value: unknown) {
  return typeof value === 'string' ? value.toLocaleLowerCase() : ''
}

function MessageBubbleInner({
  message,
  currentUserId,
  serverId,
  onReply,
  onReact,
  onMessageUpdate,
  onMessageDelete,
  onPreviewFile,
  onPreviewOAuthLink,
  onSaveToWorkspace,
  editApi,
  deleteApi,
  highlight,
  replyToMessage,
  selectionMode,
  isSelected,
  submittedInteractiveResponse,
  onToggleSelect,
  onEnterSelectionMode,
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

  const showActions = isHovered && !selectionMode

  // Close all menus on scroll (find nearest scrollable ancestor)
  useEffect(() => {
    if (!showActions && !showEmojiPicker && !showFullPicker && !showMoreMenu) return
    const scrollParent = messageRef.current?.closest(
      '[class*="overflow-y-auto"]',
    ) as HTMLElement | null
    if (!scrollParent) return
    const handleScroll = () => {
      setIsHovered(false)
      setShowEmojiPicker(false)
      setShowFullPicker(false)
      setShowMoreMenu(false)
    }
    scrollParent.addEventListener('scroll', handleScroll, { passive: true })
    return () => scrollParent.removeEventListener('scroll', handleScroll)
  }, [showActions, showEmojiPicker, showFullPicker, showMoreMenu])

  const activateHover = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    setIsHovered(true)
  }, [])

  const deactivateHover = useCallback(() => {
    if (showMoreMenu || showEmojiPicker || showFullPicker) return
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(false)
      setShowEmojiPicker(false)
      setShowFullPicker(false)
    }, 150)
  }, [showMoreMenu, showEmojiPicker, showFullPicker])

  const isOwn = message.authorId === currentUserId
  const getFloatingControlsStyle = useCallback(
    (offsetTop: number, estimatedWidth: number): React.CSSProperties | null => {
      if (typeof window === 'undefined') return null
      const rect = messageRef.current?.getBoundingClientRect()
      if (!rect) return null

      const maxTop = Math.max(8, window.innerHeight - 56)
      const maxLeft = Math.max(8, window.innerWidth - estimatedWidth - 8)
      const desiredLeft = rect.right - estimatedWidth - 16

      return {
        top: Math.min(Math.max(8, rect.top - offsetTop), maxTop),
        left: Math.min(Math.max(8, desiredLeft), maxLeft),
      }
    },
    [],
  )
  const queryClient = useQueryClient()
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

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setShowMoreMenu(false)
    setTimeout(() => setCopied(false), 2000)
  }, [message.content])

  const handleShareLink = useCallback(() => {
    const url = `${window.location.origin}${window.location.pathname}?msg=${message.id}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setShowMoreMenu(false)
    setTimeout(() => setCopied(false), 2000)
  }, [message.id])

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
  const markdownContent = useMemo(
    () => (walletRecharge ? stripWalletRechargeMarker(message.content) : message.content),
    [message.content, walletRecharge],
  )
  const markdownNode = useMemo(() => {
    if (!markdownContent || markdownContent === '\u200B') return null

    return <MessageMarkdown content={markdownContent} renderMentions={renderMentions} />
  }, [markdownContent, renderMentions])

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
        onPreviewFile={onPreviewFile}
        onSaveToWorkspace={onSaveToWorkspace}
        onImageContextMenu={onImageContextMenu}
        onOpenImage={onOpenImage}
      />
    ),
    [],
  )

  const handleRetrySend = useCallback(
    (failedMessage: Message) => {
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
      className={`group relative flex gap-4 px-4 ${isGrouped ? 'py-0.5 pl-[72px]' : 'py-2'} mx-1 message-row hover:bg-bg-tertiary/20 ${highlight ? 'bg-primary/10 animate-pulse' : 'mt-[2px]'} ${isSelected ? 'bg-primary/10' : ''} ${selectionMode ? 'cursor-pointer' : ''}`}
      onMouseEnter={activateHover}
      onMouseLeave={deactivateHover}
      onClick={selectionMode ? () => onToggleSelect?.(message.id) : undefined}
      onTouchStart={() => {
        longPressTimerRef.current = setTimeout(() => {
          setIsHovered(true)
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
      {!isGrouped && (
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
        {!isGrouped && (
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

        {walletRecharge && <WalletRechargeCard data={walletRecharge} />}

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
          const floatingStyle = getFloatingControlsStyle(16, canSendEconomyAction ? 184 : 116)
          if (!floatingStyle) return null
          return createPortal(
            <div
              ref={actionsRef}
              className="fixed flex items-center bg-white/90 dark:bg-[#1A1D24]/90 backdrop-blur-xl rounded-[14px] border border-black/5 dark:border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.4)] p-0.5 z-[65] transition-all"
              style={floatingStyle}
              onMouseEnter={activateHover}
              onMouseLeave={deactivateHover}
            >
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
              onMouseLeave={() => {
                hoverTimeoutRef.current = setTimeout(() => {
                  setIsHovered(false)
                  setShowEmojiPicker(false)
                }, 150)
              }}
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
            const rect = messageRef.current.getBoundingClientRect()
            const top = Math.max(8, rect.top - 440)
            const fullPickerPosStyle = { top, right: window.innerWidth - rect.right + 16 }
            return (
              <div
                className="fixed z-[70]"
                style={fullPickerPosStyle}
                onMouseLeave={() => {
                  setShowFullPicker(false)
                  hoverTimeoutRef.current = setTimeout(() => {
                    setIsHovered(false)
                  }, 150)
                }}
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
                        ? 'member.removeBotConfirm'
                        : 'member.kickConfirm'
                      const titleKey = author?.isBot ? 'member.removeBot' : 'member.kickMember'
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
                    {author?.isBot ? t('member.removeBot') : t('member.kickMember')}
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
  if (prev.isGrouped !== next.isGrouped) return false
  if (prev.selectionMode !== next.selectionMode) return false
  if (prev.isSelected !== next.isSelected) return false
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

  // Deep compare attachments
  if (!attachmentsEqual(prev.message.attachments, next.message.attachments)) return false

  return true
})

MessageBubble.displayName = 'MessageBubble'
