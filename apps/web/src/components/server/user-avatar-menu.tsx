import { Button, cn } from '@shadowob/ui'
import { useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate } from '@tanstack/react-router'
import {
  Cloud,
  Coins,
  type LucideIcon,
  Maximize2,
  Minimize2,
  Monitor,
  MonitorCog,
  Palette,
  PawPrint,
  Settings,
  Shirt,
  Store,
  Wallet,
} from 'lucide-react'
import { type ReactNode, useCallback, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import type { AuthenticatedUser } from '../../lib/auth-session'
import { getDesktopSettingsBridge } from '../../lib/desktop-settings-bridge'
import { SettingsModal, type SettingsModalTab } from '../../pages/settings/settings-modal'
import { UserAvatar } from '../common/avatar'
import { NotificationBell } from '../notification/notification-bell'
import { ShrimpCoinIcon } from '../shop/ui/currency'

interface UserAvatarMenuProps {
  user: AuthenticatedUser | null | undefined
  onNavigate?: () => void
  mode?: 'web' | 'os'
  variant?: 'sidebar' | 'os-topbar'
  menuZIndex?: number
  onExit?: () => void
  onOpenProfile?: () => void
  onOpenSettings?: (tab?: SettingsModalTab) => void
  onOpenBuddy?: () => void
  onOpenCloud?: () => void
  onOpenTasks?: () => void
  onOpenWallet?: () => void
  onOpenShop?: () => void
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
}

interface UserMenuSummary {
  wallet: {
    balance: number
    frozenAmount: number
  }
  notifications: {
    unreadCount: number
  }
  buddy: {
    count: number
  }
  cloud: {
    deployedCount: number
  }
}

function AvatarMenuItem({
  icon: Icon,
  label,
  end,
  onSelect,
  className,
}: {
  icon: LucideIcon
  label: string
  end?: ReactNode
  onSelect: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-bold normal-case tracking-normal text-text-secondary outline-none transition-all hover:bg-bg-tertiary/70 hover:text-text-primary focus-visible:bg-bg-tertiary/70 focus-visible:text-text-primary',
        className,
      )}
    >
      <Icon className="h-5 w-5 shrink-0 text-text-muted" strokeWidth={2.2} />
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {end}
    </button>
  )
}

export function UserAvatarMenu({
  user,
  onNavigate,
  mode = 'web',
  variant = 'sidebar',
  menuZIndex = 100,
  onOpenProfile,
  onOpenSettings,
  onOpenBuddy,
  onOpenCloud,
  onOpenTasks,
  onOpenWallet,
  onOpenShop,
  isFullscreen,
  onToggleFullscreen,
}: UserAvatarMenuProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsModalTab>('profile')
  const avatarButtonRef = useRef<HTMLButtonElement>(null)

  const updateMenuAnchor = useCallback(() => {
    const button = avatarButtonRef.current
    if (!button) return
    setMenuAnchor(button.getBoundingClientRect())
  }, [])

  const { data: summary } = useQuery({
    queryKey: ['user-menu-summary'],
    queryFn: () => fetchApi<UserMenuSummary>('/api/auth/menu-summary'),
    enabled: menuOpen,
  })

  const currentServerSlug = (() => {
    const match = location.pathname.match(/(?:^|\/)servers\/([^/]+)/u)
    return match?.[1] ? decodeURIComponent(match[1]) : undefined
  })()

  const currentOsTarget = (() => {
    const channelMatch = location.pathname.match(/(?:^|\/)servers\/[^/]+\/channels\/([^/]+)/u)
    if (channelMatch?.[1]) return { channel: decodeURIComponent(channelMatch[1]) }
    const appMatch = location.pathname.match(/(?:^|\/)servers\/[^/]+\/space-apps\/([^/]+)/u)
    if (appMatch?.[1]) return { app: decodeURIComponent(appMatch[1]) }
    if (/(?:^|\/)servers\/[^/]+\/workspace(?:\/|$)/u.test(location.pathname)) {
      return { builtin: 'workspace' as const }
    }
    if (/(?:^|\/)servers\/[^/]+\/shop(?:\/|$)/u.test(location.pathname)) {
      return { builtin: 'shop' as const }
    }
    return {}
  })()
  const isOsMode = mode === 'os'
  const isTopBarVariant = variant === 'os-topbar'
  const desktopSettingsBridge = getDesktopSettingsBridge()
  const canOpenDesktopSettings = Boolean(desktopSettingsBridge)

  useLayoutEffect(() => {
    if (!menuOpen) return
    updateMenuAnchor()
    window.addEventListener('resize', updateMenuAnchor)
    window.addEventListener('scroll', updateMenuAnchor, true)
    return () => {
      window.removeEventListener('resize', updateMenuAnchor)
      window.removeEventListener('scroll', updateMenuAnchor, true)
    }
  }, [menuOpen, updateMenuAnchor])

  const menuPosition = (() => {
    if (!menuAnchor || typeof window === 'undefined') return { left: 96, top: 20 }
    const menuWidth = 292
    if (isTopBarVariant) {
      return {
        left: Math.max(12, Math.min(menuAnchor.left, window.innerWidth - menuWidth - 12)),
        top: Math.max(12, Math.min(menuAnchor.bottom + 8, window.innerHeight - 24)),
      }
    }
    return {
      left: Math.max(12, Math.min(menuAnchor.right + 12, window.innerWidth - menuWidth - 12)),
      top: Math.max(12, Math.min(menuAnchor.top, window.innerHeight - 24)),
    }
  })()

  if (!user) {
    return (
      <div
        className={cn('grid place-items-center', isTopBarVariant ? 'mr-1.5 h-8 w-8' : 'h-16 w-16')}
      >
        <div
          className={cn(
            'animate-pulse rounded-full bg-white/8 ring-1 ring-white/5',
            isTopBarVariant ? 'h-8 w-8' : 'h-14 w-14',
          )}
        />
      </div>
    )
  }

  const displayName = user.displayName || user.username

  const afterNavigate = () => {
    setMenuOpen(false)
    onNavigate?.()
  }

  const openSettings = (tab: SettingsModalTab) => {
    if (isOsMode && onOpenSettings) {
      onOpenSettings(tab)
      afterNavigate()
      return
    }
    setSettingsTab(tab)
    setSettingsOpen(true)
    afterNavigate()
  }

  const selectProfile = () => {
    if (isOsMode && onOpenProfile) {
      onOpenProfile()
      afterNavigate()
      return
    }
    navigate({ to: '/profile/$userId', params: { userId: user.id } })
    afterNavigate()
  }

  const selectRouteOrWindow = (windowCallback: (() => void) | undefined, route: string) => {
    if (isOsMode && windowCallback) {
      windowCallback()
      afterNavigate()
      return
    }
    navigate({ to: route })
    afterNavigate()
  }

  return (
    <>
      <div className={cn('relative shrink-0', isTopBarVariant ? 'mr-1.5 h-8 w-8' : 'h-16 w-16')}>
        <Button
          ref={avatarButtonRef}
          variant="ghost"
          size="icon"
          aria-label={t('settings.avatarMenuLabel')}
          title={t('settings.avatarMenuLabel')}
          aria-expanded={menuOpen}
          onClick={() => {
            updateMenuAnchor()
            setMenuOpen((open) => !open)
          }}
          className={cn(
            'rounded-full p-0',
            isTopBarVariant
              ? 'h-8 w-8 aspect-square overflow-hidden bg-transparent text-white transition hover:scale-[1.03] hover:bg-white/8 focus-visible:ring-2 focus-visible:ring-primary/70'
              : 'absolute left-1 top-1 z-10 h-14 w-14 overflow-visible transition-all duration-200 bouncy hover:ring-[3px] hover:ring-primary hover:shadow-[0_0_24px_rgba(0,243,255,0.4)]',
            menuOpen &&
              (isTopBarVariant
                ? 'ring-2 ring-primary/70'
                : 'ring-[3px] ring-primary/80 shadow-[0_0_24px_rgba(0,243,255,0.32)]'),
          )}
        >
          <UserAvatar
            userId={user.id}
            avatarUrl={user.avatarUrl}
            displayName={displayName}
            className={cn(
              isTopBarVariant
                ? '!h-8 !w-8 aspect-square shadow-[0_8px_24px_rgba(0,0,0,0.24)]'
                : '!h-14 !w-14 aspect-square',
            )}
            loading="eager"
          />
        </Button>

        {menuOpen &&
          typeof document !== 'undefined' &&
          createPortal(
            <>
              <button
                type="button"
                aria-label={t('common.close')}
                className="fixed inset-0 cursor-default bg-transparent"
                style={{ zIndex: menuZIndex - 1 }}
                onClick={() => setMenuOpen(false)}
              />
              <div
                style={{ left: menuPosition.left, top: menuPosition.top, zIndex: menuZIndex }}
                className="fixed max-h-[calc(100vh-24px)] w-[292px] overflow-y-auto rounded-[20px] border border-border-subtle bg-bg-secondary/95 p-2 text-text-primary shadow-[0_20px_60px_rgba(0,0,0,0.4)] backdrop-blur-xl normal-case tracking-normal"
              >
                <button
                  type="button"
                  onClick={selectProfile}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-3 rounded-2xl p-3 normal-case tracking-normal outline-none transition-all',
                    'hover:bg-primary/12 hover:text-text-primary focus-visible:bg-primary/12 focus-visible:text-text-primary',
                  )}
                >
                  <UserAvatar
                    userId={user.id}
                    avatarUrl={user.avatarUrl}
                    displayName={displayName}
                    className="h-11 w-11"
                    loading="eager"
                  />
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-[15px] font-black text-text-primary">
                      {t('settings.menuViewProfile')}
                    </span>
                    <span className="block truncate text-xs font-semibold text-text-muted">
                      @{user.username}
                    </span>
                  </span>
                </button>

                <div className="my-1.5 h-px bg-border-subtle" />

                <AvatarMenuItem
                  icon={Shirt}
                  label={t('settings.menuEditAvatar')}
                  onSelect={() => openSettings('profile')}
                />
                <AvatarMenuItem
                  icon={Palette}
                  label={t('settings.tabAppearance')}
                  onSelect={() => openSettings('appearance')}
                />
                <AvatarMenuItem
                  icon={PawPrint}
                  label={t('settings.tabBuddy')}
                  onSelect={() => selectRouteOrWindow(onOpenBuddy, '/settings/buddy')}
                  end={
                    summary?.buddy.count != null ? (
                      <span className="ml-2 shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-black text-primary">
                        {t('settings.buddyCount', {
                          count: summary.buddy.count,
                        })}
                      </span>
                    ) : null
                  }
                />
                {!isOsMode ? (
                  <AvatarMenuItem
                    icon={Monitor}
                    label={t('os.switchToOs')}
                    onSelect={() => {
                      if (currentServerSlug) {
                        navigate({
                          to: '/spaces/$serverIdOrSlug',
                          params: { serverIdOrSlug: currentServerSlug },
                          search: currentOsTarget,
                        })
                      } else {
                        navigate({ to: '/space' })
                      }
                      afterNavigate()
                    }}
                  />
                ) : null}
                {!isOsMode ? (
                  <AvatarMenuItem
                    icon={Cloud}
                    label={t('server.shadowCloud')}
                    onSelect={() => selectRouteOrWindow(onOpenCloud, '/cloud')}
                    end={
                      summary?.cloud.deployedCount != null ? (
                        <span className="ml-2 shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-black text-primary">
                          {t('settings.cloudDeployedCount', {
                            count: summary.cloud.deployedCount,
                          })}
                        </span>
                      ) : null
                    }
                  />
                ) : null}
                <AvatarMenuItem
                  icon={Coins}
                  label={t('settings.tabTasks')}
                  onSelect={() => selectRouteOrWindow(onOpenTasks, '/settings/tasks')}
                />
                <AvatarMenuItem
                  icon={Wallet}
                  label={t('settings.tabWallet')}
                  onSelect={() => selectRouteOrWindow(onOpenWallet, '/settings/wallet')}
                  end={
                    summary?.wallet.balance != null ? (
                      <span className="ml-2 inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-black tabular-nums text-warning">
                        {summary.wallet.balance.toLocaleString()}
                        <ShrimpCoinIcon size={12} className="text-warning" />
                      </span>
                    ) : null
                  }
                />
                <AvatarMenuItem
                  icon={Store}
                  label={t('settings.tabShop')}
                  onSelect={() => selectRouteOrWindow(onOpenShop, '/settings/shop')}
                />

                <div className="my-1.5 h-px bg-border-subtle" />

                <AvatarMenuItem
                  icon={Settings}
                  label={t('settings.sectionSettings')}
                  onSelect={() => openSettings('account')}
                />
                {canOpenDesktopSettings ? (
                  <AvatarMenuItem
                    icon={MonitorCog}
                    label={t('os.desktopSettings')}
                    onSelect={() => {
                      void desktopSettingsBridge?.showSettings?.('general')
                      afterNavigate()
                    }}
                  />
                ) : null}
                {isOsMode && onToggleFullscreen ? (
                  <AvatarMenuItem
                    icon={isFullscreen ? Minimize2 : Maximize2}
                    label={t(isFullscreen ? 'common.exitFullscreen' : 'os.enterFullscreenMode')}
                    onSelect={() => {
                      onToggleFullscreen()
                      afterNavigate()
                    }}
                  />
                ) : null}
              </div>
            </>,
            document.body,
          )}

        {!isTopBarVariant ? (
          <NotificationBell
            compact
            rootClassName="absolute left-[40px] top-[40px] z-[80]"
            className="avatar-notification-bell h-6 w-6 rounded-full border text-primary hover:text-primary"
            onOpenChange={(open) => {
              if (open) setMenuOpen(false)
            }}
          />
        ) : null}
      </div>

      {!isOsMode || !onOpenSettings ? (
        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          initialTab={settingsTab}
        />
      ) : null}
    </>
  )
}
