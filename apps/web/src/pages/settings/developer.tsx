import { Button, Input } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import {
  AlertTriangle,
  Code2,
  Copy,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  RotateCw,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { SettingsCard, SettingsHeader, SettingsPanel } from './_shared'

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

function AppLogo({
  url,
  name,
  size = 'w-10 h-10',
  textSize = 'text-base',
}: {
  url: string | null
  name: string
  size?: string
  textSize?: string
}) {
  const [failed, setFailed] = useState(false)

  if (url && !failed) {
    return (
      <img
        src={url}
        alt={name}
        className={`${size} rounded-xl object-cover`}
        onError={() => setFailed(true)}
      />
    )
  }

  return (
    <div
      className={`${size} rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold ${textSize}`}
    >
      {name[0]?.toUpperCase()}
    </div>
  )
}

export function DeveloperSettings() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newSecret, setNewSecret] = useState<string | null>(null)
  const [showSecret, setShowSecret] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [editingAppId, setEditingAppId] = useState<string | null>(null)
  const [visibleClientIds, setVisibleClientIds] = useState<Set<string>>(new Set())

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

  const updateMutation = useMutation({
    mutationFn: ({
      appId,
      data,
    }: {
      appId: string
      data: {
        name?: string
        description?: string
        redirectUris?: string[]
        homepageUrl?: string
        logoUrl?: string
      }
    }) => fetchApi(`/api/oauth/apps/${appId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => {
      setEditingAppId(null)
      queryClient.invalidateQueries({ queryKey: ['oauth-apps'] })
    },
  })

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text)
  }

  return (
    <SettingsPanel>
      <SettingsHeader
        titleKey="oauth.developerTitle"
        titleFallback="开发者设置"
        descKey="oauth.developerDesc"
        descFallback="管理你的 OAuth 应用，接入 Shadow 开放平台"
        icon={Code2}
      />

      <div className="flex justify-end -mt-2">
        <Button variant="primary" size="sm" type="button" onClick={() => setShowCreateForm(true)}>
          <Plus size={16} />
          {t('oauth.createApp', '创建应用')}
        </Button>
      </div>

      {/* Secret display banner */}
      {newSecret && (
        <SettingsCard className="bg-warning/10 border-warning/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-warning shrink-0 mt-0.5" size={20} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-warning">
                {t('oauth.secretWarning', 'Client Secret（仅显示一次）')}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <code className="flex-1 text-xs bg-bg-tertiary/50 px-3 py-2 rounded-xl font-mono break-all">
                  {showSecret ? newSecret : '•'.repeat(40)}
                </code>
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="p-2 hover:bg-bg-modifier-hover rounded-xl transition"
                >
                  {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                <button
                  type="button"
                  onClick={() => copyToClipboard(newSecret)}
                  className="p-2 hover:bg-bg-modifier-hover rounded-xl transition"
                >
                  <Copy size={16} />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setNewSecret(null)}
                className="text-xs text-text-muted mt-2 hover:text-text-primary transition"
              >
                {t('oauth.secretDismiss', '我已保存，关闭提示')}
              </button>
            </div>
          </div>
        </SettingsCard>
      )}

      {/* Create app form */}
      {showCreateForm && (
        <CreateAppForm
          t={t}
          onSubmit={(data) => createMutation.mutate(data)}
          onCancel={() => setShowCreateForm(false)}
          isPending={createMutation.isPending}
        />
      )}

      {/* App list */}
      {isLoading ? (
        <div className="text-center text-text-muted py-8">{t('common.loading', '加载中...')}</div>
      ) : apps.length === 0 ? (
        <SettingsCard className="text-center py-12">
          <p className="text-lg mb-2 text-text-muted">{t('oauth.noApps', '暂无 OAuth 应用')}</p>
          <p className="text-sm text-text-muted">
            {t('oauth.noAppsHint', '创建你的第一个应用，开始接入 Shadow 开放平台')}
          </p>
        </SettingsCard>
      ) : (
        <div className="space-y-4">
          {apps.map((app) => (
            <SettingsCard key={app.id}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <AppLogo url={app.logoUrl} name={app.name} />
                  <div>
                    <h3 className="font-black text-text-primary">{app.name}</h3>
                    {app.description && (
                      <p className="text-xs text-text-muted mt-0.5">{app.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditingAppId(editingAppId === app.id ? null : app.id)}
                    className="p-2 text-text-muted hover:text-primary hover:bg-bg-modifier-hover rounded-xl transition"
                    title={t('oauth.editApp', '编辑应用')}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => resetSecretMutation.mutate(app.id)}
                    className="p-2 text-text-muted hover:text-primary hover:bg-bg-modifier-hover rounded-xl transition"
                    title={t('oauth.resetSecret', '重置 Secret')}
                  >
                    <RotateCw size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmId(app.id)}
                    className="p-2 text-text-muted hover:text-danger hover:bg-danger/10 rounded-xl transition"
                    title={t('oauth.deleteApp', '删除应用')}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-text-muted w-20 shrink-0">
                    {t('oauth.clientId', 'Client ID')}
                  </span>
                  <code className="bg-bg-tertiary/50 px-2 py-1 rounded font-mono text-text-secondary flex-1 truncate">
                    {visibleClientIds.has(app.id)
                      ? app.clientId
                      : `${app.clientId.slice(0, 6)}${'•'.repeat(20)}`}
                  </code>
                  <button
                    type="button"
                    onClick={() =>
                      setVisibleClientIds((prev) => {
                        const next = new Set(prev)
                        if (next.has(app.id)) next.delete(app.id)
                        else next.add(app.id)
                        return next
                      })
                    }
                    className="p-1 hover:bg-bg-modifier-hover rounded transition"
                    title={
                      visibleClientIds.has(app.id)
                        ? t('oauth.hide', '隐藏')
                        : t('oauth.show', '显示')
                    }
                  >
                    {visibleClientIds.has(app.id) ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(app.clientId)}
                    className="p-1 hover:bg-bg-modifier-hover rounded transition"
                  >
                    <Copy size={12} />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-text-muted w-20 shrink-0">
                    {t('oauth.redirectUris', 'Redirect URIs')}
                  </span>
                  <span className="text-text-secondary truncate">
                    {app.redirectUris.join(', ')}
                  </span>
                </div>
                {app.homepageUrl && (
                  <div className="flex items-center gap-2">
                    <span className="text-text-muted w-20 shrink-0">
                      {t('oauth.homepage', 'Homepage')}
                    </span>
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
                  <span className="text-text-muted w-20 shrink-0">
                    {t('oauth.createdAt', '创建时间')}
                  </span>
                  <span className="text-text-secondary">
                    {new Date(app.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {/* Delete confirmation */}
              {deleteConfirmId === app.id && (
                <div className="mt-3 p-3 bg-danger/10 rounded-2xl border border-danger/20">
                  <p className="text-sm text-danger font-medium">
                    {t('oauth.deleteConfirmMsg', '确定要删除此应用吗？此操作不可恢复。')}
                  </p>
                  <div className="flex gap-2 mt-2">
                    <Button
                      variant="danger"
                      size="sm"
                      type="button"
                      onClick={() => deleteMutation.mutate(app.id)}
                      disabled={deleteMutation.isPending}
                      className="text-xs"
                    >
                      {t('oauth.confirmDelete', '确认删除')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => setDeleteConfirmId(null)}
                      className="text-xs"
                    >
                      {t('common.cancel', '取消')}
                    </Button>
                  </div>
                </div>
              )}

              {/* Inline edit form */}
              {editingAppId === app.id && (
                <EditAppForm
                  t={t}
                  app={app}
                  onSave={(data) => updateMutation.mutate({ appId: app.id, data })}
                  onCancel={() => setEditingAppId(null)}
                  isPending={updateMutation.isPending}
                />
              )}
            </SettingsCard>
          ))}
        </div>
      )}
    </SettingsPanel>
  )
}

function LogoUploader({
  value,
  onChange,
  name,
  t,
}: {
  value: string
  onChange: (v: string) => void
  name: string
  t: TFunction
}) {
  const [showUrlInput, setShowUrlInput] = useState(!!value)

  return (
    <div>
      <label className="block text-sm font-medium text-text-secondary mb-1">
        {t('oauth.appIcon', '应用图标')}
      </label>
      <div className="flex items-start gap-4">
        <button
          type="button"
          onClick={() => setShowUrlInput(true)}
          className="w-16 h-16 rounded-xl border-2 border-dashed border-border-subtle hover:border-primary/50 flex items-center justify-center transition shrink-0 overflow-hidden group"
          title={t('oauth.setAppIcon', '设置应用图标')}
        >
          {value.trim() ? (
            <AppLogo url={value.trim()} name={name || 'A'} size="w-16 h-16" textSize="text-2xl" />
          ) : (
            <span className="text-text-muted text-xs text-center leading-tight group-hover:text-primary transition">
              {t('oauth.clickToSet', '点击设置')}
            </span>
          )}
        </button>
        {showUrlInput && (
          <div className="flex-1">
            <Input
              type="url"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="https://your-app.com/icon.png"
              className="rounded-2xl px-3 py-2 text-sm"
            />
            <p className="text-xs text-text-muted mt-1">
              {t('oauth.iconUrlHint', '可选，输入图标的 URL 地址')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function CreateAppForm({
  t,
  onSubmit,
  onCancel,
  isPending,
}: {
  t: TFunction
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
      className="rounded-3xl border border-border-subtle bg-[var(--glass-bg)] backdrop-blur-2xl p-6 shadow-[var(--shadow-soft)] space-y-4"
    >
      <h3 className="font-black text-text-primary">{t('oauth.createNew', '创建新应用')}</h3>

      <div>
        <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted ml-1 mb-2">
          {t('oauth.appName', '应用名称')} *
        </label>
        <Input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My App"
          className="rounded-2xl px-4 py-3"
          maxLength={128}
          required
        />
      </div>

      <div>
        <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted ml-1 mb-2">
          {t('oauth.appDesc', '应用描述')}
        </label>
        <Input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('oauth.descPlaceholder', '简要描述你的应用')}
          className="rounded-2xl px-4 py-3"
          maxLength={1024}
        />
      </div>

      <div>
        <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted ml-1 mb-2">
          {t('oauth.redirectUri', 'Redirect URI')} *
        </label>
        <Input
          type="url"
          value={redirectUri}
          onChange={(e) => setRedirectUri(e.target.value)}
          placeholder="https://your-app.com/callback"
          className="rounded-2xl px-4 py-3"
          required
        />
      </div>

      <div>
        <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted ml-1 mb-2">
          {t('oauth.homepageUrl', 'Homepage URL')}
        </label>
        <Input
          type="url"
          value={homepageUrl}
          onChange={(e) => setHomepageUrl(e.target.value)}
          placeholder="https://your-app.com"
          className="rounded-2xl px-4 py-3"
        />
      </div>

      <LogoUploader value={logoUrl} onChange={setLogoUrl} name={name} t={t} />

      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" type="button" onClick={onCancel}>
          {t('common.cancel', '取消')}
        </Button>
        <Button
          variant="primary"
          size="sm"
          type="submit"
          disabled={isPending || !name.trim() || !redirectUri.trim()}
        >
          {isPending ? t('oauth.creating', '创建中...') : t('oauth.createApp', '创建应用')}
        </Button>
      </div>
    </form>
  )
}

function EditAppForm({
  t,
  app,
  onSave,
  onCancel,
  isPending,
}: {
  t: TFunction
  app: OAuthApp
  onSave: (data: {
    name?: string
    description?: string
    redirectUris?: string[]
    homepageUrl?: string
    logoUrl?: string
  }) => void
  onCancel: () => void
  isPending: boolean
}) {
  const [name, setName] = useState(app.name)
  const [description, setDescription] = useState(app.description ?? '')
  const [redirectUri, setRedirectUri] = useState(app.redirectUris[0] ?? '')
  const [homepageUrl, setHomepageUrl] = useState(app.homepageUrl ?? '')
  const [logoUrl, setLogoUrl] = useState(app.logoUrl ?? '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !redirectUri.trim()) return
    onSave({
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
      className="mt-3 p-4 bg-bg-tertiary/20 rounded-2xl border border-border-subtle space-y-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted mb-1">
            {t('oauth.appName', '应用名称')}
          </label>
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-2xl px-3 py-2 text-xs h-8"
            maxLength={128}
            required
          />
        </div>
        <div>
          <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted mb-1">
            {t('oauth.appDesc', '应用描述')}
          </label>
          <Input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded-2xl px-3 py-2 text-xs h-8"
            maxLength={1024}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted mb-1">
            {t('oauth.redirectUri', 'Redirect URI')}
          </label>
          <Input
            type="url"
            value={redirectUri}
            onChange={(e) => setRedirectUri(e.target.value)}
            className="rounded-2xl px-3 py-2 text-xs h-8"
            required
          />
        </div>
        <div>
          <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted mb-1">
            {t('oauth.homepageUrl', 'Homepage URL')}
          </label>
          <Input
            type="url"
            value={homepageUrl}
            onChange={(e) => setHomepageUrl(e.target.value)}
            className="rounded-2xl px-3 py-2 text-xs h-8"
          />
        </div>
      </div>
      <div>
        <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted mb-1">
          {t('oauth.appIconUrl', '应用图标 URL')}
        </label>
        <div className="flex items-center gap-2">
          <AppLogo url={logoUrl.trim() || null} name={name || 'A'} size="w-8 h-8" />
          <Input
            type="url"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://your-app.com/icon.png"
            className="rounded-2xl px-3 py-2 text-xs h-8"
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" type="button" onClick={onCancel} className="text-xs">
          {t('common.cancel', '取消')}
        </Button>
        <Button
          variant="primary"
          size="sm"
          type="submit"
          disabled={isPending || !name.trim() || !redirectUri.trim()}
          className="text-xs"
        >
          {isPending ? t('common.saving', '保存中...') : t('common.save', '保存')}
        </Button>
      </div>
    </form>
  )
}
