import { Check, ChevronDown, Clock, Filter, MessageSquare, Search, X, Zap } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export interface ChannelFilterState {
  search: string
  sortBy: 'default' | 'lastMessage' | 'activity' | 'created' | 'updated'
  sortOrder: 'asc' | 'desc'
  showArchived: boolean
}

interface ChannelFilterProps {
  filters: ChannelFilterState
  onChange: (filters: ChannelFilterState) => void
  onClear: () => void
}

const sortOptions = [
  { key: 'default', label: 'discover.filter.sort.default', icon: Zap },
  { key: 'lastMessage', label: 'discover.filter.sort.lastMessage', icon: MessageSquare },
  { key: 'activity', label: 'discover.filter.sort.activity', icon: Clock },
  { key: 'created', label: 'discover.filter.sort.created', icon: Clock },
  { key: 'updated', label: 'discover.filter.sort.updated', icon: Clock },
] as const

export function ChannelFilter({ filters, onChange, onClear }: ChannelFilterProps) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [tempFilters, setTempFilters] = useState(filters)

  const hasActiveFilters =
    filters.search ||
    filters.sortBy !== 'default' ||
    filters.sortOrder !== 'desc' ||
    filters.showArchived

  const handleApply = () => {
    onChange(tempFilters)
    setIsOpen(false)
  }

  const handleClear = () => {
    const cleared = {
      search: '',
      sortBy: 'default' as const,
      sortOrder: 'desc' as const,
      showArchived: false,
    }
    setTempFilters(cleared)
    onClear()
    setIsOpen(false)
  }

  const toggleSortOrder = () => {
    setTempFilters((prev) => ({
      ...prev,
      sortOrder: prev.sortOrder === 'asc' ? 'desc' : 'asc',
    }))
  }

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={[
          'flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium transition',
          'border',
          hasActiveFilters || isOpen
            ? 'bg-primary/10 border-primary text-primary'
            : 'bg-bg-tertiary border-transparent text-text-secondary hover:bg-bg-secondary',
        ].join(' ')}
      >
        <Filter size={14} />
        <span>{t('discover.filter.title')}</span>
        <ChevronDown
          size={14}
          className={['transition-transform', isOpen ? 'rotate-180' : ''].join(' ')}
        />
        {hasActiveFilters && (
          <span className="ml-1 w-4 h-4 rounded-full bg-primary text-white text-[10px] flex items-center justify-center">
            !
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

          {/* Panel */}
          <div className="absolute top-full right-0 mt-2 w-80 bg-bg-secondary rounded-xl border border-bg-tertiary shadow-xl z-50 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-bg-tertiary">
              <h3 className="font-semibold text-text-primary text-[14px]">
                {t('discover.filter.title')}
              </h3>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition"
              >
                <X size={16} />
              </button>
            </div>

            {/* Search */}
            <div className="p-4 border-b border-bg-tertiary">
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                />
                <input
                  type="text"
                  value={tempFilters.search}
                  onChange={(e) => setTempFilters((prev) => ({ ...prev, search: e.target.value }))}
                  placeholder={t('discover.filter.searchPlaceholder')}
                  className="w-full bg-bg-tertiary text-text-primary rounded-lg pl-9 pr-8 py-2 text-[13px] outline-none focus:ring-1 focus:ring-primary/50"
                />
                {tempFilters.search && (
                  <button
                    type="button"
                    onClick={() => setTempFilters((prev) => ({ ...prev, search: '' }))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-text-muted hover:text-text-primary hover:bg-bg-secondary transition"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* Sort Options */}
            <div className="p-4 border-b border-bg-tertiary">
              <div className="flex items-center justify-between mb-3">
                <span className="text-text-secondary text-[12px] font-medium uppercase tracking-wider">
                  {t('discover.filter.sortBy')}
                </span>
                {/* Sort Order Toggle */}
                <button
                  type="button"
                  onClick={toggleSortOrder}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition"
                >
                  <span>{tempFilters.sortOrder === 'asc' ? '↑' : '↓'}</span>
                  <span>
                    {tempFilters.sortOrder === 'asc'
                      ? t('discover.filter.ascending')
                      : t('discover.filter.descending')}
                  </span>
                </button>
              </div>
              <div className="space-y-1">
                {sortOptions.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTempFilters((prev) => ({ ...prev, sortBy: key }))}
                    className={[
                      'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition',
                      tempFilters.sortBy === key
                        ? 'bg-primary/10 text-primary'
                        : 'text-text-secondary hover:bg-bg-tertiary',
                    ].join(' ')}
                  >
                    <Icon size={14} />
                    <span className="flex-1 text-left">{t(label)}</span>
                    {tempFilters.sortBy === key && <Check size={14} className="text-primary" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Toggle Options */}
            <div className="p-4">
              <button
                type="button"
                onClick={() =>
                  setTempFilters((prev) => ({
                    ...prev,
                    showArchived: !prev.showArchived,
                  }))
                }
                className={[
                  'w-full flex items-center justify-between px-3 py-2 rounded-lg text-[13px] transition',
                  tempFilters.showArchived
                    ? 'bg-primary/10 text-primary'
                    : 'text-text-secondary hover:bg-bg-tertiary',
                ].join(' ')}
              >
                <span className="flex items-center gap-3">
                  <span
                    className={[
                      'w-4 h-4 rounded flex items-center justify-center border-2 transition',
                      tempFilters.showArchived ? 'border-primary bg-primary' : 'border-text-muted',
                    ].join(' ')}
                  >
                    {tempFilters.showArchived && <Check size={10} className="text-white" />}
                  </span>
                  <span>{t('discover.filter.showArchived')}</span>
                </span>
              </button>
            </div>

            {/* Footer Actions */}
            <div className="flex items-center gap-2 p-4 border-t border-bg-tertiary bg-bg-tertiary/50">
              <button
                type="button"
                onClick={handleClear}
                className="flex-1 px-4 py-2 rounded-lg text-[13px] font-medium text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition"
              >
                {t('discover.filter.clear')}
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="flex-1 px-4 py-2 rounded-lg text-[13px] font-medium bg-primary text-white hover:bg-primary/90 transition"
              >
                {t('discover.filter.apply')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
