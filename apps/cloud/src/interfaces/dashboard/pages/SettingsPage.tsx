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
import { Button, Input, Tabs, TabsList, TabsTrigger } from '@shadowob/ui'
import { Breadcrumb } from '@/components/Breadcrumb'
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
    <div
      className="space-y-4 rounded-[26px] border p-4"
      style={{
        background: 'var(--nf-bg-glass-2)',
        borderColor: 'var(--nf-border)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-base font-black" style={{ color: 'var(--nf-text-high)' }}>
            {provider.id}
          </p>
          <p className="truncate text-xs font-mono" style={{ color: 'var(--nf-text-muted)' }}>
            {provider.api}
          </p>
        </div>
        <Button
          type="button"
          onClick={onRemove}
          variant="ghost"
          size="icon"
          style={{
            color: 'var(--nf-text-muted)',
            borderColor: 'var(--nf-border)',
            background: 'var(--nf-bg-raised)',
          }}
        >
          <Trash2 size={14} />
        </Button>
      </div>

      <div className="space-y-2">
        <div
          className="rounded-[20px] border px-4 py-3"
          style={{
            background: 'var(--nf-bg-raised)',
            borderColor: 'var(--nf-border)',
          }}
        >
          <p
            className="mb-1 text-[10px] font-black uppercase tracking-[0.18em]"
            style={{ color: 'var(--nf-text-muted)' }}
          >
            {t('settings.secretEnvKey')}
          </p>
          <code className="break-all text-xs font-mono" style={{ color: 'var(--color-nf-yellow)' }}>
            {getProviderSecretEnvName(provider.id)}
          </code>
          <p className="mt-2 text-[11px]" style={{ color: 'var(--nf-text-muted)' }}>
            {t('settings.credentialsManagedInSecrets')}
          </p>
        </div>

        {provider.baseUrl !== undefined && (
          <div>
            <label
              htmlFor={`baseurl-${provider.id}`}
              className="mb-1.5 block text-xs font-semibold"
              style={{ color: 'var(--nf-text-muted)' }}
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
          toast.success('Settings saved')
          addActivity({
            type: 'config',
            title: 'Updated provider settings',
            detail: `${providers.length} provider(s) configured`,
          })
        },
        onError: () => toast.error('Failed to save settings'),
      },
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="max-w-2xl text-sm leading-7" style={{ color: 'var(--nf-text-muted)' }}>
          {t('settings.configureProvidersMetadata')}
        </p>
        <div className="relative group">
          <Button type="button" variant="secondary" size="sm">
            <Plus size={12} />
            {t('settings.addProvider')}
          </Button>
          <div
            className="absolute right-0 top-full z-10 mt-2 hidden min-w-52 overflow-hidden rounded-[20px] border shadow-xl group-hover:block"
            style={{
              background: 'var(--nf-bg-surface)',
              borderColor: 'var(--nf-border)',
              boxShadow: 'var(--nf-shadow-card)',
            }}
          >
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
          color: 'var(--nf-text-mid)',
        }}
      >
        {t('settings.credentialsMoveNotice')}
      </div>

      {providers.length === 0 && (
        <div
          className="rounded-[26px] border border-dashed px-6 py-10 text-center text-sm"
          style={{
            background: 'var(--nf-bg-glass-2)',
            borderColor: 'var(--nf-border-strong)',
            color: 'var(--nf-text-muted)',
          }}
        >
          <Key size={24} className="mx-auto mb-3" style={{ color: 'var(--nf-text-muted)' }} />
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
      <div className="nf-card !p-6 space-y-4">
        <div>
          <h2 className="text-sm font-black" style={{ color: 'var(--nf-text-high)' }}>
            {t('settings.themeSection')}
          </h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--nf-text-muted)' }}>
            {t('settings.themeSectionDescription')}
          </p>
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

      <div className="nf-card !p-6 space-y-4">
        <div>
          <h2 className="text-sm font-black" style={{ color: 'var(--nf-text-high)' }}>
            {t('settings.languageSection')}
          </h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--nf-text-muted)' }}>
            {t('settings.languageSectionDescription')}
          </p>
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
      <div
        className="nf-card !p-0 divide-y divide-gray-800/50"
        style={{ borderColor: 'var(--nf-border)' }}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <span className="text-xs font-semibold" style={{ color: 'var(--nf-text-muted)' }}>
            API Status
          </span>
          <span className={cn('text-sm font-semibold', health ? 'text-green-400' : 'text-red-400')}>
            {health ? 'Healthy' : 'Unknown'}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <span className="text-xs font-semibold" style={{ color: 'var(--nf-text-muted)' }}>
            Doctor Checks
          </span>
          <span className="text-sm" style={{ color: 'var(--nf-text-high)' }}>
            {doctor
              ? `${doctor.checks.filter((c) => c.status === 'pass').length}/${doctor.checks.length} passing`
              : '—'}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <span className="text-xs font-semibold" style={{ color: 'var(--nf-text-muted)' }}>
            Dashboard Port
          </span>
          <span className="text-sm font-mono" style={{ color: 'var(--nf-text-high)' }}>
            {window.location.port || '80'}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <span className="text-xs font-semibold" style={{ color: 'var(--nf-text-muted)' }}>
            API Endpoint
          </span>
          <span className="text-sm font-mono" style={{ color: 'var(--nf-text-high)' }}>
            {window.location.origin}/api
          </span>
        </div>
      </div>

      <div className="nf-card !p-5">
        <h3 className="mb-4 text-sm font-black" style={{ color: 'var(--nf-text-high)' }}>
          Environment
        </h3>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span style={{ color: 'var(--nf-text-muted)' }}>User Agent</span>
            <span
              className="max-w-xs truncate font-mono text-[10px]"
              style={{ color: 'var(--nf-text-mid)' }}
            >
              {navigator.userAgent.split(' ').slice(-2).join(' ')}
            </span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--nf-text-muted)' }}>Language</span>
            <span style={{ color: 'var(--nf-text-mid)' }}>{navigator.language}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--nf-text-muted)' }}>Timezone</span>
            <span style={{ color: 'var(--nf-text-mid)' }}>
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
  return (
    <div className="space-y-5">
      <div className="nf-card !p-6">
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
            <h3 className="text-lg font-black" style={{ color: 'var(--nf-text-high)' }}>
              Shadow Cloud Console
            </h3>
            <p className="text-xs" style={{ color: 'var(--nf-text-muted)' }}>
              AI Agent Cluster Management Platform
            </p>
          </div>
        </div>
        <p className="text-sm leading-7" style={{ color: 'var(--nf-text-mid)' }}>
          Shadow Cloud Console provides full lifecycle management for AI agent clusters on
          Kubernetes. Deploy, monitor, scale, and manage your agent teams with an intuitive
          cloud-native interface.
        </p>
      </div>

      <div
        className="nf-card !p-0 divide-y divide-gray-800/50"
        style={{ borderColor: 'var(--nf-border)' }}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <span className="text-xs font-semibold" style={{ color: 'var(--nf-text-muted)' }}>
            Platform
          </span>
          <span className="text-sm" style={{ color: 'var(--nf-text-high)' }}>
            Shadow Cloud
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <span className="text-xs font-semibold" style={{ color: 'var(--nf-text-muted)' }}>
            Interface
          </span>
          <span className="text-sm" style={{ color: 'var(--nf-text-mid)' }}>
            Console (Web)
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <span className="text-xs font-semibold" style={{ color: 'var(--nf-text-muted)' }}>
            License
          </span>
          <span className="text-sm" style={{ color: 'var(--nf-text-mid)' }}>
            MIT
          </span>
        </div>
      </div>

      <div className="nf-card !p-5">
        <h3 className="mb-4 text-sm font-black" style={{ color: 'var(--nf-text-high)' }}>
          Quick Links
        </h3>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm">
            <a href="https://github.com/nicepkg/shadow" target="_blank" rel="noopener noreferrer">
              GitHub Repository →
            </a>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <a href="https://shadow.nicepkg.cn" target="_blank" rel="noopener noreferrer">
              Documentation →
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
    { id: 'providers', label: t('settings.providers'), icon: <Key size={13} /> },
    { id: 'appearance', label: t('settings.appearance'), icon: <Monitor size={13} /> },
    { id: 'system', label: t('settings.system'), icon: <Server size={13} /> },
    { id: 'about', label: t('settings.about'), icon: <Info size={13} /> },
  ]

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6">
      <Breadcrumb items={[{ label: t('nav.settings') }]} className="mb-1" />

      <div>
        <h1
          className="text-[30px] font-black tracking-[-0.03em]"
          style={{ color: 'var(--nf-text-high)' }}
        >
          {t('nav.settings')}
        </h1>
        <p className="mt-1 text-sm leading-7" style={{ color: 'var(--nf-text-muted)' }}>
          {t('settings.pageDescription')}
        </p>
      </div>

      {isLoading && (
        <div className="py-12 text-center text-sm" style={{ color: 'var(--nf-text-muted)' }}>
          {t('common.loading')}
        </div>
      )}

      {!isLoading && (
        <>
          <Tabs value={activeTab} onChange={setActiveTab}>
            <TabsList>
              {tabs.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id}>
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

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
  )
}
