import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@shadowob/ui'
import { Archive, ListFilter, MessageSquare } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useChannelSort } from '../../hooks/use-channel-sort'

interface ChannelSortFilterButtonProps {
  serverId: string
  showArchived?: boolean
  onShowArchivedChange?: (show: boolean) => void
}

export function ChannelSortFilterButton({
  serverId,
  showArchived = false,
  onShowArchivedChange,
}: ChannelSortFilterButtonProps) {
  const { t } = useTranslation()
  const { isLatestMessageSort, setSortBy, hasCustomSort } = useChannelSort(serverId)

  const isActive = hasCustomSort || showArchived

  return (
    <DropdownMenu
      trigger={
        <button
          type="button"
          className={`p-1 rounded transition shrink-0 ${
            isActive
              ? 'text-primary bg-primary/10'
              : 'text-text-muted hover:text-text-secondary hover:bg-bg-modifier-hover'
          }`}
          title={t('sort.title', { defaultValue: '排序' })}
        >
          <ListFilter size={14} />
        </button>
      }
    >
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          {isLatestMessageSort
            ? t('sort.byLastMessage', { defaultValue: '最新消息' })
            : t('sort.byPosition', { defaultValue: '默认顺序' })}
        </DropdownMenuLabel>

        <DropdownMenuCheckboxItem
          checked={isLatestMessageSort}
          onCheckedChange={(checked) => setSortBy(checked === true ? 'lastMessageAt' : 'position')}
        >
          <div className="flex items-center gap-2">
            <MessageSquare size={14} className="text-text-muted shrink-0" />
            <span>{t('sort.byLastMessage', { defaultValue: '最新消息' })}</span>
          </div>
        </DropdownMenuCheckboxItem>

        {onShowArchivedChange && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={showArchived}
              onCheckedChange={(checked) => onShowArchivedChange(checked === true)}
            >
              <div className="flex items-center gap-2">
                <Archive size={14} className="text-text-muted shrink-0" />
                <span>{t('channel.showArchived', { defaultValue: '显示已归档' })}</span>
              </div>
            </DropdownMenuCheckboxItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
