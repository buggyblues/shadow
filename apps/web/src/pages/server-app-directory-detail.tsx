import { Badge, Button, EmptyState, GlassPanel } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import {
  AppWindow,
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Languages,
  Link as LinkIcon,
  LockKeyhole,
  type LucideIcon,
  Play,
  Plus,
  Server,
  ShieldCheck,
  Tags,
  Terminal,
} from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DiscoverPlaceholderVisual } from '../components/discover/discover-placeholder'
import { fetchApi } from '../lib/api'
import { getApiErrorMessage } from '../lib/api-errors'
import { showToast } from '../lib/toast'

interface ServerEntry {
  server: { id: string; name: string; slug: string | null; iconUrl: string | null }
  member: { role: string }
}

interface ServerAppCommand {
  name: string
  title?: string
  description?: string
  permission: string
  action: string
  dataClass: string
}

interface ServerAppManifest {
  appKey: string
  name: string
  description?: string
  version?: string
  iconUrl: string
  api: { baseUrl: string }
  commands: ServerAppCommand[]
  skills?: Array<{ name: string; description: string }>
  help?: { overview?: string; usage?: string; details?: string }
}

interface ServerAppCatalogDetail {
  id: string
  appKey: string
  name: string
  description: string | null
  iconUrl: string | null
  manifestUrl: string | null
  manifest: ServerAppManifest
  tagline: string | null
  summary: string | null
  categories: string[]
  supportedLanguages: string[]
  coverImageUrl: string | null
  gallery: Array<{ url: string; type: 'image' | 'video'; alt: string | null }>
  links: Array<{ label: string; url: string; type: string }>
  publisher: { name: string | null; websiteUrl: string | null } | null
  commandCount: number
  skillCount: number
  serverCount: number
}

interface ServerAppCatalogWithInstall extends ServerAppCatalogDetail {
  installed: { id: string; appKey: string; name: string } | null
}

function serverKey(entry: ServerEntry | null | undefined) {
  return entry?.server.slug ?? entry?.server.id ?? ''
}

function canManageServer(entry: ServerEntry) {
  return entry.member.role === 'owner' || entry.member.role === 'admin'
}

function originOf(value: string | null | undefined) {
  if (!value) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

function DetailImageWithFallback({
  imageUrl,
  alt,
  className,
}: {
  imageUrl?: string | null
  alt: string
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setFailed(false)
  }, [imageUrl])
  if (!imageUrl || failed) return <DiscoverPlaceholderVisual className={className} />
  return <img src={imageUrl} alt={alt} className={className} onError={() => setFailed(true)} />
}

function DetailIconWithFallback({ imageUrl, label }: { imageUrl?: string | null; label: string }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setFailed(false)
  }, [imageUrl])
  if (imageUrl && !failed) {
    return (
      <img
        src={imageUrl}
        alt={label}
        className="h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
    )
  }
  return (
    <>
      <DiscoverPlaceholderVisual className="absolute inset-0" />
      <AppWindow size={30} className="relative text-primary" />
    </>
  )
}

export function ServerAppDirectoryDetailPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { appKey } = useParams({ strict: false }) as { appKey: string }
  const [selectedServerId, setSelectedServerId] = useState('')
  const [commandsOpen, setCommandsOpen] = useState(false)
  const [activeMediaIndex, setActiveMediaIndex] = useState(0)

  const { data: app, isLoading } = useQuery({
    queryKey: ['discover-server-app-detail', appKey, i18n.language],
    queryFn: ({ signal }) =>
      fetchApi<ServerAppCatalogDetail>(`/api/discover/server-apps/${encodeURIComponent(appKey)}`, {
        signal,
      }),
    enabled: Boolean(appKey),
  })

  const { data: myServers = [] } = useQuery({
    queryKey: ['servers'],
    queryFn: ({ signal }) => fetchApi<ServerEntry[]>('/api/servers', { signal }),
  })
  const manageableServers = useMemo(() => myServers.filter(canManageServer), [myServers])
  const selectedServer =
    myServers.find((entry) => entry.server.id === selectedServerId) ??
    manageableServers[0] ??
    myServers[0] ??
    null
  const selectedServerKey = serverKey(selectedServer)

  useEffect(() => {
    if (selectedServerId) return
    const fallback = manageableServers[0] ?? myServers[0]
    if (fallback) setSelectedServerId(fallback.server.id)
  }, [manageableServers, myServers, selectedServerId])

  const { data: selectedServerCatalog = [] } = useQuery({
    queryKey: ['server-app-catalog', selectedServerKey, i18n.language],
    queryFn: ({ signal }) =>
      fetchApi<ServerAppCatalogWithInstall[]>(
        `/api/servers/${encodeURIComponent(selectedServerKey)}/apps/catalog`,
        { signal },
      ),
    enabled: Boolean(selectedServerKey),
  })
  const selectedCatalogEntry = selectedServerCatalog.find((entry) => entry.appKey === app?.appKey)
  const selectedInstalled = selectedCatalogEntry?.installed ?? null
  const selectedServerManageable = selectedServer ? canManageServer(selectedServer) : false
  const overview = app?.summary ?? app?.manifest.help?.overview ?? app?.description ?? ''
  const gallery = app?.gallery.length
    ? app.gallery
    : app?.coverImageUrl
      ? [{ url: app.coverImageUrl, type: 'image' as const, alt: app.name }]
      : []
  const activeMedia = gallery[activeMediaIndex] ?? gallery[0] ?? null

  useEffect(() => {
    setActiveMediaIndex(0)
  }, [app?.appKey, gallery.length])

  const moveMedia = (direction: -1 | 1) => {
    if (gallery.length <= 1) return
    setActiveMediaIndex((index) => (index + direction + gallery.length) % gallery.length)
  }

  const installMutation = useMutation({
    mutationFn: () =>
      fetchApi(
        `/api/servers/${encodeURIComponent(selectedServerKey)}/apps/catalog/${app!.id}/install`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['server-app-catalog', selectedServerKey] })
      queryClient.invalidateQueries({ queryKey: ['server-apps', selectedServerKey] })
      showToast(t('serverApps.installSuccess'), 'success')
    },
    onError: (error) => {
      showToast(getApiErrorMessage(error, t, 'serverApps.installFailed'), 'error')
    },
  })

  const openInServer = () => {
    if (!app || !selectedServerKey) return
    navigate({
      to: '/servers/$serverSlug/apps/$appKey',
      params: { serverSlug: selectedServerKey, appKey: app.appKey },
    })
  }

  if (isLoading) {
    return (
      <div className="h-full overflow-y-auto px-4 py-5 text-text-primary">
        <GlassPanel className="mx-auto max-w-6xl p-6">
          <div className="h-[360px] animate-pulse rounded-lg bg-bg-secondary/70" />
        </GlassPanel>
      </div>
    )
  }

  if (!app) {
    return (
      <div className="h-full overflow-y-auto px-4 py-5 text-text-primary">
        <GlassPanel className="mx-auto max-w-4xl p-6">
          <EmptyState
            icon={AppWindow}
            title={t('serverApps.notFoundTitle')}
            description={t('serverApps.notFoundDesc')}
          />
        </GlassPanel>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto py-3 pr-3 pl-0 text-text-primary md:py-4 md:pr-5">
      <div className="flex w-full flex-col gap-4">
        <GlassPanel className="overflow-hidden p-0">
          <div className="relative min-h-[430px] bg-bg-primary md:min-h-[470px]">
            <DetailImageWithFallback
              imageUrl={app.coverImageUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,7,18,0.12)_0%,rgba(3,7,18,0.28)_34%,rgba(3,7,18,0.74)_70%,rgba(3,7,18,0.96)_100%)]" />
            <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/55 to-transparent" />
            <div className="relative flex min-h-[430px] flex-col justify-between p-5 md:min-h-[470px] md:p-8">
              <button
                type="button"
                onClick={() => navigate({ to: '/discover/apps' })}
                className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-black/40 px-3 py-2 text-sm font-bold text-white shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
              >
                <ArrowLeft size={16} />
                {t('serverApps.backToDirectory')}
              </button>
              <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                <div className="flex min-w-0 items-end gap-4">
                  <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-[28px] border border-white/25 bg-bg-primary shadow-[0_22px_55px_rgba(0,0,0,0.5)] md:h-28 md:w-28">
                    <DetailIconWithFallback imageUrl={app.iconUrl} label={app.name} />
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-3xl font-black leading-tight text-white drop-shadow-[0_4px_22px_rgba(0,0,0,0.92)] md:text-5xl">
                      {app.name}
                    </h1>
                    <p className="mt-3 max-w-4xl text-base font-bold leading-7 text-white/90 drop-shadow-[0_2px_14px_rgba(0,0,0,0.86)]">
                      {app.tagline ?? app.description ?? t('serverApps.noTagline')}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    icon={Play}
                    disabled={!selectedInstalled}
                    onClick={openInServer}
                  >
                    {t('serverApps.start')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="glass"
                    icon={Plus}
                    disabled={
                      !selectedServerKey ||
                      !selectedServerManageable ||
                      Boolean(selectedInstalled) ||
                      installMutation.isPending
                    }
                    onClick={() => installMutation.mutate()}
                  >
                    {installMutation.isPending
                      ? t('serverApps.adding')
                      : selectedInstalled
                        ? t('serverApps.installed')
                        : t('serverApps.addToServer')}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </GlassPanel>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-4">
            {activeMedia ? (
              <GlassPanel className="p-5 md:p-6">
                <h2 className="mb-4 text-xl font-black text-white">{t('serverApps.gallery')}</h2>
                <div className="relative overflow-hidden rounded-lg border border-[var(--glass-line)] bg-bg-primary/70">
                  <div className="aspect-video">
                    {activeMedia.type === 'video' ? (
                      <video
                        src={activeMedia.url}
                        poster={app.coverImageUrl ?? undefined}
                        controls
                        preload="metadata"
                        className="h-full w-full bg-black object-contain"
                      />
                    ) : (
                      <DetailImageWithFallback
                        imageUrl={activeMedia.url}
                        alt={activeMedia.alt ?? ''}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  {gallery.length > 1 ? (
                    <>
                      <button
                        type="button"
                        aria-label={t('serverApps.previousMedia')}
                        onClick={() => moveMedia(-1)}
                        className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
                      >
                        <ChevronLeft size={22} />
                      </button>
                      <button
                        type="button"
                        aria-label={t('serverApps.nextMedia')}
                        onClick={() => moveMedia(1)}
                        className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
                      >
                        <ChevronRight size={22} />
                      </button>
                    </>
                  ) : null}
                </div>
                {gallery.length > 1 ? (
                  <div className="mt-4 flex items-center justify-center gap-2">
                    {gallery.map((item, index) => (
                      <button
                        key={`${item.url}:${index}`}
                        type="button"
                        aria-label={t('serverApps.selectMedia', { index: index + 1 })}
                        aria-current={index === activeMediaIndex ? 'true' : undefined}
                        onClick={() => setActiveMediaIndex(index)}
                        className={`h-2.5 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 ${
                          index === activeMediaIndex
                            ? 'w-8 bg-white'
                            : 'w-2.5 bg-white/40 hover:bg-white/60'
                        }`}
                      />
                    ))}
                  </div>
                ) : null}
              </GlassPanel>
            ) : null}

            {overview ? (
              <GlassPanel className="p-5 md:p-6">
                <h2 className="mb-3 text-xl font-black text-white">{t('serverApps.overview')}</h2>
                <p className="max-w-3xl whitespace-pre-line text-sm font-semibold leading-7 text-text-secondary">
                  {overview}
                </p>
              </GlassPanel>
            ) : null}

            <GlassPanel className="p-5 md:p-6">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 text-left"
                aria-expanded={commandsOpen}
                onClick={() => setCommandsOpen((value) => !value)}
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/12 text-primary">
                    <Terminal size={18} />
                  </span>
                  <span>
                    <span className="block text-xl font-black text-white">
                      {t('serverApps.commands')}
                    </span>
                    <span className="mt-1 block text-sm font-semibold text-text-muted">
                      {app.manifest.commands.length}
                    </span>
                  </span>
                </span>
                <ChevronDown
                  size={20}
                  className={`shrink-0 text-text-muted transition ${
                    commandsOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {commandsOpen ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {app.manifest.commands.map((command) => (
                    <div
                      key={command.name}
                      className="rounded-lg border border-[var(--glass-line)] bg-bg-secondary/42 p-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                          <Terminal size={18} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-black text-white">{command.title ?? command.name}</h3>
                          <p className="mt-1 text-xs font-mono text-text-muted">{command.name}</p>
                          <p className="mt-2 line-clamp-3 text-sm leading-6 text-text-secondary">
                            {command.description ?? t('serverApps.commandNoDescription')}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </GlassPanel>

            <GlassPanel className="p-5 md:p-6">
              <h2 className="mb-4 text-xl font-black text-white">{t('serverApps.dataAccess')}</h2>
              <div className="rounded-lg border border-[var(--glass-line)] bg-bg-secondary/42 p-4">
                <div className="flex gap-3">
                  <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <p className="font-bold text-white">{t('serverApps.dataAccessTitle')}</p>
                    <p className="mt-1 text-sm leading-6 text-text-secondary">
                      {t('serverApps.dataAccessBody')}
                    </p>
                  </div>
                </div>
              </div>
            </GlassPanel>
          </div>

          <aside className="flex min-w-0 flex-col gap-4">
            <GlassPanel className="p-5">
              <label
                className="mb-2 block text-sm font-black text-white"
                htmlFor="server-app-server"
              >
                {t('serverApps.chooseServer')}
              </label>
              <select
                id="server-app-server"
                value={selectedServer?.server.id ?? ''}
                onChange={(event) => setSelectedServerId(event.target.value)}
                className="h-11 w-full rounded-lg border border-[var(--glass-line)] bg-bg-primary/70 px-3 text-sm font-bold text-white outline-none focus:ring-2 focus:ring-primary/45"
              >
                {myServers.map((entry) => (
                  <option key={entry.server.id} value={entry.server.id}>
                    {entry.server.name}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs leading-5 text-text-muted">
                {selectedInstalled
                  ? t('serverApps.installedOnSelected')
                  : selectedServerManageable
                    ? t('serverApps.readyToAdd')
                    : t('serverApps.adminRequired')}
              </p>
            </GlassPanel>

            <MetadataPanel app={app} />
          </aside>
        </div>
      </div>
    </div>
  )
}

function MetadataPanel({ app }: { app: ServerAppCatalogDetail }) {
  const { t } = useTranslation()
  const apiOrigin = originOf(app.manifest.api.baseUrl)
  return (
    <GlassPanel className="p-5">
      <div className="space-y-5">
        <MetadataBlock icon={Server} title={t('serverApps.serverCount')}>
          <p className="font-bold text-text-secondary">
            {t('serverApps.serverCountValue', { count: app.serverCount })}
          </p>
        </MetadataBlock>

        <MetadataBlock icon={Tags} title={t('serverApps.categories')}>
          <ChipList values={app.categories} empty={t('serverApps.noCategories')} />
        </MetadataBlock>

        <MetadataBlock icon={Languages} title={t('serverApps.languages')}>
          <ChipList values={app.supportedLanguages} empty={t('serverApps.noLanguages')} />
        </MetadataBlock>

        <MetadataBlock icon={LinkIcon} title={t('serverApps.links')}>
          {app.links.length ? (
            <div className="space-y-2">
              {app.links.map((link) => (
                <a
                  key={`${link.type}:${link.url}`}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-sm font-bold text-primary hover:text-primary/80"
                >
                  <ExternalLink size={15} />
                  <span className="min-w-0 truncate">{link.label}</span>
                </a>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted">{t('serverApps.noLinks')}</p>
          )}
        </MetadataBlock>

        <MetadataBlock icon={FileText} title={t('serverApps.manifest')}>
          <div className="space-y-1 text-sm font-semibold text-text-secondary">
            <p>{t('serverApps.versionValue', { version: app.manifest.version ?? '1' })}</p>
            {apiOrigin ? <p className="truncate">{apiOrigin}</p> : null}
          </div>
        </MetadataBlock>

        <MetadataBlock icon={LockKeyhole} title={t('serverApps.privacy')}>
          <p className="text-sm leading-6 text-text-secondary">{t('serverApps.privacyBody')}</p>
        </MetadataBlock>
      </div>
    </GlassPanel>
  )
}

function MetadataBlock({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon
  title: string
  children: ReactNode
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 text-sm font-black text-white">
        <Icon size={17} className="text-primary" />
        {title}
      </div>
      {children}
    </section>
  )
}

function ChipList({ values, empty }: { values: string[]; empty: string }) {
  if (!values.length) return <p className="text-sm text-text-muted">{empty}</p>
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((value) => (
        <Badge key={value} variant="neutral" size="sm">
          {value}
        </Badge>
      ))}
    </div>
  )
}
