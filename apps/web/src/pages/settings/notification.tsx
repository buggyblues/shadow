import { cn, Switch } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AtSign, Bell, BellOff, Check, Mail, Monitor, Smartphone } from 'lucide-react'
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

type AppChannel = 'in_app' | 'mobile_push' | 'web_push' | 'email'
type SpaceAppPreference = {
  serverId: string
  serverName: string
  appKey: string
  appName: string
  appIconUrl: string | null
  topicKey: string
  title: string
  description: string | null
  enabled: boolean
  channels: AppChannel[]
}

const appChannels = [
  { value: 'in_app' as const, icon: Monitor, labelKey: 'settings.spaceAppNotificationInApp' },
  {
    value: 'mobile_push' as const,
    icon: Smartphone,
    labelKey: 'settings.spaceAppNotificationMobile',
  },
  { value: 'web_push' as const, icon: Bell, labelKey: 'settings.spaceAppNotificationBrowser' },
  { value: 'email' as const, icon: Mail, labelKey: 'settings.spaceAppNotificationEmail' },
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
  const { data: appPreferences = [], isLoading: isLoadingApps } = useQuery({
    queryKey: ['space-app-notification-preferences'],
    queryFn: () => fetchApi<SpaceAppPreference[]>('/api/notifications/space-app-preferences'),
  })
  const updateAppMutation = useMutation({
    mutationFn: (payload: {
      serverId: string
      appKey: string
      topicKey: string
      enabled?: boolean
      channels?: AppChannel[]
    }) =>
      fetchApi('/api/notifications/space-app-preferences', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['space-app-notification-preferences'] }),
  })
  const groupedApps = Object.values(
    appPreferences.reduce<
      Record<string, { key: string; app: SpaceAppPreference; topics: SpaceAppPreference[] }>
    >((groups, item) => {
      const key = `${item.serverId}:${item.appKey}`
      groups[key] ??= { key, app: item, topics: [] }
      groups[key].topics.push(item)
      return groups
    }, {}),
  )

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

      <div className="px-1 pt-2">
        <h3 className="text-sm font-bold text-text-primary">
          {t('settings.spaceAppNotificationsTitle')}
        </h3>
        <p className="mt-1 text-xs text-text-muted">{t('settings.spaceAppNotificationsDesc')}</p>
      </div>

      {isLoadingApps ? (
        <SettingsCard>
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-20 rounded-2xl bg-bg-tertiary/50 animate-pulse" />
            ))}
          </div>
        </SettingsCard>
      ) : groupedApps.length === 0 ? (
        <SettingsCard>
          <p className="p-3 text-sm text-text-muted">{t('settings.spaceAppNotificationsEmpty')}</p>
        </SettingsCard>
      ) : (
        groupedApps.map((group) => (
          <SettingsCard key={group.key}>
            <div className="flex items-center gap-3 border-b border-border/60 px-3 pb-3">
              {group.app.appIconUrl ? (
                <img
                  src={group.app.appIconUrl}
                  alt=""
                  className="h-9 w-9 rounded-xl object-cover"
                />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Bell size={17} />
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-text-primary">{group.app.appName}</p>
                <p className="truncate text-xs text-text-muted">{group.app.serverName}</p>
              </div>
            </div>
            <div className="divide-y divide-border/50">
              {group.topics.map((topic) => (
                <div key={topic.topicKey} className="px-3 py-3.5">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-text-primary">{topic.title}</p>
                      {topic.description && (
                        <p className="mt-0.5 text-xs leading-5 text-text-muted">
                          {topic.description}
                        </p>
                      )}
                    </div>
                    <Switch
                      checked={topic.enabled}
                      onCheckedChange={(enabled) =>
                        updateAppMutation.mutate({
                          serverId: topic.serverId,
                          appKey: topic.appKey,
                          topicKey: topic.topicKey,
                          enabled,
                        })
                      }
                    />
                  </div>
                  {topic.enabled && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {appChannels.map((channel) => {
                        const active = topic.channels.includes(channel.value)
                        const Icon = channel.icon
                        return (
                          <button
                            key={channel.value}
                            type="button"
                            title={t(channel.labelKey)}
                            aria-label={t(channel.labelKey)}
                            onClick={() => {
                              const channels = active
                                ? topic.channels.filter((value) => value !== channel.value)
                                : [...topic.channels, channel.value]
                              if (channels.length === 0) return
                              updateAppMutation.mutate({
                                serverId: topic.serverId,
                                appKey: topic.appKey,
                                topicKey: topic.topicKey,
                                channels,
                              })
                            }}
                            className={cn(
                              'inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold transition-colors',
                              active
                                ? 'bg-primary/12 text-primary'
                                : 'bg-bg-tertiary/60 text-text-muted hover:text-text-primary',
                            )}
                          >
                            <Icon size={14} />
                            {t(channel.labelKey)}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </SettingsCard>
        ))
      )}

      <p className="text-xs text-text-muted px-1">{t('settings.desktopNotificationsDesc')}</p>
    </SettingsPanel>
  )
}
