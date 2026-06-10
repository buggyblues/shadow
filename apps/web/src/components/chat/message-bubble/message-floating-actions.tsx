import { Button } from '@shadowob/ui'
import type { TFunction } from 'i18next'
import { CornerDownRight, HandCoins, MessageSquare, Reply, Smile } from 'lucide-react'
import type { BooleanSetter, FloatingStyleResolver } from './message-action-types'
import { MoreActionsMenu } from './message-more-actions-menu'

interface FloatingMessageActionsProps {
  canDelete: boolean
  canSendEconomyAction: boolean
  copied: boolean
  getFloatingControlsStyle: FloatingStyleResolver
  hasThread?: boolean
  isOwn: boolean
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
  onReply?: (messageId: string) => void
  onSelectRangeTo?: (messageId: string) => void
  onShareLink: () => void
  selectionMode?: boolean
  setShowEmojiPicker: BooleanSetter
  setShowMoreMenu: BooleanSetter
  showEmojiPicker: boolean
  showMoreMenu: boolean
  t: TFunction
}

export function FloatingMessageActions({
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
  onReply,
  onSelectRangeTo,
  onShareLink,
  selectionMode,
  setShowEmojiPicker,
  setShowMoreMenu,
  showEmojiPicker,
  showMoreMenu,
  t,
}: FloatingMessageActionsProps) {
  const floatingStyle = getFloatingControlsStyle(
    16,
    selectionMode ? 132 : canSendEconomyAction ? 218 : 150,
  )
  if (!floatingStyle) return null

  return (
    <div
      className="fixed flex items-center bg-white/90 dark:bg-[#1A1D24]/90 backdrop-blur-xl rounded-[14px] border border-black/5 dark:border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.4)] p-0.5 z-[65] transition-all"
      style={floatingStyle}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {selectionMode ? (
        <Button
          variant="ghost"
          size="sm"
          data-selection-drag-ignore="true"
          onClick={(event) => {
            event.stopPropagation()
            onSelectRangeTo?.(messageId)
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
            onClick={() => onReply?.(messageId)}
            className="!w-8 !h-8 !p-0 !rounded-[10px] !font-normal !normal-case !tracking-normal text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            title={t('chat.reply')}
          >
            <Reply size={18} strokeWidth={2} />
          </Button>
          {onOpenThread && !messageThreadId && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onOpenThread(messageId)}
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
                onClick={onOpenTipModal}
                className="!w-8 !h-8 !p-0 !rounded-[10px] !font-normal !normal-case !tracking-normal text-text-secondary hover:text-primary hover:bg-primary/10 transition-colors"
                title={t('communityEconomy.supportMessage')}
              >
                <HandCoins size={18} strokeWidth={2} />
              </Button>
            </>
          )}
          <MoreActionsMenu
            canDelete={canDelete}
            canSendEconomyAction={canSendEconomyAction}
            copied={copied}
            isOwn={isOwn}
            messageId={messageId}
            onCopy={onCopy}
            onDelete={onDelete}
            onEdit={onEdit}
            onEnterSelectionMode={onEnterSelectionMode}
            onOpenTipModal={onOpenTipModal}
            onShareLink={onShareLink}
            setShowMoreMenu={setShowMoreMenu}
            showMoreMenu={showMoreMenu}
            t={t}
          />
        </>
      )}
    </div>
  )
}
