import { Button, cn, Input } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, Search, ShieldCheck, Store, Trash2 } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useConfirmStore } from '../../components/common/confirm-dialog'
import { useOsWindowHeaderSearch } from '../../components/window/window-header-tools'
import { fetchApi } from '../../lib/api'
import { showToast } from '../../lib/toast'
import { AppIcon } from './components'
import type { SpaceAppInstallation } from './types'
import { OS_GC_MS, OS_STALE_MS } from './utils'

interface OsSpaceAppManifest {
  name: string
  description?: string | null
  iconUrl?: string | null
  commands?: Array<{ permission: string }>
}

interface OsSpaceAppDiscovery {
  manifest: OsSpaceAppManifest
  installed: SpaceAppInstallation | null
  permissions: Array<{ permission: string }>
}

interface OsSpaceAppCatalogEntry {
  id: string
  appKey: string
  name: string
  description?: string | null
  iconUrl?: string | null
  installed: SpaceAppInstallation | null
}

type OsAppStoreTab = 'explore' | 'installed'

function appStoreErrorMessage(error: unknown, t: (key: string) => string) {
  const message = error instanceof Error ? error.message : ''
  if (message.toLowerCase().includes('private')) return t('spaceApps.privateUrlError')
  return message || t('spaceApps.installFailed')
}

function OsAppRow({
  app,
  action,
}: {
  app: Pick<SpaceAppInstallation, 'id' | 'name' | 'description' | 'iconUrl'>
  action: ReactNode
}) {
  const { t } = useTranslation()

  return (
    <div className="group flex min-h-[78px] w-full min-w-0 items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-white/[0.035]">
      <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/[0.055] text-text-muted">
        <AppIcon iconUrl={app.iconUrl} className="rounded-xl" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="min-w-0 truncate text-sm font-black text-text-primary">{app.name}</span>
        <span className="mt-1 block truncate text-xs font-medium text-text-muted">
          {app.description || t('spaceApps.noDescription')}
        </span>
      </span>
      <span className="flex shrink-0 items-center justify-end pl-2">{action}</span>
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
      <div className="text-text-muted">
        {icon}
        <p className="mt-4 text-sm font-black text-text-primary">{title}</p>
      </div>
    </div>
  )
}

function AppStoreHeader({
  tab,
  showManifestInstaller,
  onTabChange,
  onToggleManifestInstaller,
}: {
  tab: OsAppStoreTab
  showManifestInstaller: boolean
  onTabChange: (tab: OsAppStoreTab) => void
  onToggleManifestInstaller: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="flex h-14 w-full min-w-0 shrink-0 items-center gap-3 border-b border-white/[0.07] bg-black/[0.08] px-4">
      <div
        className="flex h-full shrink-0 items-center"
        role="tablist"
        aria-label={t('spaceApps.group')}
      >
        {(['explore', 'installed'] as const).map((key) => (
          <button
            type="button"
            role="tab"
            aria-selected={tab === key && !showManifestInstaller}
            key={key}
            onClick={() => onTabChange(key)}
            className={cn(
              'relative flex h-full items-center px-3 text-[13px] font-black transition',
              tab === key && !showManifestInstaller
                ? 'text-text-primary after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary'
                : 'text-text-muted hover:text-text-primary',
            )}
          >
            {key === 'explore' ? t('os.appStoreExploreTab') : t('os.appStoreInstalledTab')}
          </button>
        ))}
      </div>
      <div className="min-w-0 flex-1" />
      <Button
        variant={showManifestInstaller ? 'primary' : 'ghost'}
        size="icon"
        onClick={onToggleManifestInstaller}
        className="h-9 w-9 shrink-0 rounded-xl p-0"
        title={t('spaceApps.customInstall')}
        aria-label={t('spaceApps.customInstall')}
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
  discovery: OsSpaceAppDiscovery | null
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
          placeholder={t('spaceApps.manifestUrl')}
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
          {t('spaceApps.discoverButton')}
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
                {t('spaceApps.authorizeInstall')}
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
  apps: SpaceAppInstallation[]
  isLoading: boolean
  onOpenApp: (app: SpaceAppInstallation) => void
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<OsAppStoreTab>('explore')
  const [appSearch, setAppSearch] = useState('')
  useOsWindowHeaderSearch('app-store-search', {
    value: appSearch,
    onChange: setAppSearch,
    placeholder: t('spaceApps.searchPlaceholder'),
  })
  const [manifestUrl, setManifestUrl] = useState('')
  const [discovery, setDiscovery] = useState<OsSpaceAppDiscovery | null>(null)
  const [showManifestInstaller, setShowManifestInstaller] = useState(false)

  const { data: catalog = [], isLoading: isCatalogLoading } = useQuery({
    queryKey: ['space-app-catalog', serverSlug, i18n.language],
    queryFn: () =>
      fetchApi<OsSpaceAppCatalogEntry[]>(`/api/servers/${serverSlug}/space-apps/catalog`),
    enabled: Boolean(serverSlug),
    staleTime: OS_STALE_MS,
    gcTime: OS_GC_MS,
  })

  const invalidateApps = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['os-space-apps', serverSlug] })
    queryClient.invalidateQueries({ queryKey: ['space-apps', serverSlug] })
    queryClient.invalidateQueries({ queryKey: ['space-app-summaries', serverSlug] })
    queryClient.invalidateQueries({ queryKey: ['space-app-catalog', serverSlug] })
  }, [queryClient, serverSlug])

  const discoverApp = useMutation({
    mutationFn: () =>
      fetchApi<OsSpaceAppDiscovery>(`/api/servers/${serverSlug}/space-apps/discover`, {
        method: 'POST',
        body: JSON.stringify({ manifestUrl: manifestUrl.trim() }),
      }),
    onSuccess: (result) => setDiscovery(result),
  })

  const installCustomApp = useMutation({
    mutationFn: () =>
      fetchApi<SpaceAppInstallation>(`/api/servers/${serverSlug}/space-apps`, {
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
      showToast(t('spaceApps.installSuccess'), 'success')
    },
    onError: (error) => showToast(appStoreErrorMessage(error, t), 'error'),
  })

  const installCatalogApp = useMutation({
    mutationFn: (entry: OsSpaceAppCatalogEntry) =>
      fetchApi<SpaceAppInstallation>(
        `/api/servers/${serverSlug}/space-apps/catalog/${entry.id}/install`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        },
      ),
    onSuccess: (result) => {
      setTab('installed')
      invalidateApps()
      onOpenApp(result)
      showToast(t('spaceApps.installSuccess'), 'success')
    },
    onError: (error) => showToast(appStoreErrorMessage(error, t), 'error'),
  })

  const uninstallApp = useMutation({
    mutationFn: (app: SpaceAppInstallation) =>
      fetchApi(`/api/servers/${serverSlug}/space-apps/${app.appKey}`, {
        method: 'DELETE',
      }),
    onSuccess: (_result, app) => {
      queryClient.removeQueries({ queryKey: ['space-app-detail', serverSlug, app.appKey] })
      invalidateApps()
      showToast(t('spaceApps.uninstallSuccess'), 'success')
    },
    onError: (error) =>
      showToast(error instanceof Error ? error.message : t('spaceApps.installFailed'), 'error'),
  })

  const handleUninstall = useCallback(
    async (app: SpaceAppInstallation) => {
      const ok = await useConfirmStore.getState().confirm({
        title: t('spaceApps.uninstallConfirmTitle'),
        message: t('spaceApps.uninstallConfirmMessage', { name: app.name }),
        confirmLabel: t('spaceApps.uninstallApp'),
        danger: true,
      })
      if (ok) uninstallApp.mutate(app)
    },
    [t, uninstallApp],
  )

  const normalizedSearch = appSearch.trim().toLowerCase()
  const matchesSearch = (
    app: Pick<SpaceAppInstallation, 'name' | 'description' | 'appKey'> | OsSpaceAppCatalogEntry,
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
            title={normalizedSearch ? t('common.noResults') : t('spaceApps.catalogEmpty')}
          />
        )
      }

      return (
        <div className="mx-auto w-full max-w-5xl">
          <div className="grid gap-x-5 lg:grid-cols-2">
            {visibleCatalog.map((entry) => (
              <div key={entry.id} className="border-b border-white/[0.065]">
                <OsAppRow
                  app={entry}
                  action={
                    <Button
                      variant={entry.installed ? 'ghost' : 'outline'}
                      size="sm"
                      disabled={Boolean(entry.installed) || installCatalogApp.isPending}
                      loading={installCatalogApp.isPending}
                      onClick={() => installCatalogApp.mutate(entry)}
                      className="h-8 min-w-[54px] rounded-full px-3 text-[11px]"
                    >
                      {entry.installed
                        ? t('spaceApps.alreadyInstalled')
                        : t('spaceApps.installFromCatalog')}
                    </Button>
                  }
                />
              </div>
            ))}
          </div>
        </div>
      )
    }

    if (isLoading) return <LoadingAppStoreState />
    if (visibleInstalled.length === 0) {
      return (
        <EmptyAppStoreState
          icon={normalizedSearch ? <Search size={21} /> : <Store size={21} />}
          title={normalizedSearch ? t('common.noResults') : t('spaceApps.noInstalled')}
        />
      )
    }

    return (
      <div className="mx-auto grid w-full max-w-5xl gap-x-5 lg:grid-cols-2">
        {visibleInstalled.map((app) => (
          <div key={app.id} className="border-b border-white/[0.065]">
            <OsAppRow
              app={app}
              action={
                <span className="flex items-center gap-1.5">
                  <Button
                    variant="glass"
                    size="sm"
                    onClick={() => onOpenApp(app)}
                    className="h-8 rounded-full px-3 text-[11px]"
                  >
                    {t('spaceApps.openApp')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={uninstallApp.isPending}
                    loading={uninstallApp.isPending}
                    onClick={() => void handleUninstall(app)}
                    className="h-8 w-8 rounded-full p-0 text-text-muted hover:bg-danger/10 hover:text-danger"
                    title={t('spaceApps.uninstallApp')}
                    aria-label={t('spaceApps.uninstallApp')}
                  >
                    <Trash2 size={14} />
                  </Button>
                </span>
              }
            />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="absolute inset-0 flex min-h-0 min-w-0 flex-col overflow-hidden bg-bg-base">
      <AppStoreHeader
        tab={tab}
        showManifestInstaller={showManifestInstaller}
        onTabChange={(nextTab) => {
          setShowManifestInstaller(false)
          setTab(nextTab)
        }}
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
      <div className="min-h-0 w-full min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-2 lg:px-5">
        {renderList()}
      </div>
    </div>
  )
}
