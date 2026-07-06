import { parseBuddyInboxTaskResultMetadata } from '@shadowob/shared'
import { ClickableCard, type ClickableCardPressEvent, cn } from '@shadowob/ui'
import { useQueryClient } from '@tanstack/react-query'
import { format, formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { memo, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CommunityEconomySendModal } from '../../community-economy/community-economy-send-modal'
import { DATE_FNS_LOCALE_MAP } from './constants'
import { MessageActionPortals } from './message-action-portals'
import { getMessageAuthorContext } from './message-author-context'
import { MessageAvatarButton, MessageAvatarPortals, useMessageAvatarState } from './message-avatar'
import { areMessageBubblePropsEqual } from './message-compare'
import { MessageBubbleContent } from './message-content'
import { useMessageRendering } from './message-rendering'
import { useRetryFailedMessage } from './message-retry'
import { SelectionControl } from './pure'
import { useSlashCommandSender } from './slash-command-actions'
import { isTaskCard } from './task-card'
import type { MessageBubbleProps } from './types'
import { useMessageEditing } from './use-message-editing'
import { useMessageFloatingActions } from './use-message-floating-actions'
import { useMessageMentionRenderer } from './use-message-mentions'

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
  const queryClient = useQueryClient()
  const [showTipModal, setShowTipModal] = useState(false)
  const author = message.author
  const isOwn = message.authorId === currentUserId
  const isTaskCardMessage = useMemo(
    () => (message.metadata?.cards ?? []).some((card) => isTaskCard(card)),
    [message.metadata?.cards],
  )
  const taskResult = useMemo(
    () => parseBuddyInboxTaskResultMetadata(message.metadata),
    [message.metadata],
  )
  const renderGrouped = isGrouped && !isTaskCardMessage && !taskResult
  const canSelectRangeTo = Boolean(
    selectionMode && onSelectRangeTo && selectionAnchorId !== message.id,
  )
  const canShowActions = !selectionMode || canSelectRangeTo
  const floatingActions = useMessageFloatingActions(message.id, canShowActions)
  const avatarState = useMessageAvatarState(author)
  const authorContext = getMessageAuthorContext({
    author,
    currentUserId,
    isOwn,
    queryClient,
    serverId,
  })
  const reactionUserLabels = useMemo(() => {
    const labels: Record<string, string> = {}
    for (const member of authorContext.membersList) {
      const user = member.user
      if (!user?.id) continue
      labels[user.id] = user.displayName || user.username || user.id.slice(0, 8)
    }
    if (author?.id && !labels[author.id]) {
      labels[author.id] = author.displayName || author.username || author.id.slice(0, 8)
    }
    return labels
  }, [author, authorContext.membersList])
  const canSendEconomyAction = Boolean(author && !isOwn && !author.isBot)

  const handleOpenTipModal = useCallback(() => {
    floatingActions.closeMoreMenu()
    setShowTipModal(true)
  }, [floatingActions.closeMoreMenu])

  const editing = useMessageEditing({
    deleteApi,
    editApi,
    message,
    onCloseMoreMenu: floatingActions.closeMoreMenu,
    onMessageDelete,
    onMessageUpdate,
    t,
  })
  const renderMentions = useMessageMentionRenderer({
    membersList: authorContext.membersList,
    messageMetadata: message.metadata,
    queryClient,
    serverId,
  })
  const rendering = useMessageRendering({
    enableSlashCommandActions,
    isOwn,
    isTaskCardMessage,
    isTaskResultMessage: Boolean(taskResult),
    message,
    renderMentions,
  })
  const slashCommand = useSlashCommandSender({
    channelId: message.channelId,
    queryClient,
    threadId: message.threadId,
  })
  const handleRetrySend = useRetryFailedMessage(queryClient)

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

  const handleRowPress = useCallback(
    (event: ClickableCardPressEvent) => {
      if (event.shiftKey && canSelectRangeTo) {
        onSelectRangeTo?.(message.id)
        return
      }
      onToggleSelect?.(message.id)
    },
    [canSelectRangeTo, message.id, onSelectRangeTo, onToggleSelect],
  )
  const MessageRow = selectionMode ? ClickableCard : 'div'

  return (
    <MessageRow
      ref={floatingActions.messageRef}
      id={`msg-${message.id}`}
      data-message-id={message.id}
      aria-pressed={selectionMode ? isSelected : undefined}
      className={cn(
        'group relative mx-1 flex items-start gap-3 px-3 sm:gap-4 sm:px-4',
        [
          renderGrouped ? 'py-px pl-[64px] sm:pl-[72px]' : 'py-1.5',
          'message-row hover:bg-bg-tertiary/20',
        ],
        highlight ? 'bg-primary/10 animate-pulse' : 'mt-[2px]',
        isSelected && 'bg-primary/10',
        selectionMode && 'cursor-pointer select-none',
      )}
      onMouseEnter={floatingActions.activateHover}
      onMouseLeave={floatingActions.deactivateHover}
      onPress={selectionMode ? handleRowPress : undefined}
      onTouchStart={floatingActions.handleTouchStart}
      onTouchEnd={floatingActions.clearLongPress}
      onTouchMove={floatingActions.clearLongPress}
    >
      {selectionMode && <SelectionControl isSelected={isSelected} />}
      {!renderGrouped && (
        <MessageAvatarButton
          author={author}
          avatarRef={avatarState.avatarRef}
          onClick={avatarState.handleAvatarClick}
          onContextMenu={avatarState.handleAvatarContextMenu}
          onMouseEnter={avatarState.handleAvatarMouseEnter}
          onMouseLeave={avatarState.handleAvatarMouseLeave}
          replyToMessage={replyToMessage}
        />
      )}

      <MessageBubbleContent
        author={author}
        currentUserId={currentUserId}
        editContent={editing.editContent}
        editInputRef={editing.editInputRef}
        editedTitle={editedTitle}
        hermesToolCalls={rendering.hermesToolCalls}
        isEditing={editing.isEditing}
        isOwn={isOwn}
        markdownNode={rendering.markdownNode}
        message={message}
        onCancelEdit={editing.handleCancelEdit}
        onChangeEditContent={editing.handleEditContentChange}
        onOpenThread={onOpenThread}
        onPreviewFile={onPreviewFile}
        onPreviewOAuthLink={onPreviewOAuthLink}
        onReact={onReact}
        onRetrySend={handleRetrySend}
        onSaveEdit={editing.handleSaveEdit}
        onSaveToWorkspace={onSaveToWorkspace}
        onSendSlashCommand={slashCommand.sendSlashCommand}
        renderMentions={renderMentions}
        reactionUserLabels={reactionUserLabels}
        renderGrouped={renderGrouped}
        replyToMessage={replyToMessage}
        sendingSlashCommand={slashCommand.sendingSlashCommand}
        slashCommandActions={rendering.slashCommandActions}
        submittedInteractiveResponse={submittedInteractiveResponse}
        taskResult={taskResult}
        thread={thread}
        time={time}
        walletRecharge={rendering.walletRecharge}
      />

      <>
        <MessageActionPortals
          canDelete={authorContext.canDelete}
          canSendEconomyAction={canSendEconomyAction}
          copied={editing.copied}
          getFloatingControlsStyle={floatingActions.getFloatingControlsStyle}
          hasThread={hasThread}
          isOwn={isOwn}
          messageId={message.id}
          messageThreadId={message.threadId}
          onCopy={editing.handleCopy}
          onDelete={editing.handleDelete}
          onEdit={editing.handleEdit}
          onEnterSelectionMode={onEnterSelectionMode}
          onMouseEnter={floatingActions.activateHover}
          onMouseLeave={floatingActions.deactivateHover}
          onOpenThread={onOpenThread}
          onOpenTipModal={handleOpenTipModal}
          onReact={onReact}
          onReply={onReply}
          onSelectRangeTo={onSelectRangeTo}
          onShareLink={editing.handleShareLink}
          selectionMode={selectionMode}
          setShowEmojiPicker={floatingActions.setShowEmojiPicker}
          setShowFullPicker={floatingActions.setShowFullPicker}
          setShowMoreMenu={floatingActions.setShowMoreMenu}
          showActions={floatingActions.showActions}
          showEmojiPicker={floatingActions.showEmojiPicker}
          showFullPicker={floatingActions.showFullPicker}
          showMoreMenu={floatingActions.showMoreMenu}
        />

        <MessageAvatarPortals
          author={author}
          authorMember={authorContext.authorMember}
          avatarCardPos={avatarState.avatarCardPos}
          avatarContextMenu={avatarState.avatarContextMenu}
          avatarHover={avatarState.avatarHover}
          avatarPinned={avatarState.avatarPinned}
          buddyAgent={authorContext.buddyAgent}
          canKick={authorContext.canKick}
          clearAvatarHoverTimer={avatarState.clearAvatarHoverTimer}
          closeAvatarCard={avatarState.closeAvatarCard}
          currentUserId={currentUserId}
          handleAvatarClick={avatarState.handleAvatarClick}
          handleAvatarMouseLeave={avatarState.handleAvatarMouseLeave}
          queryClient={queryClient}
          serverId={serverId}
          setAvatarContextMenu={avatarState.setAvatarContextMenu}
        />
      </>

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
    </MessageRow>
  )
}

export const MessageBubble = memo(MessageBubbleInner, areMessageBubblePropsEqual)

MessageBubble.displayName = 'MessageBubble'
