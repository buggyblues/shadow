import type { SlashCommandAction } from '@shadowob/shared'
import { ChevronRight, MessageSquare } from 'lucide-react'
import type { MouseEvent, ReactNode, RefObject } from 'react'
import { memo, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { ImageContextMenu } from '../image-context-menu'
import { ImageViewer } from '../image-viewer'
import type { OAuthLinkPreview } from '../oauth-link-card'
import { OAuthLinkCardView } from '../oauth-link-card'
import { AttachmentView } from './attachments'
import { CommerceProductCardView, PaidFileCardView } from './commerce-cards'
import type { HermesToolCallDisplay } from './hermes-tool-calls'
import { InteractiveBlockRenderer } from './interactive-block'
import { MessageReferenceCardsView } from './message-reference-card'
import { HermesToolCallList, WalletRechargeCard } from './message-rendering'
import {
  AttachmentList,
  type AttachmentRenderProps,
  MessageAuthorLine,
  MessageEditBox,
  MessageReactions,
  ReplyReference,
  SendFailureNotice,
} from './pure'
import { ServerAppCardsView } from './server-app-card'
import { SlashCommandActions } from './slash-command-actions'
import { isTaskCard, TaskCardsView } from './task-card'
import type {
  Attachment,
  Author,
  InteractiveResponseMetadata,
  Message,
  ThreadPreview,
} from './types'
import type { WalletRechargeMetadata } from './wallet-recharge-card'

interface MessageBubbleContentProps {
  author?: Author
  currentUserId: string
  editContent: string
  editInputRef: RefObject<HTMLTextAreaElement | null>
  editedTitle: string
  hermesToolCalls: HermesToolCallDisplay[]
  isEditing: boolean
  isOwn: boolean
  markdownNode: ReactNode
  message: Message
  onCancelEdit: () => void
  onChangeEditContent: (value: string) => void
  onOpenThread?: (messageId: string) => void
  onPreviewFile?: (attachment: Attachment) => void
  onPreviewOAuthLink?: (preview: OAuthLinkPreview) => void
  onReact?: (messageId: string, emoji: string) => void
  onRetrySend: (message: Message) => void
  onSaveEdit: () => void
  onSaveToWorkspace?: (attachment: Attachment) => void
  onSendSlashCommand: (command: string) => void
  renderGrouped: boolean
  replyToMessage?: Message | null
  sendingSlashCommand: string | null
  slashCommandActions: SlashCommandAction[]
  submittedInteractiveResponse?: InteractiveResponseMetadata | null
  thread?: ThreadPreview | null
  time: string
  walletRecharge: WalletRechargeMetadata | null
}

function MessageBubbleContentBase({
  author,
  currentUserId,
  editContent,
  editInputRef,
  editedTitle,
  hermesToolCalls,
  isEditing,
  isOwn,
  markdownNode,
  message,
  onCancelEdit,
  onChangeEditContent,
  onOpenThread,
  onPreviewFile,
  onPreviewOAuthLink,
  onReact,
  onRetrySend,
  onSaveEdit,
  onSaveToWorkspace,
  onSendSlashCommand,
  renderGrouped,
  replyToMessage,
  sendingSlashCommand,
  slashCommandActions,
  submittedInteractiveResponse,
  thread,
  time,
  walletRecharge,
}: MessageBubbleContentProps) {
  const { t } = useTranslation()
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
  const hasTaskCards = (message.metadata?.cards ?? []).some((card) => isTaskCard(card))

  const handleImageContextMenu = useCallback((event: MouseEvent, attachment: Attachment) => {
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

  return (
    <div className="flex-1 min-w-0">
      {replyToMessage && <ReplyReference replyToMessage={replyToMessage} t={t} />}
      {!renderGrouped && (
        <MessageAuthorLine
          author={author}
          editedTitle={editedTitle}
          isEdited={message.isEdited}
          t={t}
          time={time}
        />
      )}

      {isEditing ? (
        <MessageEditBox
          editContent={editContent}
          inputRef={editInputRef}
          onCancel={onCancelEdit}
          onChange={onChangeEditContent}
          onSave={onSaveEdit}
          t={t}
        />
      ) : (
        markdownNode
      )}
      {!isEditing && (
        <SlashCommandActions
          actions={slashCommandActions}
          sendingCommand={sendingSlashCommand}
          onSend={onSendSlashCommand}
        />
      )}
      {!isEditing && <HermesToolCallList toolCalls={hermesToolCalls} />}

      {walletRecharge && <WalletRechargeCard data={walletRecharge} />}

      <TaskCardsView
        cards={message.metadata?.cards}
        messageId={message.id}
        onOpenThread={onOpenThread}
        thread={thread}
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

      {message.metadata?.interactive && (
        <InteractiveBlockRenderer
          block={message.metadata.interactive}
          messageId={message.id}
          disabled={message.sendStatus === 'sending'}
          submittedResponse={submittedInteractiveResponse}
        />
      )}

      {thread && !message.threadId && onOpenThread && !hasTaskCards && (
        <ThreadPreviewButton messageId={message.id} onOpenThread={onOpenThread} thread={thread} />
      )}

      {message.reactions && message.reactions.length > 0 && (
        <MessageReactions
          currentUserId={currentUserId}
          messageId={message.id}
          onReact={onReact}
          reactions={message.reactions}
        />
      )}

      {message.sendStatus === 'failed' && (
        <SendFailureNotice message={message} onRetry={onRetrySend} t={t} />
      )}
    </div>
  )
}

function ThreadPreviewButton({
  messageId,
  onOpenThread,
  thread,
}: {
  messageId: string
  onOpenThread: (messageId: string) => void
  thread: ThreadPreview
}) {
  const { t } = useTranslation()

  return (
    <div className="relative mt-2 max-w-[34rem]">
      <div
        aria-hidden="true"
        className="absolute -left-8 -top-2 h-[calc(50%+8px)] w-8 rounded-bl-xl border-b-2 border-l-2 border-border-subtle/70 sm:-left-9 sm:w-9"
      />
      <button
        type="button"
        onClick={() => onOpenThread(messageId)}
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
  )
}

export const MessageBubbleContent = memo(MessageBubbleContentBase)

MessageBubbleContent.displayName = 'MessageBubbleContent'
