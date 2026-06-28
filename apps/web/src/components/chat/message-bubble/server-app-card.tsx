import type { MessageCard, ServerAppMessageCard } from '@shadowob/shared'
import { ContentImage, DecorativeImage, cn } from '@shadowob/ui'
import { Link, useSearch } from '@tanstack/react-router'
import { AppWindow } from 'lucide-react'
import { useMemo, useState } from 'react'
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

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function cardAppIconUrl(card: ServerAppMessageCard) {
  const serverApp =
    card.data?.serverApp &&
    typeof card.data.serverApp === 'object' &&
    !Array.isArray(card.data.serverApp)
      ? (card.data.serverApp as Record<string, unknown>)
      : null
  const iconUrl = stringValue(serverApp?.iconUrl)
  if (!iconUrl || typeof window === 'undefined') return iconUrl
  try {
    return new URL(iconUrl, window.location.origin).toString()
  } catch {
    return iconUrl
  }
}

function cardPreviewUrl(card: ServerAppMessageCard) {
  const serverApp =
    card.data?.serverApp &&
    typeof card.data.serverApp === 'object' &&
    !Array.isArray(card.data.serverApp)
      ? (card.data.serverApp as Record<string, unknown>)
      : null
  const previewUrl =
    stringValue(card.imageUrl) ??
    stringValue(card.data?.imageUrl) ??
    stringValue(card.data?.coverUrl) ??
    stringValue(card.data?.coverImageUrl) ??
    stringValue(card.data?.previewUrl) ??
    stringValue(serverApp?.coverUrl) ??
    stringValue(serverApp?.coverImageUrl) ??
    stringValue(serverApp?.previewUrl)
  if (!previewUrl || typeof window === 'undefined') return previewUrl
  try {
    return new URL(previewUrl, window.location.origin).toString()
  } catch {
    return previewUrl
  }
}

function cardAppName(card: ServerAppMessageCard) {
  const serverApp =
    card.data?.serverApp &&
    typeof card.data.serverApp === 'object' &&
    !Array.isArray(card.data.serverApp)
      ? (card.data.serverApp as Record<string, unknown>)
      : null
  return stringValue(serverApp?.name) ?? card.appKey
}

export function ServerAppCardsView({ cards }: { cards: MessageCard[] | undefined }) {
  const appCards = useMemo(() => cards?.filter(isServerAppCard) ?? [], [cards])
  if (appCards.length === 0) return null
  return (
    <div className="my-2 flex w-full max-w-[360px] flex-col gap-2.5">
      {appCards.map((card, index) => (
        <ServerAppCardView key={card.id ?? `${card.appKey}:${index}`} card={card} />
      ))}
    </div>
  )
}

function ServerAppIcon({ iconUrl }: { iconUrl: string | null }) {
  const [failed, setFailed] = useState(false)
  const showImage = iconUrl && !failed
  return (
    <div
      className={cn(
        'grid h-5 w-5 shrink-0 place-items-center overflow-hidden rounded-md',
        'border border-border-subtle bg-bg-secondary text-primary',
      )}
      aria-hidden
    >
      {showImage ? (
        <DecorativeImage
          src={iconUrl}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <AppWindow size={12} />
      )}
    </div>
  )
}

function ServerAppPreview({
  appName,
  iconUrl,
  previewUrl,
}: {
  appName: string
  iconUrl: string | null
  previewUrl: string | null
}) {
  const [previewFailed, setPreviewFailed] = useState(false)
  const [iconFailed, setIconFailed] = useState(false)
  const showPreview = previewUrl && !previewFailed
  const showIcon = iconUrl && !iconFailed
  return (
    <div className="relative aspect-[1.92/1] overflow-hidden bg-bg-tertiary">
      {showPreview ? (
        <ContentImage
          src={previewUrl}
          alt={appName}
          className="h-full w-full object-cover"
          onError={() => setPreviewFailed(true)}
        />
      ) : (
        <div className="flex h-full items-center justify-center bg-bg-tertiary">
          <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl border border-primary/20 bg-bg-primary text-primary shadow-[0_16px_32px_rgba(0,0,0,0.18)]">
            {showIcon ? (
              <DecorativeImage
                src={iconUrl}
                className="h-full w-full object-cover"
                onError={() => setIconFailed(true)}
              />
            ) : (
              <AppWindow size={25} />
            )}
          </div>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/28 to-transparent" />
      <div className="absolute bottom-2 left-2 rounded-md bg-black/42 px-2 py-1 text-[11px] font-black text-white/92 backdrop-blur">
        {appName}
      </div>
    </div>
  )
}

function ServerAppCardView({ card }: { card: ServerAppMessageCard }) {
  const { t } = useTranslation()
  const routeSearch = useSearch({ strict: false }) as Record<string, unknown>
  const route = appCardRoute(card, routeSearch)
  const iconUrl = cardAppIconUrl(card)
  const previewUrl = cardPreviewUrl(card)
  const appName = cardAppName(card)
  const content = (
    <article className="overflow-hidden rounded-xl border border-border-subtle bg-bg-primary shadow-[0_10px_28px_rgba(0,0,0,0.18)] transition hover:border-primary/25 hover:shadow-[0_14px_34px_rgba(0,0,0,0.22)]">
      <div className="px-3.5 py-3">
        <h3 className="line-clamp-2 min-h-[44px] break-words text-[16px] font-black leading-[22px] text-text-primary">
          {card.title}
        </h3>
      </div>
      <ServerAppPreview appName={appName} iconUrl={iconUrl} previewUrl={previewUrl} />
      <div className="flex h-10 items-center gap-2 border-t border-border-subtle px-3.5">
        <ServerAppIcon iconUrl={iconUrl} />
        <span className="min-w-0 flex-1 truncate text-xs font-bold text-text-secondary">
          {appName}
        </span>
        <span className="shrink-0 text-xs font-bold text-text-muted">{t('serverApps.group')}</span>
      </div>
    </article>
  )
  if (!route) return content
  return (
    <Link
      to="/servers/$serverSlug/apps/$appKey"
      params={{ serverSlug: route.server, appKey: card.appKey }}
      search={route.search}
      className="block rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/35"
    >
      {content}
    </Link>
  )
}
