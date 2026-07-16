import {
  BookOpen,
  CheckCircle2,
  ExternalLink,
  ImageIcon,
  Languages,
  Plus,
  RefreshCw,
  Search,
  Server,
  Tags,
  Terminal,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { apiFetch, type SpaceAppCatalogEntry, type SpaceAppInstallation } from '../lib/admin-api'

interface PaginatedResponse<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

const PAGE_SIZE = 100

function statusClass(status: string) {
  if (status === 'active') return 'bg-green-500/20 text-green-300'
  if (status === 'disabled') return 'bg-yellow-500/20 text-yellow-300'
  return 'bg-zinc-500/20 text-zinc-300'
}

function serverRef(app: SpaceAppInstallation) {
  return app.serverSlug || app.serverId
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function normalizeApp(app: SpaceAppInstallation): SpaceAppInstallation {
  const raw = app as SpaceAppInstallation & {
    categories?: unknown
    supportedLanguages?: unknown
  }
  return {
    ...app,
    inCatalog: Boolean(app.inCatalog),
    catalogEntryId: app.catalogEntryId ?? null,
    catalogStatus: app.catalogStatus ?? null,
    categories: stringArray(raw.categories),
    supportedLanguages: stringArray(raw.supportedLanguages),
    coverImageUrl: app.coverImageUrl ?? null,
  }
}

function normalizeCatalogEntry(entry: SpaceAppCatalogEntry): SpaceAppCatalogEntry {
  const raw = entry as SpaceAppCatalogEntry & {
    categories?: unknown
    supportedLanguages?: unknown
    gallery?: unknown
    links?: unknown
  }
  return {
    ...entry,
    categories: stringArray(raw.categories),
    supportedLanguages: stringArray(raw.supportedLanguages),
    gallery: Array.isArray(raw.gallery) ? entry.gallery : [],
    links: Array.isArray(raw.links) ? entry.links : [],
    serverCount: entry.serverCount ?? 0,
    commandCount: entry.commandCount ?? 0,
    skillCount: entry.skillCount ?? 0,
  }
}

function metadataGaps(
  app: Pick<SpaceAppInstallation, 'categories' | 'supportedLanguages' | 'coverImageUrl'>,
) {
  const gaps: string[] = []
  if (!app.coverImageUrl) gaps.push('封面')
  if (app.categories.length === 0) gaps.push('分类')
  if (app.supportedLanguages.length === 0) gaps.push('语言')
  return gaps
}

export function SpaceAppsTab() {
  const [apps, setApps] = useState<SpaceAppInstallation[]>([])
  const [appTotal, setAppTotal] = useState(0)
  const [appPage, setAppPage] = useState(1)
  const [catalog, setCatalog] = useState<SpaceAppCatalogEntry[]>([])
  const [catalogTotal, setCatalogTotal] = useState(0)
  const [catalogPage, setCatalogPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [catalogManifestUrl, setCatalogManifestUrl] = useState('')
  const [catalogError, setCatalogError] = useState('')
  const [catalogSaving, setCatalogSaving] = useState(false)
  const [publishingId, setPublishingId] = useState<string | null>(null)
  const [refreshingAppId, setRefreshingAppId] = useState<string | null>(null)
  const [refreshingCatalogId, setRefreshingCatalogId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const buildParams = (page: number) => {
        const params = new URLSearchParams({
          includeTotal: '1',
          limit: String(PAGE_SIZE),
          offset: String((page - 1) * PAGE_SIZE),
        })
        const search = query.trim()
        if (search) params.set('search', search)
        return params
      }
      const [nextApps, nextCatalog] = await Promise.all([
        apiFetch<PaginatedResponse<SpaceAppInstallation>>(
          `/space-apps?${buildParams(appPage).toString()}`,
        ),
        apiFetch<PaginatedResponse<SpaceAppCatalogEntry>>(
          `/space-app-catalog?${buildParams(catalogPage).toString()}`,
        ),
      ])
      setApps(nextApps.items.map(normalizeApp))
      setAppTotal(nextApps.total)
      setCatalog(nextCatalog.items.map(normalizeCatalogEntry))
      setCatalogTotal(nextCatalog.total)
    } catch {
      /* */
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setAppPage(1)
    setCatalogPage(1)
  }, [query])

  useEffect(() => {
    load()
  }, [appPage, catalogPage, query])

  const totalCommands = apps.reduce((sum, app) => sum + app.commandCount, 0)
  const totalGrants = apps.reduce((sum, app) => sum + app.grantCount, 0)
  const activeCatalogCount = catalog.filter((entry) => entry.status === 'active').length
  const unlistedApps = apps.filter((app) => !app.inCatalog)
  const metadataGapCount = apps.filter((app) => metadataGaps(app).length > 0).length

  const addCatalogEntry = async () => {
    setCatalogError('')
    setCatalogSaving(true)
    try {
      await apiFetch<SpaceAppCatalogEntry>('/space-app-catalog', {
        method: 'POST',
        body: JSON.stringify({
          manifestUrl: catalogManifestUrl.trim(),
        }),
      })
      await load()
      setCatalogManifestUrl('')
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : String(error))
    } finally {
      setCatalogSaving(false)
    }
  }

  const publishInstalledSpaceApp = async (app: SpaceAppInstallation) => {
    setCatalogError('')
    setPublishingId(app.id)
    try {
      await apiFetch<SpaceAppCatalogEntry>(`/space-apps/${app.id}/catalog`, {
        method: 'POST',
      })
      await load()
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : String(error))
    } finally {
      setPublishingId(null)
    }
  }

  const refreshInstalledSpaceApp = async (app: SpaceAppInstallation) => {
    setCatalogError('')
    setRefreshingAppId(app.id)
    try {
      await apiFetch(`/space-apps/${app.id}/refresh`, { method: 'POST' })
      await load()
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : String(error))
    } finally {
      setRefreshingAppId(null)
    }
  }

  const refreshCatalogEntry = async (entry: SpaceAppCatalogEntry) => {
    setCatalogError('')
    setRefreshingCatalogId(entry.id)
    try {
      await apiFetch(`/space-app-catalog/${entry.id}/refresh`, { method: 'POST' })
      await load()
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : String(error))
    } finally {
      setRefreshingCatalogId(null)
    }
  }

  const deleteCatalogEntry = async (entry: SpaceAppCatalogEntry) => {
    if (!confirm(`确定要从 Space App 商店删除 ${entry.name} 吗？已安装的 Space App 不会被卸载。`))
      return
    await apiFetch(`/space-app-catalog/${entry.id}`, { method: 'DELETE' })
    await load()
  }

  const uninstall = async (app: SpaceAppInstallation) => {
    if (!confirm(`确定要从空间「${app.serverName}」卸载 ${app.name} 吗？`)) return
    await apiFetch(`/space-apps/${app.id}`, { method: 'DELETE' })
    await load()
  }

  const copyCli = async (app: SpaceAppInstallation) => {
    const text = `shadowob space-app call ${app.appKey} <command> --server ${serverRef(app)} --json-input '{}'`
    await navigator.clipboard?.writeText(text)
    setCopiedId(app.id)
    window.setTimeout(() => setCopiedId(null), 1400)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-black text-white">Space App 管理</h2>
          <p className="mt-1 text-sm text-zinc-400">
            已安装 Space App 进入待收录队列，上架后会出现在发现页。
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索 Space App、空间或 API"
              className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-900 pl-9 pr-3 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500 sm:w-80"
            />
          </div>
          <a
            href="/app/discover/space-apps"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm font-bold text-zinc-200 hover:bg-zinc-800"
          >
            <ExternalLink className="h-4 w-4" />
            发现页
          </a>
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm font-bold text-zinc-200 hover:bg-zinc-800 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </div>

      {catalogError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {catalogError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <MetricCard label="已安装" value={appTotal} />
        <MetricCard label="待收录" value={unlistedApps.length} tone="amber" />
        <MetricCard label="已上架" value={catalogTotal || activeCatalogCount} tone="green" />
        <MetricCard label="命令" value={totalCommands} tone="indigo" />
        <MetricCard label="授权" value={totalGrants} tone="green" />
        <MetricCard label="缺元数据" value={metadataGapCount} tone="red" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-sm font-black text-white">
              <UploadCloud className="h-4 w-4 text-amber-300" />
              待收录 Space App
            </h3>
            <span className="rounded-full bg-amber-500/10 px-2 py-1 text-xs font-bold text-amber-200">
              {unlistedApps.length}
            </span>
          </div>
          {unlistedApps.length ? (
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {unlistedApps.map((app) => (
                <PublishQueueCard
                  key={app.id}
                  app={app}
                  publishing={publishingId === app.id}
                  onPublish={() => publishInstalledSpaceApp(app)}
                />
              ))}
            </div>
          ) : (
            <EmptyPanel
              text={query ? '没有匹配的待收录 Space App。' : '所有已安装 Space App 都已收录。'}
            />
          )}
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-black text-white">
            <Plus className="h-4 w-4 text-indigo-300" />
            Manifest URL
          </h3>
          <div className="space-y-3">
            <input
              value={catalogManifestUrl}
              onChange={(e) => setCatalogManifestUrl(e.target.value)}
              placeholder="https://example.com/space-app.json"
              className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={addCatalogEntry}
              disabled={!catalogManifestUrl.trim() || catalogSaving}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 text-sm font-black text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              {catalogSaving ? '保存中…' : '上架到官方市场'}
            </button>
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-black text-white">
            <BookOpen className="h-4 w-4 text-indigo-300" />
            官方市场
          </h3>
          <span className="rounded-full bg-zinc-800 px-2 py-1 text-xs text-zinc-400">
            {catalogTotal}
          </span>
        </div>
        {catalog.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {catalog.map((entry) => (
              <CatalogCard
                key={entry.id}
                entry={entry}
                refreshing={refreshingCatalogId === entry.id}
                onRefresh={() => refreshCatalogEntry(entry)}
                onDelete={() => deleteCatalogEntry(entry)}
              />
            ))}
          </div>
        ) : (
          <EmptyPanel text="暂无官方市场条目。" />
        )}
        <ListPager page={catalogPage} total={catalogTotal} onPageChange={setCatalogPage} />
      </section>

      <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900">
        <table className="w-full min-w-[1080px] text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-zinc-400">
              <th className="px-4 py-3">Space App</th>
              <th className="px-4 py-3">空间</th>
              <th className="px-4 py-3">能力</th>
              <th className="px-4 py-3">端点</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">安装时间</th>
              <th className="px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {apps.map((app) => (
              <tr key={app.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                <td className="px-4 py-3 align-top">
                  <div className="flex items-start gap-3">
                    {app.iconUrl ? (
                      <img src={app.iconUrl} alt="" className="h-9 w-9 rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500 text-sm font-bold text-white">
                        {app.name[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-white">{app.name}</p>
                      <p className="font-mono text-xs text-zinc-500">{app.appKey}</p>
                      {app.description && (
                        <p className="mt-1 max-w-xs truncate text-xs text-zinc-400">
                          {app.description}
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 align-top">
                  <p className="text-zinc-200">{app.serverName}</p>
                  <p className="font-mono text-xs text-zinc-500">{serverRef(app)}</p>
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                      {app.commandCount} commands
                    </span>
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                      {app.skillCount} skills
                    </span>
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                      {app.grantCount} grants
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {app.categories.slice(0, 3).map((category) => (
                      <span
                        key={category}
                        className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300"
                      >
                        <Tags className="h-3 w-3" />
                        {category}
                      </span>
                    ))}
                    {app.supportedLanguages.slice(0, 2).map((language) => (
                      <span
                        key={language}
                        className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300"
                      >
                        <Languages className="h-3 w-3" />
                        {language}
                      </span>
                    ))}
                  </div>
                  <button
                    onClick={() => copyCli(app)}
                    className="mt-2 text-xs text-indigo-300 hover:text-indigo-200"
                  >
                    {copiedId === app.id ? '已复制 CLI 示例' : '复制 CLI 示例'}
                  </button>
                </td>
                <td className="px-4 py-3 align-top">
                  <p className="max-w-xs truncate font-mono text-xs text-zinc-400">
                    {app.apiBaseUrl}
                  </p>
                  {app.iframeEntry && (
                    <a
                      href={app.iframeEntry}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-indigo-300 hover:text-indigo-200"
                    >
                      iframe
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="flex flex-col items-start gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${statusClass(app.status)}`}>
                      {app.status}
                    </span>
                    {app.inCatalog ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/15 px-2 py-0.5 text-xs text-indigo-200">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        已上架
                      </span>
                    ) : (
                      <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                        未上架
                      </span>
                    )}
                    {!app.inCatalog && metadataGaps(app).length > 0 && (
                      <span className="text-xs text-amber-300">
                        缺少 {metadataGaps(app).join('、')}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 align-top text-zinc-500">
                  {app.createdAt ? new Date(app.createdAt).toLocaleString() : '-'}
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="flex flex-col items-start gap-2">
                    <button
                      onClick={() => refreshInstalledSpaceApp(app)}
                      disabled={refreshingAppId === app.id}
                      className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-200 disabled:opacity-60"
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${refreshingAppId === app.id ? 'animate-spin' : ''}`}
                      />
                      {refreshingAppId === app.id ? '刷新中…' : '刷新 manifest'}
                    </button>
                    {!app.inCatalog && (
                      <button
                        onClick={() => publishInstalledSpaceApp(app)}
                        disabled={publishingId === app.id}
                        className="inline-flex items-center gap-1 text-xs text-indigo-300 hover:text-indigo-200 disabled:opacity-60"
                      >
                        <UploadCloud className="h-3.5 w-3.5" />
                        {publishingId === app.id ? '上架中…' : '上架'}
                      </button>
                    )}
                    <button
                      onClick={() => uninstall(app)}
                      className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      卸载
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {apps.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-zinc-500">
                  {loading ? '加载中…' : '暂无已安装 Space App'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <ListPager page={appPage} total={appTotal} onPageChange={setAppPage} />
    </div>
  )
}

function MetricCard({
  label,
  value,
  tone = 'zinc',
}: {
  label: string
  value: number
  tone?: 'zinc' | 'indigo' | 'green' | 'amber' | 'red'
}) {
  const toneClass = {
    zinc: 'text-white',
    indigo: 'text-indigo-300',
    green: 'text-green-300',
    amber: 'text-amber-300',
    red: 'text-red-300',
  }[tone]
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs font-bold text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-black ${toneClass}`}>{value}</p>
    </div>
  )
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">
      {text}
    </div>
  )
}

function ListPager({
  page,
  total,
  onPageChange,
}: {
  page: number
  total: number
  onPageChange: (page: number) => void
}) {
  if (total <= PAGE_SIZE) return null
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  return (
    <div className="mt-4 flex items-center justify-between gap-3 text-xs text-zinc-500">
      <span>
        第 {page} / {totalPages} 页，共 {total} 条
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          className="rounded-lg border border-zinc-800 px-3 py-1.5 text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
        >
          上一页
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          className="rounded-lg border border-zinc-800 px-3 py-1.5 text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
        >
          下一页
        </button>
      </div>
    </div>
  )
}

function AppAvatar({
  iconUrl,
  name,
  size = 'md',
}: {
  iconUrl: string | null
  name: string
  size?: 'sm' | 'md'
}) {
  const sizeClass = size === 'sm' ? 'h-9 w-9 rounded-lg text-sm' : 'h-11 w-11 rounded-xl text-base'
  if (iconUrl) {
    return <img src={iconUrl} alt="" className={`${sizeClass} shrink-0 object-cover`} />
  }
  return (
    <div
      className={`${sizeClass} flex shrink-0 items-center justify-center bg-indigo-500 font-black text-white`}
    >
      {name[0]?.toUpperCase()}
    </div>
  )
}

function MetadataChips({
  categories,
  supportedLanguages,
}: Pick<SpaceAppInstallation, 'categories' | 'supportedLanguages'>) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {categories.slice(0, 3).map((category) => (
        <span
          key={category}
          className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300"
        >
          <Tags className="h-3 w-3" />
          {category}
        </span>
      ))}
      {supportedLanguages.slice(0, 2).map((language) => (
        <span
          key={language}
          className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300"
        >
          <Languages className="h-3 w-3" />
          {language}
        </span>
      ))}
    </div>
  )
}

function PublishQueueCard({
  app,
  publishing,
  onPublish,
}: {
  app: SpaceAppInstallation
  publishing: boolean
  onPublish: () => void
}) {
  const gaps = metadataGaps(app)
  return (
    <article className="flex min-h-[220px] flex-col rounded-xl border border-zinc-800 bg-zinc-950 p-3">
      <div className="flex items-start gap-3">
        <AppAvatar iconUrl={app.iconUrl} name={app.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-white">{app.name}</p>
          <p className="truncate font-mono text-xs text-zinc-500">{app.appKey}</p>
        </div>
      </div>
      <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-zinc-400">
        {app.description || '暂无介绍'}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-400">
        <span className="inline-flex items-center gap-1 rounded-lg bg-zinc-900 px-2 py-1">
          <Server className="h-3.5 w-3.5 text-zinc-500" />
          {app.serverName}
        </span>
        <span className="inline-flex items-center gap-1 rounded-lg bg-zinc-900 px-2 py-1">
          <Terminal className="h-3.5 w-3.5 text-zinc-500" />
          {app.commandCount} 命令
        </span>
      </div>
      <div className="mt-3 min-h-6">
        <MetadataChips categories={app.categories} supportedLanguages={app.supportedLanguages} />
      </div>
      {gaps.length > 0 && (
        <p className="mt-2 text-xs font-bold text-amber-300">缺少 {gaps.join('、')}</p>
      )}
      <button
        onClick={onPublish}
        disabled={publishing}
        className="mt-auto inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 text-sm font-black text-white hover:bg-indigo-500 disabled:opacity-60"
      >
        <UploadCloud className="h-4 w-4" />
        {publishing ? '上架中…' : '上架到发现页'}
      </button>
    </article>
  )
}

function CatalogCard({
  entry,
  refreshing,
  onRefresh,
  onDelete,
}: {
  entry: SpaceAppCatalogEntry
  refreshing: boolean
  onRefresh: () => void
  onDelete: () => void
}) {
  return (
    <article className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
      <div className="h-28 bg-zinc-900">
        {entry.coverImageUrl ? (
          <img src={entry.coverImageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-600">
            <ImageIcon className="h-7 w-7" />
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-start gap-3">
          <AppAvatar iconUrl={entry.iconUrl} name={entry.name} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold text-white">{entry.name}</p>
            <p className="truncate font-mono text-xs text-zinc-500">{entry.appKey}</p>
          </div>
          <span className={`rounded-full px-2 py-0.5 text-xs ${statusClass(entry.status)}`}>
            {entry.status}
          </span>
        </div>
        {entry.description && (
          <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-zinc-400">
            {entry.description}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {entry.categories.slice(0, 3).map((category) => (
            <span
              key={category}
              className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300"
            >
              {category}
            </span>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-zinc-500">
          <span>
            {entry.commandCount} 命令 · {entry.serverCount} 空间
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200 disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? '刷新中…' : '刷新'}
            </button>
            <button
              onClick={onDelete}
              className="inline-flex items-center gap-1 text-red-400 hover:text-red-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
              删除
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}
