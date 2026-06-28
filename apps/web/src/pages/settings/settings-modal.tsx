/**
 * Aggregated settings modal — low-frequency settings accessed via avatar click.
 * Contains: Profile, Account, Appearance, Notification, Developer tabs.
 */
import { cn, Modal, ModalBody, ModalContent, ModalHeader } from '@shadowob/ui'
import { useNavigate } from '@tanstack/react-router'
import { Bell, Code2, LogOut, Paintbrush, Rss, Shield, User } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { disconnectSocket } from '../../lib/socket'
import { useAuthStore } from '../../stores/auth.store'
import { AccountSettings } from './account'
import { AppearanceSettings } from './appearance'
import { ContentSubscriptionsSettings } from './content-subscriptions'
import { DeveloperSettings } from './developer'
import { NotificationSettings } from './notification'
import { ProfileSettings } from './profile'

export type SettingsModalTab =
  | 'profile'
  | 'account'
  | 'appearance'
  | 'notification'
  | 'subscriptions'
  | 'developer'

const MODAL_TABS: {
  id: SettingsModalTab
  icon: typeof User
  labelKey: string
}[] = [
  { id: 'profile', icon: User, labelKey: 'settings.tabProfile' },
  { id: 'account', icon: Shield, labelKey: 'settings.tabAccount' },
  {
    id: 'appearance',
    icon: Paintbrush,
    labelKey: 'settings.tabAppearance',
  },
  {
    id: 'notification',
    icon: Bell,
    labelKey: 'settings.tabNotification',
  },
  {
    id: 'subscriptions',
    icon: Rss,
    labelKey: 'settings.tabSubscriptions',
  },
  {
    id: 'developer',
    icon: Code2,
    labelKey: 'settings.tabDeveloper',
  },
]

export function SettingsModal({
  open,
  onClose,
  initialTab = 'profile',
}: {
  open: boolean
  onClose: () => void
  initialTab?: SettingsModalTab
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { logout } = useAuthStore()
  const [activeTab, setActiveTab] = useState<SettingsModalTab>(initialTab)
  const activeTabMeta = MODAL_TABS.find((tab) => tab.id === activeTab) ?? MODAL_TABS[0]!
  const ActiveTabIcon = activeTabMeta.icon

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab)
    }
  }, [initialTab, open])

  return (
    <Modal open={open} onClose={onClose}>
      <ModalContent
        maxWidth="max-w-4xl"
        className="h-[min(85vh,720px)] flex flex-col overflow-hidden"
      >
        <ModalHeader
          overline={t('settings.sectionSettings')}
          icon={<ActiveTabIcon size={18} strokeWidth={2.4} />}
          title={t(activeTabMeta.labelKey)}
          closeLabel={t('common.close')}
        />

        <ModalBody className="flex flex-1 min-h-0 overflow-hidden p-0">
          {/* Sidebar tabs */}
          <nav className="w-48 shrink-0 border-r border-border-subtle p-4 flex flex-col overflow-y-auto">
            <div className="space-y-1 flex-1">
              {MODAL_TABS.map((tab) => {
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2 rounded-full text-[13px] font-bold transition-all duration-200',
                      isActive
                        ? 'bg-primary/15 text-primary'
                        : 'text-text-secondary hover:bg-bg-tertiary/50 hover:text-text-primary',
                    )}
                  >
                    <tab.icon
                      className={cn(
                        'w-4 h-4 shrink-0 transition-colors',
                        isActive ? 'text-primary' : 'text-text-muted',
                      )}
                      strokeWidth={2.2}
                    />
                    <span className="truncate">{t(tab.labelKey)}</span>
                  </button>
                )
              })}
            </div>

            {/* Logout at bottom of modal sidebar */}
            <div className="pt-3 mt-3 border-t border-border-subtle">
              <button
                type="button"
                onClick={() => {
                  disconnectSocket()
                  logout()
                  navigate({ to: '/login' })
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-full text-[13px] font-bold text-text-muted hover:text-danger hover:bg-danger/10 transition-all duration-200"
              >
                <LogOut className="w-4 h-4 shrink-0" strokeWidth={2.2} />
                <span>{t('settings.logout')}</span>
              </button>
            </div>
          </nav>

          {/* Content area */}
          <div className="flex-1 min-w-0 overflow-y-auto p-6">
            {activeTab === 'profile' && <ProfileSettings />}
            {activeTab === 'account' && <AccountSettings />}
            {activeTab === 'appearance' && <AppearanceSettings />}
            {activeTab === 'notification' && <NotificationSettings />}
            {activeTab === 'subscriptions' && <ContentSubscriptionsSettings />}
            {activeTab === 'developer' && <DeveloperSettings />}
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}
