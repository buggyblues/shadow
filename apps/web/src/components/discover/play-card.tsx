import { cn } from '@shadowob/ui'
import type { KeyboardEvent } from 'react'
import { useState } from 'react'
import { DiscoverPlaceholderVisual } from './discover-placeholder'

export interface DiscoverPlayCardData {
  id: string
  title: string
  description: string
  category: string
  image?: string | null
  accentColor?: string | null
  statusLabel: string
  statusTone: 'success' | 'warning' | 'neutral'
  startsLabel: string
}

interface DiscoverPlayCardProps {
  play: DiscoverPlayCardData
  onOpen: () => void
  className?: string
}

function handleCardKey(event: KeyboardEvent, onOpen: () => void) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  onOpen()
}

export function DiscoverPlayCard({ play, onOpen, className }: DiscoverPlayCardProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = Boolean(play.image && !imageFailed)

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => handleCardKey(event, onOpen)}
      className={cn(
        'group flex min-h-[392px] cursor-pointer flex-col overflow-hidden rounded-[24px] border border-[var(--glass-line)] bg-bg-secondary/55 text-left shadow-[0_18px_48px_rgba(0,0,0,0.18)] transition hover:-translate-y-0.5 hover:border-primary/45 hover:bg-bg-tertiary/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45',
        className,
      )}
    >
      <div className="relative h-[168px] shrink-0 overflow-hidden border-b border-white/10 bg-bg-primary/55">
        {showImage ? (
          <img
            src={play.image ?? ''}
            alt={play.title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <DiscoverPlaceholderVisual className="h-full w-full" />
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 text-lg font-black leading-tight text-text-primary transition-colors group-hover:text-primary">
          {play.title}
        </h3>
        <p className="mt-3 h-16 max-h-16 min-h-16 overflow-hidden text-sm font-semibold leading-6 text-text-secondary">
          {play.description}
        </p>
        <div className="mt-auto border-t border-white/10 pt-3">
          <span className="min-w-0 truncate text-xs font-black text-text-muted">
            {play.startsLabel}
          </span>
        </div>
      </div>
    </article>
  )
}
