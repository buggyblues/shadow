import { cn } from '@shadowob/ui'
import { Bell, Code2, type LucideIcon, Paintbrush, Rss, Shield, User } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AccountSettings } from '../settings/account'
import { AppearanceSettings } from '../settings/appearance'
import { ContentSubscriptionsSettings } from '../settings/content-subscriptions'
import { DeveloperSettings } from '../settings/developer'
import { NotificationSettings } from '../settings/notification'
import { ProfileSettings } from '../settings/profile'
import type { SettingsModalTab } from '../settings/settings-modal'

const OS_SETTINGS_TABS: Array<{
  id: SettingsModalTab
  icon: LucideIcon
  labelKey: string
}> = [
  { id: 'profile', icon: User, labelKey: 'settings.tabProfile' },
  { id: 'account', icon: Shield, labelKey: 'settings.tabAccount' },
  { id: 'appearance', icon: Paintbrush, labelKey: 'settings.tabAppearance' },
  { id: 'notification', icon: Bell, labelKey: 'settings.tabNotification' },
  { id: 'subscriptions', icon: Rss, labelKey: 'settings.tabSubscriptions' },
  { id: 'developer', icon: Code2, labelKey: 'settings.tabDeveloper' },
]

export function OsSettingsWindowContent({
  initialTab = 'profile',
}: {
  initialTab?: SettingsModalTab
}) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<SettingsModalTab>(initialTab)

  return (
    <div className="flex h-full min-w-0 flex-1 overflow-hidden bg-bg-primary">
      <nav className="w-56 shrink-0 overflow-y-auto border-r border-border-subtle bg-bg-secondary/72 p-3">
        <div className="space-y-1">
          {OS_SETTINGS_TABS.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex h-10 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm font-black transition',
                  isActive
                    ? 'bg-primary/15 text-primary'
                    : 'text-text-muted hover:bg-bg-tertiary/72 hover:text-text-primary',
                )}
              >
                <tab.icon
                  className={cn('h-4 w-4 shrink-0', isActive ? 'text-primary' : 'text-text-muted')}
                  strokeWidth={2.3}
                />
                <span className="min-w-0 truncate">{t(tab.labelKey)}</span>
              </button>
            )
          })}
        </div>
      </nav>

      <div className="min-w-0 flex-1 overflow-y-auto p-5">
        {activeTab === 'profile' && <ProfileSettings />}
        {activeTab === 'account' && <AccountSettings />}
        {activeTab === 'appearance' && <AppearanceSettings />}
        {activeTab === 'notification' && <NotificationSettings />}
        {activeTab === 'subscriptions' && <ContentSubscriptionsSettings />}
        {activeTab === 'developer' && <DeveloperSettings />}
      </div>
    </div>
  )
}
