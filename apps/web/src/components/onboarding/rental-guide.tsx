import { Button, Card } from '@shadowob/ui'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowRight, Check, Cpu, Info, Monitor, Zap } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { showToast } from '../../lib/toast'

interface RentalGuideProps {
  onRentSuccess: (listingId: string, contractId: string) => void
  onBack: () => void
}

interface Listing {
  id: string
  title: string
  deviceTier: 'high_end' | 'mid_range' | 'low_end'
  osType: 'macos' | 'windows' | 'linux'
  hourlyRate: number
  deviceInfo: { model?: string; cpu?: string; ram?: string }
  totalOnlineSeconds: number
}

const TIER_CONFIG = {
  high_end: { icon: Zap, color: 'text-warning', bg: 'bg-warning/10' },
  mid_range: { icon: Cpu, color: 'text-primary', bg: 'bg-primary/10' },
  low_end: { icon: Monitor, color: 'text-success', bg: 'bg-success/10' },
}

export function RentalGuide({ onRentSuccess, onBack }: RentalGuideProps) {
  const { t } = useTranslation()
  const [rentingId, setRentingId] = useState<string | null>(null)

  // Fetch recommended listings (popular ones)
  const { data, isLoading } = useQuery({
    queryKey: ['marketplace', 'listings', 'recommended'],
    queryFn: () =>
      fetchApi<{ listings: Listing[] }>('/api/marketplace/listings?sortBy=popular&limit=3'),
  })

  const listings = data?.listings || []

  const rentMutation = useMutation({
    mutationFn: (listingId: string) =>
      fetchApi<{ id: string }>('/api/marketplace/contracts', {
        method: 'POST',
        body: JSON.stringify({
          listingId,
          durationHours: 24, // Default to 24h as a "trial" or starter pack
          agreedToTerms: true,
        }),
      }),
    onSuccess: (data, variables) => {
      setRentingId(null)
      showToast(t('onboarding.rental.success', '签约成功！'), 'success')
      onRentSuccess(variables, data.id)
    },
    onError: (err) => {
      setRentingId(null)
      showToast(t('onboarding.rental.error', '签约失败，请重试'), 'error')
    },
  })

  const handleRent = (listingId: string) => {
    setRentingId(listingId)
    rentMutation.mutate(listingId)
  }

  return (
    <div className="flex flex-col h-full bg-bg-secondary p-6 md:p-8 animate-in slide-in-from-right duration-300">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-text-primary mb-2">
          {t('onboarding.rental.title')}
        </h2>
        <p className="text-text-muted max-w-lg mx-auto">{t('onboarding.rental.desc')}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-1 -mx-4 md:-mx-8 md:px-8">
        <h3 className="text-sm font-black text-text-muted uppercase tracking-widest mb-4 flex items-center gap-2">
          <Info size={16} />
          {t('onboarding.rental.recommend')}
        </h3>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-48 bg-bg-tertiary animate-pulse rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-8">
            {listings.map((listing) => {
              const TierIcon = TIER_CONFIG[listing.deviceTier]?.icon || Monitor
              const tierColor = TIER_CONFIG[listing.deviceTier]?.color || 'text-text-muted'
              const tierBg = TIER_CONFIG[listing.deviceTier]?.bg || 'bg-bg-tertiary'

              return (
                <Card
                  key={listing.id}
                  variant="glass"
                  hoverable
                  className="!rounded-[40px] flex flex-col group relative overflow-hidden"
                >
                  <div className="p-5 flex flex-col flex-1">
                    <div className="flex items-start justify-between mb-4">
                      <div className={`p-3 rounded-2xl ${tierBg} ${tierColor}`}>
                        <TierIcon size={24} />
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-black text-text-primary">
                          ¥{listing.hourlyRate}
                          <span className="text-xs text-text-muted font-bold">/h</span>
                        </div>
                      </div>
                    </div>

                    <h3
                      className="font-black text-text-primary mb-1 line-clamp-1"
                      title={listing.title}
                    >
                      {listing.title}
                    </h3>

                    <div className="text-xs text-text-muted font-bold mb-6 space-y-1">
                      <p>{listing.deviceInfo.model || 'Unknown Model'}</p>
                      <p>{listing.osType === 'macos' ? 'macOS' : 'Windows'}</p>
                    </div>

                    <Button
                      variant="primary"
                      size="md"
                      className="mt-auto w-full"
                      onClick={() => handleRent(listing.id)}
                      disabled={rentingId === listing.id}
                      loading={rentingId === listing.id}
                      iconRight={rentingId === listing.id ? undefined : ArrowRight}
                    >
                      {t('onboarding.rental.rentButton')}
                    </Button>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      <div className="border-t border-border-subtle pt-4 mt-auto flex justify-center">
        <Button variant="ghost" onClick={onBack}>
          {t('common.cancel', '取消')}
        </Button>
      </div>
    </div>
  )
}
