import type { MessageCard, ServerAppMessageCard } from '@shadowob/shared'
import { cn } from '@shadowob/ui'
import { Link, useSearch } from '@tanstack/react-router'
import { AppWindow, ArrowRight } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

function isServerAppCard(card: MessageCard): card is ServerAppMessageCard {
  return (
    card.kind === 'server_app' && typeof card.appKey === 'string' && typeof card.title === 'string'
  )
}

function currentServerSegment() {
  if (typeof window === 'undefined') return null
  const match = window.location.pathname.match(/\/(?:app\/)?servers\/([^/]+)/u)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

function appCardRoute(card: ServerAppMessageCard, routeSearch: Record<string, unknown>) {
  const server = currentServerSegment()
  if (!server) return null
  const path =
    card.action?.mode === 'open_app' && typeof card.action.path === 'string'
      ? card.action.path.trim()
      : ''
  const search = { ...routeSearch }
  if (path.startsWith('/') && !path.startsWith('//')) {
    search.appPath = path
  } else {
    delete search.appPath
  }
  return { server, search }
}

export function ServerAppCardsView({ cards }: { cards: MessageCard[] | undefined }) {
  const appCards = useMemo(() => cards?.filter(isServerAppCard) ?? [], [cards])
  if (appCards.length === 0) return null
  return (
    <div className="my-2 flex w-full max-w-[760px] flex-col gap-2.5">
      {appCards.map((card, index) => (
        <ServerAppCardView key={card.id ?? `${card.appKey}:${index}`} card={card} />
      ))}
    </div>
  )
}

function ServerAppCardView({ card }: { card: ServerAppMessageCard }) {
  const { t } = useTranslation()
  const routeSearch = useSearch({ strict: false }) as Record<string, unknown>
  const route = appCardRoute(card, routeSearch)
  const label = card.label ?? t('chat.appCard.open')
  return (
    <article className="overflow-hidden rounded-xl border border-primary/18 bg-bg-secondary/92 shadow-[0_10px_28px_rgba(0,0,0,0.14)]">
      <div className="flex min-w-0 items-start gap-3 p-4">
        <div
          className={cn(
            'mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-lg',
            'border border-primary/25 bg-primary/12 text-primary',
          )}
          aria-hidden
        >
          <AppWindow size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="min-w-0 break-words text-base font-black leading-6 text-text-primary">
            {card.title}
          </div>
          {card.description ? (
            <p className="mt-1 line-clamp-2 text-sm leading-6 text-text-secondary">
              {card.description}
            </p>
          ) : null}
          {route ? (
            <Link
              to="/servers/$serverSlug/apps/$appKey"
              params={{ serverSlug: route.server, appKey: card.appKey }}
              search={route.search}
              className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-primary/25 bg-primary/10 px-3 text-xs font-black text-primary transition hover:bg-primary/15 focus:outline-none focus:ring-2 focus:ring-primary/35"
            >
              <span>{label}</span>
              <ArrowRight size={14} />
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  )
}
