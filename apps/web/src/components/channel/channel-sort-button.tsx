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
import { createPortal } from 'react-dom'
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
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 })
  const { sortBy, sortDirection, setSortBy, toggleSortDirection, hasCustomSort } =
    useChannelSort(serverId)

  const isActive = hasCustomSort || hasActiveFilter

  const sortOptions: SortOption[] = [
    {
      value: 'position',
      label: t('sort.byPosition', { defaultValue: '默认' }),
      icon: ArrowUpDown,
    },
    {
      value: 'lastMessageAt',
      label: t('sort.byLastMessage', { defaultValue: '消息' }),
      icon: MessageSquare,
    },
    {
      value: 'lastAccessedAt',
      label: t('sort.byLastAccessed', { defaultValue: '访问' }),
      icon: Clock,
    },
    {
      value: 'createdAt',
      label: t('sort.byCreatedAt', { defaultValue: '创建' }),
      icon: Calendar,
    },
    { value: 'updatedAt', label: t('sort.byUpdatedAt', { defaultValue: '更新' }), icon: Clock },
  ]

  const DirectionIcon = sortDirection === 'asc' ? ArrowUp : ArrowDown

  // Calculate dropdown position when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setDropdownPos({
        top: rect.bottom + 4,
        left: rect.left - 180, // Position to the left of the button
      })
    }
  }, [isOpen])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('[data-sort-dropdown]')) {
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

  const dropdown = isOpen ? (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[100]" onClick={() => setIsOpen(false)} />
      {/* Dropdown menu */}
      <div
        className="fixed z-[101] w-52 bg-bg-tertiary rounded-lg shadow-lg border border-border-subtle py-1.5"
        style={{
          top: dropdownPos.top,
          left: dropdownPos.left,
        }}
        data-sort-dropdown
      >
        {/* Filter Input */}
        <div className="px-2 pb-1.5 border-b border-border-subtle">
          <div className="flex items-center gap-1.5 px-2 py-1 bg-bg-primary/50 rounded">
            <Search size={12} className="text-text-muted shrink-0" />
            <input
              type="text"
              value={filterKeyword}
              onChange={(e) => onFilterChange(e.target.value)}
              placeholder={t('sort.filterPlaceholder', { defaultValue: '搜索...' })}
              className="flex-1 bg-transparent text-xs text-text-primary outline-none placeholder:text-text-muted"
            />
            {filterKeyword && (
              <button
                type="button"
                onClick={() => onFilterChange('')}
                className="text-text-muted hover:text-text-primary transition shrink-0"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Sort Options */}
        <div className="py-0.5">
          {sortOptions.map((option) => {
            const Icon = option.icon
            const isSelected = sortBy === option.value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelectSort(option.value)}
                className={`flex items-center gap-2 w-full px-2 py-1 text-xs transition ${
                  isSelected
                    ? 'text-primary bg-primary/10'
                    : 'text-text-secondary hover:bg-bg-modifier-hover hover:text-text-primary'
                }`}
              >
                <Icon size={14} className={isSelected ? 'text-primary' : 'text-text-muted'} />
                <span className="flex-1 text-left">{option.label}</span>
                {isSelected && (
                  <>
                    <DirectionIcon size={10} className="text-primary" />
                    <Check size={12} className="text-primary" />
                  </>
                )}
              </button>
            )
          })}
        </div>

        {/* Clear Button */}
        {isActive && (
          <div className="px-2 pt-1 border-t border-border-subtle">
            <button
              type="button"
              onClick={handleClear}
              className="flex items-center justify-center gap-1 w-full px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-modifier-hover rounded transition"
            >
              <X size={12} />
              {t('sort.clear', { defaultValue: '清除' })}
            </button>
          </div>
        )}
      </div>
    </>
  ) : null

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`p-1 rounded transition shrink-0 ${
          isActive
            ? 'text-primary bg-primary/10'
            : 'text-text-muted hover:text-text-secondary hover:bg-bg-modifier-hover'
        }`}
        title={t('sort.title', { defaultValue: '排序' })}
      >
        <ListFilter size={14} />
      </button>

      {dropdown && createPortal(dropdown, document.body)}
    </div>
  )
}
