import { Button, Input, Modal, ModalBody, ModalContent, ModalHeader } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  CheckCircle2,
  Cloud,
  ExternalLink,
  Globe,
  Info,
  Monitor,
  Moon,
  Save,
  Server,
  Sun,
  Unplug,
} from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { useApiClient } from '@/lib/api-context'
import { cn } from '@/lib/utils'
import { type Theme, useThemeStore } from '@/stores/theme'
import { useToast } from '@/stores/toast'

function AppearanceOption({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      variant="ghost"
      style={{
        /* dashboard-style-allow-inline: active-state conditional style */
        background: active ? 'var(--nf-bg-raised)' : 'transparent',
        borderColor: active ? 'rgba(0, 243, 255, 0.2)' : 'var(--nf-border)',
        color: active ? 'var(--color-nf-cyan)' : 'var(--nf-text-high)',
        boxShadow: active ? 'var(--nf-shadow-soft)' : 'none',
      }}
    >
      <span className="flex items-center gap-3 min-w-0">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border"
          style={{
            /* dashboard-style-allow-inline: active-state conditional style */
            background: active ? 'rgba(0, 243, 255, 0.12)' : 'var(--nf-bg-glass-2)',
            borderColor: active ? 'rgba(0, 243, 255, 0.18)' : 'var(--nf-border)',
          }}
        >
          {icon}
        </span>
        <span className="truncate text-sm font-semibold">{label}</span>
      </span>

      {active && <Check size={14} />}
    </Button>
  )
}

function AppearanceTab() {
  const { t, i18n } = useTranslation()
  const theme = useThemeStore((state) => state.theme)
  const setTheme = useThemeStore((state) => state.setTheme)
  const currentLanguage = i18n.language?.startsWith('zh') ? 'zh-CN' : 'en'

  const themeOptions: Array<{ value: Theme; label: string; icon: ReactNode }> = [
    {
      value: 'light',
      label: t('theme.light'),
      icon: <Sun size={16} />,
    },
    {
      value: 'dark',
      label: t('theme.dark'),
      icon: <Moon size={16} />,
    },
    {
      value: 'system',
      label: t('theme.system'),
      icon: <Monitor size={16} />,
    },
  ]

  const languageOptions = [
    {
      value: 'en',
      label: t('settings.languageEnglish'),
    },
    {
      value: 'zh-CN',
      label: t('settings.languageChinese'),
    },
  ]

  return (
    <div className="space-y-5">
      <div className="glass-card p-6 space-y-4">
        <div>
          <h2 className="text-sm font-bold text-text-primary">{t('settings.themeSection')}</h2>
          <p className="mt-1 text-sm text-text-muted">{t('settings.themeSectionDescription')}</p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {themeOptions.map((option) => (
            <AppearanceOption
              key={option.value}
              active={theme === option.value}
              icon={option.icon}
              label={option.label}
              onClick={() => setTheme(option.value)}
            />
          ))}
        </div>
      </div>

      <div className="glass-card p-6 space-y-4">
        <div>
          <h2 className="text-sm font-bold text-text-primary">{t('settings.languageSection')}</h2>
          <p className="mt-1 text-sm text-text-muted">{t('settings.languageSectionDescription')}</p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {languageOptions.map((option) => (
            <AppearanceOption
              key={option.value}
              active={currentLanguage === option.value}
              icon={<Globe size={16} />}
              label={option.label}
              onClick={() => i18n.changeLanguage(option.value)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── System Tab ────────────────────────────────────────────────────────────────

function SystemTab() {
  const { t } = useTranslation()

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: api.health,
  })

  const { data: doctor } = useQuery({
    queryKey: ['doctor'],
    queryFn: api.doctor,
  })

  return (
    <div className="space-y-5">
      <div className="glass-card divide-y divide-border-subtle">
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <span className="text-xs font-semibold text-text-muted">{t('settings.apiStatus')}</span>
          <span className={cn('text-sm font-semibold', health ? 'text-green-400' : 'text-red-400')}>
            {health ? t('settings.healthy') : t('settings.unknown')}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <span className="text-xs font-semibold text-text-muted">
            {t('settings.doctorChecks')}
          </span>
          <span className="text-sm text-text-primary">
            {doctor
              ? `${doctor.checks.filter((c) => c.status === 'pass').length}/${doctor.checks.length} ${t('settings.passing')}`
              : t('common.none')}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <span className="text-xs font-semibold text-text-muted">
            {t('settings.dashboardPort')}
          </span>
          <span className="text-sm font-mono text-text-primary">
            {window.location.port || '80'}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <span className="text-xs font-semibold text-text-muted">{t('settings.apiEndpoint')}</span>
          <span className="text-sm font-mono text-text-primary">{window.location.origin}/api</span>
        </div>
      </div>

      <div className="glass-card p-5">
        <h3 className="mb-4 text-sm font-bold text-text-primary">{t('settings.environment')}</h3>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-text-muted">{t('settings.userAgent')}</span>
            <span className="max-w-xs truncate font-mono text-micro text-text-secondary">
              {navigator.userAgent.split(' ').slice(-2).join(' ')}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">{t('settings.language')}</span>
            <span className="text-text-secondary">{navigator.language}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">{t('settings.timezone')}</span>
            <span className="text-text-secondary">
              {Intl.DateTimeFormat().resolvedOptions().timeZone}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── About Tab ─────────────────────────────────────────────────────────────────

function AboutTab() {
  const { t } = useTranslation()

  return (
    <div className="space-y-5">
      <div className="glass-card p-6">
        <div className="mb-4 flex items-center gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full"
            style={{
              background: 'rgba(0, 243, 255, 0.12)',
              border: '1px solid rgba(0, 243, 255, 0.18)',
              boxShadow: '0 10px 24px rgba(0, 198, 209, 0.14)',
            }}
          >
            <Cloud size={24} style={{ color: 'var(--color-nf-cyan)' }} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-text-primary">
              {t('nav.shadowCloud')} {t('nav.console')}
            </h3>
            <p className="text-xs text-text-muted">{t('settings.consoleTagline')}</p>
          </div>
        </div>
        <p className="text-sm leading-7 text-text-secondary">{t('settings.aboutDescription')}</p>
      </div>

      <div className="glass-card divide-y divide-border-subtle">
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <span className="text-xs font-semibold text-text-muted">{t('settings.platform')}</span>
          <span className="text-sm text-text-primary">{t('nav.shadowCloud')}</span>
        </div>
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <span className="text-xs font-semibold text-text-muted">{t('settings.interface')}</span>
          <span className="text-sm text-text-secondary">{t('settings.consoleWeb')}</span>
        </div>
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <span className="text-xs font-semibold text-text-muted">{t('settings.license')}</span>
          <span className="text-sm text-text-secondary">MIT</span>
        </div>
      </div>

      <div className="glass-card p-5">
        <h3 className="mb-4 text-sm font-bold text-text-primary">{t('settings.quickLinks')}</h3>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm">
            <a href="https://github.com/nicepkg/shadow" target="_blank" rel="noopener noreferrer">
              {t('settings.gitHubRepository')}
            </a>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <a href="https://shadow.nicepkg.cn" target="_blank" rel="noopener noreferrer">
              {t('settings.documentation')}
            </a>
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Community Tab ──────────────────────────────────────────────────────────────

function CommunityTab() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const toast = useToast()
  const apiClient = useApiClient()

  const { data, isLoading } = useQuery({
    queryKey: ['community-settings'],
    queryFn: apiClient.community.getSettings,
    retry: 0,
  })

  const [baseUrl, setBaseUrl] = useState('')
  const [token, setToken] = useState('')

  // Initialise inputs once data loads (only on first load)
  const effectiveBaseUrl = baseUrl || data?.baseUrl || 'https://shadowob.com'

  const saveMutation = useMutation({
    mutationFn: () =>
      apiClient.community.putSettings({
        baseUrl: baseUrl || undefined,
        token: token || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-settings'] })
      setToken('')
      toast.success(t('settings.communitySaved'))
    },
  })

  const handleOAuth = async () => {
    try {
      const { url } = await apiClient.community.oauthInit()
      const popup = window.open(url, 'community-oauth', 'width=800,height=600')

      const handleMessage = (event: MessageEvent) => {
        if (event.data?.type === 'community-oauth-success') {
          window.removeEventListener('message', handleMessage)
          popup?.close()
          queryClient.invalidateQueries({ queryKey: ['community-settings'] })
          toast.success(t('settings.communityOAuthSuccess'))
        }
      }

      window.addEventListener('message', handleMessage)
    } catch {
      toast.error(t('settings.communityOAuthError'))
    }
  }

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-text-muted">{t('common.loading')}</div>
  }

  const isConnected = data?.oauthConnected || data?.hasToken

  return (
    <div className="space-y-5">
      {/* Connection status */}
      <div className="glass-card p-5">
        <div className="mb-4 flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full"
            style={{
              background: isConnected ? 'rgba(0, 243, 255, 0.12)' : 'rgba(255, 255, 255, 0.06)',
              border: isConnected
                ? '1px solid rgba(0, 243, 255, 0.24)'
                : '1px solid rgba(255,255,255,0.1)',
            }}
          >
            {isConnected ? (
              <CheckCircle2 size={18} style={{ color: 'var(--color-nf-cyan)' }} />
            ) : (
              <Unplug size={18} className="text-text-muted" />
            )}
          </div>
          <div>
            <h3 className="text-sm font-bold text-text-primary">
              {isConnected ? t('settings.communityConnected') : t('settings.communityNotConnected')}
            </h3>
            <p className="text-xs text-text-muted">{data?.baseUrl ?? 'https://shadowob.com'}</p>
          </div>
        </div>
        <p className="text-sm leading-6 text-text-secondary">
          {t('settings.communityDescription')}
        </p>
      </div>

      {/* Server URL */}
      <div className="glass-card space-y-4 p-5">
        <h3 className="text-sm font-bold text-text-primary">{t('settings.communityServer')}</h3>
        <div className="space-y-2">
          <label className="text-xs font-semibold text-text-muted">
            {t('settings.communityBaseUrl')}
          </label>
          <Input
            value={baseUrl || data?.baseUrl || ''}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://shadowob.com"
            className="font-mono text-sm"
          />
          <p className="text-xs text-text-muted">{t('settings.communityBaseUrlHint')}</p>
        </div>

        {/* Token */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-text-muted">
            {t('settings.communityToken')}
            {data?.hasToken && (
              <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary">
                {t('settings.communityTokenSet')}
              </span>
            )}
          </label>
          <Input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={data?.hasToken ? '••••••••' : t('settings.communityTokenPlaceholder')}
            className="font-mono text-sm"
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            data-form-type="other"
          />
          <p className="text-xs text-text-muted">{t('settings.communityTokenHint')}</p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            size="sm"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            <Save size={14} className="mr-1.5" />
            {saveMutation.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </div>

      {/* OAuth */}
      <div className="glass-card p-5">
        <h3 className="mb-2 text-sm font-bold text-text-primary">{t('settings.communityOAuth')}</h3>
        <p className="mb-4 text-xs text-text-secondary">{t('settings.communityOAuthHint')}</p>
        <Button variant="secondary" size="sm" onClick={handleOAuth}>
          <ExternalLink size={14} className="mr-1.5" />
          {t('settings.connectViaOAuth')}
        </Button>
      </div>

      {/* Quick link to community */}
      <div className="glass-card p-5">
        <h3 className="mb-2 text-sm font-bold text-text-primary">
          {t('settings.communityBrowse')}
        </h3>
        <p className="mb-3 text-xs text-text-secondary">{t('settings.communityBrowseHint')}</p>
        <Button asChild variant="secondary" size="sm">
          <a href={effectiveBaseUrl} target="_blank" rel="noopener noreferrer">
            <Globe size={14} className="mr-1.5" />
            {t('settings.openCommunity')}
          </a>
        </Button>
      </div>
    </div>
  )
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export function SettingsModal({
  open,
  onClose,
  initialTab = 'community',
}: {
  open: boolean
  onClose: () => void
  initialTab?: string
}) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState(initialTab)

  useEffect(() => {
    if (open) setActiveTab(initialTab)
  }, [open, initialTab])

  const tabs = [
    { id: 'community', label: t('settings.community'), icon: Globe },
    { id: 'appearance', label: t('settings.appearance'), icon: Monitor },
    { id: 'system', label: t('settings.system'), icon: Server },
    { id: 'about', label: t('settings.about'), icon: Info },
  ]

  const activeTabDef = tabs.find((t) => t.id === activeTab) ?? tabs[0]!
  const ActiveTabIcon = activeTabDef.icon

  return (
    <Modal open={open} onClose={onClose}>
      <ModalContent
        maxWidth="max-w-4xl"
        className="h-[min(85vh,720px)] flex flex-col overflow-hidden"
      >
        <ModalHeader
          overline={t('nav.settings')}
          icon={<ActiveTabIcon size={18} />}
          title={activeTabDef.label}
          closeLabel={t('common.close')}
        />
        <ModalBody className="flex flex-1 min-h-0 overflow-hidden p-0">
          {/* Left nav */}
          <nav className="w-48 shrink-0 border-r border-border-subtle p-4 flex flex-col overflow-y-auto space-y-1">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id
              const TabIcon = tab.icon
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-full px-3 py-2 text-[13px] font-bold transition-all duration-200',
                    isActive
                      ? 'bg-primary/15 text-primary'
                      : 'text-text-secondary hover:bg-bg-modifier-hover hover:text-text-primary',
                  )}
                >
                  <TabIcon
                    size={15}
                    className={cn(
                      'shrink-0 transition-colors',
                      isActive ? 'text-primary' : 'text-text-muted',
                    )}
                  />
                  <span className="truncate">{tab.label}</span>
                </button>
              )
            })}
          </nav>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'appearance' && <AppearanceTab />}
            {activeTab === 'community' && <CommunityTab />}
            {activeTab === 'system' && <SystemTab />}
            {activeTab === 'about' && <AboutTab />}
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}
