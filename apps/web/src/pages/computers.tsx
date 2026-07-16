import {
  CLOUD_COMPUTER_SHELL_PALETTE,
  resolveCloudComputerShellColor,
  type ShadowComputer,
  type ShadowComputerBuddy,
} from '@shadowob/shared'
import { Button, cn, Input, Modal, ModalBody, ModalContent, ModalHeader } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Bot,
  ChevronDown,
  ChevronRight,
  Cloud,
  Download,
  FolderOpen,
  Laptop,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  WifiOff,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RuntimeIcon } from '../components/buddy-management/agent-dialogs'
import { DesktopConnectorDownloadCard } from '../components/buddy-management/desktop-connector-download-card'
import { QuickCreateBuddyModal } from '../components/buddy-management/quick-create-buddy-modal'
import type { Agent } from '../components/buddy-management/types'
import { CloudComputerShell } from '../components/cloud-computer-shell'
import { ComputerBuddyRow } from '../components/computers/computer-buddy-row'
import { ComputerStatusBadge } from '../components/computers/computer-status'
import { desktopDownloadPath } from '../components/computers/desktop-download'
import { ComputerDeviceIllustration } from '../components/computers/device-illustration'
import '../components/computers/local-computer-detail.css'
import { UserAvatar } from '../components/common/avatar'
import { useConfirmStore } from '../components/common/confirm-dialog'
import { fetchApi } from '../lib/api'
import { showToast } from '../lib/toast'
import { CloudComputersPage } from './cloud-computers'

type ComputerFilter = 'all' | 'local' | 'cloud'
type AddComputerMode = 'choose' | 'local' | 'cloud'

type ConnectorBootstrapResult = {
  computer: { id: string }
  command: string
}

function normalizeInitialId(id?: string) {
  if (!id) return null
  return id.includes(':') ? id : `cloud:${id}`
}

function ComputerStatus({ computer }: { computer: ShadowComputer }) {
  return <ComputerStatusBadge status={computer.status} kind={computer.kind} />
}

function currentOsSpaceSlug() {
  if (typeof window === 'undefined') return null
  return window.location.pathname.match(/^\/app\/spaces\/([^/]+)/)?.[1] ?? null
}

function openLocalBuddyDirectMessage(input: {
  serverId: string
  serverSlug: string
  channelId: string
  peerUserId: string
  buddy: ShadowComputerBuddy
}) {
  window.dispatchEvent(
    new CustomEvent('shadow:os-command', {
      detail: {
        action: 'open-direct-message',
        serverId: input.serverId,
        serverSlug: input.serverSlug,
        channelId: input.channelId,
        peerUserId: input.peerUserId,
        title: input.buddy.name,
        iconUrl: input.buddy.avatarUrl ?? null,
      },
    }),
  )
}

function ComputerCard({ computer, onOpen }: { computer: ShadowComputer; onOpen: () => void }) {
  const { t } = useTranslation()
  const shellColor = resolveCloudComputerShellColor(
    computer.kind === 'cloud' ? (computer.cloud?.shellColor ?? 'aqua') : null,
    computer.sourceId,
  )
  const palette = CLOUD_COMPUTER_SHELL_PALETTE[shellColor]
  const detail =
    computer.device.model ||
    computer.device.hostname ||
    [computer.device.os, computer.device.arch].filter(Boolean).join(' · ')

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex min-h-[300px] flex-col overflow-hidden rounded-[26px] border border-white/[0.08] p-5 text-left shadow-[0_18px_50px_rgba(0,0,0,0.16)] transition duration-300 hover:-translate-y-1 hover:border-white/[0.16] hover:shadow-[0_24px_65px_rgba(0,0,0,0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
      style={{
        background: `radial-gradient(circle at 50% 20%, ${palette.shell}2b, transparent 40%), linear-gradient(155deg, rgba(255,255,255,0.055), rgba(255,255,255,0.018))`,
      }}
    >
      <span className="absolute right-4 top-4 z-10 max-w-[calc(100%-2rem)]">
        <ComputerStatus computer={computer} />
      </span>
      <span className="flex h-[145px] items-center justify-center transition duration-300 group-hover:scale-105">
        {computer.kind === 'cloud' ? (
          <CloudComputerShell
            color={shellColor}
            status={computer.status}
            size="lg"
            label={computer.name}
          />
        ) : (
          <ComputerDeviceIllustration
            deviceClass={computer.device.class}
            shellColor={shellColor}
            className="h-[142px]"
          />
        )}
      </span>
      <span className="mb-3 flex min-h-7 items-center justify-center">
        {computer.buddies.length ? (
          <span className="flex -space-x-2">
            {computer.buddies.slice(0, 4).map((buddy) => (
              <UserAvatar
                key={buddy.buddyId}
                userId={buddy.buddyId}
                avatarUrl={buddy.avatarUrl}
                displayName={buddy.name}
                size="xs"
                className="h-7 w-7 border-2 border-bg-base shadow-[0_3px_12px_rgba(0,0,0,0.24)]"
              />
            ))}
          </span>
        ) : (
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-white/[0.08] bg-black/10 px-2.5 text-[10px] font-bold text-text-muted">
            <Bot size={11} />
            {t('computers.buddyCount', { count: 0 })}
          </span>
        )}
      </span>
      <span className="mt-auto block min-w-0 border-t border-white/[0.07] pt-4">
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex-1 truncate text-[15px] font-black text-text-primary">
            {computer.name}
          </span>
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/[0.05] text-text-muted transition group-hover:bg-primary/14 group-hover:text-primary">
            <ChevronRight size={15} />
          </span>
        </span>
        <span className="mt-2 flex min-w-0 items-center justify-between gap-3 text-[11px] font-semibold text-text-muted/80">
          <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap">
            {computer.kind === 'local' ? <Laptop size={12} /> : <Cloud size={12} />}
            {t(`computers.kind.${computer.kind}`)}
          </span>
          <span className="truncate">{detail || t('computers.unknownDevice')}</span>
        </span>
      </span>
    </button>
  )
}

function LocalBuddySettingsModal({
  computer,
  buddy,
  onClose,
}: {
  computer: ShadowComputer
  buddy: ShadowComputerBuddy | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const availableRuntimes = useMemo(
    () => computer.runtimes.filter((runtime) => runtime.status === 'available'),
    [computer.runtimes],
  )
  const [runtimeId, setRuntimeId] = useState('')
  const [workDir, setWorkDir] = useState('.')

  useEffect(() => {
    if (!buddy) return
    setRuntimeId(
      buddy.runtimeId && availableRuntimes.some((runtime) => runtime.id === buddy.runtimeId)
        ? buddy.runtimeId
        : (availableRuntimes[0]?.id ?? ''),
    )
    setWorkDir(buddy.workDir?.trim() || '.')
  }, [buddy, availableRuntimes])

  const configure = useMutation({
    mutationFn: () => {
      if (!buddy?.agentId) throw new Error(t('computers.buddySettingsUnavailable'))
      return fetchApi(
        `/api/connector/computers/${encodeURIComponent(computer.sourceId)}/buddies/${encodeURIComponent(buddy.agentId)}/configure`,
        {
          method: 'POST',
          body: JSON.stringify({
            runtimeId,
            serverUrl: window.location.origin,
            workDir: workDir.trim(),
          }),
        },
      )
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['computers'] }),
        queryClient.invalidateQueries({ queryKey: ['connector-computers'] }),
        queryClient.invalidateQueries({ queryKey: ['agents'] }),
      ])
      showToast(t('computers.buddySettingsSaved'), 'success')
      onClose()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  return (
    <Modal open={Boolean(buddy)} onClose={onClose}>
      <ModalContent maxWidth="max-w-xl">
        <ModalHeader
          title={t('computers.buddySettingsFor', { name: buddy?.name ?? '' })}
          closeLabel={t('common.close')}
        />
        <ModalBody className="space-y-5">
          <fieldset>
            <legend className="text-xs font-black text-text-muted">
              {t('computers.buddyRuntime')}
            </legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {availableRuntimes.map((runtime) => (
                <button
                  key={runtime.id}
                  type="button"
                  onClick={() => setRuntimeId(runtime.id)}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl border px-3 py-3 text-left transition',
                    runtimeId === runtime.id
                      ? 'border-primary/45 bg-primary/10 text-primary'
                      : 'border-border-subtle bg-bg-deep/35 text-text-secondary hover:bg-bg-tertiary/55',
                  )}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-bg-deep/55">
                    <RuntimeIcon
                      iconId={runtime.iconId}
                      runtimeId={runtime.id}
                      label={runtime.label}
                      className="h-5 w-5"
                    />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black">{runtime.label}</span>
                    <span className="block truncate text-[11px] text-text-muted">
                      {runtime.version || runtime.command || runtime.id}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </fieldset>
          <div>
            <label className="text-xs font-black text-text-muted" htmlFor="buddy-work-dir">
              {t('computers.buddyWorkDir')}
            </label>
            <div className="relative mt-2">
              <FolderOpen
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <Input
                id="buddy-work-dir"
                value={workDir}
                onChange={(event) => setWorkDir(event.target.value)}
                placeholder={t('computers.buddyWorkDirPlaceholder')}
                className="pl-9"
              />
            </div>
          </div>
          {computer.status !== 'online' ? (
            <p className="rounded-2xl border border-warning/20 bg-warning/10 px-3 py-2 text-xs font-semibold text-warning">
              {t('computers.buddySettingsOffline')}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              size="sm"
              disabled={
                computer.status !== 'online' || !runtimeId || !workDir.trim() || configure.isPending
              }
              onClick={() => configure.mutate()}
            >
              {configure.isPending ? <Loader2 size={15} className="animate-spin" /> : null}
              {t('computers.saveBuddySettings')}
            </Button>
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}

function LocalComputerDetail({
  computer,
  spaceId,
  isRefreshing,
  onRefresh,
  onBack,
}: {
  computer: ShadowComputer
  spaceId?: string
  isRefreshing: boolean
  onRefresh: () => void
  onBack: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const confirm = useConfirmStore((state) => state.confirm)
  const [name, setName] = useState(computer.name)
  const [createBuddyOpen, setCreateBuddyOpen] = useState(false)
  const [settingsBuddy, setSettingsBuddy] = useState<ShadowComputerBuddy | null>(null)
  const [openingBuddyId, setOpeningBuddyId] = useState<string | null>(null)

  useEffect(() => setName(computer.name), [computer.name])
  useEffect(() => {
    if (computer.status !== 'online') setSettingsBuddy(null)
  }, [computer.status])

  const rename = useMutation({
    mutationFn: () =>
      fetchApi<{ computer: ShadowComputer }>(`/api/computers/${encodeURIComponent(computer.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['computers'] })
      showToast(t('computers.renameSuccess'), 'success')
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const remove = useMutation({
    mutationFn: () =>
      fetchApi(`/api/computers/${encodeURIComponent(computer.id)}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['computers'] })
      showToast(t('computers.removeSuccess'), 'success')
      onBack()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const requestRemove = async () => {
    const accepted = await confirm({
      title: t('computers.removeTitle'),
      message: t('computers.removeDescription', { name: computer.name }),
      confirmLabel: t('computers.remove'),
      danger: true,
    })
    if (accepted) remove.mutate()
  }

  const openBuddyConversation = async (buddy: ShadowComputerBuddy) => {
    if (!buddy.agentId || openingBuddyId) return
    setOpeningBuddyId(buddy.buddyId)
    try {
      const agent = await fetchApi<Agent>(`/api/agents/${encodeURIComponent(buddy.agentId)}`)
      const peerUserId = agent.botUser?.id ?? agent.userId
      if (!peerUserId) throw new Error(t('computers.buddyConversationFailed'))
      const channel = await fetchApi<{ id: string }>('/api/channels/dm', {
        method: 'POST',
        body: JSON.stringify({ userId: peerUserId }),
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['direct-channels'] }),
        queryClient.invalidateQueries({ queryKey: ['messages', channel.id] }),
      ])
      const osSpaceSlug = currentOsSpaceSlug()
      if (!osSpaceSlug) throw new Error(t('computers.buddyConversationFailed'))
      const server = spaceId
        ? { id: spaceId, slug: osSpaceSlug }
        : await fetchApi<{ id: string; slug?: string | null }>(
            `/api/servers/${encodeURIComponent(osSpaceSlug)}`,
          )
      openLocalBuddyDirectMessage({
        serverId: server.id,
        serverSlug: server.slug ?? osSpaceSlug,
        channelId: channel.id,
        peerUserId,
        buddy,
      })
    } catch (error) {
      showToast(
        error instanceof Error && error.message !== t('computers.buddyConversationFailed')
          ? error.message
          : t('computers.buddyConversationFailed'),
        'error',
      )
    } finally {
      setOpeningBuddyId(null)
    }
  }

  return (
    <>
      <div className="local-computer-detail-container h-full overflow-y-auto">
        <div className="local-computer-detail-content mx-auto max-w-5xl">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft size={15} />
            {t('computers.back')}
          </Button>
          <div className="local-computer-detail-layout">
            <section className="overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.035]">
              <div className="local-computer-detail-hero bg-gradient-to-br from-primary/[0.12] via-transparent to-info/[0.08]">
                <div className="local-computer-detail-visual flex min-h-32 items-center justify-center px-5 py-3">
                  <ComputerDeviceIllustration
                    deviceClass={computer.device.class}
                    className="h-32"
                  />
                </div>
                <div className="local-computer-detail-identity flex min-w-0 flex-1 items-start justify-between gap-3 px-5 pb-5">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-text-muted">{t('computers.kind.local')}</p>
                    <h2 className="mt-1 truncate text-xl font-black text-text-primary sm:text-2xl">
                      {computer.name}
                    </h2>
                    <p className="mt-1 truncate text-xs text-text-muted">
                      {computer.device.model ||
                        computer.device.hostname ||
                        t('computers.unknownDevice')}
                    </p>
                  </div>
                  <ComputerStatus computer={computer} />
                </div>
              </div>

              {computer.status !== 'online' ? (
                <div className="local-computer-detail-offline rounded-2xl border border-warning/25 bg-warning/[0.08]">
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-warning/12 text-warning">
                      <WifiOff size={19} />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-black text-text-primary">
                        {t('computers.offlineGuideTitle')}
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-text-muted">
                        {t('computers.offlineGuideDescription', { name: computer.name })}
                      </p>
                    </div>
                  </div>
                  <ol className="local-computer-detail-steps mt-4 text-xs leading-5 text-text-secondary">
                    {['offlineStepPowerOn', 'offlineStepDesktop', 'offlineStepWait'].map(
                      (key, index) => (
                        <li key={key} className="flex gap-2 rounded-xl bg-bg-deep/30 px-3 py-2.5">
                          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-warning/15 text-[10px] font-black text-warning">
                            {index + 1}
                          </span>
                          <span>{t(`computers.${key}`)}</span>
                        </li>
                      ),
                    )}
                  </ol>
                  <div className="local-computer-detail-actions mt-4">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={isRefreshing}
                      onClick={onRefresh}
                      className="w-full"
                    >
                      <RefreshCw size={14} className={cn(isRefreshing && 'animate-spin')} />
                      {t('computers.refreshStatus')}
                    </Button>
                    <a
                      href={desktopDownloadPath(computer)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 text-xs font-black text-bg-primary transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
                    >
                      <Download size={14} />
                      {t('computers.downloadDesktop')}
                    </a>
                  </div>
                </div>
              ) : null}

              <details className="group border-t border-white/[0.07]">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-black text-text-secondary transition hover:bg-white/[0.025] hover:text-text-primary sm:px-5 [&::-webkit-details-marker]:hidden">
                  <ChevronDown
                    size={16}
                    className="text-text-muted transition-transform group-open:rotate-180"
                  />
                  {t('computers.deviceDetails')}
                </summary>
                <div className="local-computer-detail-device-grid">
                  {[
                    [
                      t('computers.deviceModel'),
                      computer.device.model || t('computers.unknownDevice'),
                    ],
                    [t('computers.hostname'), computer.device.hostname || '—'],
                    [
                      t('computers.system'),
                      [computer.device.os, computer.device.osVersion].filter(Boolean).join(' ') ||
                        '—',
                    ],
                    [t('computers.architecture'), computer.device.arch || '—'],
                    [t('computers.connectorVersion'), computer.local?.daemonVersion || '—'],
                    [
                      t('computers.lastSeen'),
                      computer.lastSeenAt ? new Date(computer.lastSeenAt).toLocaleString() : '—',
                    ],
                  ].map(([label, value]) => (
                    <div key={label} className="min-w-0 rounded-xl bg-bg-deep/45 px-3 py-2.5">
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-text-muted">
                        {label}
                      </p>
                      <p className="mt-1 truncate text-xs font-bold text-text-secondary">{value}</p>
                    </div>
                  ))}
                </div>
              </details>
            </section>

            <div className="space-y-5">
              <section className="rounded-3xl border border-white/[0.08] bg-white/[0.035] p-4 sm:p-5">
                <div className="flex items-center gap-2">
                  <Bot size={17} className="text-primary" />
                  <h3 className="text-sm font-black text-text-primary">{t('computers.buddies')}</h3>
                  <span className="ml-auto text-xs font-bold text-text-muted">
                    {computer.buddyCount}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={computer.status !== 'online'}
                    onClick={() => setCreateBuddyOpen(true)}
                    title={
                      computer.status === 'online'
                        ? t('computers.addBuddy')
                        : t('computers.addBuddyOffline')
                    }
                    aria-label={t('computers.addBuddy')}
                    className="h-8 w-8"
                  >
                    <Plus size={15} />
                  </Button>
                </div>
                <div className="mt-4 space-y-2">
                  {computer.buddies.length ? (
                    computer.buddies.map((buddy) => {
                      const runtime = computer.runtimes.find(
                        (candidate) => candidate.id === buddy.runtimeId,
                      )
                      const runtimeId = buddy.runtimeId || runtime?.id || 'unknown'
                      const runtimeLabel = buddy.runtimeLabel || runtime?.label || runtimeId
                      const buddyOnline =
                        computer.status === 'online' &&
                        (buddy.status === 'running' || buddy.status === 'online')
                      return (
                        <ComputerBuddyRow
                          key={buddy.buddyId}
                          id={buddy.buddyId}
                          name={buddy.name}
                          avatarUrl={buddy.avatarUrl}
                          online={buddyOnline}
                          runtimeId={runtimeId}
                          runtimeLabel={runtimeLabel}
                          runtimeIconId={runtime?.iconId}
                          opening={openingBuddyId === buddy.buddyId}
                          chatDisabled={!buddy.agentId || Boolean(openingBuddyId)}
                          chatLabel={t('computers.openBuddyConversation', { name: buddy.name })}
                          configureLabel={
                            computer.status === 'online'
                              ? t('computers.buddySettingsFor', { name: buddy.name })
                              : undefined
                          }
                          onOpenChat={() => void openBuddyConversation(buddy)}
                          onConfigure={
                            buddy.agentId && computer.status === 'online'
                              ? () => setSettingsBuddy(buddy)
                              : undefined
                          }
                        />
                      )
                    })
                  ) : (
                    <p className="py-4 text-center text-sm text-text-muted">
                      {t('computers.noBuddies')}
                    </p>
                  )}
                </div>
              </section>

              <section className="rounded-3xl border border-white/[0.08] bg-white/[0.035] p-4 sm:p-5">
                <h3 className="text-sm font-black text-text-primary">{t('computers.settings')}</h3>
                <label
                  className="mt-4 block text-xs font-bold text-text-muted"
                  htmlFor="computer-name"
                >
                  {t('computers.name')}
                </label>
                <div className="mt-2 flex flex-col gap-2 min-[420px]:flex-row">
                  <Input
                    id="computer-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                  <Button
                    size="sm"
                    className="min-[420px]:shrink-0"
                    disabled={!name.trim() || name.trim() === computer.name || rename.isPending}
                    onClick={() => rename.mutate()}
                  >
                    {rename.isPending ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      t('computers.save')
                    )}
                  </Button>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  className="mt-5"
                  disabled={remove.isPending}
                  onClick={requestRemove}
                >
                  {remove.isPending ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Trash2 size={15} />
                  )}
                  {t('computers.remove')}
                </Button>
              </section>
            </div>
          </div>
        </div>
      </div>
      <QuickCreateBuddyModal
        open={createBuddyOpen}
        onClose={() => setCreateBuddyOpen(false)}
        onSuccess={async () => {
          await queryClient.invalidateQueries({ queryKey: ['computers'] })
          setCreateBuddyOpen(false)
        }}
        initialTarget="local"
        fixedConnectorComputerId={computer.sourceId}
      />
      <LocalBuddySettingsModal
        computer={computer}
        buddy={settingsBuddy}
        onClose={() => setSettingsBuddy(null)}
      />
    </>
  )
}

export function ComputersPage({
  initialComputerId,
  spaceId,
}: {
  initialComputerId?: string
  spaceId?: string
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<ComputerFilter>('all')
  const [search, setSearch] = useState('')
  const [addComputerMode, setAddComputerMode] = useState<AddComputerMode | null>(null)
  const [connectorCommand, setConnectorCommand] = useState<string | null>(null)
  const [waitingForConnector, setWaitingForConnector] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    normalizeInitialId(initialComputerId),
  )
  const computersQuery = useQuery({
    queryKey: ['computers'],
    queryFn: () => fetchApi<{ computers: ShadowComputer[] }>('/api/computers'),
    refetchInterval: (query) => {
      const hasLifecycleTransition = query.state.data?.computers.some((computer) =>
        ['pending', 'deploying', 'resuming', 'destroying', 'cancelling'].includes(computer.status),
      )
      return hasLifecycleTransition ||
        addComputerMode === 'local' ||
        selectedId?.startsWith('local:')
        ? 3_000
        : 15_000
    },
  })

  const connectorBootstrap = useMutation({
    mutationFn: () =>
      fetchApi<ConnectorBootstrapResult>('/api/connector/computers/bootstrap', {
        method: 'POST',
        body: JSON.stringify({
          serverUrl: window.location.origin,
          name: t('computers.defaultLocalName'),
        }),
      }),
    onSuccess: (result) => {
      setConnectorCommand(result.command)
      queryClient.invalidateQueries({ queryKey: ['computers'] })
      queryClient.invalidateQueries({ queryKey: ['connector-computers'] })
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const requestConnectorCommand = () => {
    if (!connectorCommand && !connectorBootstrap.isPending) connectorBootstrap.mutate()
  }

  const computers = computersQuery.data?.computers ?? []
  const selected = computers.find((computer) => computer.id === selectedId) ?? null
  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase()
    return computers.filter((computer) => {
      if (filter !== 'all' && computer.kind !== filter) return false
      if (!needle) return true
      return [computer.name, computer.device.hostname, computer.device.model, computer.device.os]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase().includes(needle))
    })
  }, [computers, filter, search])

  if (selected?.kind === 'local') {
    return (
      <LocalComputerDetail
        computer={selected}
        spaceId={spaceId}
        isRefreshing={computersQuery.isFetching}
        onRefresh={() => void computersQuery.refetch()}
        onBack={() => setSelectedId(null)}
      />
    )
  }

  if (selected?.kind === 'cloud') {
    return (
      <CloudComputersPage
        initialComputerId={selected.sourceId}
        spaceId={spaceId}
        onBack={() => setSelectedId(null)}
      />
    )
  }

  return (
    <>
      <div className="h-full overflow-y-auto p-5 sm:p-7">
        <div className="mx-auto max-w-6xl">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-text-primary">
                {t('computers.title')}
              </h1>
              <p className="mt-1 text-sm text-text-muted">{t('computers.subtitle')}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => computersQuery.refetch()}>
                <RefreshCw size={15} className={cn(computersQuery.isFetching && 'animate-spin')} />
                {t('computers.refresh')}
              </Button>
              <Button size="sm" onClick={() => setAddComputerMode('choose')}>
                <Plus size={15} />
                {t('computers.addComputer')}
              </Button>
            </div>
          </header>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="flex rounded-2xl border border-white/[0.08] bg-bg-deep/40 p-1">
              {(['all', 'local', 'cloud'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={cn(
                    'rounded-xl px-3 py-2 text-xs font-black transition',
                    filter === value
                      ? 'bg-primary text-white shadow'
                      : 'text-text-muted hover:text-text-primary',
                  )}
                >
                  {t(`computers.filter.${value}`)}
                </button>
              ))}
            </div>
            <div className="relative min-w-52 flex-1 sm:max-w-sm">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <Input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('computers.search')}
                className="pl-9"
              />
            </div>
          </div>

          {computersQuery.isLoading ? (
            <div className="grid min-h-72 place-items-center">
              <Loader2 className="animate-spin text-primary" />
            </div>
          ) : computersQuery.isError ? (
            <div className="grid min-h-72 place-items-center text-sm font-bold text-danger">
              {t('computers.loadFailed')}
            </div>
          ) : visible.length ? (
            <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
              {visible.map((computer) => (
                <ComputerCard
                  key={computer.id}
                  computer={computer}
                  onOpen={() => setSelectedId(computer.id)}
                />
              ))}
            </div>
          ) : (
            <div className="grid min-h-72 place-items-center rounded-3xl border border-dashed border-white/[0.10] bg-white/[0.02] text-center">
              <div>
                <Laptop size={40} className="mx-auto text-text-muted/50" />
                <p className="mt-3 text-sm font-bold text-text-muted">{t('computers.empty')}</p>
              </div>
            </div>
          )}
        </div>
      </div>
      <Modal
        open={addComputerMode !== null}
        onClose={() => {
          setAddComputerMode(null)
          setWaitingForConnector(false)
        }}
      >
        <ModalContent
          maxWidth={
            addComputerMode === 'cloud'
              ? 'max-w-4xl'
              : addComputerMode === 'local'
                ? 'max-w-4xl'
                : 'max-w-xl'
          }
          className={cn(addComputerMode === 'cloud' && 'max-h-[calc(100dvh-1rem)] rounded-[28px]')}
        >
          {addComputerMode === 'cloud' ? (
            <CloudComputersPage
              createOnly
              embeddedCreate
              openCreateOnMount
              spaceId={spaceId}
              onCreateBack={() => setAddComputerMode('choose')}
              onCreateClose={() => setAddComputerMode(null)}
              onCreated={(computer) => {
                setAddComputerMode(null)
                setSelectedId(`cloud:${computer.id}`)
              }}
            />
          ) : (
            <>
              <ModalHeader
                title={
                  addComputerMode === 'local'
                    ? t('computers.connectLocalTitle')
                    : t('computers.addComputerTitle')
                }
                onBack={
                  addComputerMode === 'local'
                    ? () => {
                        setAddComputerMode('choose')
                        setWaitingForConnector(false)
                      }
                    : undefined
                }
                backLabel={t('computers.chooseAnotherType')}
                closeLabel={t('common.close')}
              />
              <ModalBody className="space-y-4 py-5">
                {addComputerMode === 'local' ? (
                  <DesktopConnectorDownloadCard
                    connectorCommand={connectorCommand}
                    isWaitingForConnector={waitingForConnector}
                    onWaitingForConnectorChange={setWaitingForConnector}
                    onCliFallbackOpen={requestConnectorCommand}
                    t={t}
                  />
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setAddComputerMode('local')}
                      className="group rounded-3xl border border-white/[0.09] bg-white/[0.035] p-5 text-left transition hover:-translate-y-0.5 hover:border-primary/35 hover:bg-primary/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
                    >
                      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/12 text-primary">
                        <Laptop size={21} />
                      </span>
                      <span className="mt-4 block text-base font-black text-text-primary">
                        {t('computers.addLocal')}
                      </span>
                      <span className="mt-1.5 block text-xs leading-5 text-text-muted">
                        {t('computers.addLocalDescription')}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddComputerMode('cloud')}
                      className="group rounded-3xl border border-white/[0.09] bg-white/[0.035] p-5 text-left transition hover:-translate-y-0.5 hover:border-primary/35 hover:bg-primary/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
                    >
                      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-info/12 text-info">
                        <Cloud size={21} />
                      </span>
                      <span className="mt-4 block text-base font-black text-text-primary">
                        {t('computers.addCloud')}
                      </span>
                      <span className="mt-1.5 block text-xs leading-5 text-text-muted">
                        {t('computers.addCloudDescription')}
                      </span>
                    </button>
                  </div>
                )}
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  )
}
