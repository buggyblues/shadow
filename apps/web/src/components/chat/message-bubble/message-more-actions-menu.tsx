import { Button, TooltipIconButton } from '@shadowob/ui'
import type { TFunction } from 'i18next'
import {
  CheckSquare,
  Copy,
  ExternalLink,
  HandCoins,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react'
import type { BooleanSetter } from './message-action-types'

interface MoreActionsMenuProps {
  canDelete: boolean
  canSendEconomyAction: boolean
  copied: boolean
  isOwn: boolean
  messageId: string
  onCopy: () => void
  onDelete: () => void
  onEdit: () => void
  onEnterSelectionMode?: (messageId: string) => void
  onOpenTipModal: () => void
  onShareLink: () => void
  setShowMoreMenu: BooleanSetter
  showMoreMenu: boolean
  t: TFunction
}

export function MoreActionsMenu({
  canDelete,
  canSendEconomyAction,
  copied,
  isOwn,
  messageId,
  onCopy,
  onDelete,
  onEdit,
  onEnterSelectionMode,
  onOpenTipModal,
  onShareLink,
  setShowMoreMenu,
  showMoreMenu,
  t,
}: MoreActionsMenuProps) {
  return (
    <div className="relative">
      <TooltipIconButton
        label={t('chat.more')}
        size="xs"
        onClick={() => setShowMoreMenu(!showMoreMenu)}
        className={`!w-8 !h-8 !p-0 !rounded-[10px] !font-normal !normal-case !tracking-normal transition-colors ${showMoreMenu ? 'bg-black/5 dark:bg-white/10 text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/10'}`}
      >
        <MoreHorizontal size={18} strokeWidth={2} />
      </TooltipIconButton>
      {showMoreMenu && (
        <div className="absolute top-[calc(100%+4px)] right-0 origin-top-right bg-white/95 dark:bg-[#1A1D24]/95 backdrop-blur-2xl rounded-[16px] border border-black/5 dark:border-white/10 shadow-[0_12px_48px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_48px_rgba(0,0,0,0.5)] py-2 min-w-[180px] z-50 flex flex-col gap-0.5 px-1.5 animate-in fade-in zoom-in-95 duration-100">
          {isOwn && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onEdit}
              className="!w-full !justify-start !rounded-[10px] !font-medium !normal-case !tracking-normal !px-3 !py-2.5 !text-[14px] !h-auto text-text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              <Pencil size={16} strokeWidth={2} className="mr-1.5 opacity-70" />
              {t('chat.editMessage')}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onCopy}
            className="!w-full !justify-start !rounded-[10px] !font-medium !normal-case !tracking-normal !px-3 !py-2.5 !text-[14px] !h-auto text-text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <Copy size={16} strokeWidth={2} className="mr-1.5 opacity-70" />
            {copied ? t('common.copied') : t('chat.copyMessage')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onShareLink}
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
                onClick={onOpenTipModal}
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
                onEnterSelectionMode(messageId)
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
                onClick={onDelete}
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
  )
}
