import { Button, cn } from '@shadowob/ui'
import { ChevronLeft, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { tabIcons } from '../lib/pet-tabs'
import type { AppTab } from '../pet-types'

const tabGroups: AppTab[][] = [
  ['chat', 'care', 'services'],
  ['community', 'subscriptions', 'store'],
]

export function PetPanelShell({
  tab,
  unreadNotificationCount,
  unreadSubscriptionCount,
  serviceAlertCount,
  careAttentionCount,
  avatar,
  onTabChange,
  onCollapse,
}: {
  tab: AppTab
  unreadNotificationCount: number
  unreadSubscriptionCount: number
  serviceAlertCount: number
  careAttentionCount: number
  avatar?: ReactNode
  onTabChange: (tab: AppTab) => void
  onCollapse?: () => void
}) {
  const { t } = useTranslation()

  function tabAttentionLabel(item: AppTab) {
    if (item === 'community' && unreadNotificationCount > 0) {
      return t('desktopPet.community.unread')
    }
    if (item === 'subscriptions' && unreadSubscriptionCount > 0) {
      return t('desktopPet.subscriptions.unread')
    }
    if (item === 'services' && serviceAlertCount > 0) {
      return t('desktopPet.services.unread')
    }
    if (item === 'care' && careAttentionCount > 0) {
      return t('desktopPet.care.recommendedAction')
    }
    return ''
  }

  return (
    <aside className="desktop-pet-panel-sidebar">
      <div className="desktop-pet-panel-drag-buffer" aria-hidden="true" />
      {avatar ? <div className="desktop-pet-panel-avatar-slot">{avatar}</div> : null}
      <nav className="desktop-pet-panel-nav" aria-label={t('desktopPet.app.title')}>
        {tabGroups.map((group) => (
          <div
            key={group.join('-')}
            className={['desktop-pet-tab-group', group.includes(tab) ? 'active-group' : '']
              .filter(Boolean)
              .join(' ')}
            role="tablist"
          >
            {group.map((item) => {
              const Icon = tabIcons[item]
              const label = t(`desktopPet.tabs.${item}`)
              const attentionLabel = tabAttentionLabel(item)
              return (
                <Button
                  key={item}
                  type="button"
                  role="tab"
                  variant="ghost"
                  size="sm"
                  aria-selected={tab === item}
                  aria-label={label}
                  className={cn('desktop-pet-tab-button', tab === item && 'active')}
                  title={label}
                  onClick={() => onTabChange(item)}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                  {attentionLabel ? (
                    <span className="desktop-pet-tab-dot" aria-label={attentionLabel} />
                  ) : null}
                </Button>
              )
            })}
          </div>
        ))}
      </nav>
      {onCollapse ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="desktop-pet-panel-collapse"
          aria-label={t('desktopPet.app.compact')}
          title={t('desktopPet.app.compact')}
          onClick={onCollapse}
        >
          <ChevronLeft size={16} />
          <span>{t('desktopPet.app.compact')}</span>
        </Button>
      ) : null}
    </aside>
  )
}

export function PetPanelTopBar({
  tab,
  petName,
  onClose,
}: {
  tab: AppTab
  petName: string
  onClose?: () => void
}) {
  const { t } = useTranslation()
  return (
    <header className="desktop-pet-panel-topbar">
      <div>
        <strong>{t(`desktopPet.tabs.${tab}`)}</strong>
        <span>{t(`desktopPet.panelSubtitle.${tab}`, { name: petName })}</span>
      </div>
      {onClose ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="desktop-pet-panel-close"
          aria-label={t('desktopPet.app.compact')}
          title={t('desktopPet.app.compact')}
          onClick={onClose}
        >
          <X size={16} />
        </Button>
      ) : null}
      <i aria-hidden="true" />
    </header>
  )
}
