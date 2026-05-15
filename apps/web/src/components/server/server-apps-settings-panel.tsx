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
  Check,
  ChevronRight,
  CirclePlus,
  Search,
  ShieldCheck,
  Terminal,
  UserRound,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { SettingsCard, SettingsPanel } from '../../pages/settings/_shared'

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
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<PanelMode>('detail')
  const [addMode, setAddMode] = useState<AddMode>('catalog')
  const [selectedAppKey, setSelectedAppKey] = useState('')
  const [manifestUrl, setManifestUrl] = useState('')
  const [discovery, setDiscovery] = useState<ServerAppDiscovery | null>(null)
  const [selectedBuddyAgentId, setSelectedBuddyAgentId] = useState('')
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([])

  const { data: access } = useQuery({
    queryKey: ['server-access', serverSlug],
    queryFn: () => fetchApi<ServerAccess>(`/api/servers/${serverSlug}/access`),
    enabled: !!serverSlug,
  })

  const { data: apps = [], isLoading } = useQuery({
    queryKey: ['server-apps', serverSlug],
    queryFn: () => fetchApi<ServerAppIntegration[]>(`/api/servers/${serverSlug}/apps`),
    enabled: !!serverSlug,
  })

  const { data: catalog = [] } = useQuery({
    queryKey: ['server-app-catalog', serverSlug],
    queryFn: () => fetchApi<ServerAppCatalogEntry[]>(`/api/servers/${serverSlug}/apps/catalog`),
    enabled: !!serverSlug && !!access?.canManage,
  })

  const activeApp = useMemo(
    () => apps.find((app) => app.appKey === selectedAppKey) ?? apps[0] ?? null,
    [apps, selectedAppKey],
  )

  const { data: activeAppDetail } = useQuery({
    queryKey: ['server-app-detail', serverSlug, activeApp?.appKey],
    queryFn: () =>
      fetchApi<ServerAppIntegration>(`/api/servers/${serverSlug}/apps/${activeApp!.appKey}`),
    enabled: !!serverSlug && !!activeApp?.appKey && mode === 'detail',
  })

  const selectedApp = activeAppDetail ?? activeApp

  const { data: members = [] } = useQuery({
    queryKey: ['server-members', serverSlug],
    queryFn: () => fetchApi<ServerMember[]>(`/api/servers/${serverSlug}/members`),
    enabled: !!serverSlug && !!access?.canManage,
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
      queryClient.invalidateQueries({ queryKey: ['server-app-catalog', serverSlug] })
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

  const togglePermission = (permission: string) => {
    setSelectedPermissions((current) =>
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
    <SettingsPanel className="grid min-h-0 max-w-none gap-4 p-5 lg:grid-cols-[260px_minmax(0,1fr)]">
      <SettingsCard className="min-h-0 overflow-hidden p-0">
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
                'grid h-7 w-7 place-items-center rounded-full text-text-muted transition hover:bg-bg-modifier-hover hover:text-text-primary',
                mode === 'add' && 'bg-primary/15 text-primary',
              )}
              aria-label={t('serverApps.addApp')}
              title={t('serverApps.addApp')}
            >
              <CirclePlus size={17} />
            </button>
          )}
        </div>
        <div className="max-h-[560px] overflow-y-auto p-2">
          {apps.map((app) => {
            const isActive = mode === 'detail' && selectedApp?.appKey === app.appKey
            return (
              <button
                type="button"
                key={app.id}
                onClick={() => openDetail(app.appKey)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition',
                  isActive
                    ? 'bg-primary/15 text-primary ring-1 ring-primary/25'
                    : 'text-text-secondary hover:bg-bg-modifier-hover hover:text-text-primary',
                )}
              >
                <AppIcon app={app} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-black">{app.name}</div>
                  <div className="truncate text-xs text-text-muted">{app.appKey}</div>
                </div>
                <ChevronRight size={15} className="shrink-0 opacity-60" />
              </button>
            )
          })}
          {apps.length === 0 && (
            <div className="rounded-lg border border-border-subtle bg-bg-tertiary/40 p-4 text-sm text-text-muted">
              {t('serverApps.noInstalled')}
            </div>
          )}
        </div>
      </SettingsCard>

      <div className="min-h-0 overflow-y-auto pb-6">
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
            grantBuddy={grantBuddy}
          />
        ) : (
          <SettingsCard className="grid min-h-[280px] place-items-center text-center">
            <div>
              <AppWindow className="mx-auto mb-3 text-text-muted" size={28} />
              <p className="text-sm font-bold text-text-primary">{t('serverApps.selectApp')}</p>
              <p className="mt-1 text-sm text-text-muted">{t('serverApps.selectFromSidebar')}</p>
            </div>
          </SettingsCard>
        )}
      </div>
    </SettingsPanel>
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
    <SettingsCard className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-text-primary">{t('serverApps.addApp')}</h3>
          <p className="mt-1 text-sm leading-6 text-text-muted">{t('serverApps.addDescription')}</p>
        </div>
        <div className="inline-flex rounded-lg border border-border-subtle bg-bg-primary/50 p-1">
          {(['catalog', 'custom'] as AddMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => props.setAddMode(mode)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-black transition',
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
        <div className="grid gap-3 md:grid-cols-2">
          {props.catalog.map((entry) => {
            return (
              <div
                key={entry.id}
                className="rounded-lg border border-border-subtle bg-bg-primary/45 p-3"
              >
                <div className="flex items-start gap-3">
                  <AppIcon app={entry} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-black text-text-primary">
                      {entry.name}
                    </div>
                    <div className="truncate text-xs text-text-muted">{entry.appKey}</div>
                    <div className="mt-2">
                      <AuthBadge manifest={entry.manifest} />
                    </div>
                  </div>
                </div>
                <p className="mt-3 line-clamp-2 text-xs leading-5 text-text-muted">
                  {entry.description ?? t('serverApps.noDescription')}
                </p>
                <PermissionChips
                  permissions={(entry.permissions ?? []).map((item) => item.permission)}
                />
                <Button
                  variant={entry.installed ? 'glass' : 'primary'}
                  size="sm"
                  disabled={Boolean(entry.installed) || props.installCatalogApp.isPending}
                  loading={props.installCatalogApp.isPending}
                  onClick={() => props.installCatalogApp.mutate(entry)}
                  className="mt-3 w-full"
                >
                  <Check size={14} />
                  {entry.installed
                    ? t('serverApps.alreadyInstalled')
                    : t('serverApps.installFromCatalog')}
                </Button>
              </div>
            )
          })}
          {props.catalog.length === 0 && (
            <div className="rounded-lg border border-border-subtle bg-bg-primary/45 p-4 text-sm text-text-muted md:col-span-2">
              {t('serverApps.catalogEmpty')}
            </div>
          )}
          {props.installCatalogApp.error instanceof Error && (
            <p className="text-xs text-danger md:col-span-2">
              {props.installCatalogApp.error.message}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-2">
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
            >
              <Search size={14} />
              {t('serverApps.discoverButton')}
            </Button>
          </div>
          {props.discoverApp.error instanceof Error && (
            <p className="text-xs text-danger">{props.discoverApp.error.message}</p>
          )}
          {props.discovery && (
            <div className="rounded-lg border border-primary/25 bg-primary/10 p-4">
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
                <p className="mt-2 text-xs text-danger">{props.installApp.error.message}</p>
              )}
            </div>
          )}
        </div>
      )}
    </SettingsCard>
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
  grantBuddy: UseMutationResult<unknown, Error, void>
}) {
  const { t } = useTranslation()
  const grantPermissions = uniquePermissions(props.app.manifest.commands)
  return (
    <SettingsCard className="space-y-5">
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
      </div>

      <section>
        <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-text-muted">
          <Terminal size={14} />
          {t('serverApps.commands')}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {props.app.manifest.commands.map((command) => (
            <div
              key={command.name}
              className="rounded-lg border border-border-subtle bg-bg-tertiary/35 p-3"
            >
              <div className="text-sm font-black text-text-primary">{command.name}</div>
              <p className="mt-1 text-xs leading-5 text-text-muted">
                {command.description ?? command.permission}
              </p>
              <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-text-muted">
                <span className="rounded-full bg-bg-primary/60 px-2 py-0.5">{command.action}</span>
                <span className="rounded-full bg-bg-primary/60 px-2 py-0.5">
                  {command.dataClass}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {props.access?.canManage && (
        <section className="rounded-lg border border-border-subtle bg-bg-tertiary/35 p-3">
          <div className="mb-1 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-text-muted">
            <Bot size={14} />
            {t('serverApps.accessTitle')}
          </div>
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
        </section>
      )}
    </SettingsCard>
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
