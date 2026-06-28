import { Badge, Card, CardContent, ClickableCard, cn } from '@shadowob/ui'
import { useNavigate } from '@tanstack/react-router'
import { Clock, Eye, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { UserAvatar } from '../common/avatar'
import { PriceDisplay } from '../shop/ui/currency'

export interface BuddyListingCardOwner {
  id?: string | null
  username?: string | null
  displayName?: string | null
  avatarUrl?: string | null
}

export interface BuddyListingCardData {
  id: string
  ownerId?: string | null
  title: string
  description?: string | null
  skills?: string[] | null
  tags?: string[] | null
  hourlyRate?: number | null
  viewCount?: number | null
  rentalCount?: number | null
  totalOnlineSeconds?: number | null
  owner?: BuddyListingCardOwner | null
}

interface BuddyListingCardProps {
  listing: BuddyListingCardData
  onOpen: () => void
  className?: string
}

function formatOnlineDuration(seconds?: number | null) {
  if (!seconds || seconds <= 0) return '-'
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}m`
  const hours = Math.floor(seconds / 3600)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  const remainHours = hours % 24
  return remainHours > 0 ? `${days}d ${remainHours}h` : `${days}d`
}

export function BuddyListingCard({ listing, onOpen, className }: BuddyListingCardProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const ownerProfileId = listing.owner?.id ?? listing.ownerId ?? null
  const ownerName =
    listing.owner?.displayName || listing.owner?.username || t('marketplace.provider')
  const tags = listing.skills?.length ? listing.skills : listing.tags
  const visibleTools = (tags ?? []).filter(Boolean).slice(0, 3)
  const descriptionText = listing.description?.trim() || t('marketplace.noDescription')

  return (
    <ClickableCard asChild onPress={onOpen}>
      <article
        aria-label={`${t('marketplace.viewDetails')} · ${listing.title}`}
        className={cn(
          'group block h-full cursor-pointer overflow-hidden rounded-[24px]',
          className,
        )}
      >
        <Card className="relative h-full rounded-[24px] border border-[var(--glass-line)] bg-bg-secondary/48 shadow-[0_18px_48px_rgba(0,0,0,0.18)] transition duration-300 hover:border-primary/45 hover:bg-bg-tertiary/55">
          <CardContent className="space-y-3 p-0">
            <div className="p-4 pb-3">
              <div className="flex items-start gap-3">
                <div className="relative mt-1 shrink-0">
                  <div className="rounded-full p-0.5 ring-1 ring-primary/30">
                    <UserAvatar
                      userId={ownerProfileId ?? listing.id}
                      avatarUrl={listing.owner?.avatarUrl ?? null}
                      displayName={ownerName || listing.title}
                      size="md"
                    />
                  </div>
                  <span
                    aria-label={t('marketplace.online')}
                    role="img"
                    className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[2.5px] border-bg-secondary bg-success"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-base font-black text-text-primary transition-colors group-hover:text-primary">
                    {listing.title}
                  </h3>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      if (!ownerProfileId) return
                      navigate({
                        to: '/profile/$userId',
                        params: { userId: ownerProfileId },
                      })
                    }}
                    disabled={!ownerProfileId}
                    className="mt-0.5 inline-flex max-w-full text-[11px] font-black uppercase tracking-[0.14em] text-text-muted hover:text-primary disabled:cursor-default disabled:hover:text-text-muted"
                  >
                    {t('marketplace.provider')}:
                    <span className="ml-1 truncate font-normal normal-case text-text-secondary hover:text-primary">
                      {ownerName}
                    </span>
                  </button>
                </div>

                <div className="shrink-0 self-start text-right">
                  <p className="mt-0 flex items-baseline justify-end gap-1">
                    <span className="text-[3rem] font-black leading-none text-primary">
                      <PriceDisplay amount={listing.hourlyRate ?? 0} size={40} />
                    </span>
                    <span className="text-sm font-black text-text-secondary">
                      {t('marketplace.perHour')}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            <div className="-mt-1 px-4">
              <p className="line-clamp-2 text-sm leading-7 text-text-primary">{descriptionText}</p>
            </div>

            <div className="px-4">
              <div className="mt-2">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-text-muted">
                  {t('marketplace.skills')}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {visibleTools.map((tool) => (
                    <Badge key={tool} variant="info" size="xs" className="normal-case">
                      {tool}
                    </Badge>
                  ))}
                  {visibleTools.length === 0 ? (
                    <span className="text-xs text-text-muted">
                      {t('marketplace.noDescription')}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="px-4 pb-4">
              <div className="mt-2 grid grid-cols-3 divide-x divide-white/10 rounded-[16px] border border-white/10 bg-bg-primary/45 px-1 py-2.5 text-xs text-text-secondary">
                <div className="flex min-w-0 items-center gap-1.5 px-3">
                  <Clock size={12} className="shrink-0 text-text-muted" />
                  <span className="truncate">{t('marketplace.totalOnline')}</span>
                  <span className="ml-auto font-black text-text-primary">
                    {formatOnlineDuration(listing.totalOnlineSeconds)}
                  </span>
                </div>

                <div className="flex min-w-0 items-center gap-1.5 px-3">
                  <Eye size={12} className="shrink-0 text-text-muted" />
                  <span className="truncate">{t('marketplace.views')}</span>
                  <span className="ml-auto font-black text-text-primary">
                    {listing.viewCount ?? 0}
                  </span>
                </div>

                <div className="flex min-w-0 items-center gap-1.5 px-3">
                  <RefreshCw size={12} className="shrink-0 text-text-muted" />
                  <span className="truncate">{t('marketplace.rentalCount')}</span>
                  <span className="ml-auto font-black text-text-primary">
                    {listing.rentalCount ?? 0}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </article>
    </ClickableCard>
  )
}
