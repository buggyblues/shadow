import {
  isMessageReferenceCard,
  type MessageCard,
  type MessageReferenceCard,
} from '@shadowob/shared'
import { cn } from '@shadowob/ui'
import { Link } from '@tanstack/react-router'
import { ArrowRight, MessageSquareText } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

function currentServerSegment() {
  if (typeof window === 'undefined') return null
  const match = window.location.pathname.match(/\/(?:app\/)?servers\/([^/]+)/u)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

function referenceRoute(card: MessageReferenceCard) {
  const server = card.target.serverSlug ?? card.target.serverId ?? currentServerSegment()
  if (!server || !card.target.channelId || !card.target.messageId) return null
  return {
    server,
    channelId: card.target.channelId,
    search: { msg: card.target.messageId },
  }
}

export function MessageReferenceCardsView({ cards }: { cards: MessageCard[] | undefined }) {
  const referenceCards = useMemo(() => cards?.filter(isMessageReferenceCard) ?? [], [cards])
  if (referenceCards.length === 0) return null
  return (
    <div className="my-2 flex w-full max-w-[min(36rem,100%)] flex-col gap-2">
      {referenceCards.map((card, index) => (
        <MessageReferenceCardView
          key={card.id ?? `${card.target.messageId}:${index}`}
          card={card}
        />
      ))}
    </div>
  )
}

function MessageReferenceCardView({ card }: { card: MessageReferenceCard }) {
  const { t } = useTranslation()
  const route = referenceRoute(card)
  const label = card.label ?? card.source?.label ?? t('chat.messageReference.defaultLabel')

  const content = (
    <div className="flex min-w-0 items-start gap-2.5 px-3 py-2.5">
      <div
        className={cn(
          'mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg',
          'border border-primary/20 bg-primary/10 text-primary',
        )}
        aria-hidden
      >
        <MessageSquareText size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[11px] font-bold text-text-muted">{label}</span>
          {route ? <ArrowRight size={12} className="shrink-0 text-text-muted/70" /> : null}
        </div>
        <div className="mt-0.5 min-w-0 truncate text-sm font-semibold leading-5 text-text-primary">
          {card.title}
        </div>
        {card.description ? (
          <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap break-words text-xs leading-5 text-text-muted">
            {card.description}
          </p>
        ) : null}
      </div>
    </div>
  )

  if (route) {
    return (
      <Link
        to="/servers/$serverSlug/channels/$channelId"
        params={{ serverSlug: route.server, channelId: route.channelId }}
        search={route.search}
        className="group/reference block overflow-hidden rounded-xl border border-border-subtle/70 bg-bg-secondary/35 transition hover:border-primary/30 hover:bg-primary/8 focus:outline-none focus:ring-2 focus:ring-primary/35"
        aria-label={t('chat.messageReference.open')}
      >
        {content}
      </Link>
    )
  }

  return (
    <article className="overflow-hidden rounded-xl border border-border-subtle/70 bg-bg-secondary/35">
      {content}
    </article>
  )
}
