/**
 * Aggregated settings modal — low-frequency settings accessed via avatar click.
 * Contains: Profile, Account, Appearance, Notification, Developer tabs.
 */
import { cn, Dialog, DialogContent } from '@shadowob/ui'
import { useNavigate } from '@tanstack/react-router'
import { Bell, Code2, LogOut, Paintbrush, Shield, User, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { disconnectSocket } from '../../lib/socket'
import { useAuthStore } from '../../stores/auth.store'
import { AccountSettings } from './account'
import { AppearanceSettings } from './appearance'
import { DeveloperSettings } from './developer'
import { NotificationSettings } from './notification'
import { ProfileSettings } from './profile'

type ModalTab = 'profile' | 'account' | 'appearance' | 'notification' | 'developer'

const MODAL_TABS: {
  id: ModalTab
  icon: typeof User
  labelKey: string
  labelFallback: string
}[] = [
  { id: 'profile', icon: User, labelKey: 'settings.tabProfile', labelFallback: '修改资料' },
  { id: 'account', icon: Shield, labelKey: 'settings.tabAccount', labelFallback: '账号与安全' },
  {
    id: 'appearance',
    icon: Paintbrush,
    labelKey: 'settings.tabAppearance',
    labelFallback: '外观',
  },
  {
    id: 'notification',
    icon: Bell,
    labelKey: 'settings.tabNotification',
    labelFallback: '通知',
  },
  {
    id: 'developer',
    icon: Code2,
    labelKey: 'settings.tabDeveloper',
    labelFallback: '开发者',
  },
]

export function SettingsModal({
  open,
  onClose,
  initialTab = 'profile',
}: {
  open: boolean
  onClose: () => void
  initialTab?: ModalTab
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { logout } = useAuthStore()
  const [activeTab, setActiveTab] = useState<ModalTab>(initialTab)
  const activeTabMeta = MODAL_TABS.find((tab) => tab.id === activeTab) ?? MODAL_TABS[0]!

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab)
    }
  }, [initialTab, open])

  return (
    <Dialog isOpen={open} onClose={onClose}>
      <DialogContent
        maxWidth="max-w-4xl"
        hideCloseButton
        className="h-[min(85vh,720px)] p-0 flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between gap-4 border-b border-border-subtle/80 bg-bg-secondary/20 px-5 py-4 backdrop-blur-xl shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-text-muted/50">
              {t('settings.sectionSettings', '设置')}
            </p>
            <h2 className="text-sm font-black tracking-tight text-text-primary truncate">
              {t(activeTabMeta.labelKey, activeTabMeta.labelFallback)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border-subtle bg-[var(--glass-bg)] text-text-muted shadow-[var(--shadow-soft)] transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:bg-bg-tertiary/60 hover:text-text-primary active:scale-95"
            aria-label={t('common.close', '关闭')}
          >
            <X size={18} strokeWidth={2.6} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
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
                    <span className="truncate">{t(tab.labelKey, tab.labelFallback)}</span>
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
                <span>{t('settings.logout', '退出登录')}</span>
              </button>
            </div>
          </nav>

          {/* Content area */}
          <div className="flex-1 min-w-0 overflow-y-auto p-6">
            {activeTab === 'profile' && <ProfileSettings />}
            {activeTab === 'account' && <AccountSettings />}
            {activeTab === 'appearance' && <AppearanceSettings />}
            {activeTab === 'notification' && <NotificationSettings />}
            {activeTab === 'developer' && <DeveloperSettings />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
