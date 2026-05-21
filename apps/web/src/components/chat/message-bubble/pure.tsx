import { Button, cn } from '@shadowob/ui'
import type { TFunction } from 'i18next'
import { AlertCircle, Check, CheckSquare, Reply, Square, X } from 'lucide-react'
import React, { memo } from 'react'
import type { Attachment, Author, Message, ReactionGroup } from './types'

type TextareaRef = React.RefObject<HTMLTextAreaElement | null>

interface SelectionControlProps {
  isSelected?: boolean
}

function SelectionControlBase({ isSelected }: SelectionControlProps) {
  return (
    <div className="flex-shrink-0 flex items-center mr-[-8px]">
      {isSelected ? (
        <CheckSquare size={18} className="text-primary" />
      ) : (
        <Square size={18} className="text-text-muted" />
      )}
    </div>
  )
}

export const SelectionControl = memo(SelectionControlBase)

interface ReplyReferenceProps {
  replyToMessage: Message
  t: TFunction
}

function ReplyReferenceBase({ replyToMessage, t }: ReplyReferenceProps) {
  const jumpToReply = () => {
    const el = document.getElementById(`msg-${replyToMessage.id}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div className="mb-1 flex w-full justify-start">
      <button
        type="button"
        onClick={jumpToReply}
        className="grid max-w-[min(100%,42rem)] grid-cols-[auto_minmax(0,1fr)] items-center gap-x-1.5 border-l-2 border-primary/70 py-0.5 pl-2 text-left text-xs text-text-muted transition hover:text-text-secondary"
      >
        <Reply size={12} className="shrink-0 text-primary/75" />
        <span className="min-w-0 truncate">
          <span className="font-semibold text-text-secondary/90">
            {replyToMessage.author?.displayName ??
              replyToMessage.author?.username ??
              t('common.unknownUser')}
          </span>
          <span className="opacity-70"> {replyToMessage.content}</span>
        </span>
      </button>
    </div>
  )
}

export const ReplyReference = memo(ReplyReferenceBase)

interface MessageAuthorLineProps {
  author?: Author
  editedTitle: string
  isEdited: boolean
  t: TFunction
  time: string
}

function MessageAuthorLineBase({ author, editedTitle, isEdited, t, time }: MessageAuthorLineProps) {
  return (
    <div className="mb-1 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 leading-none">
      <span
        className={`min-w-0 max-w-[min(16rem,50vw)] truncate whitespace-nowrap text-[15px] font-bold hover:underline cursor-pointer ${author?.isBot ? 'text-primary' : 'text-text-primary'}`}
      >
        {author?.displayName ?? author?.username ?? t('common.unknownUser')}
      </span>
      {author?.isBot && (
        <span className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-black uppercase tracking-widest text-primary">
          <Check size={8} />
          {t('common.bot')}
        </span>
      )}
      <span className="ml-0.5 shrink-0 whitespace-nowrap text-xs text-text-muted">{time}</span>
      {isEdited && (
        <span
          className="shrink-0 whitespace-nowrap text-[11px] text-text-muted cursor-help"
          title={editedTitle}
        >
          {t('chat.edited')}
        </span>
      )}
    </div>
  )
}

export const MessageAuthorLine = memo(MessageAuthorLineBase)

interface MessageEditBoxProps {
  editContent: string
  inputRef: TextareaRef
  onCancel: () => void
  onChange: (value: string) => void
  onSave: () => void
  t: TFunction
}

function MessageEditBoxBase({
  editContent,
  inputRef,
  onCancel,
  onChange,
  onSave,
  t,
}: MessageEditBoxProps) {
  return (
    <div className="mt-1">
      <textarea
        ref={inputRef}
        value={editContent}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
            e.preventDefault()
            onSave()
          } else if (e.key === 'Escape') {
            onCancel()
          }
        }}
        className="w-full bg-bg-secondary/80 text-text-primary rounded-2xl px-3 py-2 text-sm outline-none border-2 border-border-subtle focus:ring-2 focus:ring-primary/20 resize-none"
        rows={Math.min(editContent.split('\n').length + 1, 8)}
      />
      <div className="flex items-center gap-2 mt-1 text-xs text-text-muted">
        <span>Esc {t('common.cancel')}</span>
        <span>·</span>
        <span>Enter {t('common.save')}</span>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="!p-1 !h-auto !w-auto !font-normal !normal-case !tracking-normal"
        >
          <X size={14} />
        </Button>
        <Button
          size="sm"
          onClick={onSave}
          className="!p-1 !h-auto !w-auto !font-normal !normal-case !tracking-normal"
        >
          <Check size={14} />
        </Button>
      </div>
    </div>
  )
}

export const MessageEditBox = memo(MessageEditBoxBase)

interface MessageReactionsProps {
  currentUserId: string
  messageId: string
  onReact?: (messageId: string, emoji: string) => void
  reactions: ReactionGroup[]
}

function MessageReactionsBase({
  currentUserId,
  messageId,
  onReact,
  reactions,
}: MessageReactionsProps) {
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {reactions.map((r) => (
        <Button
          variant="ghost"
          size="sm"
          key={r.emoji}
          onClick={() => onReact?.(messageId, r.emoji)}
          className={cn(
            '!rounded-[10px] !h-[26px] !px-2 !font-normal !normal-case !tracking-normal !text-xs hover:!translate-y-0 transition-colors',
            (r.userIds ?? []).includes(currentUserId)
              ? 'bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20'
              : 'bg-white/5 dark:bg-[#1A1D24]/50 border border-black/5 dark:border-white/5 text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/10',
          )}
        >
          <span className="mr-1">{r.emoji}</span>
          <span className="font-medium opacity-80">{r.count}</span>
        </Button>
      ))}
    </div>
  )
}

export const MessageReactions = memo(MessageReactionsBase, (prev, next) => {
  if (prev.currentUserId !== next.currentUserId) return false
  if (prev.messageId !== next.messageId) return false
  if (prev.onReact !== next.onReact) return false
  return reactionsEqual(prev.reactions, next.reactions, true)
})

interface SendFailureNoticeProps {
  message: Message
  onRetry: (message: Message) => void
  t: TFunction
}

function SendFailureNoticeBase({ message, onRetry, t }: SendFailureNoticeProps) {
  return (
    <div className="flex items-center gap-1.5 mt-1 text-xs text-danger">
      <AlertCircle size={12} />
      <span>{t('chat.sendFailed')}</span>
      <button
        type="button"
        onClick={() => onRetry(message)}
        className="ml-1 px-2 py-0.5 bg-danger/10 hover:bg-danger/20 rounded text-danger text-xs font-medium transition"
      >
        {t('chat.retry')}
      </button>
    </div>
  )
}

export const SendFailureNotice = memo(SendFailureNoticeBase, (prev, next) => {
  if (prev.onRetry !== next.onRetry) return false
  if (prev.t !== next.t) return false
  return retryMessageEqual(prev.message, next.message)
})

interface AttachmentListProps {
  attachments: Attachment[]
  onImageContextMenu: (event: React.MouseEvent, attachment: Attachment) => void
  onOpenImage: (attachment: Attachment, src: string) => void
  onPreviewFile?: (attachment: Attachment) => void
  onSaveToWorkspace?: (attachment: Attachment) => void
  renderAttachment: (props: AttachmentRenderProps) => React.ReactNode
}

export interface AttachmentRenderProps {
  attachment: Attachment
  onImageContextMenu: (event: React.MouseEvent, attachment: Attachment) => void
  onOpenImage: (attachment: Attachment, src: string) => void
  onPreviewFile?: (attachment: Attachment) => void
  onSaveToWorkspace?: (attachment: Attachment) => void
}

function AttachmentListBase({
  attachments,
  onImageContextMenu,
  onOpenImage,
  onPreviewFile,
  onSaveToWorkspace,
  renderAttachment,
}: AttachmentListProps) {
  return (
    <div className="flex flex-col gap-2 mt-2">
      {attachments.map((attachment) =>
        renderAttachment({
          attachment,
          onPreviewFile,
          onSaveToWorkspace,
          onImageContextMenu,
          onOpenImage,
        }),
      )}
    </div>
  )
}

export const AttachmentList = memo(AttachmentListBase, (prev, next) => {
  if (prev.onImageContextMenu !== next.onImageContextMenu) return false
  if (prev.onOpenImage !== next.onOpenImage) return false
  if (prev.onPreviewFile !== next.onPreviewFile) return false
  if (prev.onSaveToWorkspace !== next.onSaveToWorkspace) return false
  if (prev.renderAttachment !== next.renderAttachment) return false
  return attachmentsEqual(prev.attachments, next.attachments)
})

export function reactionsEqual(
  prev?: ReactionGroup[],
  next?: ReactionGroup[],
  compareUserIds = false,
): boolean {
  if (prev?.length !== next?.length) return false
  if (!prev && !next) return true
  if (!prev || !next) return false
  for (let i = 0; i < prev.length; i++) {
    const prevReaction = prev[i]
    const nextReaction = next[i]
    if (!prevReaction || !nextReaction) return false
    if (prevReaction.emoji !== nextReaction.emoji) return false
    if (prevReaction.count !== nextReaction.count) return false
    if (compareUserIds && !stringArraysEqual(prevReaction.userIds, nextReaction.userIds)) {
      return false
    }
  }
  return true
}

export function attachmentsEqual(prev?: Attachment[], next?: Attachment[]): boolean {
  if (prev?.length !== next?.length) return false
  if (!prev && !next) return true
  if (!prev || !next) return false
  for (let i = 0; i < prev.length; i++) {
    const prevAttachment = prev[i]
    const nextAttachment = next[i]
    if (!prevAttachment || !nextAttachment) return false
    if (prevAttachment.id !== nextAttachment.id) return false
    if (prevAttachment.url !== nextAttachment.url) return false
    if (prevAttachment.filename !== nextAttachment.filename) return false
    if (prevAttachment.contentType !== nextAttachment.contentType) return false
    if (prevAttachment.size !== nextAttachment.size) return false
    if (prevAttachment.paidFileId !== nextAttachment.paidFileId) return false
  }
  return true
}

function retryMessageEqual(prev: Message, next: Message): boolean {
  return (
    prev.id === next.id &&
    prev.channelId === next.channelId &&
    prev.content === next.content &&
    prev.replyToId === next.replyToId &&
    prev.sendStatus === next.sendStatus
  )
}

function stringArraysEqual(prev?: string[], next?: string[]): boolean {
  if (prev?.length !== next?.length) return false
  if (!prev && !next) return true
  if (!prev || !next) return false
  for (let i = 0; i < prev.length; i++) {
    if (prev[i] !== next[i]) return false
  }
  return true
}

MessageAuthorLine.displayName = 'MessageAuthorLine'
MessageEditBox.displayName = 'MessageEditBox'
MessageReactions.displayName = 'MessageReactions'
ReplyReference.displayName = 'ReplyReference'
SelectionControl.displayName = 'SelectionControl'
SendFailureNotice.displayName = 'SendFailureNotice'
AttachmentList.displayName = 'AttachmentList'
