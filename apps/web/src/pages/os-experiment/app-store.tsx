import { Button, cn, Input, Search as SearchField } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, Search, ShieldCheck, Store, Trash2 } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useConfirmStore } from '../../components/common/confirm-dialog'
import { fetchApi } from '../../lib/api'
import { showToast } from '../../lib/toast'
import { AppIcon } from './components'
import type { ServerAppIntegration } from './types'
import { OS_GC_MS, OS_STALE_MS } from './utils'

interface OsServerAppManifest {
  name: string
  description?: string | null
  iconUrl?: string | null
  commands?: Array<{ permission: string }>
}

interface OsServerAppDiscovery {
  manifest: OsServerAppManifest
  installed: ServerAppIntegration | null
  permissions: Array<{ permission: string }>
}

interface OsServerAppCatalogEntry {
  id: string
  appKey: string
  name: string
  description?: string | null
  iconUrl?: string | null
  installed: ServerAppIntegration | null
}

type OsAppStoreTab = 'explore' | 'installed'

function appStoreErrorMessage(error: unknown, t: (key: string) => string) {
  const message = error instanceof Error ? error.message : ''
  if (message.toLowerCase().includes('private')) return t('serverApps.privateUrlError')
  return message || t('serverApps.installFailed')
}

function OsAppRow({
  app,
  action,
}: {
  app: Pick<ServerAppIntegration, 'id' | 'name' | 'description' | 'iconUrl'>
  action: ReactNode
}) {
  const { t } = useTranslation()

  return (
    <div className="group grid h-[116px] w-full min-w-0 grid-cols-[44px_minmax(0,1fr)] gap-3 rounded-[16px] border border-white/10 bg-white/[0.035] p-3 transition hover:border-white/18 hover:bg-white/[0.055]">
      <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[12px] bg-white/8 text-text-muted shadow-[0_10px_24px_rgba(0,0,0,0.18)]">
        <AppIcon iconUrl={app.iconUrl} className="rounded-[12px]" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="min-w-0 truncate text-sm font-black text-text-primary">{app.name}</span>
        <span className="mt-1 block truncate text-xs font-semibold leading-5 text-text-muted">
          {app.description || t('serverApps.noDescription')}
        </span>
        <span className="mt-auto flex min-w-0 justify-end pt-3">{action}</span>
      </span>
    </div>
  )
}

function AppGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid w-full min-w-0 gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))]">
      {children}
    </div>
  )
}

function LoadingAppStoreState() {
  return (
    <div className="grid h-full min-h-[220px] w-full min-w-0 place-items-center text-text-muted">
      <Loader2 size={20} className="animate-spin" />
    </div>
  )
}

function EmptyAppStoreState({ icon, title }: { icon: ReactNode; title: ReactNode }) {
  return (
    <div className="grid h-full min-h-[220px] w-full min-w-0 place-items-center px-6 text-center">
      <div>
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-border-subtle bg-bg-secondary/70 text-text-muted">
          {icon}
        </div>
        <p className="mt-4 text-sm font-black text-text-primary">{title}</p>
      </div>
    </div>
  )
}

function AppStoreHeader({
  tab,
  appSearch,
  showManifestInstaller,
  onTabChange,
  onSearchChange,
  onToggleManifestInstaller,
}: {
  tab: OsAppStoreTab
  appSearch: string
  showManifestInstaller: boolean
  onTabChange: (tab: OsAppStoreTab) => void
  onSearchChange: (value: string) => void
  onToggleManifestInstaller: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="flex w-full min-w-0 shrink-0 flex-col gap-3 border-b border-white/10 bg-black/18 px-4 py-3 lg:flex-row lg:items-center">
      <div className="flex shrink-0 items-center gap-1 rounded-xl border border-white/10 bg-white/[0.035] p-1">
        {(['explore', 'installed'] as OsAppStoreTab[]).map((key) => (
          <button
            type="button"
            key={key}
            onClick={() => onTabChange(key)}
            className={cn(
              'h-8 rounded-lg px-3 text-xs font-black transition',
              tab === key
                ? 'bg-primary text-bg-primary shadow-[0_10px_24px_rgba(0,198,209,0.24)]'
                : 'text-text-muted hover:bg-white/8 hover:text-text-primary',
            )}
          >
            {key === 'explore' ? t('os.appStoreExploreTab') : t('os.appStoreInstalledTab')}
          </button>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <SearchField
          type="search"
          value={appSearch}
          onChange={onSearchChange}
          placeholder={t('serverApps.searchPlaceholder')}
          aria-label={t('serverApps.searchPlaceholder')}
        />
      </div>
      <Button
        variant={showManifestInstaller ? 'primary' : 'glass'}
        size="icon"
        onClick={onToggleManifestInstaller}
        className="h-10 w-10 shrink-0 rounded-xl p-0"
        title={t('serverApps.customInstall')}
        aria-label={t('serverApps.customInstall')}
      >
        <Plus size={16} />
      </Button>
    </div>
  )
}

function ManifestInstaller({
  manifestUrl,
  discovery,
  discoverError,
  isDiscovering,
  isInstalling,
  onManifestUrlChange,
  onDiscover,
  onInstall,
}: {
  manifestUrl: string
  discovery: OsServerAppDiscovery | null
  discoverError: unknown
  isDiscovering: boolean
  isInstalling: boolean
  onManifestUrlChange: (value: string) => void
  onDiscover: () => void
  onInstall: () => void
}) {
  const { t } = useTranslation()
  const manifestInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      manifestInputRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [])

  return (
    <div className="w-full min-w-0 border-b border-white/10 bg-black/14 px-4 py-3">
      <div className="flex w-full min-w-0 flex-col gap-2 lg:flex-row lg:items-center">
        <Input
          ref={manifestInputRef}
          value={manifestUrl}
          onChange={(event) => onManifestUrlChange(event.target.value)}
          placeholder={t('serverApps.manifestUrl')}
          className="h-10 min-w-0 flex-1 rounded-xl border-white/10 bg-black/24 text-sm"
        />
        <Button
          variant="glass"
          size="sm"
          disabled={!manifestUrl.trim() || isDiscovering}
          loading={isDiscovering}
          onClick={onDiscover}
          className="h-10 rounded-xl px-3"
        >
          <Search size={14} />
          {t('serverApps.discoverButton')}
        </Button>
      </div>
      {discoverError instanceof Error ? (
        <p className="mt-2 text-xs font-semibold text-danger">
          {appStoreErrorMessage(discoverError, t)}
        </p>
      ) : null}
      {discovery ? (
        <div className="mt-3 w-full min-w-0 rounded-[16px] border border-primary/25 bg-primary/10 p-2">
          <OsAppRow
            app={{
              id: discovery.manifest.name,
              name: discovery.manifest.name,
              description: discovery.manifest.description,
              iconUrl: discovery.manifest.iconUrl,
            }}
            action={
              <Button
                variant="primary"
                size="sm"
                disabled={isInstalling}
                loading={isInstalling}
                onClick={onInstall}
                className="h-8 rounded-full px-3 text-xs"
              >
                <ShieldCheck size={13} />
                {t('serverApps.authorizeInstall')}
              </Button>
            }
          />
          {discovery.permissions.length > 0 ? (
            <div className="mt-2 flex max-h-12 flex-wrap gap-1 overflow-hidden">
              {discovery.permissions.map((permission) => (
                <span
                  key={permission.permission}
                  className="rounded-full border border-border-subtle bg-bg-primary/60 px-2 py-0.5 text-[10px] font-bold text-text-muted"
                >
                  {permission.permission}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function OsAppStoreContent({
  serverSlug,
  apps,
  isLoading,
  onOpenApp,
}: {
  serverSlug: string
  apps: ServerAppIntegration[]
  isLoading: boolean
  onOpenApp: (app: ServerAppIntegration) => void
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<OsAppStoreTab>('explore')
  const [appSearch, setAppSearch] = useState('')
  const [manifestUrl, setManifestUrl] = useState('')
  const [discovery, setDiscovery] = useState<OsServerAppDiscovery | null>(null)
  const [showManifestInstaller, setShowManifestInstaller] = useState(false)

  const { data: catalog = [], isLoading: isCatalogLoading } = useQuery({
    queryKey: ['server-app-catalog', serverSlug, i18n.language],
    queryFn: () => fetchApi<OsServerAppCatalogEntry[]>(`/api/servers/${serverSlug}/apps/catalog`),
    enabled: Boolean(serverSlug),
    staleTime: OS_STALE_MS,
    gcTime: OS_GC_MS,
  })

  const invalidateApps = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['os-server-apps', serverSlug] })
    queryClient.invalidateQueries({ queryKey: ['server-apps', serverSlug] })
    queryClient.invalidateQueries({ queryKey: ['server-app-summaries', serverSlug] })
    queryClient.invalidateQueries({ queryKey: ['server-app-catalog', serverSlug] })
  }, [queryClient, serverSlug])

  const discoverApp = useMutation({
    mutationFn: () =>
      fetchApi<OsServerAppDiscovery>(`/api/servers/${serverSlug}/apps/discover`, {
        method: 'POST',
        body: JSON.stringify({ manifestUrl: manifestUrl.trim() }),
      }),
    onSuccess: (result) => setDiscovery(result),
  })

  const installCustomApp = useMutation({
    mutationFn: () =>
      fetchApi<ServerAppIntegration>(`/api/servers/${serverSlug}/apps`, {
        method: 'POST',
        body: JSON.stringify({
          manifestUrl: manifestUrl.trim(),
          manifest: discovery?.manifest,
        }),
      }),
    onSuccess: (result) => {
      setManifestUrl('')
      setDiscovery(null)
      setShowManifestInstaller(false)
      setTab('installed')
      invalidateApps()
      onOpenApp(result)
      showToast(t('serverApps.installSuccess'), 'success')
    },
    onError: (error) => showToast(appStoreErrorMessage(error, t), 'error'),
  })

  const installCatalogApp = useMutation({
    mutationFn: (entry: OsServerAppCatalogEntry) =>
      fetchApi<ServerAppIntegration>(
        `/api/servers/${serverSlug}/apps/catalog/${entry.id}/install`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        },
      ),
    onSuccess: (result) => {
      setTab('installed')
      invalidateApps()
      onOpenApp(result)
      showToast(t('serverApps.installSuccess'), 'success')
    },
    onError: (error) => showToast(appStoreErrorMessage(error, t), 'error'),
  })

  const uninstallApp = useMutation({
    mutationFn: (app: ServerAppIntegration) =>
      fetchApi(`/api/servers/${serverSlug}/apps/${app.appKey}`, {
        method: 'DELETE',
      }),
    onSuccess: (_result, app) => {
      queryClient.removeQueries({ queryKey: ['server-app-detail', serverSlug, app.appKey] })
      invalidateApps()
      showToast(t('serverApps.uninstallSuccess'), 'success')
    },
    onError: (error) =>
      showToast(error instanceof Error ? error.message : t('serverApps.installFailed'), 'error'),
  })

  const handleUninstall = useCallback(
    async (app: ServerAppIntegration) => {
      const ok = await useConfirmStore.getState().confirm({
        title: t('serverApps.uninstallConfirmTitle'),
        message: t('serverApps.uninstallConfirmMessage', { name: app.name }),
        confirmLabel: t('serverApps.uninstallApp'),
        danger: true,
      })
      if (ok) uninstallApp.mutate(app)
    },
    [t, uninstallApp],
  )

  const normalizedSearch = appSearch.trim().toLowerCase()
  const matchesSearch = (
    app: Pick<ServerAppIntegration, 'name' | 'description' | 'appKey'> | OsServerAppCatalogEntry,
  ) => {
    if (!normalizedSearch) return true
    return [app.name, app.description, 'appKey' in app ? app.appKey : null]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedSearch))
  }
  const visibleCatalog = catalog.filter(matchesSearch)
  const visibleInstalled = apps.filter(matchesSearch)

  const renderList = () => {
    if (tab === 'explore') {
      if (isCatalogLoading) return <LoadingAppStoreState />
      if (visibleCatalog.length === 0) {
        return (
          <EmptyAppStoreState
            icon={<Search size={21} />}
            title={normalizedSearch ? t('common.noResults') : t('serverApps.catalogEmpty')}
          />
        )
      }

      return (
        <AppGrid>
          {visibleCatalog.map((entry) => (
            <OsAppRow
              key={entry.id}
              app={entry}
              action={
                <Button
                  variant={entry.installed ? 'glass' : 'primary'}
                  size="sm"
                  disabled={Boolean(entry.installed) || installCatalogApp.isPending}
                  loading={installCatalogApp.isPending}
                  onClick={() => installCatalogApp.mutate(entry)}
                  className="h-8 rounded-full px-3 text-xs"
                >
                  {entry.installed
                    ? t('serverApps.alreadyInstalled')
                    : t('serverApps.installFromCatalog')}
                </Button>
              }
            />
          ))}
        </AppGrid>
      )
    }

    if (isLoading) return <LoadingAppStoreState />
    if (visibleInstalled.length === 0) {
      return (
        <EmptyAppStoreState
          icon={normalizedSearch ? <Search size={21} /> : <Store size={21} />}
          title={normalizedSearch ? t('common.noResults') : t('serverApps.noInstalled')}
        />
      )
    }

    return (
      <AppGrid>
        {visibleInstalled.map((app) => (
          <OsAppRow
            key={app.id}
            app={app}
            action={
              <span className="flex items-center gap-2">
                <Button
                  variant="glass"
                  size="sm"
                  onClick={() => onOpenApp(app)}
                  className="h-8 rounded-full px-3 text-xs"
                >
                  {t('serverApps.openApp')}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={uninstallApp.isPending}
                  loading={uninstallApp.isPending}
                  onClick={() => void handleUninstall(app)}
                  className="h-8 rounded-full px-3 text-xs"
                >
                  <Trash2 size={13} />
                  {t('serverApps.uninstallApp')}
                </Button>
              </span>
            }
          />
        ))}
      </AppGrid>
    )
  }

  return (
    <div className="flex h-full w-full min-w-0 flex-col bg-bg-base">
      <AppStoreHeader
        tab={tab}
        appSearch={appSearch}
        showManifestInstaller={showManifestInstaller}
        onTabChange={setTab}
        onSearchChange={setAppSearch}
        onToggleManifestInstaller={() => setShowManifestInstaller((current) => !current)}
      />
      {showManifestInstaller ? (
        <ManifestInstaller
          manifestUrl={manifestUrl}
          discovery={discovery}
          discoverError={discoverApp.error}
          isDiscovering={discoverApp.isPending}
          isInstalling={installCustomApp.isPending}
          onManifestUrlChange={setManifestUrl}
          onDiscover={() => discoverApp.mutate()}
          onInstall={() => installCustomApp.mutate()}
        />
      ) : null}
      <div className="min-h-0 w-full min-w-0 flex-1 overflow-auto p-4">{renderList()}</div>
    </div>
  )
}
