import { BookOpen, ExternalLink, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { apiFetch, type ServerAppCatalogEntry, type ServerAppIntegration } from '../lib/admin-api'

function statusClass(status: string) {
  if (status === 'active') return 'bg-green-500/20 text-green-300'
  if (status === 'disabled') return 'bg-yellow-500/20 text-yellow-300'
  return 'bg-zinc-500/20 text-zinc-300'
}

function serverRef(app: ServerAppIntegration) {
  return app.serverSlug || app.serverId
}

export function ServerAppsTab() {
  const [apps, setApps] = useState<ServerAppIntegration[]>([])
  const [catalog, setCatalog] = useState<ServerAppCatalogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [catalogManifestUrl, setCatalogManifestUrl] = useState('')
  const [catalogSharedSecret, setCatalogSharedSecret] = useState('')
  const [catalogError, setCatalogError] = useState('')
  const [catalogSaving, setCatalogSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [nextApps, nextCatalog] = await Promise.all([
        apiFetch<ServerAppIntegration[]>('/server-apps'),
        apiFetch<ServerAppCatalogEntry[]>('/server-app-catalog'),
      ])
      setApps(nextApps)
      setCatalog(nextCatalog)
    } catch {
      /* */
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filteredApps = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return apps
    return apps.filter((app) =>
      [app.name, app.appKey, app.serverName, app.serverSlug ?? '', app.apiBaseUrl]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
  }, [apps, query])

  const totalCommands = apps.reduce((sum, app) => sum + app.commandCount, 0)
  const totalGrants = apps.reduce((sum, app) => sum + app.grantCount, 0)

  const addCatalogEntry = async () => {
    setCatalogError('')
    setCatalogSaving(true)
    try {
      const entry = await apiFetch<ServerAppCatalogEntry>('/server-app-catalog', {
        method: 'POST',
        body: JSON.stringify({
          manifestUrl: catalogManifestUrl.trim(),
          ...(catalogSharedSecret.trim() ? { sharedSecret: catalogSharedSecret.trim() } : {}),
        }),
      })
      setCatalog((current) => {
        const withoutExisting = current.filter((item) => item.appKey !== entry.appKey)
        return [...withoutExisting, entry].sort((a, b) => a.name.localeCompare(b.name))
      })
      setCatalogManifestUrl('')
      setCatalogSharedSecret('')
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : String(error))
    } finally {
      setCatalogSaving(false)
    }
  }

  const deleteCatalogEntry = async (entry: ServerAppCatalogEntry) => {
    if (!confirm(`确定要从 App 名录删除 ${entry.name} 吗？已安装的服务器 App 不会被卸载。`)) return
    await apiFetch(`/server-app-catalog/${entry.id}`, { method: 'DELETE' })
    setCatalog((current) => current.filter((item) => item.id !== entry.id))
  }

  const uninstall = async (app: ServerAppIntegration) => {
    if (!confirm(`确定要从服务器「${app.serverName}」卸载 ${app.name} 吗？`)) return
    await apiFetch(`/server-apps/${app.id}`, { method: 'DELETE' })
    setApps((current) => current.filter((item) => item.id !== app.id))
  }

  const copyCli = async (app: ServerAppIntegration) => {
    const text = `shadowob app call ${app.appKey} <command> --server ${serverRef(app)} --json-input '{}'`
    await navigator.clipboard?.writeText(text)
    setCopiedId(app.id)
    window.setTimeout(() => setCopiedId(null), 1400)
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-bold mb-1">App 集成</h2>
          <p className="text-sm text-zinc-400">
            查看所有绑定到服务器的 App，审计 Buddy 授权数量，并在异常时从全局卸载。
          </p>
        </div>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索 App、服务器或 API"
            className="w-72 max-w-full bg-zinc-900 text-white rounded-lg px-3 py-2 text-sm border border-zinc-800 outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </div>

      <div className="mb-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-bold text-white">
                <BookOpen className="h-4 w-4 text-indigo-300" />
                App 名录
              </h3>
              <p className="mt-1 text-xs text-zinc-500">
                管理端维护可安装 App，服务器页面可从名录一键安装，也可以继续自定义 manifest。
              </p>
            </div>
            <span className="rounded-full bg-zinc-800 px-2 py-1 text-xs text-zinc-400">
              {catalog.length} entries
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {catalog.map((entry) => (
              <div key={entry.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <div className="flex items-start gap-3">
                  {entry.iconUrl ? (
                    <img src={entry.iconUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500 text-sm font-bold text-white">
                      {entry.name[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-white">{entry.name}</p>
                      {entry.hasSharedSecret && (
                        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-green-300" />
                      )}
                    </div>
                    <p className="font-mono text-xs text-zinc-500">{entry.appKey}</p>
                    {entry.description && (
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-400">
                        {entry.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                  <span>{entry.commandCount} commands</span>
                  <button
                    onClick={() => deleteCatalogEntry(entry)}
                    className="inline-flex items-center gap-1 text-red-400 hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    删除
                  </button>
                </div>
              </div>
            ))}
            {catalog.length === 0 && (
              <div className="rounded-lg border border-dashed border-zinc-800 p-5 text-sm text-zinc-500">
                暂无 App 名录。
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
            <Plus className="h-4 w-4 text-indigo-300" />
            新增或更新 App
          </h3>
          <div className="space-y-3">
            <input
              value={catalogManifestUrl}
              onChange={(e) => setCatalogManifestUrl(e.target.value)}
              placeholder="Manifest URL"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              value={catalogSharedSecret}
              onChange={(e) => setCatalogSharedSecret(e.target.value)}
              placeholder="Shared secret（可选）"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={addCatalogEntry}
              disabled={!catalogManifestUrl.trim() || catalogSaving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              {catalogSaving ? '保存中…' : '保存到名录'}
            </button>
            {catalogError && (
              <p className="rounded-lg bg-red-500/10 p-2 text-xs text-red-300">{catalogError}</p>
            )}
          </div>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500">已集成 App</p>
          <p className="mt-1 text-2xl font-bold text-white">{apps.length}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500">可发现命令</p>
          <p className="mt-1 text-2xl font-bold text-indigo-300">{totalCommands}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500">Buddy 授权</p>
          <p className="mt-1 text-2xl font-bold text-green-300">{totalGrants}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500">命中搜索</p>
          <p className="mt-1 text-2xl font-bold text-amber-300">{filteredApps.length}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900">
        <table className="w-full min-w-[1080px] text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-zinc-400">
              <th className="px-4 py-3">App</th>
              <th className="px-4 py-3">服务器</th>
              <th className="px-4 py-3">能力</th>
              <th className="px-4 py-3">端点</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">安装时间</th>
              <th className="px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredApps.map((app) => (
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
                  <span className={`rounded-full px-2 py-0.5 text-xs ${statusClass(app.status)}`}>
                    {app.status}
                  </span>
                </td>
                <td className="px-4 py-3 align-top text-zinc-500">
                  {app.createdAt ? new Date(app.createdAt).toLocaleString() : '-'}
                </td>
                <td className="px-4 py-3 align-top">
                  <button
                    onClick={() => uninstall(app)}
                    className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    卸载
                  </button>
                </td>
              </tr>
            ))}
            {filteredApps.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-zinc-500">
                  {loading ? '加载中…' : '暂无 App 集成'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
