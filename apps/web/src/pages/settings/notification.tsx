import { Card, cn, SectionHeader } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AtSign, Bell, BellOff, Check, Settings2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'

const strategies = [
  {
    value: 'all' as const,
    icon: Bell,
    titleKey: 'settings.notifyAll',
    titleFallback: '全部通知',
    descKey: 'settings.notifyAllDesc',
    descFallback: '接收提及、回复与系统通知。',
  },
  {
    value: 'mention_only' as const,
    icon: AtSign,
    titleKey: 'settings.notifyMentionOnly',
    titleFallback: '仅提及',
    descKey: 'settings.notifyMentionOnlyDesc',
    descFallback: '只接收 @提及 和系统消息。',
  },
  {
    value: 'none' as const,
    icon: BellOff,
    titleKey: 'settings.notifyNone',
    titleFallback: '仅系统',
    descKey: 'settings.notifyNoneDesc',
    descFallback: '屏蔽消息类通知，仅保留系统通知。',
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

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <SectionHeader
        title={t('settings.notificationTitle', '通知设置')}
        description={t('settings.notificationDesc', '管理通知策略')}
        icon={Bell}
      />

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-[24px] bg-bg-tertiary/50 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {strategies.map((item) => {
            const Icon = item.icon
            const checked = (preference?.strategy ?? 'all') === item.value
            return (
              <Card
                key={item.value}
                variant="glass"
                hoverable
                active={checked}
                className={cn(
                  'cursor-pointer transition-all duration-300',
                  checked && 'ring-1 ring-primary/30',
                )}
                onClick={() => updateMutation.mutate({ strategy: item.value })}
              >
                <div className="flex items-center gap-4 p-5">
                  <div
                    className={cn(
                      'w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-colors',
                      checked ? 'bg-primary/20 text-primary' : 'bg-bg-tertiary/50 text-text-muted',
                    )}
                  >
                    <Icon size={22} strokeWidth={2.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        'text-sm font-black',
                        checked ? 'text-primary' : 'text-text-primary',
                      )}
                    >
                      {t(item.titleKey, item.titleFallback)}
                    </p>
                    <p className="text-xs text-text-muted mt-0.5">
                      {t(item.descKey, item.descFallback)}
                    </p>
                  </div>
                  {checked && (
                    <div className="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                      <Check size={16} className="text-primary" strokeWidth={3} />
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Desktop Preferences */}
      <Card variant="surface" className="p-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-bg-tertiary/50 flex items-center justify-center shrink-0">
            <Settings2 size={22} className="text-text-muted" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-text-primary">
              {t('settings.desktopNotifications', '桌面通知偏好')}
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              {t('settings.desktopNotificationsDesc', '频道静音可在频道列表右键菜单中设置。')}
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
