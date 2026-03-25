import type { ChannelSortBy } from '@shadowob/shared'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  Check,
  Clock,
  ListFilter,
  MessageSquare,
  Search,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useChannelSort } from '../../hooks/use-channel-sort'

interface SortOption {
  value: ChannelSortBy
  label: string
  icon: typeof Calendar
}

interface ChannelSortFilterButtonProps {
  serverId: string
  filterKeyword: string
  onFilterChange: (keyword: string) => void
  hasActiveFilter: boolean
}

export function ChannelSortFilterButton({
  serverId,
  filterKeyword,
  onFilterChange,
  hasActiveFilter,
}: ChannelSortFilterButtonProps) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { sortBy, sortDirection, setSortBy, toggleSortDirection, hasCustomSort } =
    useChannelSort(serverId)

  const isActive = hasCustomSort || hasActiveFilter

  const sortOptions: SortOption[] = [
    {
      value: 'position',
      label: t('sort.byPosition', { defaultValue: '默认顺序' }),
      icon: ArrowUpDown,
    },
    {
      value: 'lastMessageAt',
      label: t('sort.byLastMessage', { defaultValue: '最新消息' }),
      icon: MessageSquare,
    },
    {
      value: 'lastAccessedAt',
      label: t('sort.byLastAccessed', { defaultValue: '访问时间' }),
      icon: Clock,
    },
    {
      value: 'createdAt',
      label: t('sort.byCreatedAt', { defaultValue: '创建时间' }),
      icon: Calendar,
    },
    { value: 'updatedAt', label: t('sort.byUpdatedAt', { defaultValue: '更新时间' }), icon: Clock },
  ]

  const DirectionIcon = sortDirection === 'asc' ? ArrowUp : ArrowDown

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleSelectSort = (value: ChannelSortBy) => {
    if (value === sortBy) {
      toggleSortDirection()
    } else {
      setSortBy(value)
    }
  }

  const handleClear = () => {
    onFilterChange('')
    setSortBy('position')
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`p-1.5 rounded-md transition shrink-0 ${
          isActive
            ? 'text-primary bg-primary/10'
            : 'text-text-secondary hover:text-text-primary hover:bg-bg-modifier-hover'
        }`}
        title={t('sort.title', { defaultValue: '排序和筛选' })}
      >
        <ListFilter size={16} />
      </button>

      {isOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
            aria-label="Close"
          />
          <div className="absolute left-0 top-full mt-1 z-[100] w-64 bg-bg-tertiary rounded-lg shadow-lg border border-border-subtle py-2">
            {/* Filter Input */}
            <div className="px-3 pb-2 border-b border-border-subtle">
              <div className="flex items-center gap-2 px-2 py-1.5 bg-bg-primary/50 rounded-md">
                <Search size={14} className="text-text-muted shrink-0" />
                <input
                  type="text"
                  value={filterKeyword}
                  onChange={(e) => onFilterChange(e.target.value)}
                  placeholder={t('sort.filterPlaceholder', { defaultValue: '搜索频道...' })}
                  className="flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
                />
                {filterKeyword && (
                  <button
                    type="button"
                    onClick={() => onFilterChange('')}
                    className="text-text-muted hover:text-text-primary transition shrink-0"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Sort Options */}
            <div className="py-1">
              <div className="px-3 py-1.5 text-xs font-bold uppercase text-text-muted">
                {t('sort.title', { defaultValue: '排序方式' })}
              </div>
              {sortOptions.map((option) => {
                const Icon = option.icon
                const isSelected = sortBy === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleSelectSort(option.value)}
                    className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition ${
                      isSelected
                        ? 'text-primary bg-primary/10'
                        : 'text-text-secondary hover:bg-bg-modifier-hover hover:text-text-primary'
                    }`}
                  >
                    <Icon size={16} className={isSelected ? 'text-primary' : 'text-text-muted'} />
                    <span className="flex-1 text-left">{option.label}</span>
                    {isSelected && (
                      <>
                        <DirectionIcon size={12} className="text-primary" />
                        <Check size={14} className="text-primary" />
                      </>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Clear Button */}
            {isActive && (
              <div className="px-3 pt-2 border-t border-border-subtle">
                <button
                  type="button"
                  onClick={handleClear}
                  className="flex items-center justify-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-modifier-hover rounded-md transition"
                >
                  <X size={14} />
                  {t('sort.clear', { defaultValue: '清除筛选' })}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
