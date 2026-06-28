/**
 * Server settings modal — aligned with settings-modal pattern.
 * Tabs: Basic, Advanced, Apps, Shop.
 * Uses shared SettingsPanel / SettingsCard / SettingsHeader / SettingsDanger primitives.
 */
import {
  Button,
  ContentImage,
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
  TooltipIconButton,
} from '@shadowob/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  AppWindow,
  Check,
  Copy,
  ImageIcon,
  Save,
  Settings,
  ShoppingBag,
  Trash2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { copyToClipboard } from '../../lib/clipboard'
import {
  SettingsCard,
  SettingsDanger,
  SettingsGroup,
  SettingsPanel,
} from '../../pages/settings/_shared'
import { useAuthStore } from '../../stores/auth.store'
import { useConfirmStore } from '../common/confirm-dialog'
import { ShopAdmin } from '../shop/shop-admin'
import { ShopPage } from '../shop/shop-page'
import { ServerAppsSettingsPanel } from './server-apps-settings-panel'

interface Server {
  id: string
  name: string
  description: string | null
  slug: string
  iconUrl: string | null
  bannerUrl: string | null
  isPublic: boolean
  inviteCode: string
  ownerId: string
}

type ModalTab = 'basic' | 'advanced' | 'apps' | 'shop'

const MODAL_TABS: {
  id: ModalTab
  icon: typeof Settings
  labelKey: string
}[] = [
  { id: 'basic', icon: ImageIcon, labelKey: 'server.settingsBasic' },
  { id: 'advanced', icon: Settings, labelKey: 'server.settingsAdvanced' },
  { id: 'apps', icon: AppWindow, labelKey: 'server.settingsApps' },
  { id: 'shop', icon: ShoppingBag, labelKey: 'server.settingsShop' },
]

export function ServerSettingsModal({
  open,
  onClose,
  server,
  serverSlug,
  initialTab = 'basic',
  embedded = false,
}: {
  open: boolean
  onClose: () => void
  server: Server | undefined
  serverSlug: string
  initialTab?: ModalTab
  embedded?: boolean
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const [activeTab, setActiveTab] = useState<ModalTab>(initialTab)
  const activeTabResetKeyRef = useRef<string | null>(null)
  const isOwner = !!currentUser && !!server && currentUser.id === server.ownerId

  // Draft state
  const [formDraft, setFormDraft] = useState({
    name: '',
    description: '',
    slug: '',
    isPublic: false,
    iconUrl: null as string | null,
    bannerUrl: null as string | null,
  })
  const [bannerUploading, setBannerUploading] = useState(false)
  const [iconUploading, setIconUploading] = useState(false)
  const [iconPreviewUrl, setIconPreviewUrl] = useState<string | null>(null)
  const [copiedInvite, setCopiedInvite] = useState(false)
  const activeTabMeta = MODAL_TABS.find((tab) => tab.id === activeTab) ?? MODAL_TABS[0]!
  const ActiveTabIcon = activeTabMeta.icon
  const headerOverline = server?.name
    ? `${t('channel.serverSettings')} · ${server.name}`
    : t('channel.serverSettings')
  const isSettingsTab = activeTab === 'basic' || activeTab === 'advanced'
  const settingsPanelClassName = cn('pb-6', embedded && 'w-full !max-w-none space-y-5 !pb-4')
  const settingsContentClassName = cn(
    'flex-1 min-w-0',
    embedded && 'w-full basis-0',
    isSettingsTab && 'overflow-y-auto p-6',
    isSettingsTab && embedded && 'p-3 md:p-4',
    !isSettingsTab && 'flex flex-col overflow-hidden bg-bg-primary/5',
  )

  // Initialize draft when dialog opens or server data changes
  useEffect(() => {
    if (open && server) {
      setFormDraft({
        name: server.name,
        description: server.description ?? '',
        slug: server.slug ?? '',
        isPublic: server.isPublic,
        iconUrl: server.iconUrl,
        bannerUrl: server.bannerUrl,
      })
      setIconPreviewUrl(null)
    }
  }, [open, server])

  useEffect(() => {
    if (!open) {
      activeTabResetKeyRef.current = null
      return
    }
    if (!server) return
    const resetKey = `${server.id}:${initialTab}`
    if (activeTabResetKeyRef.current === resetKey) return
    activeTabResetKeyRef.current = resetKey
    setActiveTab(initialTab)
  }, [initialTab, open, server])

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
      const result = await fetchApi<{ url: string; signedUrl?: string }>('/api/media/upload', {
        method: 'POST',
        body: formData,
      })
      updateDraftField('bannerUrl', result.url)
      // Auto-save after upload
      saveServerChanges({ bannerUrl: result.url })
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
      formData.append('kind', 'avatar')
      const result = await fetchApi<{ url: string; avatarUrl?: string }>('/api/media/upload', {
        method: 'POST',
        body: formData,
      })
      updateDraftField('iconUrl', result.url)
      setIconPreviewUrl(result.avatarUrl ?? result.url)
      // Auto-save after upload
      saveServerChanges({ iconUrl: result.url })
    } catch {
      /* upload failed */
    } finally {
      setIconUploading(false)
    }
  }

  const saveServerChanges = (overrides: Partial<typeof formDraft> = {}) => {
    const nextDraft = { ...formDraft, ...overrides }
    if (!nextDraft.name.trim()) return
    updateServer.mutate(
      {
        name: nextDraft.name.trim(),
        description: nextDraft.description.trim() || null,
        slug: nextDraft.slug.trim() || undefined,
        isPublic: nextDraft.isPublic,
        iconUrl: nextDraft.iconUrl,
        bannerUrl: nextDraft.bannerUrl,
      },
      {
        onSuccess: () => {
          if (!embedded) onClose()
        },
      },
    )
  }

  const copyInviteCode = async () => {
    if (server?.inviteCode) {
      const inviteLink = `${window.location.origin}/app/invite/${server.inviteCode}`
      const didCopy = await copyToClipboard(inviteLink, {
        successMessage: t('common.copied'),
        errorMessage: t('chat.copyFailed'),
      })
      if (didCopy) {
        setCopiedInvite(true)
        setTimeout(() => setCopiedInvite(false), 2000)
      }
    }
  }

  const content = (
    <>
      {!embedded && (
        <ModalHeader
          overline={headerOverline}
          icon={<ActiveTabIcon size={18} strokeWidth={2.4} />}
          title={t(activeTabMeta.labelKey)}
          onClose={onClose}
          closeLabel={t('common.close')}
        />
      )}

      <ModalBody
        className={cn(
          'flex min-h-0 flex-1 overflow-hidden p-0',
          embedded && 'flex-col md:flex-row',
        )}
      >
        {/* Sidebar tabs */}
        <nav
          className={cn(
            'flex w-48 shrink-0 flex-col overflow-y-auto border-r border-border-subtle p-4',
            embedded &&
              'w-full flex-row overflow-x-auto overflow-y-hidden border-b border-r-0 p-2 md:w-44 md:flex-col md:overflow-x-hidden md:overflow-y-auto md:border-b-0 md:border-r md:p-3',
          )}
        >
          <div
            className={cn(
              'flex-1',
              embedded ? 'flex min-w-max gap-1 md:block md:min-w-0 md:space-y-1' : 'space-y-1',
            )}
          >
            {MODAL_TABS.map((tab) => {
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-2.5 rounded-full px-3 py-2 text-[13px] font-bold transition-all duration-200',
                    embedded ? 'h-10 shrink-0 md:w-full' : 'w-full',
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
                  <span className="truncate">{t(tab.labelKey)}</span>
                </button>
              )
            })}
          </div>
        </nav>

        {/* Content area */}
        <div className={settingsContentClassName}>
          {/* Basic Settings */}
          {activeTab === 'basic' && (
            <SettingsPanel className={settingsPanelClassName}>
              {/* Banner + Icon */}
              <SettingsCard className="p-0 overflow-hidden">
                <div className="relative h-32 bg-gradient-to-br from-primary/20 to-primary/5 group/banner">
                  {formDraft.bannerUrl && (
                    <ContentImage
                      src={formDraft.bannerUrl}
                      alt={t('server.bannerPreviewAlt', { name: formDraft.name })}
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
                          {t('channel.uploadBanner')}
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
                      {iconPreviewUrl || formDraft.iconUrl ? (
                        <ContentImage
                          src={iconPreviewUrl ?? formDraft.iconUrl ?? ''}
                          alt={t('server.iconPreviewAlt', { name: formDraft.name })}
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
            <SettingsPanel className={settingsPanelClassName}>
              <SettingsCard>
                <div className="space-y-5">
                  <SettingsGroup labelKey="channel.serverSlug">
                    <Input
                      value={formDraft.slug}
                      onChange={(e) => updateDraftField('slug', e.target.value)}
                      placeholder={t('channel.slugPlaceholder')}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-text-muted mt-1">{t('channel.slugDesc')}</p>
                  </SettingsGroup>
                </div>
              </SettingsCard>

              {/* Invite link */}
              {server?.inviteCode && (
                <SettingsCard>
                  <SettingsGroup labelKey="channel.inviteLink">
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-bg-deep/20 text-text-primary rounded-xl px-4 py-3 font-mono text-xs truncate border border-border-subtle">
                        {`${window.location.origin}/app/invite/${server.inviteCode}`}
                      </code>
                      <TooltipIconButton
                        label={t('channel.copyInviteCode')}
                        variant="glass"
                        size="xs"
                        onClick={copyInviteCode}
                        className="h-10 w-10 p-0"
                      >
                        {copiedInvite ? (
                          <Check size={16} className="text-success" />
                        ) : (
                          <Copy size={16} />
                        )}
                      </TooltipIconButton>
                    </div>
                  </SettingsGroup>
                </SettingsCard>
              )}

              {/* Server ID */}
              <SettingsCard>
                <SettingsGroup labelKey="server.serverId">
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
              {isOwner ? (
                <ShopAdmin serverId={serverSlug} embedded />
              ) : (
                <ShopPage serverId={serverSlug} isAdmin={false} embedded />
              )}
            </div>
          )}

          {activeTab === 'apps' && (
            <div className="flex h-full min-h-0 flex-col">
              <ServerAppsSettingsPanel serverSlug={serverSlug} />
            </div>
          )}
        </div>
      </ModalBody>

      {/* Footer — save / cancel (only for settings tabs) */}
      {isSettingsTab && (
        <ModalFooter className={cn(embedded && 'shrink-0 px-3 py-2 md:px-4 md:py-3')}>
          {hasDraftChanges() && !updateServer.isPending && (
            <span className="text-xs text-warning mr-auto">{t('server.unsavedChanges')}</span>
          )}
          {updateServer.isPending && (
            <span className="text-xs text-text-muted animate-pulse mr-auto">
              {t('common.saving')}
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
              onClick={() => saveServerChanges()}
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
    </>
  )

  if (embedded) {
    return (
      <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-bg-primary">
        {content}
      </div>
    )
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalContent
        maxWidth="max-w-5xl"
        className="h-[min(88vh,820px)] flex flex-col overflow-hidden"
      >
        {content}
      </ModalContent>
    </Modal>
  )
}
