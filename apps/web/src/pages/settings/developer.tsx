import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Copy, Eye, EyeOff, Plus, RotateCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { fetchApi } from '../../lib/api'

interface OAuthApp {
  id: string
  clientId: string
  name: string
  description: string | null
  redirectUris: string[]
  homepageUrl: string | null
  logoUrl: string | null
  isActive: boolean
  createdAt: string
}

interface CreateAppResult extends OAuthApp {
  clientSecret: string
}

export function DeveloperSettings() {
  const queryClient = useQueryClient()
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newSecret, setNewSecret] = useState<string | null>(null)
  const [showSecret, setShowSecret] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const { data: apps = [], isLoading } = useQuery({
    queryKey: ['oauth-apps'],
    queryFn: () => fetchApi<OAuthApp[]>('/api/oauth/apps'),
  })

  const createMutation = useMutation({
    mutationFn: (data: {
      name: string
      description?: string
      redirectUris: string[]
      homepageUrl?: string
      logoUrl?: string
    }) =>
      fetchApi<CreateAppResult>('/api/oauth/apps', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: (result) => {
      setNewSecret(result.clientSecret)
      setShowSecret(true)
      setShowCreateForm(false)
      queryClient.invalidateQueries({ queryKey: ['oauth-apps'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (appId: string) => fetchApi(`/api/oauth/apps/${appId}`, { method: 'DELETE' }),
    onSuccess: () => {
      setDeleteConfirmId(null)
      queryClient.invalidateQueries({ queryKey: ['oauth-apps'] })
    },
  })

  const resetSecretMutation = useMutation({
    mutationFn: (appId: string) =>
      fetchApi<{ clientSecret: string }>(`/api/oauth/apps/${appId}/reset-secret`, {
        method: 'POST',
      }),
    onSuccess: (result) => {
      setNewSecret(result.clientSecret)
      setShowSecret(true)
    },
  })

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-text-primary">开发者设置</h2>
          <p className="text-sm text-text-muted mt-1">管理你的 OAuth 应用，接入 Shadow 开放平台</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition text-sm font-medium"
        >
          <Plus size={16} />
          创建应用
        </button>
      </div>

      {/* Secret display banner */}
      {newSecret && (
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-warning shrink-0 mt-0.5" size={20} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-warning">Client Secret（仅显示一次）</p>
              <div className="flex items-center gap-2 mt-2">
                <code className="flex-1 text-xs bg-bg-secondary px-3 py-2 rounded-lg font-mono break-all">
                  {showSecret ? newSecret : '•'.repeat(40)}
                </code>
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="p-2 hover:bg-bg-modifier-hover rounded-lg transition"
                >
                  {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                <button
                  type="button"
                  onClick={() => copyToClipboard(newSecret)}
                  className="p-2 hover:bg-bg-modifier-hover rounded-lg transition"
                >
                  <Copy size={16} />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setNewSecret(null)}
                className="text-xs text-text-muted mt-2 hover:text-text-primary transition"
              >
                我已保存，关闭提示
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create app form */}
      {showCreateForm && (
        <CreateAppForm
          onSubmit={(data) => createMutation.mutate(data)}
          onCancel={() => setShowCreateForm(false)}
          isPending={createMutation.isPending}
        />
      )}

      {/* App list */}
      {isLoading ? (
        <div className="text-center text-text-muted py-8">加载中...</div>
      ) : apps.length === 0 ? (
        <div className="text-center text-text-muted py-12">
          <p className="text-lg mb-2">暂无 OAuth 应用</p>
          <p className="text-sm">创建你的第一个应用，开始接入 Shadow 开放平台</p>
        </div>
      ) : (
        <div className="space-y-4">
          {apps.map((app) => (
            <div
              key={app.id}
              className="bg-bg-secondary rounded-xl p-4 border border-border-subtle"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  {app.logoUrl ? (
                    <img
                      src={app.logoUrl}
                      alt={app.name}
                      className="w-10 h-10 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold">
                      {app.name[0]?.toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h3 className="font-semibold text-text-primary">{app.name}</h3>
                    {app.description && (
                      <p className="text-xs text-text-muted mt-0.5">{app.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => resetSecretMutation.mutate(app.id)}
                    className="p-2 text-text-muted hover:text-primary hover:bg-bg-modifier-hover rounded-lg transition"
                    title="重置 Secret"
                  >
                    <RotateCw size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmId(app.id)}
                    className="p-2 text-text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition"
                    title="删除应用"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-text-muted w-20 shrink-0">Client ID</span>
                  <code className="bg-bg-primary px-2 py-1 rounded font-mono text-text-secondary flex-1 truncate">
                    {app.clientId}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(app.clientId)}
                    className="p-1 hover:bg-bg-modifier-hover rounded transition"
                  >
                    <Copy size={12} />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-text-muted w-20 shrink-0">Redirect URIs</span>
                  <span className="text-text-secondary truncate">
                    {app.redirectUris.join(', ')}
                  </span>
                </div>
                {app.homepageUrl && (
                  <div className="flex items-center gap-2">
                    <span className="text-text-muted w-20 shrink-0">Homepage</span>
                    <a
                      href={app.homepageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline truncate"
                    >
                      {app.homepageUrl}
                    </a>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-text-muted w-20 shrink-0">创建时间</span>
                  <span className="text-text-secondary">
                    {new Date(app.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {/* Delete confirmation */}
              {deleteConfirmId === app.id && (
                <div className="mt-3 p-3 bg-danger/10 rounded-lg border border-danger/20">
                  <p className="text-sm text-danger font-medium">
                    确定要删除此应用吗？此操作不可恢复。
                  </p>
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => deleteMutation.mutate(app.id)}
                      className="px-3 py-1.5 bg-danger text-white rounded-lg text-xs font-medium hover:bg-danger/90 transition"
                      disabled={deleteMutation.isPending}
                    >
                      确认删除
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmId(null)}
                      className="px-3 py-1.5 bg-bg-primary text-text-secondary rounded-lg text-xs font-medium hover:bg-bg-modifier-hover transition"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CreateAppForm({
  onSubmit,
  onCancel,
  isPending,
}: {
  onSubmit: (data: {
    name: string
    description?: string
    redirectUris: string[]
    homepageUrl?: string
    logoUrl?: string
  }) => void
  onCancel: () => void
  isPending: boolean
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [redirectUri, setRedirectUri] = useState('')
  const [homepageUrl, setHomepageUrl] = useState('')
  const [logoUrl, setLogoUrl] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !redirectUri.trim()) return
    onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      redirectUris: [redirectUri.trim()],
      homepageUrl: homepageUrl.trim() || undefined,
      logoUrl: logoUrl.trim() || undefined,
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-bg-secondary rounded-xl p-5 border border-border-subtle space-y-4"
    >
      <h3 className="font-semibold text-text-primary">创建新应用</h3>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          应用名称 <span className="text-danger">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My App"
          className="w-full px-3 py-2 bg-bg-primary border border-border-subtle rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50"
          maxLength={128}
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">应用描述</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="简要描述你的应用"
          className="w-full px-3 py-2 bg-bg-primary border border-border-subtle rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50"
          maxLength={1024}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Redirect URI <span className="text-danger">*</span>
        </label>
        <input
          type="url"
          value={redirectUri}
          onChange={(e) => setRedirectUri(e.target.value)}
          placeholder="https://your-app.com/callback"
          className="w-full px-3 py-2 bg-bg-primary border border-border-subtle rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">Homepage URL</label>
        <input
          type="url"
          value={homepageUrl}
          onChange={(e) => setHomepageUrl(e.target.value)}
          placeholder="https://your-app.com"
          className="w-full px-3 py-2 bg-bg-primary border border-border-subtle rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">应用图标 URL</label>
        <div className="flex items-center gap-3">
          {logoUrl.trim() && (
            <img
              src={logoUrl.trim()}
              alt="App icon preview"
              className="w-10 h-10 rounded-lg object-cover border border-border-subtle"
              onError={(e) => {
                ;(e.target as HTMLImageElement).style.display = 'none'
              }}
            />
          )}
          <input
            type="url"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://your-app.com/icon.png"
            className="w-full px-3 py-2 bg-bg-primary border border-border-subtle rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary bg-bg-primary rounded-lg transition"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={isPending || !name.trim() || !redirectUri.trim()}
          className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition disabled:opacity-50"
        >
          {isPending ? '创建中...' : '创建应用'}
        </button>
      </div>
    </form>
  )
}
