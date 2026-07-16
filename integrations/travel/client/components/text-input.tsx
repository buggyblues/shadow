import type { InputHTMLAttributes, ReactNode } from 'react'
import { cn } from '../utils/class-names.js'
import { Search } from './icons.js'

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  leadingIcon?: ReactNode
  containerClassName?: string
}

export function TextInput({
  className,
  containerClassName,
  leadingIcon = <Search size={18} />,
  ...props
}: TextInputProps) {
  return (
    <label className={cn('relative block w-full', containerClassName)}>
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">
        {leadingIcon}
      </span>
      <input
        className={cn(
          'h-10 w-full rounded-xl border border-line bg-white px-10 text-[14px] text-ink outline-none transition placeholder:text-muted focus:border-olive focus:ring-4 focus:ring-olive/10',
          className,
        )}
        {...props}
      />
    </label>
  )
}
