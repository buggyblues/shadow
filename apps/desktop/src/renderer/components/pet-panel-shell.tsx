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
  onTabChange,
}: {
  tab: AppTab
  unreadNotificationCount: number
  unreadSubscriptionCount: number
  serviceAlertCount: number
  careAttentionCount: number
  onTabChange: (tab: AppTab) => void
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
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={tab === item}
                  aria-label={label}
                  className={
                    tab === item ? 'desktop-pet-tab-button active' : 'desktop-pet-tab-button'
                  }
                  title={label}
                  onClick={() => onTabChange(item)}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                  {attentionLabel ? (
                    <span className="desktop-pet-tab-dot" aria-label={attentionLabel} />
                  ) : null}
                </button>
              )
            })}
          </div>
        ))}
      </nav>
    </aside>
  )
}

export function PetPanelTopBar({ tab, petName }: { tab: AppTab; petName: string }) {
  const { t } = useTranslation()
  return (
    <header className="desktop-pet-panel-topbar">
      <div>
        <strong>{t(`desktopPet.tabs.${tab}`)}</strong>
        <span>{t(`desktopPet.panelSubtitle.${tab}`, { name: petName })}</span>
      </div>
      <i aria-hidden="true" />
    </header>
  )
}
