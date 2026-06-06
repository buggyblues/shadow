import { Button } from '@shadowob/ui'
import { useQueryClient } from '@tanstack/react-query'
import { Check, X } from 'lucide-react'
import {
  memo,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../../lib/api'
import { useChatStore } from '../../../stores/chat.store'
import type {
  InteractiveBlock,
  InteractiveResponseMetadata,
  InteractiveStateMetadata,
} from './types'

interface InteractiveSelectChoice {
  key: string
  label: string
  value: string
}

export function InteractiveSelect({
  ariaLabel,
  disabled,
  onSelect,
  options,
  placeholder,
  value,
}: {
  ariaLabel?: string
  disabled?: boolean
  onSelect: (choice: InteractiveSelectChoice) => void
  options: InteractiveSelectChoice[]
  placeholder: string
  value: string
}) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const listboxId = useId()
  const selectedIndex = options.findIndex((option) => option.key === value)
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null
  const isDisabled = disabled || options.length === 0

  const clampIndex = useCallback(
    (index: number) => {
      if (options.length === 0) return 0
      if (index < 0) return options.length - 1
      if (index >= options.length) return 0
      return index
    },
    [options.length],
  )

  const openAt = useCallback(
    (index: number) => {
      setActiveIndex(clampIndex(index))
      setOpen(true)
    },
    [clampIndex],
  )

  useEffect(() => {
    if (!open) return
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnPointerDown)
    return () => document.removeEventListener('pointerdown', closeOnPointerDown)
  }, [open])

  useEffect(() => {
    if (selectedIndex >= 0) {
      setActiveIndex(selectedIndex)
    }
  }, [selectedIndex])

  const choose = useCallback(
    (choice: InteractiveSelectChoice) => {
      if (isDisabled) return
      onSelect(choice)
      setOpen(false)
    },
    [isDisabled, onSelect],
  )

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (isDisabled) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!open) {
        openAt(selectedIndex >= 0 ? selectedIndex : 0)
        return
      }
      setActiveIndex((index) => clampIndex(index + 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        openAt(selectedIndex >= 0 ? selectedIndex : options.length - 1)
        return
      }
      setActiveIndex((index) => clampIndex(index - 1))
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (!open) {
        openAt(selectedIndex >= 0 ? selectedIndex : 0)
        return
      }
      const choice = options[activeIndex]
      if (choice) choose(choice)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div className="relative min-w-0" ref={rootRef}>
      <button
        aria-activedescendant={
          open && options[activeIndex] ? `${listboxId}-${activeIndex}` : undefined
        }
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel ?? placeholder}
        className="flex min-h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-border-subtle bg-background px-2.5 py-1.5 text-left text-sm font-medium text-text-primary outline-none transition-colors hover:bg-bg-secondary focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isDisabled}
        role="combobox"
        type="button"
        onClick={() => {
          if (open) {
            setOpen(false)
          } else {
            openAt(selectedIndex >= 0 ? selectedIndex : 0)
          }
        }}
        onKeyDown={handleKeyDown}
      >
        <span className={selected ? 'truncate' : 'truncate text-text-muted'}>
          {selected?.label ?? placeholder}
        </span>
        <span aria-hidden className="text-[11px] leading-none text-text-muted">
          v
        </span>
      </button>
      {open ? (
        <div
          className="absolute left-0 right-0 top-full z-[80] mt-1 max-h-60 overflow-y-auto rounded-md border border-border-subtle bg-bg-primary p-1 shadow-xl"
          id={listboxId}
          role="listbox"
        >
          {options.map((option, index) => {
            const isSelected = option.key === selected?.key
            const isActive = index === activeIndex
            return (
              <button
                aria-selected={isSelected}
                className={[
                  'flex min-h-8 w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm text-text-primary outline-none',
                  isActive ? 'bg-bg-secondary' : '',
                  isSelected ? 'font-semibold' : 'font-medium',
                ]
                  .filter(Boolean)
                  .join(' ')}
                id={`${listboxId}-${index}`}
                key={option.key}
                role="option"
                type="button"
                onClick={() => choose(option)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span className="truncate">{option.label}</span>
                {isSelected ? <Check size={14} className="shrink-0 text-primary" /> : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Phase 2 POC — renders interactive controls (buttons / select) attached to
 * a message and POSTs the user's choice to the server, which echoes a
 * follow-up reply that the buddy agent receives via normal chat flow.
 */
function InteractiveBlockRendererBase({
  block,
  messageId,
  disabled,
  submittedResponse,
}: {
  block: InteractiveBlock
  messageId: string
  disabled?: boolean
  submittedResponse?: InteractiveResponseMetadata | null
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const activeChannelId = useChatStore((s) => s.activeChannelId)
  const [submitting, setSubmitting] = useState(false)
  const [serverResponse, setServerResponse] = useState<InteractiveResponseMetadata | null>(null)
  const effectiveResponse = submittedResponse ?? serverResponse
  const [done, setDone] = useState<string | null>(submittedResponse?.actionId ?? null)
  const [error, setError] = useState<string | null>(null)
  const submittingRef = useRef(false)

  useEffect(() => {
    if (submittedResponse) {
      setServerResponse(null)
    }
  }, [submittedResponse])

  useEffect(() => {
    if (block.oneShot === false || submittedResponse?.actionId) return
    let alive = true
    const query = new URLSearchParams({ blockId: block.id }).toString()
    fetchApi<InteractiveStateMetadata>(`/api/messages/${messageId}/interactive-state?${query}`)
      .then((state) => {
        if (alive && state.submitted && state.response) {
          setServerResponse(state.response)
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [block.id, block.oneShot, messageId, submittedResponse?.actionId])

  useEffect(() => {
    if (effectiveResponse?.actionId) {
      setDone(effectiveResponse.actionId)
    }
  }, [effectiveResponse?.actionId])

  const send = useCallback(
    async (actionId: string, value: string, label: string, values?: Record<string, string>) => {
      if (submittingRef.current || (block.oneShot !== false && done)) return
      submittingRef.current = true
      const previousDone = done
      setSubmitting(true)
      if (block.oneShot !== false) setDone(actionId)
      setError(null)
      try {
        const result = await fetchApi<
          | {
              metadata?: {
                interactiveResponse?: InteractiveResponseMetadata
                interactiveState?: InteractiveStateMetadata
              }
            }
          | { interactiveState?: InteractiveStateMetadata }
        >(`/api/messages/${messageId}/interactive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            blockId: block.id,
            actionId,
            value,
            label,
            ...(values ? { values } : {}),
          }),
        })
        const resultRecord = result as {
          metadata?: {
            interactiveResponse?: InteractiveResponseMetadata
            interactiveState?: InteractiveStateMetadata
          }
          interactiveState?: InteractiveStateMetadata
        }
        const nextResponse =
          resultRecord.metadata?.interactiveState?.response ??
          resultRecord.metadata?.interactiveResponse ??
          resultRecord.interactiveState?.response
        if (nextResponse) setServerResponse(nextResponse)
        setDone(actionId)
        if (activeChannelId) {
          queryClient.invalidateQueries({ queryKey: ['messages', activeChannelId] })
        }
      } catch (e) {
        if (block.oneShot !== false) setDone(previousDone)
        setError(e instanceof Error ? e.message : t('chat.interactiveSubmitFailed'))
      } finally {
        submittingRef.current = false
        setSubmitting(false)
      }
    },
    [activeChannelId, block.id, block.oneShot, done, messageId, queryClient, t],
  )

  const isLocked =
    disabled || submitting || (block.oneShot !== false && (done !== null || !!effectiveResponse))

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-lg border border-border-subtle bg-black/5 dark:bg-white/5 p-3">
      {block.prompt && (
        <div className="text-sm text-text-secondary whitespace-pre-wrap">{block.prompt}</div>
      )}

      {block.kind === 'buttons' && block.buttons && (
        <div className="flex flex-wrap gap-2">
          {block.buttons.map((b) => {
            const value = b.value ?? b.id
            const isPicked = done === b.id
            return (
              <Button
                key={b.id}
                size="sm"
                variant={
                  b.style === 'destructive'
                    ? 'danger'
                    : b.style === 'primary' || isPicked
                      ? 'primary'
                      : 'outline'
                }
                disabled={isLocked}
                onClick={() => send(b.id, value, b.label)}
              >
                {isPicked ? (
                  <>
                    <Check size={14} />
                    <span>{b.label}</span>
                  </>
                ) : (
                  b.label
                )}
              </Button>
            )
          })}
        </div>
      )}

      {block.kind === 'select' && block.options && (
        <InteractiveSelect
          ariaLabel={block.prompt ?? t('chat.interactiveChoose')}
          disabled={isLocked}
          options={block.options.map((option, index) => ({
            key: option.id || `option-${index}`,
            label: option.label,
            value: option.value,
          }))}
          placeholder={t('chat.interactiveChoose')}
          value={done ?? ''}
          onSelect={(choice) => {
            send(choice.key, choice.value, choice.label)
          }}
        />
      )}

      {(block.kind === 'form' || block.kind === 'approval') && (
        <InteractiveFormBody
          block={block}
          isLocked={isLocked}
          submittedValues={effectiveResponse?.values}
          onSubmit={(actionId, label, values) => send(actionId, actionId, label, values)}
        />
      )}

      {error && <div className="text-xs text-danger">{error}</div>}
    </div>
  )
}

export const InteractiveBlockRenderer = memo(InteractiveBlockRendererBase)
InteractiveBlockRenderer.displayName = 'InteractiveBlockRenderer'

/**
 * Renders a `kind: 'form' | 'approval'` block as a controlled mini-form.
 * - 'form': renders fields + Submit button (single action 'submit').
 * - 'approval': renders fields (typically a single comment textarea) + Approve / Reject pair.
 */
function InteractiveFormBody({
  block,
  isLocked,
  submittedValues,
  onSubmit,
}: {
  block: InteractiveBlock
  isLocked: boolean
  submittedValues?: Record<string, string>
  onSubmit: (actionId: string, label: string, values: Record<string, string>) => void
}) {
  const { t } = useTranslation()
  const initial = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {}
    for (const f of block.fields ?? []) {
      out[f.id] =
        submittedValues?.[f.id] ?? f.defaultValue ?? (f.kind === 'checkbox' ? 'false' : '')
    }
    return out
  }, [block.fields, submittedValues])
  const [values, setValues] = useState<Record<string, string>>(initial)
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (submittedValues) {
      setValues(initial)
    }
  }, [initial, submittedValues])

  const setField = (id: string, v: string) => setValues((prev) => ({ ...prev, [id]: v }))

  const missingRequired = (block.fields ?? []).some((f) => f.required && !values[f.id]?.trim())

  const submit = (actionId: string, label: string) => {
    if (isLocked) return
    setTouched(true)
    if (missingRequired) return
    onSubmit(actionId, label, values)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
        {(block.fields ?? []).map((f) => {
          const v = values[f.id] ?? ''
          const showError = touched && f.required && !v.trim()
          const selectOptions =
            f.kind === 'select'
              ? (f.options ?? []).map((option, index) => ({
                  key: option.id || `${f.id}-${index}`,
                  label: option.label,
                  value: option.value,
                }))
              : []
          const selectValue = selectOptions.find((option) => option.value === v)?.key ?? ''
          return (
            <label key={f.id} className="flex flex-col gap-1 text-sm">
              <span className="text-text-secondary">
                {f.label}
                {f.required ? <span className="text-danger ml-0.5">*</span> : null}
              </span>
              {f.kind === 'textarea' ? (
                <textarea
                  className="rounded-md border border-border-subtle bg-background px-2 py-1 text-sm min-h-[60px]"
                  placeholder={f.placeholder}
                  maxLength={f.maxLength}
                  value={v}
                  disabled={isLocked}
                  onChange={(e) => setField(f.id, e.target.value)}
                />
              ) : f.kind === 'select' ? (
                <InteractiveSelect
                  ariaLabel={f.label}
                  disabled={isLocked}
                  options={selectOptions}
                  placeholder={t('chat.interactiveChoose')}
                  value={selectValue}
                  onSelect={(choice) => setField(f.id, choice.value)}
                />
              ) : f.kind === 'checkbox' ? (
                <input
                  type="checkbox"
                  className="self-start"
                  checked={v === 'true'}
                  disabled={isLocked}
                  onChange={(e) => setField(f.id, e.target.checked ? 'true' : 'false')}
                />
              ) : (
                <input
                  type={f.kind === 'number' ? 'number' : 'text'}
                  className="rounded-md border border-border-subtle bg-background px-2 py-1 text-sm"
                  placeholder={f.placeholder}
                  maxLength={f.maxLength}
                  min={f.min}
                  max={f.max}
                  value={v}
                  disabled={isLocked}
                  onChange={(e) => setField(f.id, e.target.value)}
                />
              )}
              {showError && (
                <span className="text-xs text-danger">{t('chat.interactiveRequired')}</span>
              )}
            </label>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        {block.kind === 'form' ? (
          <Button
            size="sm"
            variant="primary"
            disabled={isLocked}
            onClick={() => submit('submit', block.submitLabel ?? t('chat.interactiveSubmit'))}
          >
            {block.submitLabel ?? t('chat.interactiveSubmit')}
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              variant="primary"
              disabled={isLocked}
              onClick={() => submit('approve', t('chat.interactiveApprove'))}
            >
              <Check size={14} />
              <span>{t('chat.interactiveApprove')}</span>
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={isLocked}
              onClick={() => submit('reject', t('chat.interactiveReject'))}
            >
              <X size={14} />
              <span>{t('chat.interactiveReject')}</span>
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
