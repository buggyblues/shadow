/**
 * Server settings modal — aligned with settings-modal pattern.
 * Tabs: Basic, Advanced, Shop, Workspace.
 * Uses shared SettingsPanel / SettingsCard / SettingsHeader / SettingsDanger primitives.
 */
import {
  Button,
  cn,
  FormField,
  Input,
  Modal,
  ModalBody,
  ModalButtonGroup,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Switch,
  Textarea,
} from '@shadowob/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  Check,
  Copy,
  FolderClosed,
  ImageIcon,
  Save,
  Settings,
  ShoppingBag,
  Trash2,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import {
  SettingsCard,
  SettingsDanger,
  SettingsGroup,
  SettingsPanel,
} from '../../pages/settings/_shared'
import { useAppStore } from '../../stores/app.store'
import { useAuthStore } from '../../stores/auth.store'
import { useConfirmStore } from '../common/confirm-dialog'
import { ShopPage } from '../shop/shop-page'
import { WorkspacePage } from '../workspace/workspace-page'

interface Server {
  id: string
  name: string
  description: string | null
  slug: string
  iconUrl: string | null
  bannerUrl: string | null
  homepageHtml: string | null
  isPublic: boolean
  inviteCode: string
  ownerId: string
}

type ModalTab = 'basic' | 'advanced' | 'shop' | 'workspace'

const MODAL_TABS: {
  id: ModalTab
  icon: typeof Settings
  labelKey: string
  labelFallback: string
}[] = [
  { id: 'basic', icon: ImageIcon, labelKey: 'server.settingsBasic', labelFallback: '基础设置' },
  {
    id: 'advanced',
    icon: Settings,
    labelKey: 'server.settingsAdvanced',
    labelFallback: '进阶设置',
  },
  { id: 'shop', icon: ShoppingBag, labelKey: 'server.settingsShop', labelFallback: '店铺' },
  {
    id: 'workspace',
    icon: FolderClosed,
    labelKey: 'server.settingsWorkspace',
    labelFallback: '工作区',
  },
]

export function ServerSettingsModal({
  open,
  onClose,
  server,
  serverSlug,
  initialTab = 'basic',
}: {
  open: boolean
  onClose: () => void
  server: Server | undefined
  serverSlug: string
  initialTab?: ModalTab
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const [activeTab, setActiveTab] = useState<ModalTab>(initialTab)
  const isOwner = !!currentUser && !!server && currentUser.id === server.ownerId

  // Draft state
  const [formDraft, setFormDraft] = useState({
    name: '',
    description: '',
    slug: '',
    isPublic: false,
    homepageHtml: '',
    iconUrl: null as string | null,
    bannerUrl: null as string | null,
  })
  const [bannerUploading, setBannerUploading] = useState(false)
  const [iconUploading, setIconUploading] = useState(false)
  const [copiedInvite, setCopiedInvite] = useState(false)
  const activeTabMeta = MODAL_TABS.find((tab) => tab.id === activeTab) ?? MODAL_TABS[0]!
  const ActiveTabIcon = activeTabMeta.icon
  const headerOverline = server?.name
    ? `${t('channel.serverSettings', '服务器设置')} · ${server.name}`
    : t('channel.serverSettings', '服务器设置')

  // Initialize draft when dialog opens or server data changes
  useEffect(() => {
    if (open && server) {
      setFormDraft({
        name: server.name,
        description: server.description ?? '',
        slug: server.slug ?? '',
        isPublic: server.isPublic,
        homepageHtml: server.homepageHtml ?? '',
        iconUrl: server.iconUrl,
        bannerUrl: server.bannerUrl,
      })
      setActiveTab(initialTab)
    }
  }, [open, server, initialTab])

  const updateDraftField = <K extends keyof typeof formDraft>(
    field: K,
    value: (typeof formDraft)[K],
  ) => {
    setFormDraft((prev) => ({ ...prev, [field]: value }))
  }

  const hasDraftChanges = () => {
    if (!server) return false
    return (
      formDraft.name !== server.name ||
      formDraft.description !== (server.description ?? '') ||
      formDraft.slug !== (server.slug ?? '') ||
      formDraft.isPublic !== server.isPublic ||
      formDraft.homepageHtml !== (server.homepageHtml ?? '') ||
      formDraft.iconUrl !== server.iconUrl ||
      formDraft.bannerUrl !== server.bannerUrl
    )
  }

  const updateServer = useMutation({
    mutationFn: (data: {
      name?: string
      description?: string | null
      slug?: string
      iconUrl?: string | null
      bannerUrl?: string | null
      homepageHtml?: string | null
      isPublic?: boolean
    }) =>
      fetchApi<Server>(`/api/servers/${serverSlug}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: (updatedServer) => {
      queryClient.invalidateQueries({ queryKey: ['server', serverSlug] })
      if (updatedServer.slug && updatedServer.slug !== serverSlug) {
        queryClient.invalidateQueries({ queryKey: ['server', updatedServer.slug] })
      }
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      queryClient.invalidateQueries({ queryKey: ['discover-servers'] })
      if (updatedServer.slug && updatedServer.slug !== serverSlug) {
        navigate({ to: '/servers/$serverSlug', params: { serverSlug: updatedServer.slug } })
      }
    },
  })

  const deleteServer = useMutation({
    mutationFn: () => fetchApi(`/api/servers/${serverSlug}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      navigate({ to: '/' })
    },
  })

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBannerUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const result = await fetchApi<{ url: string }>('/api/media/upload', {
        method: 'POST',
        body: formData,
      })
      updateDraftField('bannerUrl', result.url)
      // Auto-save after upload
      saveServerChanges()
    } catch {
      /* upload failed */
    } finally {
      setBannerUploading(false)
    }
  }

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIconUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const result = await fetchApi<{ url: string }>('/api/media/upload', {
        method: 'POST',
        body: formData,
      })
      updateDraftField('iconUrl', result.url)
      // Auto-save after upload
      saveServerChanges()
    } catch {
      /* upload failed */
    } finally {
      setIconUploading(false)
    }
  }

  const saveServerChanges = () => {
    if (!formDraft.name.trim()) return
    updateServer.mutate(
      {
        name: formDraft.name.trim(),
        description: formDraft.description.trim() || null,
        slug: formDraft.slug.trim() || undefined,
        isPublic: formDraft.isPublic,
        homepageHtml: formDraft.homepageHtml.trim() || null,
        iconUrl: formDraft.iconUrl,
        bannerUrl: formDraft.bannerUrl,
      },
      { onSuccess: () => onClose() },
    )
  }

  const copyInviteCode = async () => {
    if (server?.inviteCode) {
      const inviteLink = `${window.location.origin}/app/invite/${server.inviteCode}`
      await navigator.clipboard.writeText(inviteLink)
      setCopiedInvite(true)
      setTimeout(() => setCopiedInvite(false), 2000)
    }
  }

  const isSettingsTab = activeTab === 'basic' || activeTab === 'advanced'

  return (
    <Modal open={open} onClose={onClose}>
      <ModalContent
        maxWidth="max-w-5xl"
        className="h-[min(88vh,820px)] flex flex-col overflow-hidden"
      >
        <ModalHeader
          overline={headerOverline}
          icon={<ActiveTabIcon size={18} strokeWidth={2.4} />}
          title={t(activeTabMeta.labelKey, activeTabMeta.labelFallback)}
          closeLabel={t('common.close', '关闭')}
        />

        <ModalBody className="flex flex-1 min-h-0 overflow-hidden p-0">
          {/* Sidebar tabs */}
          <nav className="w-48 shrink-0 border-r border-border-subtle p-4 flex flex-col overflow-y-auto">
            <div className="space-y-1 flex-1">
              {MODAL_TABS.map((tab) => {
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2 rounded-full text-[13px] font-bold transition-all duration-200',
                      isActive
                        ? 'bg-primary/15 text-primary'
                        : 'text-text-secondary hover:bg-bg-tertiary/50 hover:text-text-primary',
                    )}
                  >
                    <tab.icon
                      className={cn(
                        'w-4 h-4 shrink-0 transition-colors',
                        isActive ? 'text-primary' : 'text-text-muted',
                      )}
                      strokeWidth={2.2}
                    />
                    <span className="truncate">{t(tab.labelKey, tab.labelFallback)}</span>
                  </button>
                )
              })}
            </div>
          </nav>

          {/* Content area */}
          <div
            className={cn(
              'flex-1 min-w-0',
              isSettingsTab
                ? 'overflow-y-auto p-6'
                : 'flex flex-col overflow-hidden bg-bg-primary/5',
            )}
          >
            {/* Basic Settings */}
            {activeTab === 'basic' && (
              <SettingsPanel className="pb-6">
                {/* Banner + Icon */}
                <SettingsCard className="p-0 overflow-hidden">
                  <div className="relative h-32 bg-gradient-to-br from-primary/20 to-primary/5 group/banner">
                    {formDraft.bannerUrl && (
                      <img
                        src={formDraft.bannerUrl}
                        alt=""
                        className="w-full h-full object-cover absolute inset-0"
                      />
                    )}
                    <label className="absolute inset-0 flex items-center justify-center bg-bg-deep/40 opacity-0 group-hover/banner:opacity-100 transition cursor-pointer">
                      <span className="text-white text-sm font-medium flex items-center gap-2">
                        {bannerUploading ? (
                          <span className="animate-pulse">{t('common.loading')}</span>
                        ) : (
                          <>
                            <ImageIcon size={16} />
                            {t('channel.uploadBanner', '更换横幅')}
                          </>
                        )}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleBannerUpload}
                        className="hidden"
                        disabled={bannerUploading}
                      />
                    </label>
                  </div>

                  <div className="relative px-6 pb-6">
                    <div className="absolute -top-8 left-6">
                      <div className="relative w-16 h-16 rounded-2xl overflow-hidden bg-bg-tertiary/50 border-4 border-[var(--glass-bg)] shadow-lg group/icon">
                        {formDraft.iconUrl ? (
                          <img
                            src={formDraft.iconUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-text-muted">
                            {formDraft.name?.[0]?.toUpperCase() ?? '?'}
                          </div>
                        )}
                        <label className="absolute inset-0 flex items-center justify-center bg-bg-deep/50 opacity-0 group-hover/icon:opacity-100 transition cursor-pointer">
                          <span className="text-white text-xs font-medium">
                            {iconUploading ? '...' : <ImageIcon size={14} />}
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleIconUpload}
                            className="hidden"
                            disabled={iconUploading}
                          />
                        </label>
                      </div>
                    </div>

                    <div className="pt-12 space-y-5">
                      <FormField label={t('channel.editServerName')}>
                        <Input
                          value={formDraft.name}
                          onChange={(e) => updateDraftField('name', e.target.value)}
                          placeholder={t('server.serverName')}
                        />
                      </FormField>

                      <FormField label={t('channel.editServerDescription')}>
                        <Textarea
                          value={formDraft.description}
                          onChange={(e) => updateDraftField('description', e.target.value)}
                          rows={3}
                          placeholder={t('channel.descriptionPlaceholder')}
                          className="!min-h-0 resize-none"
                        />
                      </FormField>
                    </div>
                  </div>
                </SettingsCard>

                {/* Public toggle */}
                <SettingsCard>
                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <span className="text-sm font-bold text-text-primary">
                        {t('channel.publicServer')}
                      </span>
                      <p className="text-xs text-text-muted mt-0.5">
                        {t('channel.publicServerDesc')}
                      </p>
                    </div>
                    <Switch
                      checked={formDraft.isPublic}
                      onCheckedChange={(val) => updateDraftField('isPublic', val)}
                    />
                  </label>
                </SettingsCard>
              </SettingsPanel>
            )}

            {/* Advanced Settings */}
            {activeTab === 'advanced' && (
              <SettingsPanel className="pb-6">
                <SettingsCard>
                  <div className="space-y-5">
                    <SettingsGroup labelKey="channel.serverSlug" labelFallback="自定义链接标识">
                      <Input
                        value={formDraft.slug}
                        onChange={(e) => updateDraftField('slug', e.target.value)}
                        placeholder={t('channel.slugPlaceholder')}
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-text-muted mt-1">{t('channel.slugDesc')}</p>
                    </SettingsGroup>

                    <SettingsGroup labelKey="channel.homepageHtml" labelFallback="Homepage HTML">
                      <Textarea
                        value={formDraft.homepageHtml}
                        onChange={(e) => updateDraftField('homepageHtml', e.target.value)}
                        rows={6}
                        placeholder={t('channel.homepageHtmlPlaceholder', '<h1>Welcome!</h1>')}
                        className="resize-y font-mono text-xs"
                      />
                      <p className="text-xs text-text-muted mt-1">
                        {t('channel.homepageHtmlDesc', 'Custom HTML for the server homepage.')}
                      </p>
                    </SettingsGroup>
                  </div>
                </SettingsCard>

                {/* Invite link */}
                {server?.inviteCode && (
                  <SettingsCard>
                    <SettingsGroup labelKey="channel.inviteLink" labelFallback="邀请链接">
                      <div className="flex items-center gap-2">
                        <code className="flex-1 bg-bg-deep/20 text-text-primary rounded-xl px-4 py-3 font-mono text-xs truncate border border-border-subtle">
                          {`${window.location.origin}/app/invite/${server.inviteCode}`}
                        </code>
                        <Button
                          variant="glass"
                          size="xs"
                          onClick={copyInviteCode}
                          title={t('channel.copyInviteCode')}
                          className="h-10 w-10 p-0"
                        >
                          {copiedInvite ? (
                            <Check size={16} className="text-success" />
                          ) : (
                            <Copy size={16} />
                          )}
                        </Button>
                      </div>
                    </SettingsGroup>
                  </SettingsCard>
                )}

                {/* Server ID */}
                <SettingsCard>
                  <SettingsGroup labelKey="server.serverId" labelFallback="服务器 ID">
                    <code className="text-text-muted text-xs font-mono">{server?.id}</code>
                  </SettingsGroup>
                </SettingsCard>

                {/* Danger zone — delete server (owner only) */}
                {isOwner && (
                  <SettingsDanger>
                    <SettingsCard>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold text-text-primary">
                            {t('channel.deleteServer')}
                          </p>
                          <p className="text-xs text-text-muted mt-0.5">
                            {t('channel.deleteServerConfirm')}
                          </p>
                        </div>
                        <Button
                          variant="danger"
                          size="sm"
                          icon={Trash2}
                          onClick={async () => {
                            const ok = await useConfirmStore.getState().confirm({
                              title: t('channel.deleteServer'),
                              message: t('channel.deleteServerConfirm'),
                            })
                            if (ok) deleteServer.mutate()
                          }}
                          disabled={deleteServer.isPending}
                          loading={deleteServer.isPending}
                        >
                          {t('channel.deleteServer')}
                        </Button>
                      </div>
                    </SettingsCard>
                  </SettingsDanger>
                )}
              </SettingsPanel>
            )}

            {/* Shop page */}
            {activeTab === 'shop' && (
              <div className="flex h-full min-h-0 flex-col">
                <ShopPage serverId={serverSlug} isAdmin={isOwner} embedded />
              </div>
            )}

            {/* Workspace page */}
            {activeTab === 'workspace' && (
              <div className="flex h-full min-h-0 flex-col">
                <WorkspacePage
                  serverId={serverSlug}
                  embedded
                  onPublishAsApp={(node) => {
                    const { setPublishFile, setOverlay, setEditingApp } = useAppStore.getState()
                    setEditingApp(null)
                    setPublishFile(node.id, node.name)
                    setOverlay('create')
                    onClose()
                    navigate({ to: '/servers/$serverSlug/apps', params: { serverSlug } })
                  }}
                />
              </div>
            )}
          </div>
        </ModalBody>

        {/* Footer — save / cancel (only for settings tabs) */}
        {isSettingsTab && (
          <ModalFooter>
            {hasDraftChanges() && !updateServer.isPending && (
              <span className="text-xs text-warning mr-auto">
                {t('server.unsavedChanges', '有未保存的更改')}
              </span>
            )}
            {updateServer.isPending && (
              <span className="text-xs text-text-muted animate-pulse mr-auto">
                {t('common.saving', '保存中...')}
              </span>
            )}
            <ModalButtonGroup>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                disabled={updateServer.isPending}
                className="uppercase tracking-widest font-black"
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={saveServerChanges}
                disabled={!formDraft.name.trim() || updateServer.isPending || !hasDraftChanges()}
                loading={updateServer.isPending}
                icon={Save}
                className="uppercase tracking-widest font-black"
              >
                {updateServer.isPending ? t('common.saving') : t('common.save')}
              </Button>
            </ModalButtonGroup>
          </ModalFooter>
        )}
      </ModalContent>
    </Modal>
  )
}
