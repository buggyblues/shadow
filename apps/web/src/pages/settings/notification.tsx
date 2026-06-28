import { cn } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AtSign, Bell, BellOff, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { SettingsCard, SettingsPanel } from './_shared'

const strategies = [
  {
    value: 'all' as const,
    icon: Bell,
    titleKey: 'settings.notifyAll',
    descKey: 'settings.notifyAllDesc',
  },
  {
    value: 'mention_only' as const,
    icon: AtSign,
    titleKey: 'settings.notifyMentionOnly',
    descKey: 'settings.notifyMentionOnlyDesc',
  },
  {
    value: 'none' as const,
    icon: BellOff,
    titleKey: 'settings.notifyNone',
    descKey: 'settings.notifyNoneDesc',
  },
]

export function NotificationSettings() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const { data: preference, isLoading } = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () =>
      fetchApi<{
        strategy: 'all' | 'mention_only' | 'none'
      }>('/api/notifications/preferences'),
  })

  const updateMutation = useMutation({
    mutationFn: (payload: { strategy: 'all' | 'mention_only' | 'none' }) =>
      fetchApi('/api/notifications/preferences', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] })
      queryClient.invalidateQueries({ queryKey: ['notification-scoped-unread'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const current = preference?.strategy ?? 'all'

  return (
    <SettingsPanel>
      <SettingsCard>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-2xl bg-bg-tertiary/50 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {strategies.map((item) => {
              const checked = current === item.value
              const Icon = item.icon
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => updateMutation.mutate({ strategy: item.value })}
                  className={cn(
                    'w-full flex items-center gap-4 p-4 rounded-2xl transition-all duration-200',
                    checked ? 'bg-primary/10' : 'hover:bg-bg-modifier-hover',
                  )}
                >
                  <div
                    className={cn(
                      'w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 transition-colors',
                      checked ? 'bg-primary/20 text-primary' : 'bg-bg-tertiary/50 text-text-muted',
                    )}
                  >
                    <Icon size={18} strokeWidth={2.5} />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p
                      className={cn(
                        'text-sm font-bold',
                        checked ? 'text-primary' : 'text-text-primary',
                      )}
                    >
                      {t(item.titleKey)}
                    </p>
                    <p className="text-xs text-text-muted mt-0.5">{t(item.descKey)}</p>
                  </div>
                  {checked && (
                    <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                      <Check size={14} className="text-primary" strokeWidth={3} />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </SettingsCard>

      <p className="text-xs text-text-muted px-1">{t('settings.desktopNotificationsDesc')}</p>
    </SettingsPanel>
  )
}
