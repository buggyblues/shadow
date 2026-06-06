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
    <div className="my-2 flex w-full max-w-[760px] flex-col gap-2.5">
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
  return (
    <article className="overflow-hidden rounded-xl border border-border-subtle bg-bg-secondary/92 shadow-[0_10px_28px_rgba(0,0,0,0.14)]">
      <div className="flex min-w-0 items-start gap-3 p-4">
        <div
          className={cn(
            'mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-lg',
            'border border-primary/20 bg-primary/10 text-primary',
          )}
          aria-hidden
        >
          <MessageSquareText size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-xs font-black uppercase text-text-muted">{label}</span>
          </div>
          <div className="mt-1 min-w-0 break-words text-base font-black leading-6 text-text-primary">
            {card.title}
          </div>
          {card.description ? (
            <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-sm leading-6 text-text-secondary">
              {card.description}
            </p>
          ) : null}
          {route ? (
            <Link
              to="/servers/$serverSlug/channels/$channelId"
              params={{ serverSlug: route.server, channelId: route.channelId }}
              search={route.search}
              className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-primary/25 bg-primary/10 px-3 text-xs font-black text-primary transition hover:bg-primary/15 focus:outline-none focus:ring-2 focus:ring-primary/35"
            >
              <span>{t('chat.messageReference.open')}</span>
              <ArrowRight size={14} />
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  )
}
