import type { KeyboardEvent, ReactNode } from 'react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'

export type ReactSelectOption = {
  disabled?: boolean
  label: string
  value: string
}

export function ReactSelect<TOption extends ReactSelectOption>(props: {
  ariaLabel?: string
  className?: string
  defaultOpen?: boolean
  disabled?: boolean
  emptyLabel?: string
  loading?: boolean
  loadingLabel?: string
  onChange: (value: string, option: TOption) => void
  options: TOption[]
  placeholder: string
  renderOption?: (option: TOption) => ReactNode
  renderValue?: (option: TOption) => ReactNode
  value: string
}) {
  const [open, setOpen] = useState(props.defaultOpen ?? false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const reactId = useId()
  const listboxId = `${reactId}-listbox`
  const selectedIndex = props.options.findIndex((option) => option.value === props.value)
  const selected = selectedIndex >= 0 ? props.options[selectedIndex] : null
  const disabled = props.disabled || props.loading
  const activeOptionId = open && activeIndex >= 0 ? optionId(listboxId, activeIndex) : undefined
  const currentLabel = props.loading
    ? (props.loadingLabel ?? 'Loading')
    : (selected?.label ?? props.placeholder)
  const selectedOrFirstIndex = useMemo(() => {
    if (selectedIndex >= 0 && !props.options[selectedIndex]?.disabled) return selectedIndex
    return firstEnabledIndex(props.options)
  }, [props.options, selectedIndex])

  useEffect(() => {
    if (!open) return
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnPointerDown)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    setActiveIndex(selectedOrFirstIndex)
  }, [open, selectedOrFirstIndex])

  const openAt = (index = selectedOrFirstIndex) => {
    setActiveIndex(index)
    setOpen(true)
  }
  const selectOption = (option: TOption) => {
    if (option.disabled) return
    props.onChange(option.value, option)
    setOpen(false)
  }
  const moveActive = (direction: 1 | -1) => {
    const fromIndex = activeIndex >= 0 ? activeIndex : selectedOrFirstIndex
    const nextIndex = nextEnabledIndex(props.options, fromIndex, direction)
    if (nextIndex >= 0) setActiveIndex(nextIndex)
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!open) openAt()
      else moveActive(1)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) openAt()
      else moveActive(-1)
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex(firstEnabledIndex(props.options))
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex(lastEnabledIndex(props.options))
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (!open) {
        openAt()
        return
      }
      const option = props.options[activeIndex]
      if (option) selectOption(option)
      return
    }
    if (event.key === 'Tab') setOpen(false)
  }

  return (
    <div
      className={classNames('reactSelect', props.className, open && 'open')}
      data-open={open ? 'true' : 'false'}
      ref={rootRef}
    >
      <button
        aria-activedescendant={activeOptionId}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={props.ariaLabel ?? props.placeholder}
        className={classNames('reactSelectButton', selected && 'selected')}
        disabled={disabled}
        role="combobox"
        type="button"
        onClick={() => {
          if (open) setOpen(false)
          else openAt()
        }}
        onKeyDown={handleKeyDown}
      >
        <span className="reactSelectValue">
          {selected && props.renderValue ? (
            props.renderValue(selected)
          ) : (
            <span className={selected ? 'reactSelectLabel' : 'reactSelectLabel placeholder'}>
              {currentLabel}
            </span>
          )}
        </span>
        <span aria-hidden className="reactSelectChevron" />
      </button>
      {open ? (
        <div className="reactSelectMenu" id={listboxId} role="listbox">
          {props.options.length ? (
            props.options.map((option, index) => {
              const selectedOption = option.value === props.value
              const active = index === activeIndex
              return (
                <div
                  aria-disabled={option.disabled || undefined}
                  aria-selected={selectedOption}
                  className={classNames(
                    'reactSelectOption',
                    selectedOption && 'selected',
                    active && 'active',
                    option.disabled && 'disabled',
                  )}
                  id={optionId(listboxId, index)}
                  key={option.value}
                  role="option"
                  tabIndex={-1}
                  onClick={() => selectOption(option)}
                  onMouseEnter={() => {
                    if (!option.disabled) setActiveIndex(index)
                  }}
                  onPointerDown={(event) => event.preventDefault()}
                >
                  {props.renderOption ? props.renderOption(option) : option.label}
                </div>
              )
            })
          ) : (
            <div className="reactSelectEmpty">{props.emptyLabel ?? 'No options available'}</div>
          )}
        </div>
      ) : null}
    </div>
  )
}

function optionId(listboxId: string, index: number) {
  return `${listboxId}-option-${index}`
}

function firstEnabledIndex(options: ReactSelectOption[]) {
  return options.findIndex((option) => !option.disabled)
}

function lastEnabledIndex(options: ReactSelectOption[]) {
  for (let index = options.length - 1; index >= 0; index -= 1) {
    if (!options[index]?.disabled) return index
  }
  return -1
}

function nextEnabledIndex(options: ReactSelectOption[], startIndex: number, direction: 1 | -1) {
  if (!options.length) return -1
  for (let step = 1; step <= options.length; step += 1) {
    const index = (startIndex + step * direction + options.length) % options.length
    if (!options[index]?.disabled) return index
  }
  return -1
}

function classNames(...names: Array<string | false | null | undefined>) {
  return names.filter(Boolean).join(' ')
}
