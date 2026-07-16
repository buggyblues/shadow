import type { ReactNode } from 'react'
import { cn } from '../utils/class-names.js'
import { Paperclip, Plus } from './icons.js'

export interface AttachmentItem {
  id: string
  label: ReactNode
  meta?: ReactNode
}

interface AttachmentListProps {
  addLabel?: ReactNode
  className?: string
  items: AttachmentItem[]
}

export function AttachmentList({ addLabel, className, items }: AttachmentListProps) {
  return (
    <div className={cn('grid gap-2', className)}>
      {items.map((item) => (
        <div
          className="flex min-w-0 items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-[12px]"
          key={item.id}
        >
          <Paperclip className="shrink-0 text-muted" size={15} />
          <span className="min-w-0 flex-1 truncate font-bold">{item.label}</span>
          {item.meta ? <span className="shrink-0 text-muted">{item.meta}</span> : null}
        </div>
      ))}
      {addLabel ? (
        <button
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-line bg-white px-3 font-extrabold text-[12px] text-olive transition hover:bg-sage"
          type="button"
        >
          <Plus size={15} />
          {addLabel}
        </button>
      ) : null}
    </div>
  )
}
