import { Button, cn, Input, Spinner } from '@shadowob/ui'
import {
  type UseMutationResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  AppWindow,
  Bot,
  ChevronDown,
  ChevronRight,
  CirclePlus,
  Search,
  ShieldCheck,
  Terminal,
  Trash2,
  UserRound,
} from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { useConfirmStore } from '../common/confirm-dialog'

const SERVER_APP_SETTINGS_STALE_MS = 5 * 60 * 1000
const SERVER_APP_SETTINGS_GC_MS = 30 * 60 * 1000

interface ServerAccess {
  canManage: boolean
}

interface ServerMember {
  uid: string
  nickname: string
  isBot?: boolean
  user?: {
    id: string
    username: string
    displayName?: string | null
    isBot?: boolean
  } | null
  agent?: {
    id: string
    status?: string | null
  } | null
}

interface ServerAppCommand {
  name: string
  title?: string
  description?: string
  permission: string
  action: string
  dataClass: string
  approvalMode?: 'none' | 'first_time' | 'every_time' | 'policy'
}

interface ServerAppManifest {
  schemaVersion: 'shadow.app/1'
  appKey: string
  name: string
  description?: string
  version?: string
  iconUrl: string
  api: {
    baseUrl: string
    auth?: { type: 'oauth2-bearer' }
  }
  commands: ServerAppCommand[]
  skills?: Array<{ name: string; description: string }>
}

interface ServerAppIntegration {
  id: string
  serverId: string
  appKey: string
  name: string
  description?: string | null
  iconUrl: string | null
  iframeEntry?: string | null
  allowedOrigins: string[]
  manifest: ServerAppManifest
  defaultPermissions: string[]
  defaultApprovalMode: 'none' | 'first_time' | 'every_time' | 'policy'
  grants?: Array<{
    id: string
    buddyAgentId: string
    permissions: string[]
    approvalMode: string
  }>
}

interface ServerAppDiscovery {
  manifest: ServerAppManifest
  installed: ServerAppIntegration | null
  permissions: Array<{
    name: string
    title: string
    description?: string | null
    permission: string
    action: string
    dataClass: string
    approvalMode: string
  }>
}

interface ServerAppCatalogEntry {
  id: string
  appKey: string
  name: string
  description?: string | null
  iconUrl?: string | null
  manifestUrl?: string | null
  manifest: ServerAppManifest
  installed: ServerAppIntegration | null
  permissions: ServerAppDiscovery['permissions']
}

type PanelMode = 'detail' | 'add'
type AddMode = 'catalog' | 'custom'

function uniquePermissions(commands: ServerAppCommand[]) {
  return Array.from(new Set(commands.map((command) => command.permission)))
}

function manifestAuthType(manifest: ServerAppManifest) {
  return manifest.api.auth?.type ?? 'oauth2-bearer'
}

function serverAppErrorMessage(error: unknown, t: (key: string) => string) {
  if (!(error instanceof Error)) return String(error)
  if (
    error.message.includes('Private or local provider URLs') ||
    error.message.includes('Local provider URLs') ||
    error.message.includes('resolves to a private or local address')
  ) {
    return t('serverApps.privateUrlError')
  }
  return error.message
}

function AuthBadge({ manifest }: { manifest: ServerAppManifest }) {
  const { t } = useTranslation()
  const type = manifestAuthType(manifest)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold',
        'border-primary/25 bg-primary/10 text-primary',
      )}
    >
      <ShieldCheck size={12} />
      {t(`serverApps.auth.${type}`)}
    </span>
  )
}

function AppIcon({ app, size = 'md' }: { app: { iconUrl?: string | null }; size?: 'sm' | 'md' }) {
  const className = size === 'sm' ? 'h-8 w-8' : 'h-11 w-11'
  const iconSize = size === 'sm' ? 16 : 20
  return (
    <div
      className={cn(
        'grid shrink-0 place-items-center rounded-lg bg-bg-tertiary/70 text-text-muted',
        className,
      )}
    >
      {app.iconUrl ? (
        <img src={app.iconUrl} alt="" className="h-2/3 w-2/3 rounded-md object-cover" />
      ) : (
        <AppWindow size={iconSize} />
      )}
    </div>
  )
}

export function ServerAppsSettingsPanel({ serverSlug }: { serverSlug: string }) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<PanelMode>('detail')
  const [addMode, setAddMode] = useState<AddMode>('catalog')
  const [selectedAppKey, setSelectedAppKey] = useState('')
  const [manifestUrl, setManifestUrl] = useState('')
  const [discovery, setDiscovery] = useState<ServerAppDiscovery | null>(null)
  const [selectedBuddyAgentId, setSelectedBuddyAgentId] = useState('')
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([])
  const [defaultPermissions, setDefaultPermissions] = useState<string[]>([])

  const { data: access } = useQuery({
    queryKey: ['server-access', serverSlug],
    queryFn: () => fetchApi<ServerAccess>(`/api/servers/${serverSlug}/access`),
    enabled: !!serverSlug,
    staleTime: SERVER_APP_SETTINGS_STALE_MS,
    gcTime: SERVER_APP_SETTINGS_GC_MS,
  })

  const { data: apps = [], isLoading } = useQuery({
    queryKey: ['server-apps', serverSlug, i18n.language],
    queryFn: () => fetchApi<ServerAppIntegration[]>(`/api/servers/${serverSlug}/apps`),
    enabled: !!serverSlug,
    staleTime: SERVER_APP_SETTINGS_STALE_MS,
    gcTime: SERVER_APP_SETTINGS_GC_MS,
  })

  const { data: catalog = [] } = useQuery({
    queryKey: ['server-app-catalog', serverSlug, i18n.language],
    queryFn: () => fetchApi<ServerAppCatalogEntry[]>(`/api/servers/${serverSlug}/apps/catalog`),
    enabled: !!serverSlug && !!access?.canManage,
    staleTime: SERVER_APP_SETTINGS_STALE_MS,
    gcTime: SERVER_APP_SETTINGS_GC_MS,
  })

  const activeApp = useMemo(
    () => apps.find((app) => app.appKey === selectedAppKey) ?? apps[0] ?? null,
    [apps, selectedAppKey],
  )

  const { data: activeAppDetail } = useQuery({
    queryKey: ['server-app-detail', serverSlug, activeApp?.appKey, i18n.language],
    queryFn: () =>
      fetchApi<ServerAppIntegration>(`/api/servers/${serverSlug}/apps/${activeApp!.appKey}`),
    enabled: !!serverSlug && !!activeApp?.appKey && mode === 'detail',
    staleTime: SERVER_APP_SETTINGS_STALE_MS,
    gcTime: SERVER_APP_SETTINGS_GC_MS,
  })

  const selectedApp = activeAppDetail ?? activeApp

  const { data: members = [] } = useQuery({
    queryKey: ['server-members', serverSlug],
    queryFn: () => fetchApi<ServerMember[]>(`/api/servers/${serverSlug}/members`),
    enabled: !!serverSlug && !!access?.canManage,
    staleTime: SERVER_APP_SETTINGS_STALE_MS,
    gcTime: SERVER_APP_SETTINGS_GC_MS,
  })

  const buddies = useMemo(
    () => members.filter((member) => (member.isBot || member.user?.isBot) && member.agent?.id),
    [members],
  )

  useEffect(() => {
    if (!selectedAppKey && apps[0]?.appKey) setSelectedAppKey(apps[0].appKey)
    if (apps.length === 0 && mode === 'detail') setMode('add')
  }, [apps, mode, selectedAppKey])

  useEffect(() => {
    if (buddies.length > 0 && !selectedBuddyAgentId) {
      setSelectedBuddyAgentId(buddies[0]?.agent?.id ?? '')
    }
  }, [buddies, selectedBuddyAgentId])

  useEffect(() => {
    if (selectedApp) {
      setSelectedPermissions(uniquePermissions(selectedApp.manifest.commands))
      setDefaultPermissions(selectedApp.defaultPermissions ?? [])
    }
  }, [selectedApp?.id, selectedApp?.manifest.commands])

  const discoverApp = useMutation({
    mutationFn: () =>
      fetchApi<ServerAppDiscovery>(`/api/servers/${serverSlug}/apps/discover`, {
        method: 'POST',
        body: JSON.stringify({ manifestUrl: manifestUrl.trim() }),
      }),
    onSuccess: (result) => setDiscovery(result),
  })

  const installApp = useMutation({
    mutationFn: () =>
      fetchApi<ServerAppIntegration>(`/api/servers/${serverSlug}/apps`, {
        method: 'POST',
        body: JSON.stringify({
          manifestUrl: manifestUrl.trim(),
          manifest: discovery?.manifest,
        }),
      }),
    onSuccess: (app) => {
      setManifestUrl('')
      setDiscovery(null)
      setSelectedAppKey(app.appKey)
      setMode('detail')
      queryClient.invalidateQueries({ queryKey: ['server-apps', serverSlug] })
      queryClient.invalidateQueries({ queryKey: ['server-app-summaries', serverSlug] })
      queryClient.invalidateQueries({ queryKey: ['server-app-catalog', serverSlug] })
    },
  })

  const installCatalogApp = useMutation({
    mutationFn: (entry: ServerAppCatalogEntry) =>
      fetchApi<ServerAppIntegration>(
        `/api/servers/${serverSlug}/apps/catalog/${entry.id}/install`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        },
      ),
    onSuccess: (app) => {
      setSelectedAppKey(app.appKey)
      setMode('detail')
      queryClient.invalidateQueries({ queryKey: ['server-apps', serverSlug] })
      queryClient.invalidateQueries({ queryKey: ['server-app-summaries', serverSlug] })
      queryClient.invalidateQueries({ queryKey: ['server-app-catalog', serverSlug] })
    },
  })

  const uninstallApp = useMutation({
    mutationFn: (app: ServerAppIntegration) =>
      fetchApi(`/api/servers/${serverSlug}/apps/${app.appKey}`, {
        method: 'DELETE',
      }),
    onSuccess: (_result, app) => {
      setSelectedAppKey((current) => (current === app.appKey ? '' : current))
      queryClient.invalidateQueries({ queryKey: ['server-apps', serverSlug] })
      queryClient.invalidateQueries({ queryKey: ['server-app-summaries', serverSlug] })
      queryClient.invalidateQueries({ queryKey: ['server-app-catalog', serverSlug] })
      queryClient.removeQueries({ queryKey: ['server-app-detail', serverSlug, app.appKey] })
    },
  })

  const grantBuddy = useMutation({
    mutationFn: () =>
      fetchApi(`/api/servers/${serverSlug}/apps/${selectedApp!.appKey}/grants`, {
        method: 'POST',
        body: JSON.stringify({
          buddyAgentId: selectedBuddyAgentId,
          permissions: selectedPermissions,
          approvalMode: 'none',
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['server-app-detail', serverSlug, selectedApp?.appKey],
      })
    },
  })

  const updateAccessPolicy = useMutation({
    mutationFn: () =>
      fetchApi<ServerAppIntegration>(
        `/api/servers/${serverSlug}/apps/${selectedApp!.appKey}/access-policy`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            defaultPermissions,
            defaultApprovalMode: selectedApp?.defaultApprovalMode ?? 'none',
          }),
        },
      ),
    onSuccess: (app) => {
      setDefaultPermissions(app.defaultPermissions ?? [])
      queryClient.invalidateQueries({
        queryKey: ['server-app-detail', serverSlug, selectedApp?.appKey],
      })
      queryClient.invalidateQueries({ queryKey: ['server-apps', serverSlug] })
      queryClient.invalidateQueries({ queryKey: ['server-app-summaries', serverSlug] })
    },
  })

  const togglePermission = (permission: string) => {
    setSelectedPermissions((current) =>
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission],
    )
  }

  const toggleDefaultPermission = (permission: string) => {
    setDefaultPermissions((current) =>
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission],
    )
  }

  const openAdd = () => {
    setMode('add')
    setDiscovery(null)
  }

  const openDetail = (appKey: string) => {
    setSelectedAppKey(appKey)
    setMode('detail')
  }

  if (isLoading) {
    return (
      <div className="grid h-full place-items-center text-text-muted">
        <Spinner size="sm" />
      </div>
    )
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[240px_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col border-r border-border-subtle bg-bg-secondary/10">
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-black text-text-primary">
            <AppWindow size={16} />
            {t('serverApps.installedTitle')}
          </div>
          {access?.canManage && (
            <button
              type="button"
              onClick={openAdd}
              className={cn(
                'grid h-8 w-8 place-items-center rounded-full text-text-muted transition hover:bg-bg-modifier-hover hover:text-text-primary',
                mode === 'add' && 'bg-primary/15 text-primary',
              )}
              aria-label={t('serverApps.addApp')}
              title={t('serverApps.addApp')}
            >
              <CirclePlus size={17} />
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {apps.map((app) => {
            const isActive = mode === 'detail' && selectedApp?.appKey === app.appKey
            return (
              <button
                type="button"
                key={app.id}
                onClick={() => openDetail(app.appKey)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition',
                  isActive
                    ? 'bg-primary/15 text-primary ring-1 ring-primary/25'
                    : 'text-text-secondary hover:bg-bg-modifier-hover hover:text-text-primary',
                )}
              >
                <AppIcon app={app} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-black">{app.name}</div>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-text-muted">
                    {app.description || t('serverApps.noDescription')}
                  </p>
                </div>
              </button>
            )
          })}
          {apps.length === 0 && (
            <div className="rounded-xl border border-dashed border-border-subtle p-4 text-sm text-text-muted">
              {t('serverApps.noInstalled')}
            </div>
          )}
        </div>
      </aside>

      <main className="min-h-0 overflow-y-auto px-5 py-5">
        {mode === 'add' && access?.canManage ? (
          <AddAppView
            addMode={addMode}
            setAddMode={setAddMode}
            catalog={catalog}
            installCatalogApp={installCatalogApp}
            manifestUrl={manifestUrl}
            setManifestUrl={(value) => {
              setManifestUrl(value)
              setDiscovery(null)
            }}
            discovery={discovery}
            discoverApp={discoverApp}
            installApp={installApp}
          />
        ) : selectedApp ? (
          <DetailView
            app={selectedApp}
            access={access}
            buddies={buddies}
            selectedBuddyAgentId={selectedBuddyAgentId}
            setSelectedBuddyAgentId={setSelectedBuddyAgentId}
            selectedPermissions={selectedPermissions}
            togglePermission={togglePermission}
            defaultPermissions={defaultPermissions}
            toggleDefaultPermission={toggleDefaultPermission}
            updateAccessPolicy={updateAccessPolicy}
            grantBuddy={grantBuddy}
            uninstallApp={uninstallApp}
          />
        ) : (
          <div className="grid min-h-[280px] place-items-center text-center">
            <div>
              <AppWindow className="mx-auto mb-3 text-text-muted" size={28} />
              <p className="text-sm font-bold text-text-primary">{t('serverApps.selectApp')}</p>
              <p className="mt-1 text-sm text-text-muted">{t('serverApps.selectFromSidebar')}</p>
              {access?.canManage && (
                <Button variant="primary" size="sm" onClick={openAdd} className="mt-4">
                  <CirclePlus size={14} />
                  {t('serverApps.install')}
                </Button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function AddAppView(props: {
  addMode: AddMode
  setAddMode: (mode: AddMode) => void
  catalog: ServerAppCatalogEntry[]
  installCatalogApp: UseMutationResult<ServerAppIntegration, Error, ServerAppCatalogEntry>
  manifestUrl: string
  setManifestUrl: (value: string) => void
  discovery: ServerAppDiscovery | null
  discoverApp: UseMutationResult<ServerAppDiscovery, Error, void>
  installApp: UseMutationResult<ServerAppIntegration, Error, void>
}) {
  const { t } = useTranslation()
  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h3 className="text-base font-black text-text-primary">{t('serverApps.addApp')}</h3>
          <p className="mt-1 text-sm leading-6 text-text-muted">{t('serverApps.addDescription')}</p>
        </div>
        <div className="inline-flex rounded-xl border border-border-subtle bg-bg-primary/50 p-1">
          {(['catalog', 'custom'] as AddMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => props.setAddMode(mode)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-black transition',
                props.addMode === mode
                  ? 'bg-primary text-bg-primary'
                  : 'text-text-muted hover:text-text-primary',
              )}
            >
              {t(`serverApps.addMode.${mode}`)}
            </button>
          ))}
        </div>
      </div>

      {props.addMode === 'catalog' ? (
        <div className="space-y-2">
          {props.catalog.map((entry) => {
            return (
              <div
                key={entry.id}
                className="flex items-center gap-3 rounded-xl border border-border-subtle bg-bg-primary/30 p-3"
              >
                <AppIcon app={entry} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-black text-text-primary">{entry.name}</div>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-text-muted">
                    {entry.description || t('serverApps.noDescription')}
                  </p>
                </div>
                <Button
                  variant={entry.installed ? 'glass' : 'primary'}
                  size="sm"
                  disabled={Boolean(entry.installed) || props.installCatalogApp.isPending}
                  loading={props.installCatalogApp.isPending}
                  onClick={() => props.installCatalogApp.mutate(entry)}
                  className="shrink-0"
                >
                  {entry.installed
                    ? t('serverApps.alreadyInstalled')
                    : t('serverApps.installFromCatalog')}
                </Button>
              </div>
            )
          })}
          {props.catalog.length === 0 && (
            <div className="rounded-xl border border-dashed border-border-subtle p-4">
              <p className="text-sm text-text-muted">{t('serverApps.catalogEmpty')}</p>
              <Button
                variant="glass"
                size="sm"
                onClick={() => props.setAddMode('custom')}
                className="mt-3"
              >
                <CirclePlus size={14} />
                {t('serverApps.customInstall')}
              </Button>
            </div>
          )}
          {props.installCatalogApp.error instanceof Error && (
            <p className="text-xs text-danger">
              {serverAppErrorMessage(props.installCatalogApp.error, t)}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={props.manifestUrl}
              onChange={(event) => props.setManifestUrl(event.target.value)}
              placeholder={t('serverApps.manifestUrl')}
            />
            <Button
              variant="glass"
              size="sm"
              disabled={!props.manifestUrl.trim() || props.discoverApp.isPending}
              loading={props.discoverApp.isPending}
              onClick={() => props.discoverApp.mutate()}
              className="shrink-0"
            >
              <Search size={14} />
              {t('serverApps.discoverButton')}
            </Button>
          </div>
          {props.discoverApp.error instanceof Error && (
            <p className="text-xs text-danger">
              {serverAppErrorMessage(props.discoverApp.error, t)}
            </p>
          )}
          {props.discovery && (
            <div className="rounded-xl border border-primary/25 bg-primary/10 p-4">
              <div className="flex items-start gap-3">
                <AppIcon app={{ iconUrl: props.discovery.manifest.iconUrl }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-black text-text-primary">
                    {props.discovery.manifest.name}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-text-muted">
                    {props.discovery.manifest.description ?? t('serverApps.noDescription')}
                  </p>
                  <div className="mt-2">
                    <AuthBadge manifest={props.discovery.manifest} />
                  </div>
                </div>
              </div>
              <PermissionChips
                label={t('serverApps.requestedPermissions')}
                permissions={props.discovery.permissions.map((permission) => permission.permission)}
              />
              <Button
                variant="primary"
                size="sm"
                disabled={props.installApp.isPending}
                loading={props.installApp.isPending}
                onClick={() => props.installApp.mutate()}
                className="mt-3"
              >
                <ShieldCheck size={14} />
                {t('serverApps.authorizeInstall')}
              </Button>
              {props.installApp.error instanceof Error && (
                <p className="mt-2 text-xs text-danger">
                  {serverAppErrorMessage(props.installApp.error, t)}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DetailView(props: {
  app: ServerAppIntegration
  access?: ServerAccess
  buddies: ServerMember[]
  selectedBuddyAgentId: string
  setSelectedBuddyAgentId: (id: string) => void
  selectedPermissions: string[]
  togglePermission: (permission: string) => void
  defaultPermissions: string[]
  toggleDefaultPermission: (permission: string) => void
  updateAccessPolicy: UseMutationResult<ServerAppIntegration, Error, void>
  grantBuddy: UseMutationResult<unknown, Error, void>
  uninstallApp: UseMutationResult<unknown, Error, ServerAppIntegration>
}) {
  const { t } = useTranslation()
  const [commandsOpen, setCommandsOpen] = useState(false)
  const [accessOpen, setAccessOpen] = useState(false)
  const grantPermissions = uniquePermissions(props.app.manifest.commands)
  const confirmUninstall = async () => {
    const ok = await useConfirmStore.getState().confirm({
      title: t('serverApps.uninstallConfirmTitle'),
      message: t('serverApps.uninstallConfirmMessage', { name: props.app.name }),
      confirmLabel: t('serverApps.uninstallApp'),
      danger: true,
    })
    if (ok) props.uninstallApp.mutate(props.app)
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div className="flex items-start gap-3">
        <AppIcon app={props.app} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-black text-text-primary">{props.app.name}</h3>
            <AuthBadge manifest={props.app.manifest} />
          </div>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            {props.app.description ?? t('serverApps.noDescription')}
          </p>
        </div>
        {props.access?.canManage && (
          <Button
            variant="danger"
            size="sm"
            disabled={props.uninstallApp.isPending}
            loading={props.uninstallApp.isPending}
            onClick={confirmUninstall}
            className="shrink-0"
          >
            <Trash2 size={14} />
            {t('serverApps.uninstallApp')}
          </Button>
        )}
      </div>
      {props.uninstallApp.error instanceof Error && (
        <p className="text-xs text-danger">{props.uninstallApp.error.message}</p>
      )}

      <section>
        <SectionToggle
          open={commandsOpen}
          onToggle={() => setCommandsOpen((value) => !value)}
          icon={<Terminal size={14} />}
          title={t('serverApps.commands')}
          count={props.app.manifest.commands.length}
        />
        {commandsOpen && (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {props.app.manifest.commands.map((command) => (
              <div
                key={command.name}
                className="rounded-xl border border-border-subtle bg-bg-tertiary/25 p-3"
              >
                <div className="text-sm font-black text-text-primary">{command.name}</div>
                <p className="mt-1 text-xs leading-5 text-text-muted">
                  {command.description ?? command.permission}
                </p>
                <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-text-muted">
                  <span className="rounded-full bg-bg-primary/60 px-2 py-0.5">
                    {command.action}
                  </span>
                  <span className="rounded-full bg-bg-primary/60 px-2 py-0.5">
                    {command.dataClass}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {props.access?.canManage && (
        <section>
          <SectionToggle
            open={accessOpen}
            onToggle={() => setAccessOpen((value) => !value)}
            icon={<Bot size={14} />}
            title={t('serverApps.accessTitle')}
            count={props.app.grants?.length ?? 0}
          />
          {accessOpen && (
            <div className="mt-3 space-y-4 rounded-xl border border-border-subtle bg-bg-tertiary/20 p-3">
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-black text-text-primary">
                      {t('serverApps.defaultAccessTitle')}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-text-muted">
                      {t('serverApps.defaultAccessDescription')}
                    </p>
                  </div>
                  <Button
                    variant="glass"
                    size="sm"
                    disabled={props.updateAccessPolicy.isPending}
                    loading={props.updateAccessPolicy.isPending}
                    onClick={() => props.updateAccessPolicy.mutate()}
                  >
                    <ShieldCheck size={14} />
                    {t('serverApps.saveDefaultAccess')}
                  </Button>
                </div>
                <div className="grid gap-1 md:grid-cols-2">
                  {grantPermissions.map((permission) => (
                    <label
                      key={permission}
                      className="flex items-center gap-2 rounded-md bg-bg-primary/50 px-2 py-2 text-xs text-text-secondary"
                    >
                      <input
                        type="checkbox"
                        checked={props.defaultPermissions.includes(permission)}
                        onChange={() => props.toggleDefaultPermission(permission)}
                        className="h-4 w-4 accent-primary"
                      />
                      <span className="min-w-0 break-all">{permission}</span>
                    </label>
                  ))}
                </div>
                {props.updateAccessPolicy.isSuccess && (
                  <p className="mt-2 text-xs text-primary">{t('serverApps.defaultAccessSaved')}</p>
                )}
                {props.updateAccessPolicy.error instanceof Error && (
                  <p className="mt-2 text-xs text-danger">
                    {props.updateAccessPolicy.error.message}
                  </p>
                )}
              </div>
              <div className="h-px bg-border-subtle" />
              <div>
                <p className="mb-3 text-xs leading-5 text-text-muted">
                  {t('serverApps.accessDescription')}
                </p>
                {props.buddies.length > 0 ? (
                  <div className="space-y-3">
                    <select
                      value={props.selectedBuddyAgentId}
                      onChange={(event) => props.setSelectedBuddyAgentId(event.target.value)}
                      className="h-9 w-full rounded-lg border border-border-subtle bg-bg-primary px-3 text-sm text-text-primary outline-none focus:border-primary"
                    >
                      {props.buddies.map((buddy) => (
                        <option key={buddy.agent!.id} value={buddy.agent!.id}>
                          {buddy.nickname}
                        </option>
                      ))}
                    </select>
                    <div className="grid gap-1 md:grid-cols-2">
                      {grantPermissions.map((permission) => (
                        <label
                          key={permission}
                          className="flex items-center gap-2 rounded-md bg-bg-primary/50 px-2 py-2 text-xs text-text-secondary"
                        >
                          <input
                            type="checkbox"
                            checked={props.selectedPermissions.includes(permission)}
                            onChange={() => props.togglePermission(permission)}
                            className="h-4 w-4 accent-primary"
                          />
                          <span className="min-w-0 break-all">{permission}</span>
                        </label>
                      ))}
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={
                        !props.selectedBuddyAgentId ||
                        props.selectedPermissions.length === 0 ||
                        props.grantBuddy.isPending
                      }
                      loading={props.grantBuddy.isPending}
                      onClick={() => props.grantBuddy.mutate()}
                    >
                      <UserRound size={14} />
                      {t('serverApps.grantButton')}
                    </Button>
                    {props.grantBuddy.isSuccess && (
                      <p className="text-xs text-primary">{t('serverApps.grantSuccess')}</p>
                    )}
                    {props.grantBuddy.error instanceof Error && (
                      <p className="text-xs text-danger">{props.grantBuddy.error.message}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-text-muted">{t('serverApps.noBuddies')}</p>
                )}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function SectionToggle({
  open,
  onToggle,
  icon,
  title,
  count,
}: {
  open: boolean
  onToggle: () => void
  icon: ReactNode
  title: string
  count: number
}) {
  const Icon = open ? ChevronDown : ChevronRight
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs font-black uppercase tracking-wider text-text-muted transition hover:bg-bg-modifier-hover hover:text-text-primary"
    >
      <Icon size={14} />
      {icon}
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <span className="rounded-full bg-bg-tertiary px-2 py-0.5 text-[11px]">{count}</span>
    </button>
  )
}

function PermissionChips({ permissions, label }: { permissions: string[]; label?: string }) {
  if (permissions.length === 0) return null
  return (
    <div className="mt-3">
      {label && (
        <div className="mb-2 text-[11px] font-black uppercase tracking-wider text-text-muted">
          {label}
        </div>
      )}
      <div className="flex flex-wrap gap-1">
        {permissions.slice(0, 5).map((permission) => (
          <span
            key={permission}
            className="rounded-full bg-bg-tertiary px-2 py-0.5 text-[11px] text-text-muted"
          >
            {permission}
          </span>
        ))}
      </div>
    </div>
  )
}
