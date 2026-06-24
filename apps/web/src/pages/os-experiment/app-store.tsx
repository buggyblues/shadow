import { Button, cn, Input } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CirclePlus, Loader2, Search, ShieldCheck, Sparkles, Store, Trash2 } from 'lucide-react'
import { type ReactNode, useCallback, useState } from 'react'
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
  featured = false,
}: {
  app: Pick<ServerAppIntegration, 'id' | 'name' | 'description' | 'iconUrl'>
  action: ReactNode
  featured?: boolean
}) {
  const { t } = useTranslation()

  return (
    <div
      className={cn(
        'group flex min-w-0 items-center gap-4 rounded-[22px] border p-4 transition hover:-translate-y-0.5',
        featured
          ? 'border-primary/24 bg-[linear-gradient(135deg,rgba(0,198,209,0.16),rgba(255,255,255,0.055))] shadow-[0_18px_48px_rgba(0,0,0,0.22)]'
          : 'border-white/10 bg-white/[0.035] hover:border-white/16 hover:bg-white/[0.055]',
      )}
    >
      <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-[16px] bg-white/8 text-text-muted shadow-[0_12px_30px_rgba(0,0,0,0.20)]">
        <AppIcon iconUrl={app.iconUrl} className="rounded-[16px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-black text-text-primary">{app.name}</span>
        <span className="mt-1 block line-clamp-2 text-sm font-semibold leading-6 text-text-muted">
          {app.description || t('serverApps.noDescription')}
        </span>
      </span>
      <span className="shrink-0">{action}</span>
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
    onSuccess: () => {
      setManifestUrl('')
      setDiscovery(null)
      setTab('installed')
      invalidateApps()
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
    onSuccess: () => {
      setTab('installed')
      invalidateApps()
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

  return (
    <div className="flex h-full min-h-0 flex-col bg-[radial-gradient(circle_at_18%_0%,rgba(0,198,209,0.12),transparent_32%),#070910]">
      <div className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-black/18 px-5 py-4">
        <div className="flex shrink-0 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.035] p-1">
          {(['explore', 'installed'] as OsAppStoreTab[]).map((key) => (
            <button
              type="button"
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                'rounded-xl px-4 py-2.5 text-sm font-black transition',
                tab === key
                  ? 'bg-primary text-bg-primary shadow-[0_12px_32px_rgba(0,198,209,0.28)]'
                  : 'text-text-muted hover:bg-white/8 hover:text-text-primary',
              )}
            >
              {key === 'explore' ? t('os.appStoreExploreTab') : t('os.appStoreInstalledTab')}
            </button>
          ))}
        </div>
        <label className="ml-auto flex h-11 min-w-[240px] max-w-md flex-1 items-center gap-2 rounded-2xl border border-white/10 bg-black/22 px-3 text-text-muted">
          <Search size={16} className="shrink-0" />
          <Input
            value={appSearch}
            onChange={(event) => setAppSearch(event.target.value)}
            placeholder={t('serverApps.searchPlaceholder')}
            className="h-auto flex-1 border-0 bg-transparent p-0 text-sm font-bold shadow-none focus-visible:ring-0"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-5">
        {tab === 'explore' ? (
          <div className="grid gap-5 xl:grid-cols-[minmax(320px,430px)_minmax(0,1fr)]">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.045] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-[16px] bg-primary/16 text-primary">
                    <Sparkles size={20} />
                  </div>
                  <h3 className="text-xl font-black text-text-primary">
                    {t('serverApps.customInstall')}
                  </h3>
                  <p className="mt-2 text-sm font-semibold leading-6 text-text-muted">
                    {t('serverApps.addDescription')}
                  </p>
                </div>
                <CirclePlus size={18} className="text-text-muted" />
              </div>
              <div className="mt-5 flex flex-col gap-3">
                <Input
                  value={manifestUrl}
                  onChange={(event) => setManifestUrl(event.target.value)}
                  placeholder={t('serverApps.manifestUrl')}
                  className="h-12 rounded-2xl border-white/10 bg-black/26 text-sm"
                />
                <Button
                  variant="glass"
                  size="sm"
                  disabled={!manifestUrl.trim() || discoverApp.isPending}
                  loading={discoverApp.isPending}
                  onClick={() => discoverApp.mutate()}
                  className="h-11 shrink-0 rounded-2xl"
                >
                  <Search size={14} />
                  {t('serverApps.discoverButton')}
                </Button>
              </div>
              {discoverApp.error instanceof Error && (
                <p className="mt-2 text-xs text-danger">
                  {appStoreErrorMessage(discoverApp.error, t)}
                </p>
              )}
              {discovery ? (
                <div className="mt-4 rounded-[22px] border border-primary/25 bg-primary/10 p-3">
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
                        disabled={installCustomApp.isPending}
                        loading={installCustomApp.isPending}
                        onClick={() => installCustomApp.mutate()}
                        className="rounded-full px-4"
                      >
                        <ShieldCheck size={14} />
                        {t('serverApps.authorizeInstall')}
                      </Button>
                    }
                  />
                  {discovery.permissions.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {discovery.permissions.map((permission) => (
                        <span
                          key={permission.permission}
                          className="rounded-full border border-border-subtle bg-bg-primary/60 px-2 py-1 text-[11px] font-bold text-text-muted"
                        >
                          {permission.permission}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="grid content-start gap-4 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]">
              {isCatalogLoading ? (
                <div className="col-span-full grid h-40 place-items-center text-text-muted">
                  <Loader2 size={20} className="animate-spin" />
                </div>
              ) : visibleCatalog.length > 0 ? (
                visibleCatalog.map((entry) => (
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
                        className="rounded-full px-4"
                      >
                        {entry.installed
                          ? t('serverApps.alreadyInstalled')
                          : t('serverApps.installFromCatalog')}
                      </Button>
                    }
                  />
                ))
              ) : (
                <div className="col-span-full rounded-2xl border border-dashed border-border-subtle p-4 text-sm font-semibold text-text-muted">
                  {normalizedSearch ? t('common.noResults') : t('serverApps.catalogEmpty')}
                </div>
              )}
            </div>
          </div>
        ) : isLoading ? (
          <div className="grid h-full place-items-center text-text-muted">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : visibleInstalled.length > 0 ? (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(380px,1fr))]">
            {visibleInstalled.map((app) => (
              <OsAppRow
                key={app.id}
                app={app}
                featured
                action={
                  <span className="flex items-center gap-2">
                    <Button
                      variant="glass"
                      size="sm"
                      onClick={() => onOpenApp(app)}
                      className="rounded-full px-4"
                    >
                      {t('serverApps.openApp')}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={uninstallApp.isPending}
                      loading={uninstallApp.isPending}
                      onClick={() => void handleUninstall(app)}
                      className="rounded-full px-4"
                    >
                      <Trash2 size={14} />
                      {t('serverApps.uninstallApp')}
                    </Button>
                  </span>
                }
              />
            ))}
          </div>
        ) : normalizedSearch ? (
          <div className="grid h-full place-items-center px-6 text-center">
            <div>
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-border-subtle bg-bg-secondary/70 text-text-muted">
                <Search size={21} />
              </div>
              <p className="mt-4 text-sm font-black text-text-primary">{t('common.noResults')}</p>
            </div>
          </div>
        ) : (
          <div className="grid h-full place-items-center px-6 text-center">
            <div>
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-border-subtle bg-bg-secondary/70 text-text-muted">
                <Store size={21} />
              </div>
              <p className="mt-4 text-sm font-black text-text-primary">
                {t('serverApps.noInstalled')}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
