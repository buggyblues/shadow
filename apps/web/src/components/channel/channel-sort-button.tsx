import {
  cn,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@shadowob/ui'
import {
  Archive,
  ArrowUpDown,
  Check,
  ListFilter,
  MessageSquare,
  RotateCcw,
  Search,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useChannelSort } from '../../hooks/use-channel-sort'

interface ChannelSortFilterButtonProps {
  serverId: string
  searchQuery?: string
  onSearchQueryChange?: (value: string) => void
  showArchived?: boolean
  onShowArchivedChange?: (show: boolean) => void
}

export function ChannelSortFilterButton({
  serverId,
  searchQuery = '',
  onSearchQueryChange,
  showArchived = false,
  onShowArchivedChange,
}: ChannelSortFilterButtonProps) {
  const { t } = useTranslation()
  const { sortBy, setSortBy, hasCustomSort } = useChannelSort(serverId)
  const normalizedSortBy = sortBy === 'position' ? 'position' : 'lastMessageAt'
  const hasSearch = searchQuery.trim().length > 0
  const canReset = normalizedSortBy !== 'position' || hasSearch || showArchived

  const isActive = hasCustomSort || hasSearch || showArchived

  const sortOptions = [
    {
      value: 'position' as const,
      icon: ArrowUpDown,
      label: t('sort.byPosition'),
    },
    {
      value: 'lastMessageAt' as const,
      icon: MessageSquare,
      label: t('sort.byLastMessage'),
    },
  ]

  const handleReset = () => {
    onSearchQueryChange?.('')
    onShowArchivedChange?.(false)
    setSortBy('position')
  }

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
          title={t('sort.title')}
        >
          <ListFilter size={14} />
        </button>
      }
    >
      <DropdownMenuContent align="end" className="w-64 p-2">
        {onSearchQueryChange && (
          <div className="p-1" onClick={(event) => event.stopPropagation()}>
            <div className="relative">
              <Search
                size={13}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted/70"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => onSearchQueryChange(event.target.value)}
                onKeyDown={(event) => event.stopPropagation()}
                placeholder={t('sort.filterPlaceholder')}
                className="h-9 w-full rounded-xl border border-border-subtle bg-bg-secondary/40 pl-9 pr-3 text-sm font-medium text-text-primary outline-none transition-colors placeholder:text-text-muted/45 focus:border-primary/35 focus:bg-bg-secondary/60"
              />
            </div>
          </div>
        )}

        {onSearchQueryChange && <DropdownMenuSeparator />}

        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2 normal-case tracking-normal">
            <Archive size={16} />
            <span>{t('sort.viewOptions')}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56 p-2">
            {onShowArchivedChange && (
              <DropdownMenuCheckboxItem
                checked={showArchived}
                onCheckedChange={(checked) => onShowArchivedChange(Boolean(checked))}
                className="gap-2 normal-case tracking-normal"
              >
                <Archive size={15} />
                <span>{t('channel.showArchived')}</span>
              </DropdownMenuCheckboxItem>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2 normal-case tracking-normal">
            <ArrowUpDown size={16} />
            <span>{t('sort.order')}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56 p-2">
            {sortOptions.map((option) => {
              const Icon = option.icon
              const selected = normalizedSortBy === option.value

              return (
                <DropdownMenuItem
                  key={option.value}
                  onSelect={() => setSortBy(option.value)}
                  className={cn(
                    'gap-2 normal-case tracking-normal',
                    selected && 'text-primary focus:text-bg-deep',
                  )}
                >
                  <Icon size={15} />
                  <span>{option.label}</span>
                  {selected && <Check size={15} className="ml-auto" />}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {canReset && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={handleReset}
              className="gap-2 normal-case tracking-normal text-text-muted"
            >
              <RotateCcw size={15} />
              <span>{t('sort.clear')}</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
