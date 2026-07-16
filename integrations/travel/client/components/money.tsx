import { type CSSProperties, type MouseEvent, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useExchangeRates } from '../features/plan/hooks/use-exchange-rates.js'
import { type CurrencyPreference, useTravelPreferences } from '../store/preferences.js'
import { cn } from '../utils/class-names.js'

const currencyOptions: CurrencyPreference[] = ['EUR', 'USD', 'CNY', 'JPY', 'GBP', 'SGD']

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    currency,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    style: 'currency',
  }).format(amount)
}

export function Money({
  amount,
  className,
  currency,
  secondaryClassName,
}: {
  amount: number
  currency: string
  className?: string
  secondaryClassName?: string
}) {
  const { t } = useTranslation()
  const preferences = useTravelPreferences()
  const anchorRef = useRef<HTMLSpanElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const closeTimerRef = useRef<number | null>(null)
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({})
  const baseCurrency = currency.trim().toUpperCase()
  const preferredCurrency = preferences.currency
  const exchange = useExchangeRates(baseCurrency)
  const rate = baseCurrency === preferredCurrency ? 1 : exchange.data?.[preferredCurrency]
  const convertedAmount = rate && rate > 0 ? amount * rate : null
  const primary =
    convertedAmount !== null && preferredCurrency !== baseCurrency
      ? formatCurrency(convertedAmount, preferredCurrency)
      : formatCurrency(amount, baseCurrency)
  const secondary =
    convertedAmount !== null && preferredCurrency !== baseCurrency
      ? formatCurrency(amount, baseCurrency)
      : null
  const title = useMemo(() => {
    if (!secondary || !rate) return formatCurrency(amount, baseCurrency)
    return `${secondary} · 1 ${baseCurrency} = ${rate.toFixed(4)} ${preferredCurrency}`
  }, [amount, baseCurrency, preferredCurrency, rate, secondary])

  const clearCloseTimer = () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = null
  }
  const positionPopover = () => {
    const anchor = anchorRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    const width = Math.min(292, window.innerWidth - 24)
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12)
    const showAbove = rect.bottom + 230 > window.innerHeight
    setPopoverStyle({
      left,
      top: showAbove ? Math.max(12, rect.top - 214) : rect.bottom + 8,
      width,
    })
  }
  const showPopover = (pin = false) => {
    clearCloseTimer()
    positionPopover()
    if (pin) setPinned(true)
    setOpen(true)
  }
  const scheduleClose = () => {
    clearCloseTimer()
    if (pinned) return
    closeTimerRef.current = window.setTimeout(() => setOpen(false), 140)
  }
  const togglePopover = (event: MouseEvent<HTMLSpanElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (open && pinned) {
      setOpen(false)
      setPinned(false)
      return
    }
    showPopover(true)
  }

  useEffect(() => {
    if (!open) return
    const closeFromOutside = (event: PointerEvent) => {
      const target = event.target as Node
      if (anchorRef.current?.contains(target) || popoverRef.current?.contains(target)) return
      setOpen(false)
      setPinned(false)
    }
    const closeFromEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      setPinned(false)
    }
    const reposition = () => positionPopover()
    window.addEventListener('pointerdown', closeFromOutside)
    window.addEventListener('keydown', closeFromEscape)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('pointerdown', closeFromOutside)
      window.removeEventListener('keydown', closeFromEscape)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open])

  useEffect(() => () => clearCloseTimer(), [])

  const popover = open
    ? createPortal(
        <div
          className="fixed z-[10000] rounded-[18px] border border-line/80 bg-white p-3.5 text-left text-ink shadow-[0_20px_60px_rgba(34,55,48,0.22)]"
          onClick={(event) => event.stopPropagation()}
          onMouseEnter={clearCloseTimer}
          onMouseLeave={scheduleClose}
          ref={popoverRef}
          role="dialog"
          style={popoverStyle}
        >
          <div className="flex items-start justify-between gap-3">
            <span>
              <strong className="block text-[12px]">{t('money.convertedTo')}</strong>
              <span className="mt-0.5 block text-[10px] text-muted">{t('money.liveRate')}</span>
            </span>
            <strong className="text-[17px]">{primary}</strong>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-[13px] bg-paper/75 p-2.5 text-[10px]">
            <span>
              <span className="block text-muted">{t('money.originalAmount')}</span>
              <strong className="mt-1 block text-[12px]">
                {formatCurrency(amount, baseCurrency)}
              </strong>
            </span>
            <span>
              <span className="block text-muted">{t('money.liveRate')}</span>
              <strong className="mt-1 block text-[11px]">
                {rate
                  ? t('money.rateLine', {
                      base: baseCurrency,
                      rate: rate.toFixed(4),
                      target: preferredCurrency,
                    })
                  : t('money.unavailable')}
              </strong>
            </span>
          </div>
          <label className="mt-3 grid gap-1.5">
            <span className="font-bold text-[10px] text-muted">{t('money.preferredCurrency')}</span>
            <select
              className="h-10 rounded-xl border border-line bg-white px-3 font-bold text-[12px] outline-none focus:border-olive"
              onChange={(event) =>
                preferences.setCurrency(event.target.value as CurrencyPreference)
              }
              value={preferredCurrency}
            >
              {currencyOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>,
        document.body,
      )
    : null

  return (
    <>
      <span
        aria-expanded={open}
        className={cn(
          'inline-flex min-w-0 cursor-pointer items-baseline gap-1.5 rounded-md outline-none transition hover:text-olive focus-visible:ring-2 focus-visible:ring-olive/35',
          className,
        )}
        onClick={togglePopover}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          event.stopPropagation()
          showPopover(true)
        }}
        onMouseEnter={() => showPopover(false)}
        onMouseLeave={scheduleClose}
        ref={anchorRef}
        role="button"
        tabIndex={0}
        title={title}
      >
        <span className="min-w-0 truncate">{primary}</span>
        {secondary ? (
          <span
            className={cn('truncate text-[0.72em] font-semibold opacity-60', secondaryClassName)}
          >
            {secondary}
          </span>
        ) : null}
      </span>
      {popover}
    </>
  )
}

export function formatMoneyText(amount: number, currency: string) {
  return formatCurrency(amount, currency)
}
