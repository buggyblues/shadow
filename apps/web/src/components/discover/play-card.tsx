import { Badge, Button, cn } from '@shadowob/ui'
import { Play } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import { useState } from 'react'

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
  actionLabel: string
  className?: string
}

function handleCardKey(event: KeyboardEvent, onOpen: () => void) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  onOpen()
}

export function DiscoverPlayCard({ play, onOpen, actionLabel, className }: DiscoverPlayCardProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = Boolean(play.image && !imageFailed)

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => handleCardKey(event, onOpen)}
      className={cn(
        'group flex min-h-[390px] cursor-pointer flex-col overflow-hidden rounded-[18px] border border-border-subtle bg-bg-secondary/60 p-3 text-left shadow-[0_16px_42px_rgba(0,0,0,0.14)] transition hover:-translate-y-0.5 hover:border-primary/35 hover:bg-bg-secondary/72 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45',
        className,
      )}
    >
      <div className="relative h-[142px] shrink-0 overflow-hidden rounded-[14px] border border-border-subtle/70 bg-bg-tertiary">
        {showImage ? (
          <img
            src={play.image ?? ''}
            alt={play.title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div
            className="h-full w-full"
            style={{
              background: `radial-gradient(circle at 76% 18%, ${play.accentColor ?? 'rgba(0,209,255,0.28)'}, transparent 30%), linear-gradient(135deg, rgba(255,255,255,0.08), rgba(0,209,255,0.12) 42%, rgba(255,51,102,0.10))`,
            }}
          />
        )}
      </div>

      <div className="flex flex-1 flex-col px-3 pb-2 pt-4">
        <div className="mb-3 flex flex-wrap gap-2">
          <Badge variant="primary" size="sm">
            {play.category}
          </Badge>
          <Badge variant={play.statusTone} size="sm">
            {play.statusLabel}
          </Badge>
        </div>
        <h3 className="line-clamp-2 text-lg font-black leading-tight text-text-primary transition-colors group-hover:text-primary">
          {play.title}
        </h3>
        <p className="mt-3 line-clamp-3 flex-1 text-sm font-semibold leading-7 text-text-secondary">
          {play.description}
        </p>
        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="min-w-0 truncate text-xs font-black text-text-muted">
            {play.startsLabel}
          </span>
        </div>
        <Button
          className="mt-4 w-full"
          onClick={(event) => {
            event.stopPropagation()
            onOpen()
          }}
        >
          <Play size={15} fill="currentColor" />
          {actionLabel}
        </Button>
      </div>
    </article>
  )
}
