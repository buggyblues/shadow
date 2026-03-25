import type { ChannelSortBy } from '@shadowob/shared'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  Check,
  Clock,
  MessageSquare,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useChannelSort } from '../../hooks/use-channel-sort'

interface SortOption {
  value: ChannelSortBy
  label: string
  icon: typeof Calendar
}

interface ChannelSortButtonProps {
  serverId: string
}

export function ChannelSortButton({ serverId }: ChannelSortButtonProps) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const { sortBy, sortDirection, setSortBy, toggleSortDirection } = useChannelSort(serverId)

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

  const currentOption = sortOptions.find((opt) => opt.value === sortBy) || sortOptions[0]!
  const DirectionIcon = sortDirection === 'asc' ? ArrowUp : ArrowDown

  const handleSelectSort = (value: ChannelSortBy) => {
    if (value === sortBy) {
      toggleSortDirection()
    } else {
      setSortBy(value)
    }
    setIsOpen(false)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium text-text-muted hover:text-text-secondary hover:bg-bg-modifier-hover transition"
      >
        <currentOption.icon size={14} />
        <span className="hidden sm:inline">{currentOption.label}</span>
        <DirectionIcon size={12} />
      </button>

      {isOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
            aria-label="Close"
          />
          <div className="absolute right-0 top-full mt-1 z-50 w-56 bg-bg-tertiary rounded-lg shadow-lg border border-border-subtle py-1">
            <div className="px-3 py-2 text-xs font-bold uppercase text-text-muted border-b border-border-subtle">
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
                      ? 'bg-primary/10 text-primary'
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
        </>
      )}
    </div>
  )
}
