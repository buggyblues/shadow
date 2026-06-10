import { memo } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { BooleanSetter, FloatingStyleResolver } from './message-action-types'
import { FullEmojiPicker, QuickEmojiPicker } from './message-emoji-portals'
import { FloatingMessageActions } from './message-floating-actions'

interface MessageActionPortalsProps {
  canDelete: boolean
  canSendEconomyAction: boolean
  copied: boolean
  getFloatingControlsStyle: FloatingStyleResolver
  hasThread?: boolean
  messageId: string
  messageThreadId?: string | null
  onCopy: () => void
  onDelete: () => void
  onEdit: () => void
  onEnterSelectionMode?: (messageId: string) => void
  onMouseEnter: () => void
  onMouseLeave: () => void
  onOpenThread?: (messageId: string) => void
  onOpenTipModal: () => void
  onReact?: (messageId: string, emoji: string) => void
  onReply?: (messageId: string) => void
  onSelectRangeTo?: (messageId: string) => void
  onShareLink: () => void
  selectionMode?: boolean
  setShowEmojiPicker: BooleanSetter
  setShowFullPicker: BooleanSetter
  setShowMoreMenu: BooleanSetter
  showActions: boolean
  showEmojiPicker: boolean
  showFullPicker: boolean
  showMoreMenu: boolean
  isOwn: boolean
}

function MessageActionPortalsBase({
  canDelete,
  canSendEconomyAction,
  copied,
  getFloatingControlsStyle,
  hasThread,
  isOwn,
  messageId,
  messageThreadId,
  onCopy,
  onDelete,
  onEdit,
  onEnterSelectionMode,
  onMouseEnter,
  onMouseLeave,
  onOpenThread,
  onOpenTipModal,
  onReact,
  onReply,
  onSelectRangeTo,
  onShareLink,
  selectionMode,
  setShowEmojiPicker,
  setShowFullPicker,
  setShowMoreMenu,
  showActions,
  showEmojiPicker,
  showFullPicker,
  showMoreMenu,
}: MessageActionPortalsProps) {
  const { t } = useTranslation()

  return (
    <>
      {showActions &&
        createPortal(
          <FloatingMessageActions
            canDelete={canDelete}
            canSendEconomyAction={canSendEconomyAction}
            copied={copied}
            getFloatingControlsStyle={getFloatingControlsStyle}
            hasThread={hasThread}
            isOwn={isOwn}
            messageId={messageId}
            messageThreadId={messageThreadId}
            onCopy={onCopy}
            onDelete={onDelete}
            onEdit={onEdit}
            onEnterSelectionMode={onEnterSelectionMode}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            onOpenThread={onOpenThread}
            onOpenTipModal={onOpenTipModal}
            onReply={onReply}
            onSelectRangeTo={onSelectRangeTo}
            onShareLink={onShareLink}
            selectionMode={selectionMode}
            setShowEmojiPicker={setShowEmojiPicker}
            setShowMoreMenu={setShowMoreMenu}
            showEmojiPicker={showEmojiPicker}
            showMoreMenu={showMoreMenu}
            t={t}
          />,
          document.body,
        )}

      {showEmojiPicker &&
        createPortal(
          <QuickEmojiPicker
            getFloatingControlsStyle={getFloatingControlsStyle}
            messageId={messageId}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            onReact={onReact}
            setShowEmojiPicker={setShowEmojiPicker}
            setShowFullPicker={setShowFullPicker}
            t={t}
          />,
          document.body,
        )}

      {showFullPicker &&
        createPortal(
          <FullEmojiPicker
            getFloatingControlsStyle={getFloatingControlsStyle}
            messageId={messageId}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            onReact={onReact}
            setShowFullPicker={setShowFullPicker}
          />,
          document.body,
        )}
    </>
  )
}

export const MessageActionPortals = memo(MessageActionPortalsBase)

MessageActionPortals.displayName = 'MessageActionPortals'
