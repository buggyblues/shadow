import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Cloud, Info, Key, Plus, Save, Server, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Breadcrumb } from '@/components/Breadcrumb'
import { Tabs } from '@/components/Tabs'
import { api, type ProviderSettings, type Settings } from '@/lib/api'
import { API_PRESETS } from '@/lib/presets'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app'
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
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{provider.id}</p>
          <p className="text-xs text-gray-500 font-mono">{provider.api}</p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-gray-600 hover:text-red-400 transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="space-y-2">
        <div className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-1">
            {t('settings.secretEnvKey')}
          </p>
          <code className="text-xs font-mono text-yellow-400/90 break-all">
            {getProviderSecretEnvName(provider.id)}
          </code>
          <p className="text-[11px] text-gray-600 mt-2">
            {t('settings.credentialsManagedInSecrets')}
          </p>
        </div>

        {provider.baseUrl !== undefined && (
          <div>
            <label htmlFor={`baseurl-${provider.id}`} className="text-xs text-gray-500 block mb-1">
              {t('settings.baseUrl')}
            </label>
            <input
              id={`baseurl-${provider.id}`}
              type="text"
              value={provider.baseUrl ?? ''}
              onChange={(e) => onChange({ ...provider, baseUrl: e.target.value })}
              placeholder="https://api.example.com/v1"
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-1.5 text-sm font-mono text-gray-300 placeholder-gray-600 focus:outline-none focus:border-blue-500"
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{t('settings.configureProvidersMetadata')}</p>
        <div className="relative group">
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs border border-gray-700 hover:border-gray-500 text-gray-400 hover:text-white rounded-lg px-3 py-1.5 transition-colors"
          >
            <Plus size={12} />
            {t('settings.addProvider')}
          </button>
          <div className="absolute right-0 top-full mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-10 min-w-48 hidden group-hover:block">
            {API_PRESETS.map((preset) => (
              <button
                type="button"
                key={preset.id}
                onClick={() => addProvider(preset)}
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-800 text-gray-300 first:rounded-t-lg last:rounded-b-lg"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-blue-950/20 border border-blue-900/30 rounded-lg p-4 text-xs text-blue-300">
        {t('settings.credentialsMoveNotice')}
      </div>

      {providers.length === 0 && (
        <div className="bg-gray-900 border border-dashed border-gray-700 rounded-lg p-8 text-center text-sm text-gray-600">
          <Key size={24} className="mx-auto mb-2 text-gray-700" />
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
          <button
            type="button"
            onClick={handleSave}
            disabled={mutation.isPending}
            className={cn(
              'flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg transition-colors',
              mutation.isPending
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 text-white',
            )}
          >
            <Save size={14} />
            {mutation.isPending ? t('common.saving') : t('settings.saveSettings')}
          </button>
        </div>
      )}
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
    <div className="space-y-6">
      <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800">
        <div className="px-5 py-3 flex items-center justify-between">
          <span className="text-xs text-gray-500">API Status</span>
          <span className={cn('text-sm', health ? 'text-green-400' : 'text-red-400')}>
            {health ? 'Healthy' : 'Unknown'}
          </span>
        </div>
        <div className="px-5 py-3 flex items-center justify-between">
          <span className="text-xs text-gray-500">Doctor Checks</span>
          <span className="text-sm">
            {doctor
              ? `${doctor.checks.filter((c) => c.status === 'pass').length}/${doctor.checks.length} passing`
              : '—'}
          </span>
        </div>
        <div className="px-5 py-3 flex items-center justify-between">
          <span className="text-xs text-gray-500">Dashboard Port</span>
          <span className="text-sm font-mono text-gray-400">{window.location.port || '80'}</span>
        </div>
        <div className="px-5 py-3 flex items-center justify-between">
          <span className="text-xs text-gray-500">API Endpoint</span>
          <span className="text-sm font-mono text-gray-400">{window.location.origin}/api</span>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
        <h3 className="text-sm font-medium mb-3">Environment</h3>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-500">User Agent</span>
            <span className="text-gray-400 font-mono text-[10px] max-w-xs truncate">
              {navigator.userAgent.split(' ').slice(-2).join(' ')}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Language</span>
            <span className="text-gray-400">{navigator.language}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Timezone</span>
            <span className="text-gray-400">
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
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-blue-900/20 to-purple-900/20 border border-gray-800 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <Cloud size={28} className="text-blue-400" />
          <div>
            <h3 className="text-lg font-bold">Shadow Cloud Console</h3>
            <p className="text-xs text-gray-500">AI Agent Cluster Management Platform</p>
          </div>
        </div>
        <p className="text-sm text-gray-400 leading-relaxed">
          Shadow Cloud Console provides full lifecycle management for AI agent clusters on
          Kubernetes. Deploy, monitor, scale, and manage your agent teams with an intuitive
          cloud-native interface.
        </p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800">
        <div className="px-5 py-3 flex items-center justify-between">
          <span className="text-xs text-gray-500">Platform</span>
          <span className="text-sm">Shadow Cloud</span>
        </div>
        <div className="px-5 py-3 flex items-center justify-between">
          <span className="text-xs text-gray-500">Interface</span>
          <span className="text-sm text-gray-400">Console (Web)</span>
        </div>
        <div className="px-5 py-3 flex items-center justify-between">
          <span className="text-xs text-gray-500">License</span>
          <span className="text-sm text-gray-400">MIT</span>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
        <h3 className="text-sm font-medium mb-3">Quick Links</h3>
        <div className="space-y-2">
          <a
            href="https://github.com/nicepkg/shadow"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            GitHub Repository →
          </a>
          <a
            href="https://shadow.nicepkg.cn"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            Documentation →
          </a>
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
    { id: 'system', label: t('settings.system'), icon: <Server size={13} /> },
    { id: 'about', label: t('settings.about'), icon: <Info size={13} /> },
  ]

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Breadcrumb items={[{ label: t('nav.settings') }]} className="mb-4" />

      <div className="mb-6">
        <h1 className="text-xl font-bold">{t('nav.settings')}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{t('settings.configureProvidersMetadata')}</p>
      </div>

      {isLoading && (
        <div className="text-center text-gray-500 text-sm py-12">{t('common.loading')}</div>
      )}

      {!isLoading && (
        <>
          <Tabs items={tabs} active={activeTab} onChange={setActiveTab} className="mb-6" />

          {activeTab === 'providers' && (
            <ProvidersTab
              providers={currentProviders}
              setProviders={setLocalProviders}
              data={data}
              mutation={mutation}
            />
          )}
          {activeTab === 'system' && <SystemTab />}
          {activeTab === 'about' && <AboutTab />}
        </>
      )}
    </div>
  )
}
