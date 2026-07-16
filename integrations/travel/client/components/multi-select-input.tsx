import {
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  useId,
  useMemo,
  useState,
} from 'react'
import { cn } from '../utils/class-names.js'
import { CheckCircle, X } from './icons.js'

export interface MultiSelectOption {
  id: string
  label: string
  leading?: ReactNode
  meta?: string
}

export function MultiSelectInput({
  className,
  emptyLabel,
  label,
  onChange,
  options,
  placeholder,
  selectedIds,
}: {
  className?: string
  emptyLabel: string
  label: string
  onChange: (ids: string[]) => void
  options: MultiSelectOption[]
  placeholder: string
  selectedIds: string[]
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputId = useId()
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const selectedOptions = options.filter((option) => selectedIds.includes(option.id))
  const filteredOptions = useMemo(
    () =>
      options.filter(
        (option) =>
          !normalizedQuery ||
          option.label.toLocaleLowerCase().includes(normalizedQuery) ||
          option.meta?.toLocaleLowerCase().includes(normalizedQuery),
      ),
    [normalizedQuery, options],
  )
  const toggle = (id: string) =>
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((selectedId) => selectedId !== id)
        : [...selectedIds, id],
    )
  const closeWhenFocusLeaves = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
  }
  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && filteredOptions[0]) {
      event.preventDefault()
      toggle(filteredOptions[0].id)
      setQuery('')
    }
    if (event.key === 'Backspace' && !query && selectedIds.length) {
      onChange(selectedIds.slice(0, -1))
    }
  }

  return (
    <div className={cn('relative min-w-0', className)} onBlur={closeWhenFocusLeaves}>
      <label className="mb-2 block font-bold text-[11px] text-muted" htmlFor={inputId}>
        {label}
      </label>
      <div
        className={cn(
          'flex min-h-11 flex-wrap items-center gap-1.5 rounded-[14px] border bg-white px-2 py-1.5 transition',
          open ? 'border-olive ring-4 ring-olive/10' : 'border-line',
        )}
      >
        {selectedOptions.map((option) => (
          <button
            aria-label={`${option.label} ×`}
            className="inline-flex h-7 max-w-full items-center gap-1 rounded-[9px] bg-sage/75 pr-1.5 pl-1 font-bold text-[10px] text-olive"
            key={option.id}
            onClick={() => toggle(option.id)}
            type="button"
          >
            {option.leading}
            <span className="max-w-24 truncate">{option.label}</span>
            <X size={11} />
          </button>
        ))}
        <input
          aria-expanded={open}
          aria-label={label}
          autoComplete="off"
          className="h-7 min-w-24 flex-1 bg-transparent px-1 text-[12px] text-ink outline-none placeholder:text-muted"
          id={inputId}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleInputKeyDown}
          placeholder={selectedOptions.length ? '' : placeholder}
          role="combobox"
          value={query}
        />
      </div>
      {open ? (
        <div
          className="absolute inset-x-0 top-full z-[80] mt-1.5 max-h-52 overflow-auto rounded-[14px] border border-line bg-white p-1.5 shadow-[0_16px_40px_rgba(34,55,48,0.18)]"
          role="listbox"
        >
          {filteredOptions.length ? (
            filteredOptions.map((option) => {
              const selected = selectedIds.includes(option.id)
              return (
                <button
                  aria-selected={selected}
                  className={cn(
                    'flex min-h-10 w-full items-center gap-2 rounded-[10px] px-2 text-left transition',
                    selected ? 'bg-sage/70 text-olive' : 'hover:bg-paper',
                  )}
                  key={option.id}
                  onClick={() => {
                    toggle(option.id)
                    setQuery('')
                  }}
                  role="option"
                  type="button"
                >
                  {option.leading}
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-[11px]">{option.label}</strong>
                    {option.meta ? (
                      <span className="block truncate text-[9px] text-muted">{option.meta}</span>
                    ) : null}
                  </span>
                  <CheckCircle className={selected ? 'text-olive' : 'text-muted/20'} size={15} />
                </button>
              )
            })
          ) : (
            <div className="px-3 py-4 text-center text-[11px] text-muted">{emptyLabel}</div>
          )}
        </div>
      ) : null}
    </div>
  )
}
