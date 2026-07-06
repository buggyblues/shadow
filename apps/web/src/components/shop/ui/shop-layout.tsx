import { cn, Search as SearchField } from '@shadowob/ui'
import type { HTMLAttributes, ReactNode } from 'react'

export function ShopPanel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-[24px] border border-[var(--glass-line)] bg-bg-secondary/30',
        className,
      )}
      {...props}
    />
  )
}

export function ShopSearchField({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  className?: string
}) {
  return (
    <div className={cn('min-w-[220px]', className)}>
      <SearchField
        type="search"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </div>
  )
}

export function ShopPillBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex max-w-full min-w-0 items-center gap-2 overflow-x-auto pb-2 pt-1 scrollbar-hidden',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function ShopPillButton({
  active,
  tone = 'primary',
  className,
  children,
  ...props
}: HTMLAttributes<HTMLButtonElement> & {
  active?: boolean
  tone?: 'primary' | 'accent'
  children: ReactNode
}) {
  const activeClass =
    tone === 'accent'
      ? 'border-accent/45 bg-accent text-bg-primary'
      : 'border-primary/45 bg-primary text-bg-primary'
  const idleClass =
    tone === 'accent'
      ? 'border-[var(--glass-line)] bg-bg-secondary/48 text-text-secondary hover:border-accent/40 hover:bg-accent/15 hover:text-accent'
      : 'border-[var(--glass-line)] bg-bg-secondary/48 text-text-secondary hover:border-primary/40 hover:bg-primary/15 hover:text-primary'

  return (
    <button
      type="button"
      className={cn(
        'h-10 whitespace-nowrap rounded-full border px-4 text-sm font-black transition hover:-translate-y-0.5',
        active ? activeClass : idleClass,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
