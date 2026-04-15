import { Button, Input } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  Cloud,
  Globe,
  Info,
  Key,
  Monitor,
  Moon,
  Plus,
  Save,
  Server,
  Sun,
  Trash2,
} from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageShell } from '@/components/PageShell'
import { api, type ProviderSettings, type Settings } from '@/lib/api'
import { API_PRESETS } from '@/lib/presets'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app'
import { type Theme, useThemeStore } from '@/stores/theme'
import { useToast } from '@/stores/toast'

function getProviderSecretEnvName(providerId: string): string {
  return `${providerId.toUpperCase().replace(/-/g, '_')}_API_KEY`
}

// ── Provider Card ─────────────────────────────────────────────────────────────

function ProviderCard({
  provider,
  onChange,
  onRemove,
}: {
  provider: ProviderSettings
  onChange: (updated: ProviderSettings) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="glass-surface space-y-4 rounded-[26px] border border-border-subtle p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-base font-semibold text-text-primary">{provider.id}</p>
          <p className="truncate text-xs font-mono text-text-muted">{provider.api}</p>
        </div>
        <Button
          type="button"
          onClick={onRemove}
          variant="ghost"
          size="icon"
          className="text-text-muted border-border-subtle"
        >
          <Trash2 size={14} />
        </Button>
      </div>

      <div className="space-y-2">
        <div className="rounded-[20px] border border-border-subtle bg-bg-secondary/50 px-4 py-3">
          <p className="mb-1 text-micro font-semibold uppercase tracking-[0.18em] text-text-muted">
            {t('settings.secretEnvKey')}
          </p>
          <code className="break-all text-xs font-mono" style={{ color: 'var(--color-nf-yellow)' }}>
            {getProviderSecretEnvName(provider.id)}
          </code>
          <p className="mt-2 text-label text-text-muted">
            {t('settings.credentialsManagedInSecrets')}
          </p>
        </div>

        {provider.baseUrl !== undefined && (
          <div>
            <label
              htmlFor={`baseurl-${provider.id}`}
              className="mb-1.5 block text-xs font-semibold text-text-muted"
            >
              {t('settings.baseUrl')}
            </label>
            <Input
              id={`baseurl-${provider.id}`}
              type="text"
              value={provider.baseUrl ?? ''}
              onChange={(e) => onChange({ ...provider, baseUrl: e.target.value })}
              placeholder="https://api.example.com/v1"
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Providers Tab ─────────────────────────────────────────────────────────────

function ProvidersTab({
  providers,
  setProviders,
  data,
  mutation,
}: {
  providers: ProviderSettings[]
  setProviders: (p: ProviderSettings[]) => void
  data: Settings | undefined
  mutation: ReturnType<typeof useMutation<{ ok: boolean }, Error, Settings>>
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const addActivity = useAppStore((s) => s.addActivity)

  const addProvider = (preset: (typeof API_PRESETS)[number]) => {
    const newProvider: ProviderSettings = {
      id: preset.id,
      api: preset.api,
      ...(preset.baseUrl ? { baseUrl: preset.baseUrl } : {}),
    }
    setProviders([...providers, newProvider])
  }

  const updateProvider = (index: number, updated: ProviderSettings) => {
    const next = [...providers]
    next[index] = updated
    setProviders(next)
  }

  const removeProvider = (index: number) => {
    setProviders(providers.filter((_, i) => i !== index))
  }

  const handleSave = () => {
    mutation.mutate(
      { ...(data ?? {}), providers },
      {
        onSuccess: () => {
          toast.success(t('settings.settingsSaved'))
          addActivity({
            type: 'config',
            title: t('settings.updatedProviderSettings'),
            detail: t('settings.configuredProviders', { count: providers.length }),
          })
        },
        onError: () => toast.error(t('settings.settingsSaveFailed')),
      },
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="max-w-2xl text-sm leading-7 text-text-muted">
          {t('settings.configureProvidersMetadata')}
        </p>
        <div className="relative group">
          <Button type="button" variant="secondary" size="sm">
            <Plus size={12} />
            {t('settings.addProvider')}
          </Button>
          <div className="absolute right-0 top-full z-10 mt-2 hidden min-w-52 overflow-hidden rounded-[20px] border border-border-subtle shadow-xl group-hover:block bg-bg-secondary">
            {API_PRESETS.map((preset) => (
              <Button
                type="button"
                key={preset.id}
                onClick={() => addProvider(preset)}
                variant="ghost"
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div
        className="rounded-[22px] border px-4 py-3 text-sm leading-6"
        style={{
          background: 'rgba(0, 243, 255, 0.08)',
          borderColor: 'rgba(0, 243, 255, 0.16)',
          color: 'var(--nf-text-mid)' /* dashboard-style-allow-inline */,
        }}
      >
        {t('settings.credentialsMoveNotice')}
      </div>

      {providers.length === 0 && (
        <div className="glass-surface rounded-[26px] border border-dashed border-border-strong px-6 py-10 text-center text-sm text-text-muted">
          <Key size={24} className="mx-auto mb-3 text-text-muted" />
          {t('settings.noProvidersConfigured')}
        </div>
      )}

      <div className="space-y-3">
        {providers.map((provider, i) => (
          <ProviderCard
            key={`${provider.id}-${i}`}
            provider={provider}
            onChange={(updated) => updateProvider(i, updated)}
            onRemove={() => removeProvider(i)}
          />
        ))}
      </div>

      {providers.length > 0 && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={mutation.isPending}
          >
            <Save size={14} />
            {mutation.isPending ? t('common.saving') : t('settings.saveSettings')}
          </Button>
        </div>
      )}
    </div>
  )
}

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

// ── Main Page ─────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('providers')

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: api.settings.get,
  })

  const [localProviders, setLocalProviders] = useState<ProviderSettings[] | null>(null)
  const currentProviders: ProviderSettings[] = localProviders ?? data?.providers ?? []

  const mutation = useMutation({
    mutationFn: (settings: Settings) => api.settings.put(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  const tabs = [
    { id: 'providers', label: t('settings.providers'), icon: Key },
    { id: 'appearance', label: t('settings.appearance'), icon: Monitor },
    { id: 'system', label: t('settings.system'), icon: Server },
    { id: 'about', label: t('settings.about'), icon: Info },
  ]

  return (
    <PageShell breadcrumb={[{ label: t('nav.settings') }]} title={t('nav.settings')} narrow>
      <div className="glass-panel p-5">
        <div className="flex min-h-0 gap-6">
          {/* Left nav */}
          <nav className="w-44 shrink-0 space-y-1">
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
          <div className="min-w-0 flex-1">
            {isLoading && (
              <div className="py-12 text-center text-sm text-text-muted">{t('common.loading')}</div>
            )}
            {!isLoading && (
              <>
                {activeTab === 'providers' && (
                  <ProvidersTab
                    providers={currentProviders}
                    setProviders={setLocalProviders}
                    data={data}
                    mutation={mutation}
                  />
                )}
                {activeTab === 'appearance' && <AppearanceTab />}
                {activeTab === 'system' && <SystemTab />}
                {activeTab === 'about' && <AboutTab />}
              </>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  )
}
