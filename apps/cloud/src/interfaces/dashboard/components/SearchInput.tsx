import { Search, X } from 'lucide-react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
  autoFocus?: boolean
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
  size = 'md',
  autoFocus,
}: SearchInputProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)

  const sizeClasses = {
    sm: 'h-8 text-xs pl-8 pr-7',
    md: 'h-9 text-sm pl-9 pr-8',
    lg: 'h-11 text-base pl-10 pr-9',
  }

  const iconSize = { sm: 13, md: 15, lg: 17 }

  return (
    <div className={cn('relative', className)}>
      <Search
        size={iconSize[size]}
        className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
        style={{ color: 'var(--nf-text-muted)' }}
      />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? `${t('common.search')}...`}
        autoFocus={autoFocus}
        className={cn(
          'w-full rounded-2xl text-gray-100 backdrop-blur-xl',
          'border transition-all duration-200',
          'focus:outline-none focus:ring-2',
          sizeClasses[size],
        )}
        style={{
          background: 'var(--nf-bg-glass-2)',
          borderColor: 'var(--nf-border)',
          color: 'var(--nf-text-high)',
          boxShadow: 'var(--nf-shadow-soft)',
        }}
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange('')
            inputRef.current?.focus()
          }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 transition-colors"
          style={{ color: 'var(--nf-text-muted)' }}
        >
          <X size={iconSize[size] - 2} />
        </button>
      )}
    </div>
  )
}
