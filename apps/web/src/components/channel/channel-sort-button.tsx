import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@shadowob/ui'
import { Archive, ArrowUpDown, ListFilter, MessageSquare, RotateCcw, Search } from 'lucide-react'
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
      label: t('sort.byPosition', { defaultValue: '默认' }),
      description: t('sort.byPositionDesc', { defaultValue: '按频道原始顺序显示' }),
    },
    {
      value: 'lastMessageAt' as const,
      icon: MessageSquare,
      label: t('sort.byLastMessage', { defaultValue: '新消息' }),
      description: t('sort.byLastMessageDesc', { defaultValue: '最近有消息的频道优先' }),
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
          title={t('sort.title', { defaultValue: '排序' })}
        >
          <ListFilter size={14} />
        </button>
      }
    >
      <DropdownMenuContent align="end" className="w-72 p-3">
        <div className="space-y-3" onClick={(event) => event.stopPropagation()}>
          {onSearchQueryChange && (
            <div className="space-y-2">
              <DropdownMenuLabel className="px-0 py-0">
                {t('channel.search', { defaultValue: '搜索频道' })}
              </DropdownMenuLabel>
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
                  placeholder={t('channel.search', { defaultValue: '搜索频道' })}
                  className="h-10 w-full rounded-2xl border border-border-subtle bg-bg-secondary/40 pl-9 pr-3 text-sm font-medium text-text-primary outline-none transition-colors placeholder:text-text-muted/45 focus:border-primary/35 focus:bg-bg-secondary/60"
                />
              </div>
            </div>
          )}

          <DropdownMenuSeparator className="mx-0" />

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <DropdownMenuLabel className="px-0 py-0">
                {t('sort.order', { defaultValue: '排列顺序' })}
              </DropdownMenuLabel>
              {canReset && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black text-text-muted transition-colors hover:bg-bg-modifier-hover hover:text-text-primary"
                >
                  <RotateCcw size={11} />
                  <span>{t('common.reset', { defaultValue: '重置' })}</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {sortOptions.map((option) => {
                const Icon = option.icon
                const selected = normalizedSortBy === option.value

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSortBy(option.value)}
                    className={cn(
                      'flex min-h-[84px] flex-col items-start gap-2 rounded-[20px] border px-3 py-3 text-left transition-all duration-200',
                      selected
                        ? 'border-primary/35 bg-primary/12 text-text-primary shadow-[0_14px_30px_rgba(0,198,209,0.12)]'
                        : 'border-border-subtle bg-bg-secondary/20 text-text-secondary hover:border-border-subtle/80 hover:bg-bg-modifier-hover hover:text-text-primary',
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-2xl border transition-colors',
                        selected
                          ? 'border-primary/20 bg-primary/15 text-primary'
                          : 'border-border-subtle bg-bg-secondary/30 text-text-muted',
                      )}
                    >
                      <Icon size={15} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-black tracking-tight">{option.label}</p>
                      <p className="text-[11px] font-medium leading-relaxed text-text-muted/80">
                        {option.description}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {onShowArchivedChange && (
            <>
              <DropdownMenuSeparator className="mx-0" />
              <button
                type="button"
                onClick={() => onShowArchivedChange(!showArchived)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-[20px] border px-3 py-3 text-left transition-all duration-200',
                  showArchived
                    ? 'border-primary/35 bg-primary/12 text-text-primary shadow-[0_14px_30px_rgba(0,198,209,0.12)]'
                    : 'border-border-subtle bg-bg-secondary/20 text-text-secondary hover:border-border-subtle/80 hover:bg-bg-modifier-hover hover:text-text-primary',
                )}
              >
                <div
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border transition-colors',
                    showArchived
                      ? 'border-primary/20 bg-primary/15 text-primary'
                      : 'border-border-subtle bg-bg-secondary/30 text-text-muted',
                  )}
                >
                  <Archive size={15} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black tracking-tight">
                    {t('channel.showArchived', { defaultValue: '显示已归档' })}
                  </p>
                  <p className="text-[11px] font-medium leading-relaxed text-text-muted/80">
                    {t('channel.showArchivedDesc', {
                      defaultValue: '把归档频道也一起显示在列表里',
                    })}
                  </p>
                </div>
                <span
                  className={cn(
                    'h-2.5 w-2.5 shrink-0 rounded-full transition-all',
                    showArchived
                      ? 'bg-primary shadow-[0_0_18px_rgba(0,198,209,0.45)]'
                      : 'bg-text-muted/25',
                  )}
                />
              </button>
            </>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
