import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AppWindow,
  ArrowLeft,
  CheckCircle2,
  Edit3,
  ExternalLink,
  Globe,
  Home,
  Loader2,
  Maximize2,
  Minimize2,
  Package,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchApi } from '../../lib/api'
import { joinApp, leaveApp } from '../../lib/socket'
import { useAppStore } from '../../stores/app.store'
import { WorkspaceFilePicker } from '../workspace/WorkspaceFilePicker'

/* ───────── Types ───────── */

export interface AppItem {
  id: string
  serverId: string
  publisherId: string
  channelId: string | null
  name: string
  slug: string | null
  description: string | null
  iconUrl: string | null
  bannerUrl: string | null
  sourceType: 'zip' | 'url'
  sourceUrl: string
  version: string | null
  status: 'draft' | 'active' | 'archived'
  isHomepage: boolean
  settings: Record<string, unknown> | null
  viewCount: number
  userCount: number
  createdAt: string
  updatedAt: string
}

/* ───────── Main Component ───────── */

interface AppPageProps {
  serverId: string
  isAdmin?: boolean
  onClose?: () => void
}

export function AppPage({ serverId, isAdmin, onClose }: AppPageProps) {
  const { activeAppId, setActiveAppId, overlay, setOverlay, editingApp, setEditingApp } =
    useAppStore()
  const queryClient = useQueryClient()
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; app: AppItem } | null>(null)

  const { data: appsData, isLoading } = useQuery({
    queryKey: ['apps', serverId],
    queryFn: () => fetchApi<{ items: AppItem[]; total: number }>(`/api/servers/${serverId}/apps`),
    enabled: !!serverId,
  })

  const deleteApp = useMutation({
    mutationFn: (appId: string) =>
      fetchApi(`/api/servers/${serverId}/apps/${appId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['apps', serverId] }),
  })

  const updateApp = useMutation({
    mutationFn: ({ appId, data }: { appId: string; data: Record<string, unknown> }) =>
      fetchApi(`/api/servers/${serverId}/apps/${appId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['apps', serverId] }),
  })

  const apps = appsData?.items ?? []

  // If viewing a specific app, show the viewer
  if (activeAppId) {
    const app = apps.find((a) => a.id === activeAppId)
    return (
      <AppViewer
        app={app ?? null}
        appId={activeAppId}
        serverId={serverId}
        onBack={() => setActiveAppId(null)}
      />
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-bg-primary overflow-hidden">
      {/* Header */}
      <div className="desktop-drag-titlebar h-12 px-4 flex items-center gap-3 border-b border-border-subtle bg-bg-secondary/50 shrink-0">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <AppWindow size={18} className="text-text-muted" />
        <h2 className="font-bold text-text-primary text-sm">应用中心</h2>
        <span className="text-text-muted text-xs">
          {appsData ? `${appsData.total} 个应用` : ''}
        </span>
        <div className="flex-1" />
        {isAdmin && (
          <button
            type="button"
            onClick={() => {
              setEditingApp(null)
              setOverlay('create')
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-primary text-white hover:bg-primary/90 transition"
          >
            <Plus size={14} />
            添加应用
          </button>
        )}
      </div>

      {/* Content — iOS-style icon grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-text-muted">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : apps.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-text-muted gap-2">
            <AppWindow size={32} className="opacity-40" />
            <p className="text-sm">暂无应用</p>
            {isAdmin && <p className="text-xs">点击「添加应用」发布第一个应用</p>}
          </div>
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-4">
            {apps.map((app) => (
              <AppIcon
                key={app.id}
                app={app}
                onOpen={() => setActiveAppId(app.id)}
                onContextMenu={(e) => {
                  if (!isAdmin) return
                  e.preventDefault()
                  setCtxMenu({ x: e.clientX, y: e.clientY, app })
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* App context menu */}
      {ctxMenu && (
        <AppContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          app={ctxMenu.app}
          onClose={() => setCtxMenu(null)}
          onEdit={() => {
            setEditingApp(ctxMenu.app)
            setOverlay('create')
            setCtxMenu(null)
          }}
          onToggleHomepage={() => {
            updateApp.mutate({
              appId: ctxMenu.app.id,
              data: { isHomepage: !ctxMenu.app.isHomepage },
            })
            setCtxMenu(null)
          }}
          onToggleStatus={() => {
            const next = ctxMenu.app.status === 'active' ? 'archived' : 'active'
            updateApp.mutate({ appId: ctxMenu.app.id, data: { status: next } })
            setCtxMenu(null)
          }}
          onDelete={() => {
            if (confirm(`确定删除应用「${ctxMenu.app.name}」？`)) {
              deleteApp.mutate(ctxMenu.app.id)
            }
            setCtxMenu(null)
          }}
        />
      )}

      {/* Create / Edit overlay */}
      {overlay === 'create' && (
        <CreateEditOverlay
          serverId={serverId}
          editingApp={editingApp}
          onClose={() => {
            setOverlay(null)
            setEditingApp(null)
          }}
          onSaved={() => {
            setOverlay(null)
            setEditingApp(null)
            queryClient.invalidateQueries({ queryKey: ['apps', serverId] })
          }}
        />
      )}
    </div>
  )
}

/* ───────── iOS-style App Icon ───────── */

/** Generate a deterministic pastel background color from the first character */
function nameToColor(name: string): string {
  const char = name[0] ?? 'A'
  const code = char.toUpperCase().charCodeAt(0)
  const hue = (code * 137) % 360
  return `hsl(${hue}, 60%, 65%)`
}

function AppIcon({
  app,
  onOpen,
  onContextMenu,
}: {
  app: AppItem
  onOpen: () => void
  onContextMenu: (e: React.MouseEvent) => void
}) {
  return (
    <div
      className="flex flex-col items-center gap-1.5 cursor-pointer group"
      onClick={onOpen}
      onContextMenu={onContextMenu}
    >
      {/* Icon square */}
      <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden shadow-md group-hover:shadow-lg transition-shadow">
        {app.iconUrl ? (
          <img src={app.iconUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-white font-bold text-xl select-none"
            style={{ backgroundColor: nameToColor(app.name) }}
          >
            {app.name[0]?.toUpperCase()}
          </div>
        )}
        {/* Badges */}
        {app.isHomepage && (
          <span className="absolute top-0.5 right-0.5 w-4 h-4 flex items-center justify-center bg-primary rounded-full">
            <Home size={9} className="text-white" />
          </span>
        )}
        {app.status !== 'active' && (
          <span className="absolute bottom-0 inset-x-0 text-center text-[8px] font-bold bg-black/50 text-white py-0.5">
            {app.status === 'draft' ? '草稿' : '归档'}
          </span>
        )}
      </div>
      {/* Name */}
      <span className="text-[11px] text-text-primary text-center leading-tight line-clamp-2 w-16 sm:w-18">
        {app.name}
      </span>
    </div>
  )
}

/* ───────── App Context Menu ───────── */

function AppContextMenu({
  x,
  y,
  app,
  onClose,
  onEdit,
  onToggleHomepage,
  onToggleStatus,
  onDelete,
}: {
  x: number
  y: number
  app: AppItem
  onClose: () => void
  onEdit: () => void
  onToggleHomepage: () => void
  onToggleStatus: () => void
  onDelete: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  useEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    let nx = x
    let ny = y
    if (nx + rect.width > window.innerWidth - 8) nx = window.innerWidth - rect.width - 8
    if (ny + rect.height > window.innerHeight - 8) ny = window.innerHeight - rect.height - 8
    if (nx < 8) nx = 8
    if (ny < 8) ny = 8
    setPos({ x: nx, y: ny })
  }, [x, y])

  const items = [
    { icon: Edit3, label: '编辑', onClick: onEdit },
    {
      icon: Home,
      label: app.isHomepage ? '取消首页' : '设为首页',
      onClick: onToggleHomepage,
    },
    {
      icon: Package,
      label: app.status === 'active' ? '归档' : '激活',
      onClick: onToggleStatus,
    },
    { icon: Trash2, label: '删除', onClick: onDelete, danger: true },
  ]

  return (
    <>
      <div
        className="fixed inset-0 z-[60]"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />
      <div
        ref={menuRef}
        className="fixed z-[61] bg-bg-tertiary/95 backdrop-blur-md border border-border-dim/60 rounded-xl shadow-2xl py-1 min-w-[160px] animate-scale-in"
        style={{ left: pos.x, top: pos.y }}
      >
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={item.onClick}
            className={`flex items-center gap-2 w-full px-2.5 py-[5px] text-[12px] transition-all duration-100 rounded-md mx-1 ${
              item.danger
                ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300'
                : 'text-text-secondary hover:bg-bg-modifier-hover hover:text-text-primary'
            }`}
            style={{ width: 'calc(100% - 8px)' }}
          >
            <item.icon size={14} className="shrink-0" />
            <span className="flex-1 text-left">{item.label}</span>
          </button>
        ))}
      </div>
    </>
  )
}

/* ───────── App Viewer (iframe) ───────── */

function AppViewer({
  app,
  appId,
  serverId,
  onBack,
}: {
  app: AppItem | null
  appId: string
  serverId: string
  onBack: () => void
}) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Fetch app if not passed
  const { data: fetchedApp } = useQuery({
    queryKey: ['app', appId],
    queryFn: () => fetchApi<AppItem>(`/api/servers/${serverId}/apps/${appId}`),
    enabled: !app,
  })

  const currentApp = app ?? fetchedApp

  // Join app WS room
  useEffect(() => {
    if (!currentApp?.id) return
    joinApp(currentApp.id)
    return () => {
      leaveApp(currentApp.id)
    }
  }, [currentApp?.id])

  const resolveAppUrl = useCallback(() => {
    if (!currentApp) return ''
    if (currentApp.sourceType === 'url') {
      const proxyEnabled = currentApp.settings?.proxyEnabled === true
      if (!proxyEnabled) return currentApp.sourceUrl

      const configuredSuffix = (
        import.meta.env.VITE_APP_PROXY_HOST_SUFFIX as string | undefined
      )?.trim()
      const prefix =
        (import.meta.env.VITE_APP_PROXY_SUBDOMAIN_PREFIX as string | undefined)?.trim() || 'app'

      let suffix = configuredSuffix
      if (!suffix) {
        const host = window.location.hostname
        const isLocalHost =
          host === 'localhost' ||
          host === '127.0.0.1' ||
          host === '0.0.0.0' ||
          host.endsWith('.local')

        if (!isLocalHost) {
          // Auto derive: shadowob.com -> shadowob.com, www.shadowob.com -> shadowob.com
          suffix = host.startsWith('www.') ? host.slice(4) : host
        }
      }

      if (suffix) {
        return `${window.location.protocol}//${prefix}-${currentApp.id}.${suffix}/`
      }

      // Fallback for local dev without wildcard DNS/Caddy subdomain routing
      return `/api/app-proxy/${currentApp.id}/`
    }
    // Serve zip/html content through the server extraction endpoint
    return `/api/servers/${serverId}/apps/${currentApp.id}/serve/`
  }, [currentApp, serverId])

  const openInNewWindow = useCallback(() => {
    const url = resolveAppUrl()
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }, [resolveAppUrl])

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
      setIsFullscreen(false)
    } else {
      containerRef.current.requestFullscreen()
      setIsFullscreen(true)
    }
  }, [])

  useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement) setIsFullscreen(false)
    }
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  if (!currentApp) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-primary text-text-muted">
        <Loader2 size={20} className="animate-spin" />
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex-1 flex flex-col h-full bg-bg-primary overflow-hidden">
      <div className="desktop-drag-titlebar h-12 px-3 flex items-center gap-2 border-b border-border-subtle bg-bg-secondary/50 shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="text-text-muted hover:text-text-primary transition"
        >
          <ArrowLeft size={16} />
        </button>
        {currentApp.iconUrl && <img src={currentApp.iconUrl} alt="" className="w-5 h-5 rounded" />}
        <span className="font-medium text-text-primary text-sm truncate">{currentApp.name}</span>
        {currentApp.version && (
          <span className="text-[11px] text-text-muted">v{currentApp.version}</span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={toggleFullscreen}
          className="p-1 text-text-muted hover:text-text-primary transition"
          title={isFullscreen ? '退出全屏' : '全屏'}
        >
          {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
        <button
          type="button"
          onClick={openInNewWindow}
          className="p-1 text-text-muted hover:text-text-primary transition"
          title="在新窗口打开"
        >
          <ExternalLink size={14} />
        </button>
      </div>
      <iframe
        ref={iframeRef}
        src={resolveAppUrl()}
        title={currentApp.name}
        className="flex-1 w-full border-0"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        allow="fullscreen; clipboard-write"
      />
    </div>
  )
}

/* ───────── Create / Edit App Overlay ───────── */

function CreateEditOverlay({
  serverId,
  editingApp,
  onClose,
  onSaved,
}: {
  serverId: string
  editingApp: AppItem | null
  onClose: () => void
  onSaved: () => void
}) {
  const { publishFileId, publishFileName, setPublishFile } = useAppStore()
  const isEdit = !!editingApp

  const [name, setName] = useState(editingApp?.name ?? '')
  const [slug, setSlug] = useState(editingApp?.slug ?? '')
  const [description, setDescription] = useState(editingApp?.description ?? '')
  const [iconUrl, setIconUrl] = useState(editingApp?.iconUrl ?? '')
  const [sourceType, setSourceType] = useState<'url' | 'zip'>(
    editingApp?.sourceType ?? (publishFileId ? 'zip' : 'url'),
  )
  const [sourceUrl, setSourceUrl] = useState(editingApp?.sourceUrl ?? '')
  const [proxyEnabled, setProxyEnabled] = useState(editingApp?.settings?.proxyEnabled === true)
  const [version, setVersion] = useState(editingApp?.version ?? '')
  const [isHomepage, setIsHomepage] = useState(editingApp?.isHomepage ?? false)
  const [isUploading, setIsUploading] = useState(false)
  const [isUploadingIcon, setIsUploadingIcon] = useState(false)
  const [showFilePicker, setShowFilePicker] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  // For zip: workspace file picker
  const [selectedFileId, setSelectedFileId] = useState(publishFileId ?? '')
  const [selectedFileName, setSelectedFileName] = useState(publishFileName ?? '')

  // Cleanup publishFile on unmount
  useEffect(() => {
    return () => setPublishFile(null)
  }, [setPublishFile])

  const create = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetchApi(`/api/servers/${serverId}/apps`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => onSaved(),
  })

  const update = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetchApi(`/api/servers/${serverId}/apps/${editingApp!.id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => onSaved(),
  })

  // Upload icon via /api/media/upload
  const handleIconUpload = async (file: File) => {
    setIsUploadingIcon(true)
    setErrorMessage('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const result = await fetchApi<{ url: string }>('/api/media/upload', {
        method: 'POST',
        body: formData,
      })
      setIconUrl(result.url)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '图标上传失败')
    } finally {
      setIsUploadingIcon(false)
    }
  }

  // Upload zip file via /api/media/upload
  const handleZipUpload = async (file: File) => {
    setIsUploading(true)
    setErrorMessage('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const result = await fetchApi<{ url: string }>('/api/media/upload', {
        method: 'POST',
        body: formData,
      })
      setSourceUrl(result.url)
      setSelectedFileName(file.name)
      setSelectedFileId('')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '文件上传失败')
    } finally {
      setIsUploading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage('')

    let finalSourceUrl = sourceUrl

    // If picker selected, resolve file contentRef (works for create + edit)
    if (sourceType === 'zip' && selectedFileId) {
      try {
        const fileNode = await fetchApi<{ contentRef?: string | null }>(
          `/api/servers/${serverId}/workspace/files/${selectedFileId}`,
        )
        if (!fileNode?.contentRef) {
          setErrorMessage('选中的工作区文件无可用内容引用')
          return
        }
        finalSourceUrl = fileNode.contentRef
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '获取工作区文件失败')
        return
      }
    }

    if (isEdit) {
      update.mutate({
        name: name || undefined,
        slug: slug || undefined,
        description: description || undefined,
        iconUrl: iconUrl || null,
        sourceType,
        sourceUrl: finalSourceUrl || undefined,
        settings:
          sourceType === 'url' ? { ...(editingApp?.settings ?? {}), proxyEnabled } : undefined,
        version: version || undefined,
        isHomepage,
      })
      return
    }

    // Create: if using workspace file, use publish endpoint
    if (sourceType === 'zip' && selectedFileId) {
      try {
        await fetchApi(`/api/servers/${serverId}/apps/publish`, {
          method: 'POST',
          body: JSON.stringify({
            name,
            slug: slug || undefined,
            description: description || undefined,
            iconUrl: iconUrl || undefined,
            fileId: selectedFileId,
            version: version || undefined,
            isHomepage,
          }),
        })
        onSaved()
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '发布失败')
      }
      return
    }

    create.mutate({
      name,
      slug: slug || undefined,
      description: description || undefined,
      iconUrl: iconUrl || undefined,
      sourceType,
      sourceUrl: finalSourceUrl,
      settings: sourceType === 'url' ? { proxyEnabled } : undefined,
      version: version || undefined,
      isHomepage,
      status: 'active',
    })
  }

  const isPending = create.isPending || update.isPending || isUploading
  const canSubmit =
    name.trim() &&
    (sourceType === 'url' ? sourceUrl.trim() : sourceUrl?.trim() || selectedFileId) &&
    !isPending

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-bg-secondary rounded-xl border border-border-subtle w-full max-w-md p-5 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-text-primary">{isEdit ? '编辑应用' : '添加应用'}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          {errorMessage && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {errorMessage}
            </div>
          )}

          {/* Icon upload */}
          <div>
            <label className="block text-xs text-text-muted mb-1">应用图标</label>
            <div className="flex items-center gap-3">
              <div className="relative w-14 h-14 rounded-2xl overflow-hidden shadow-md shrink-0">
                {iconUrl ? (
                  <img src={iconUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center text-white font-bold text-lg select-none"
                    style={{ backgroundColor: nameToColor(name || 'A') }}
                  >
                    {(name || 'A')[0]?.toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <label className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-bg-modifier-hover text-text-secondary hover:text-text-primary hover:bg-bg-modifier-active transition cursor-pointer">
                  <Upload size={12} />
                  {isUploadingIcon ? '上传中...' : '上传图标'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) handleIconUpload(f)
                    }}
                  />
                </label>
                {iconUrl && (
                  <button
                    type="button"
                    onClick={() => setIconUrl('')}
                    className="text-[11px] text-text-muted hover:text-danger transition text-left"
                  >
                    移除图标
                  </button>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs text-text-muted mb-1">应用名称 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 bg-bg-primary border border-border-subtle rounded-lg text-sm text-text-primary outline-none focus:ring-1 focus:ring-primary"
              placeholder="我的应用"
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Slug（可选 URL 标识符）</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full px-3 py-2 bg-bg-primary border border-border-subtle rounded-lg text-sm text-text-primary outline-none focus:ring-1 focus:ring-primary"
              placeholder="my-app"
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-bg-primary border border-border-subtle rounded-lg text-sm text-text-primary outline-none focus:ring-1 focus:ring-primary resize-none"
              rows={2}
              placeholder="简要描述应用功能..."
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">来源类型</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSourceType('url')}
                className={`flex-1 py-2 text-sm rounded-lg border transition ${
                  sourceType === 'url'
                    ? 'bg-primary/10 border-primary text-primary'
                    : 'bg-bg-primary border-border-subtle text-text-muted hover:text-text-primary'
                }`}
              >
                <Globe size={14} className="inline mr-1" />
                Web URL
              </button>
              <button
                type="button"
                onClick={() => setSourceType('zip')}
                className={`flex-1 py-2 text-sm rounded-lg border transition ${
                  sourceType === 'zip'
                    ? 'bg-primary/10 border-primary text-primary'
                    : 'bg-bg-primary border-border-subtle text-text-muted hover:text-text-primary'
                }`}
              >
                <Package size={14} className="inline mr-1" />
                Zip / HTML
              </button>
            </div>
          </div>

          {/* Source input */}
          {sourceType === 'url' ? (
            <div>
              <label className="block text-xs text-text-muted mb-1">Web URL *</label>
              <input
                type="text"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                required
                className="w-full px-3 py-2 bg-bg-primary border border-border-subtle rounded-lg text-sm text-text-primary outline-none focus:ring-1 focus:ring-primary"
                placeholder="https://example.com"
              />
              <label className="mt-2 flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={proxyEnabled}
                  onChange={(e) => setProxyEnabled(e.target.checked)}
                  className="rounded border-border-subtle"
                />
                <span className="text-xs text-text-secondary">
                  通过子域名代理访问（支持绝对路径、SSE、WebSocket）
                </span>
              </label>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block text-xs text-text-muted mb-1">Zip / HTML 文件 *</label>
              {/* Upload file */}
              <label className="bg-bg-tertiary border-2 border-dashed border-border-subtle hover:border-primary/50 rounded-lg p-3 flex items-center gap-3 transition-colors cursor-pointer group">
                <span className="w-8 h-8 rounded-full bg-bg-secondary group-hover:bg-primary/20 flex items-center justify-center transition">
                  <Upload size={16} className="text-text-primary" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-text-primary font-medium">
                    {isUploading ? '上传中...' : '点击上传 Zip / HTML 文件'}
                  </span>
                  <span className="block text-xs text-text-muted truncate">
                    支持 .zip / .html，上传后可直接运行
                  </span>
                </span>
                <input
                  type="file"
                  accept=".zip,.html,application/zip,text/html"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleZipUpload(f)
                  }}
                />
              </label>
              {/* Or pick from workspace */}
              <button
                type="button"
                onClick={() => setShowFilePicker(true)}
                className="flex items-center gap-2 w-full px-3 py-2 bg-bg-primary border border-border-subtle rounded-lg text-sm text-text-muted hover:text-text-primary hover:border-primary/30 transition"
              >
                <Package size={14} />
                从工作区选择文件
              </button>

              {(sourceUrl || selectedFileName) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFileId('')
                    setSelectedFileName('')
                    setSourceUrl('')
                  }}
                  className="text-xs text-text-muted hover:text-text-primary transition text-left"
                >
                  清空已选文件
                </button>
              )}

              {/* Show selected info */}
              {(sourceUrl || selectedFileName) && (
                <p className="text-xs text-text-muted flex items-center gap-1">
                  <CheckCircle2 size={12} className="text-emerald-400" />
                  已选择: {selectedFileName || sourceUrl}
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs text-text-muted mb-1">版本号</label>
            <input
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="w-full px-3 py-2 bg-bg-primary border border-border-subtle rounded-lg text-sm text-text-primary outline-none focus:ring-1 focus:ring-primary"
              placeholder="1.0.0"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isHomepage}
              onChange={(e) => setIsHomepage(e.target.checked)}
              className="rounded border-border-subtle"
            />
            <span className="text-sm text-text-secondary">设为服务器首页</span>
          </label>
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full py-2.5 bg-primary text-white font-medium text-sm rounded-lg hover:bg-primary/90 disabled:opacity-50 transition"
          >
            {isPending ? '处理中...' : isEdit ? '保存修改' : '创建应用'}
          </button>
        </form>
      </div>

      {/* Workspace file picker modal */}
      {showFilePicker && (
        <WorkspaceFilePicker
          serverId={serverId}
          mode="select-file"
          title="选择应用文件"
          accept={['.zip', '.html', '.htm']}
          onConfirm={(result) => {
            setSelectedFileId(result.node.id)
            setSelectedFileName(result.node.name)
            setSourceUrl('')
            setErrorMessage('')
            setShowFilePicker(false)
          }}
          onClose={() => setShowFilePicker(false)}
        />
      )}
    </div>
  )
}
