import RFB from '@novnc/novnc'
import type {
  ShadowCloudComputer,
  ShadowCloudComputerApp,
  ShadowCloudComputerBuddiesResponse,
  ShadowCloudComputerBuddy,
  ShadowCloudComputerBuddyCreateResponse,
  ShadowCloudComputerConfigurationQuote,
  ShadowCloudComputerResourceProfile,
  ShadowCloudComputerRuntime,
} from '@shadowob/sdk'
import {
  CLOUD_COMPUTER_SHELL_COLORS,
  CLOUD_COMPUTER_SHELL_PALETTE,
  type CloudComputerShellColor,
  type ShadowComputer,
  waitForCloudComputerBuddy,
} from '@shadowob/shared'
import {
  Button,
  Checkbox,
  cn,
  Input,
  Modal,
  ModalBody,
  ModalButtonGroup,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@shadowob/ui'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal as XTerm } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { useGSAP } from '@gsap/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import gsap from 'gsap'
import type { TFunction } from 'i18next'
import {
  AlertCircle,
  Archive,
  Bot,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cloud,
  FolderOpen,
  Globe2,
  Loader2,
  type LucideIcon,
  MessageCircle,
  Monitor,
  Pause,
  Pencil,
  Play,
  PlugZap,
  Plus,
  RefreshCw,
  Save,
  ScreenShare,
  Settings,
  Square,
  Terminal,
  Trash2,
  Wallet,
  Wrench,
} from 'lucide-react'
import {
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  type WheelEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { getBuddyIntroPrompt, RuntimeIcon } from '../components/buddy-management/agent-dialogs'
import { CloudComputerConnectorsApp } from '../components/cloud-computer-connectors'
import { CloudComputerShell } from '../components/cloud-computer-shell'
import { UserAvatar } from '../components/common/avatar'
import { AvatarEditor } from '../components/common/avatar-editor'
import { useConfirmStore } from '../components/common/confirm-dialog'
import { ComputerBuddyRow } from '../components/computers/computer-buddy-row'
import { ComputerStatusDot } from '../components/computers/computer-status'
import { createCloudComputerWorkspaceSource, WorkspacePage } from '../components/workspace'
import { ApiError, fetchApi } from '../lib/api'
import { CloudBrowserCdpClient } from '../lib/cloud-browser-cdp'
import { canLoadCloudComputerApps } from '../lib/cloud-computer-cover'
import { connectSocket, getSocket } from '../lib/socket'
import { showToast } from '../lib/toast'
import { useRechargeStore } from '../stores/recharge.store'

gsap.registerPlugin(useGSAP)

type CloudComputerSummary = ShadowCloudComputer
type CloudComputerAppResult = ShadowCloudComputerApp
type CloudComputerResourceProfile = ShadowCloudComputerResourceProfile

export type CloudComputerCreateInput = {
  name: string
  shellColor: CloudComputerShellColor
  resourceTier: CloudComputerResourceProfile['id']
  buddy?: {
    name: string
    description?: string
    avatarUrl?: string
    runtimeId: string
    serverId?: string
  }
}

type CloudComputerConfigurationQuote = ShadowCloudComputerConfigurationQuote
type CloudComputerRuntimeCatalogEntry = ShadowCloudComputerRuntime

function cloudComputerResourceTierRank(tier: 'lightweight' | 'standard' | 'pro') {
  return { lightweight: 0, standard: 1, pro: 2 }[tier]
}

type CloudComputersPageProps = {
  initialComputerId?: string
  initialApp?: CloudComputerApp
  spaceId?: string
  createOnly?: boolean
  embeddedCreate?: boolean
  openCreateOnMount?: boolean
  onBack?: () => void
  onCreateBack?: () => void
  onCreateClose?: () => void
  onCreated?: (computer: ShadowCloudComputer) => void
}

export const CLOUD_COMPUTER_APP_KEYS = [
  'files',
  'browser',
  'terminal',
  'desktop',
  'buddies',
  'backups',
  'connectors',
  'settings',
] as const
export type CloudComputerApp = (typeof CLOUD_COMPUTER_APP_KEYS)[number]
type TerminalStatus = 'connecting' | 'connected' | 'disconnected' | 'error'
type VncStatus = 'connecting' | 'connected' | 'disconnected' | 'error'
type BrowserStatus = 'connecting' | 'connected' | 'error'

type CloudComputerVncSession = {
  ok: true
  websocketUrl: string
  expiresAt: string
  runtimeEnsured?: boolean
  repairAvailable?: boolean
  componentStatus?: 'ensured' | 'repairable' | 'not-configured'
}

type CloudComputerRepairResponse = {
  ok: true
  component: 'browser' | 'desktop'
  runtimeEnsured: boolean
  repairAvailable: boolean
  componentStatus: 'ensured' | 'repairable' | 'not-configured'
}

async function prepareCloudComputerComponent<T extends CloudComputerVncSession>(input: {
  initialSession: T
  repair: () => Promise<CloudComputerRepairResponse>
  session: () => Promise<T>
  isDisposed: () => boolean
}) {
  if (input.initialSession.runtimeEnsured || !input.initialSession.repairAvailable) {
    return input.initialSession
  }
  await input.repair()
  let current = input.initialSession
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 1_000))
    if (input.isDisposed()) return current
    current = await input.session()
    if (current.runtimeEnsured) return current
  }
  return current
}

function cloudComputerReconnectDelay(attempt: number) {
  return Math.min(1_000 * 2 ** Math.min(attempt, 4), 15_000)
}

function shouldRetryCloudComputerConnection(error: unknown) {
  return !(error instanceof ApiError && [400, 401, 403, 404, 422].includes(error.status))
}

type CloudComputerBrowserPage = {
  title: string
  url: string
}

type CloudComputerBrowserSession = {
  ok: true
  surface: 'cdp'
  token: string
  expiresAt: string
  cloudComputerId: string
  websocketUrl: string
  page: CloudComputerBrowserPage | null
  endpoints: {
    screenshot: string
    navigate: string
    click: string
    type: string
    key: string
  }
  runtimeEnsured?: boolean
  repairAvailable?: boolean
  componentStatus?: 'ensured' | 'repairable' | 'not-configured'
}

type CloudComputerRuntimeRepairResponse = {
  ok?: boolean
  component: 'runtime'
  cloudComputerId: string
  recoveryAction: 'redeploy' | 'resume'
}

type CloudComputerRuntimeRebuildResponse = {
  ok: true
  component: 'runtime'
  cloudComputerId: string
  recoveryAction: 'safe-rebuild'
  status: string
  detachedConnectors: number
  preservedWorkspace: boolean
}

type CloudComputerLifecycleAction = 'pause' | 'resume' | 'cancel' | 'repair' | 'delete'

type CloudComputerLifecycleResponse = {
  ok: boolean
  cloudComputerId: string
  status?: string
  error?: string
}

type CloudComputerBuddy = ShadowCloudComputerBuddy
type CloudComputerBuddiesResponse = ShadowCloudComputerBuddiesResponse
type CloudComputerCreateBuddyResponse = ShadowCloudComputerBuddyCreateResponse

type CloudDeploymentBackup = {
  id: string
  agentId?: string | null
  status: string
  driver?: string | null
  phase?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  completedAt?: string | null
}

type CloudComputerBackupsResponse = {
  cloudComputerId: string
  backups: CloudDeploymentBackup[]
}

function formatTimestamp(value: string | null | undefined, locale: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function currentOsSpaceSlug() {
  if (typeof window === 'undefined') return null
  return window.location.pathname.match(/^\/app\/spaces\/([^/]+)/)?.[1] ?? null
}

function openOsDirectMessage(input: {
  serverId: string
  serverSlug: string
  channelId: string
  buddy: CloudComputerBuddy
}) {
  window.dispatchEvent(
    new CustomEvent('shadow:os-command', {
      detail: {
        action: 'open-direct-message',
        serverId: input.serverId,
        serverSlug: input.serverSlug,
        channelId: input.channelId,
        peerUserId: input.buddy.botUser?.id,
        title:
          input.buddy.botUser?.displayName ?? input.buddy.botUser?.username ?? input.buddy.name,
        iconUrl: input.buddy.botUser?.avatarUrl ?? input.buddy.avatarUrl ?? null,
      },
    }),
  )
}

function openOsBuddySettings(input: { serverId: string; serverSlug: string; agentId: string }) {
  window.dispatchEvent(
    new CustomEvent('shadow:os-command', {
      detail: {
        action: 'open-buddy-settings',
        serverId: input.serverId,
        serverSlug: input.serverSlug,
        agentId: input.agentId,
      },
    }),
  )
}

function StatusDot({ status }: { status: string }) {
  return <ComputerStatusDot status={status} kind="cloud" />
}

function cloudComputerDisplayError(t: TFunction, computer: CloudComputerSummary) {
  return t(`cloudComputers.failureReason.${computer.health?.reason ?? 'runtime_failed'}`, {
    defaultValue: t('cloudComputers.cover.failedDesc'),
  })
}

function CloudComputerStateBanner({
  computer,
  compact = false,
}: {
  computer: CloudComputerSummary
  compact?: boolean
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const openRecharge = useRechargeStore((state) => state.openModalWithContext)
  const [message, setMessage] = useState<string | null>(null)
  const healthState =
    computer.health?.state ??
    (computer.status === 'failed'
      ? 'failed'
      : computer.status === 'paused'
        ? 'paused'
        : computer.status === 'deployed'
          ? 'ready'
          : 'preparing')
  const recommended = computer.nextActions?.[0]
  const walletQuery = useQuery({
    queryKey: ['wallet'],
    enabled: recommended === 'add-funds',
    queryFn: () => fetchApi<{ balance: number }>('/api/wallet'),
  })
  const hourlyCost = computer.cost?.hourlyCredits ?? 0
  const canResumeWithBalance =
    typeof walletQuery.data?.balance === 'number' &&
    hourlyCost > 0 &&
    walletQuery.data.balance >= hourlyCost
  const runRecovery = useMutation({
    mutationFn: async (action: 'repair' | 'resume' | 'rebuild' | 'cancel' | 'delete') => {
      if (action === 'rebuild') {
        return fetchApi<CloudComputerRuntimeRebuildResponse>(
          `/api/cloud-computers/${encodeURIComponent(computer.id)}/runtime/rebuild`,
          { method: 'POST' },
        )
      }
      if (action === 'cancel') {
        return fetchApi<CloudComputerLifecycleResponse>(
          `/api/cloud-computers/${encodeURIComponent(computer.id)}/cancel`,
          { method: 'POST' },
        )
      }
      if (action === 'resume') {
        return fetchApi<CloudComputerLifecycleResponse>(
          `/api/cloud-computers/${encodeURIComponent(computer.id)}/resume`,
          { method: 'POST' },
        )
      }
      if (action === 'delete') {
        return fetchApi<CloudComputerLifecycleResponse>(
          `/api/cloud-computers/${encodeURIComponent(computer.id)}`,
          { method: 'DELETE' },
        )
      }
      return fetchApi<CloudComputerRuntimeRepairResponse>(
        `/api/cloud-computers/${encodeURIComponent(computer.id)}/runtime/repair`,
        { method: 'POST' },
      )
    },
    onSuccess: (_response, action) => {
      setMessage(
        action === 'delete'
          ? t('cloudComputers.lifecycle.deleteQueued')
          : t(`cloudComputers.recovery.${action}Queued`),
      )
      queryClient.invalidateQueries({ queryKey: ['cloud-computers'] })
    },
    onError: () => setMessage(t('cloudComputers.lifecycle.actionFailed')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['cloud-computers'] }),
  })

  if (healthState === 'ready') return null
  const isDeleting = computer.operation?.kind === 'delete'
  const isUpdating = computer.operation?.kind === 'update'
  const description = isDeleting
    ? t('cloudComputers.operation.deleteNotice')
    : isUpdating
      ? t('cloudComputers.recovery.updatingDesc')
      : healthState === 'failed' ||
          (healthState === 'paused' && computer.health?.reason === 'insufficient_balance')
        ? cloudComputerDisplayError(t, computer)
        : t(`cloudComputers.cover.${healthState}Desc`)
  const openCloudComputerRecharge = () =>
    openRecharge({
      source: 'cloud-computer',
      cloudComputerId: computer.id,
      cloudComputerName: computer.name,
      hourlyCost: computer.cost?.hourlyCredits ?? undefined,
      resumeAfterPayment: true,
    })

  return (
    <div
      className={cn(
        'mt-4 flex flex-wrap items-center gap-3',
        !compact && 'rounded-2xl border px-4 py-3',
        !compact &&
          (healthState === 'failed'
            ? 'border-danger/20 bg-danger/7'
            : 'border-warning/20 bg-warning/7'),
      )}
    >
      {!compact ? (
        computer.operation ? (
          <Loader2 size={18} className="shrink-0 animate-spin text-warning" />
        ) : (
          <AlertCircle
            size={18}
            className={healthState === 'failed' ? 'shrink-0 text-danger' : 'shrink-0 text-warning'}
          />
        )
      ) : null}
      {!compact ? (
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-text-primary">
            {isDeleting
              ? t('cloudComputers.recovery.deletingTitle')
              : isUpdating
                ? t('cloudComputers.recovery.updatingTitle')
                : t(`cloudComputers.recovery.${healthState}Title`)}
          </p>
          <p className="mt-0.5 text-xs leading-5 text-text-muted">{description}</p>
          {computer.operation ? (
            <p className="mt-0.5 text-xs font-semibold text-text-secondary">
              {t(`cloudComputers.operation.${computer.operation.stage}`)} ·{' '}
              {computer.operation.progress}%
            </p>
          ) : null}
          {message ? (
            <p className="mt-1 text-xs font-semibold text-text-secondary">{message}</p>
          ) : null}
          {healthState === 'failed' && computer.errorMessage ? (
            <details className="mt-1 text-xs text-text-muted">
              <summary className="cursor-pointer">
                {t('cloudComputers.recovery.technicalDetails')}
              </summary>
              <p className="mt-1 break-words font-mono">{computer.errorMessage}</p>
            </details>
          ) : null}
        </div>
      ) : null}
      {healthState === 'paused' ? (
        recommended === 'add-funds' && !canResumeWithBalance ? (
          <Button size="sm" onClick={openCloudComputerRecharge}>
            <Wallet size={14} />
            {t('recharge.restoreAndResume')}
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={runRecovery.isPending}
            onClick={() => runRecovery.mutate('resume')}
          >
            <Play size={14} />
            {t('cloudComputers.lifecycle.resume')}
          </Button>
        )
      ) : healthState === 'failed' ? (
        recommended === 'retry-delete' ? (
          <Button
            size="sm"
            disabled={runRecovery.isPending}
            onClick={() => runRecovery.mutate('delete')}
          >
            <Trash2 size={14} />
            {t('cloudComputers.recovery.retryDelete')}
          </Button>
        ) : recommended === 'rebuild-runtime' ? (
          <Button
            size="sm"
            disabled={runRecovery.isPending}
            onClick={() => runRecovery.mutate('rebuild')}
          >
            <RefreshCw size={14} />
            {t('cloudComputers.recovery.setupAgain')}
          </Button>
        ) : recommended === 'repair-runtime' ? (
          <Button
            size="sm"
            disabled={runRecovery.isPending}
            onClick={() => runRecovery.mutate('repair')}
          >
            <Wrench size={14} />
            {t('cloudComputers.recovery.retry')}
          </Button>
        ) : recommended === 'add-funds' ? (
          <Button size="sm" onClick={openCloudComputerRecharge}>
            <Wallet size={14} />
            {t('recharge.restoreAndResume')}
          </Button>
        ) : null
      ) : computer.operation?.cancellable ? (
        <Button
          variant="secondary"
          size="sm"
          disabled={runRecovery.isPending}
          onClick={() => runRecovery.mutate('cancel')}
        >
          <Square size={14} />
          {t('cloudComputers.lifecycle.cancel')}
        </Button>
      ) : null}
    </div>
  )
}

function LoadingDesktop() {
  const { t } = useTranslation()
  return (
    <div className="grid h-full place-items-center text-sm font-semibold text-text-muted">
      <span className="inline-flex items-center gap-2">
        <Loader2 size={16} className="animate-spin" />
        {t('common.loading')}
      </span>
    </div>
  )
}

export function CloudComputerCreateModal({
  open,
  creating,
  error,
  spaceId,
  onClose,
  onBack,
  onSubmit,
  embedded = false,
}: {
  open: boolean
  creating: boolean
  error: string | null
  spaceId?: string
  onClose: () => void
  onBack?: () => void
  onSubmit: (input: CloudComputerCreateInput) => void
  embedded?: boolean
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [shellColor, setShellColor] = useState<CloudComputerShellColor>('aqua')
  const [resourceTier, setResourceTier] = useState<CloudComputerResourceProfile['id']>('standard')
  const [createBuddy, setCreateBuddy] = useState(true)
  const [buddyName, setBuddyName] = useState('')
  const [buddyDescription, setBuddyDescription] = useState('')
  const [buddyAvatarUrl, setBuddyAvatarUrl] = useState('')
  const [runtimeId, setRuntimeId] = useState('hermes')
  const [runtimePickerOpen, setRuntimePickerOpen] = useState(false)
  const profilesQuery = useQuery({
    queryKey: ['cloud-computer-resource-profiles'],
    enabled: open,
    queryFn: () =>
      fetchApi<{ profiles: CloudComputerResourceProfile[] }>(
        '/api/cloud-computers/resource-profiles',
      ),
  })
  const runtimesQuery = useQuery({
    queryKey: ['cloud-computer-runtime-catalog'],
    enabled: open,
    queryFn: () =>
      fetchApi<{ runtimes: CloudComputerRuntimeCatalogEntry[] }>('/api/cloud-computers/runtimes'),
  })

  useEffect(() => {
    if (!open) return
    setName(t('cloudComputers.defaultName'))
    setShellColor('aqua')
    setResourceTier('standard')
    setCreateBuddy(true)
    setBuddyName(t('cloudComputers.createBuddyDefaultName'))
    setBuddyDescription('')
    setBuddyAvatarUrl('')
    setRuntimeId('hermes')
    setRuntimePickerOpen(false)
  }, [open, t])

  useEffect(() => {
    const runtimes = runtimesQuery.data?.runtimes
    if (!open || !runtimes?.length || runtimes.some((runtime) => runtime.id === runtimeId)) return
    const fallback = runtimes.find((runtime) => runtime.id === 'hermes') ?? runtimes[0]
    if (!fallback) return
    setRuntimeId(fallback.id)
    const minimumResourceTier = fallback.minimumResourceTier
    if (minimumResourceTier) {
      setResourceTier((current) =>
        cloudComputerResourceTierRank(current) < cloudComputerResourceTierRank(minimumResourceTier)
          ? minimumResourceTier
          : current,
      )
    }
  }, [open, runtimeId, runtimesQuery.data?.runtimes])

  const trimmedName = name.trim()
  const trimmedBuddyName = buddyName.trim()
  const selectedProfile = profilesQuery.data?.profiles.find(
    (profile) => profile.id === resourceTier,
  )
  const selectedRuntime = runtimesQuery.data?.runtimes.find((runtime) => runtime.id === runtimeId)
  const requiredTier = selectedRuntime?.minimumResourceTier
  const runtimeNeedsConfiguration = Boolean(
    createBuddy &&
      requiredTier &&
      cloudComputerResourceTierRank(resourceTier) < cloudComputerResourceTierRank(requiredTier),
  )
  const hourlyCredits = selectedProfile
    ? selectedProfile.baseHourlyCredits + (createBuddy ? selectedProfile.additionalBuddyCredits : 0)
    : null
  const canSubmit = Boolean(
    trimmedName &&
      !creating &&
      selectedProfile &&
      (!createBuddy || (trimmedBuddyName && selectedRuntime)) &&
      !runtimeNeedsConfiguration,
  )
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return
    onSubmit({
      name: trimmedName,
      shellColor,
      resourceTier,
      ...(createBuddy
        ? {
            buddy: {
              name: trimmedBuddyName,
              ...(buddyDescription.trim() ? { description: buddyDescription.trim() } : {}),
              ...(buddyAvatarUrl ? { avatarUrl: buddyAvatarUrl } : {}),
              runtimeId,
              ...(spaceId ? { serverId: spaceId } : {}),
            },
          }
        : {}),
    })
  }

  const content = (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-col">
      <ModalHeader
        title={t('cloudComputers.createDialogTitle')}
        onBack={onBack}
        backLabel={t('computers.chooseAnotherType')}
        closeLabel={t('common.close')}
        hideCloseButton={creating}
        className="px-5 py-3 [&_button]:h-9 [&_button]:w-9"
      />
      <ModalBody className="space-y-3 px-5 py-3 text-sm">
        <section className="overflow-hidden rounded-[24px] bg-bg-secondary/55 ring-1 ring-white/[0.06]">
          <div className="grid md:grid-cols-[250px_minmax(0,1fr)]">
            <aside className="flex flex-col items-center border-b border-white/[0.06] p-4 md:border-b-0 md:border-r">
              <div className="flex min-h-[158px] w-full items-center justify-center rounded-2xl bg-[radial-gradient(circle_at_50%_42%,rgba(47,223,234,0.14),transparent_68%),rgba(0,0,0,0.1)]">
                <CloudComputerShell
                  color={shellColor}
                  status="ready"
                  size="lg"
                  label={t('cloudComputers.createAppearancePreview')}
                />
              </div>
              <fieldset className="mt-2">
                <legend className="sr-only">{t('cloudComputers.createColorLabel')}</legend>
                <div className="flex flex-nowrap justify-center gap-1">
                  {CLOUD_COMPUTER_SHELL_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={t(`cloudComputers.appearance.colors.${color}`)}
                      aria-pressed={shellColor === color}
                      onClick={() => setShellColor(color)}
                      disabled={creating}
                      className={cn(
                        'grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                        shellColor === color
                          ? 'border-white shadow-[0_0_0_3px_rgba(47,223,234,0.28)]'
                          : 'border-transparent',
                      )}
                    >
                      <span
                        className="h-3.5 w-3.5 rounded-full shadow-inner"
                        style={{ backgroundColor: CLOUD_COMPUTER_SHELL_PALETTE[color].shell }}
                      />
                    </button>
                  ))}
                </div>
              </fieldset>
              {hourlyCredits !== null ? (
                <div className="mt-3 w-full border-t border-white/[0.06] pt-3 text-center">
                  <p className="text-[11px] font-bold text-text-muted">
                    {t(`cloudComputers.configuration.tiers.${resourceTier}`)}
                  </p>
                  <p className="mt-0.5 text-lg font-black text-primary">
                    {t('cloudComputers.createQuoteHourly', { count: hourlyCredits })}
                  </p>
                  <p className="text-[10px] text-text-muted">
                    {t('cloudComputers.createQuoteMonthly', { count: hourlyCredits * 720 })}
                  </p>
                </div>
              ) : null}
            </aside>

            <div className="min-w-0 p-4">
              <Input
                autoFocus
                maxLength={80}
                aria-label={t('cloudComputers.createNameLabel')}
                placeholder={t('cloudComputers.createNamePlaceholder')}
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={creating}
                className="h-11 text-base"
              />

              <div className="mt-4">
                <p className="text-xs font-black text-text-secondary">
                  {t('cloudComputers.createConfigurationTitle')}
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {(profilesQuery.data?.profiles ?? []).map((profile) => {
                    const profileHourlyCredits =
                      profile.baseHourlyCredits + (createBuddy ? profile.additionalBuddyCredits : 0)
                    return (
                      <button
                        key={profile.id}
                        type="button"
                        aria-pressed={resourceTier === profile.id}
                        onClick={() => setResourceTier(profile.id)}
                        disabled={creating}
                        className={cn(
                          'rounded-xl px-3 py-2.5 text-left ring-1 ring-inset transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                          resourceTier === profile.id
                            ? 'bg-primary/12 ring-primary/60'
                            : 'bg-bg-base/55 ring-white/[0.07] hover:bg-bg-base/80 hover:ring-primary/30',
                        )}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-sm font-black text-text-primary">
                            {t(`cloudComputers.configuration.tiers.${profile.id}`)}
                          </span>
                          <span className="text-[10px] font-bold text-primary">
                            {t('cloudComputers.createQuoteHourly', {
                              count: profileHourlyCredits,
                            })}
                          </span>
                        </span>
                        <span className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-text-muted">
                          <span>{profile.cpu}</span>
                          <span>{profile.memory}</span>
                          <span>{profile.storageGi} GiB</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="mt-4 border-t border-white/[0.06] pt-4">
                <label className="flex cursor-pointer items-center gap-2.5">
                  <Checkbox
                    checked={createBuddy}
                    onCheckedChange={(checked) => setCreateBuddy(checked === true)}
                    disabled={creating}
                  />
                  <span className="text-[13px] font-black text-text-primary">
                    {t('cloudComputers.createBuddyWithComputer')}
                  </span>
                </label>
                {createBuddy ? (
                  <div className="mt-3 grid gap-3 md:grid-cols-[52px_minmax(0,1fr)_250px] md:items-stretch">
                    <div className="self-start [&>button]:h-[52px] [&>button]:w-[52px]">
                      <AvatarEditor
                        value={buddyAvatarUrl}
                        userId="new-cloud-computer-buddy"
                        onChange={setBuddyAvatarUrl}
                      />
                    </div>
                    <div className="grid min-w-0 gap-2">
                      <Input
                        maxLength={80}
                        aria-label={t('cloudComputers.buddyName')}
                        placeholder={t('cloudComputers.buddyNamePlaceholder')}
                        value={buddyName}
                        onChange={(event) => setBuddyName(event.target.value)}
                        disabled={creating}
                        className="h-10"
                      />
                      <textarea
                        aria-label={t('cloudComputers.buddyDescription')}
                        value={buddyDescription}
                        onChange={(event) => setBuddyDescription(event.target.value)}
                        placeholder={t('cloudComputers.buddyDescriptionPlaceholder')}
                        maxLength={500}
                        disabled={creating}
                        className="h-14 min-h-14 w-full resize-none rounded-xl border border-border-subtle/55 bg-bg-primary/45 px-3 py-2.5 text-sm font-bold leading-5 text-text-primary outline-none placeholder:text-text-muted/40 focus:border-primary/70 focus:shadow-[0_0_0_4px_rgba(0,198,209,0.12)] disabled:opacity-60"
                      />
                    </div>
                    <Popover open={runtimePickerOpen} onOpenChange={setRuntimePickerOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          aria-expanded={runtimePickerOpen}
                          aria-label={t('cloudComputers.buddyRuntime')}
                          disabled={creating}
                          className="flex min-h-[104px] w-full items-center gap-3 rounded-xl bg-bg-base/55 px-4 text-left ring-1 ring-inset ring-white/[0.07] transition hover:bg-bg-base/80 hover:ring-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {selectedRuntime ? (
                            <RuntimeIcon
                              runtimeId={selectedRuntime.id}
                              iconId={selectedRuntime.iconId}
                              label={selectedRuntime.label}
                              className="h-9 w-9 shrink-0"
                            />
                          ) : (
                            <Bot size={28} className="shrink-0 text-text-muted" />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block text-[10px] font-bold text-text-muted">
                              {t('cloudComputers.buddyRuntime')}
                            </span>
                            <span className="mt-0.5 block truncate text-sm font-black text-text-primary">
                              {selectedRuntime?.label ?? runtimeId}
                            </span>
                          </span>
                          <ChevronRight
                            size={16}
                            className={cn(
                              'shrink-0 text-text-muted transition-transform',
                              runtimePickerOpen && 'rotate-90',
                            )}
                          />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-72 rounded-2xl p-2">
                        <div className="grid gap-1">
                          {(runtimesQuery.data?.runtimes ?? []).map((runtime) => (
                            <button
                              key={runtime.id}
                              type="button"
                              aria-pressed={runtimeId === runtime.id}
                              onClick={() => {
                                setRuntimeId(runtime.id)
                                setRuntimePickerOpen(false)
                                if (
                                  runtime.minimumResourceTier &&
                                  cloudComputerResourceTierRank(resourceTier) <
                                    cloudComputerResourceTierRank(runtime.minimumResourceTier)
                                ) {
                                  setResourceTier(runtime.minimumResourceTier)
                                }
                              }}
                              disabled={creating}
                              className={cn(
                                'flex min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                                runtimeId === runtime.id
                                  ? 'bg-primary/12 text-primary'
                                  : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary',
                              )}
                            >
                              <RuntimeIcon
                                runtimeId={runtime.id}
                                iconId={runtime.iconId}
                                label={runtime.label}
                                className="h-7 w-7 shrink-0"
                              />
                              <span className="truncate">{runtime.label}</span>
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                    {runtimeNeedsConfiguration && requiredTier ? (
                      <p className="flex items-center gap-2 text-xs font-semibold text-warning md:col-start-2 md:col-end-4">
                        <AlertCircle size={14} />
                        {t('cloudComputers.buddyRuntimeNeedsConfiguration', {
                          runtime: selectedRuntime?.label ?? runtimeId,
                          tier: t(`cloudComputers.configuration.tiers.${requiredTier}`),
                        })}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>
        {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}
      </ModalBody>
      <ModalFooter className="px-5 py-2.5">
        <ModalButtonGroup>
          <Button type="button" variant="ghost" size="sm" disabled={creating} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={!canSubmit}>
            {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            {creating ? t('cloudComputers.creatingComputer') : t('cloudComputers.confirmCreate')}
          </Button>
        </ModalButtonGroup>
      </ModalFooter>
    </form>
  )

  if (embedded) return open ? content : null

  return (
    <Modal
      open={open}
      onClose={creating ? undefined : onClose}
      closeOnEscape={!creating}
      closeOnOverlayClick={!creating}
    >
      <ModalContent
        size="lg"
        className="max-h-[calc(100dvh-1rem)] rounded-[28px] supports-[height:100dvh]:max-h-[calc(100dvh-1rem)]"
      >
        {content}
      </ModalContent>
    </Modal>
  )
}

function CloudComputerTerminalPanel({ computer }: { computer: CloudComputerSummary }) {
  const { t } = useTranslation()
  const terminalHostRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const [status, setStatus] = useState<TerminalStatus>('connecting')
  const [error, setError] = useState<string | null>(null)
  const [restartKey, setRestartKey] = useState(0)
  const repairRuntime = useMutation({
    mutationFn: () =>
      fetchApi<CloudComputerRuntimeRepairResponse>(
        `/api/cloud-computers/${computer.id}/runtime/repair`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      setError(null)
      setStatus('connecting')
      setRestartKey((value) => value + 1)
    },
    onError: (err: Error) => {
      setError(err.message)
    },
  })

  useEffect(() => {
    const host = terminalHostRef.current
    if (!host) return

    const terminal = new XTerm({
      cursorBlink: true,
      convertEol: true,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      fontSize: 13,
      theme: {
        background: '#09090b',
        foreground: '#f4f4f5',
        cursor: '#f4f4f5',
        selectionBackground: '#3f3f46',
      },
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(host)
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.key !== 'Tab') return true
      event.preventDefault()
      event.stopPropagation()
      return true
    })
    terminal.focus()
    fitAddon.fit()
    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    connectSocket()
    const socket = getSocket()

    const handleData = (payload: { sessionId?: string; data?: string }) => {
      if (payload.sessionId !== sessionIdRef.current || typeof payload.data !== 'string') return
      terminal.write(payload.data)
    }
    const handleExit = (payload: { sessionId?: string; exitCode?: number }) => {
      if (payload.sessionId !== sessionIdRef.current) return
      sessionIdRef.current = null
      setStatus('disconnected')
      terminal.writeln('')
      terminal.writeln(t('cloudComputers.terminalSessionEnded', { code: payload.exitCode ?? 0 }))
    }

    socket.on('cloud-computer:terminal:data', handleData)
    socket.on('cloud-computer:terminal:exit', handleExit)

    const startTerminal = () => {
      setStatus('connecting')
      socket.emit(
        'cloud-computer:terminal:start',
        {
          computerId: computer.id,
          cols: terminal.cols,
          rows: terminal.rows,
        },
        (response: { ok: true; sessionId: string } | { ok: false; error: string }) => {
          if (!response.ok) {
            setStatus('error')
            setError(response.error)
            terminal.writeln(t('cloudComputers.terminalStartFailed', { error: response.error }))
            return
          }
          sessionIdRef.current = response.sessionId
          setStatus('connected')
          setError(null)
          terminal.writeln(t('cloudComputers.terminalConnected'))
        },
      )
    }

    const dataDisposable = terminal.onData((data) => {
      const sessionId = sessionIdRef.current
      if (!sessionId) return
      socket.emit('cloud-computer:terminal:input', { sessionId, data })
    })
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
      const sessionId = sessionIdRef.current
      if (!sessionId) return
      socket.emit('cloud-computer:terminal:resize', {
        sessionId,
        cols: terminal.cols,
        rows: terminal.rows,
      })
    })
    resizeObserver.observe(host)
    startTerminal()

    return () => {
      const sessionId = sessionIdRef.current
      if (sessionId) socket.emit('cloud-computer:terminal:stop', { sessionId })
      sessionIdRef.current = null
      socket.off('cloud-computer:terminal:data', handleData)
      socket.off('cloud-computer:terminal:exit', handleExit)
      resizeObserver.disconnect()
      dataDisposable.dispose()
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [computer.id, restartKey, t])

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-black">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-950 px-3 py-2">
        <span className="text-xs font-bold text-zinc-300">
          {t(`cloudComputers.terminalStatus.${status}`)}
        </span>
        {error ? (
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-xs text-danger">{error}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 px-2 text-xs text-zinc-200"
              disabled={repairRuntime.isPending}
              onClick={() => repairRuntime.mutate()}
              title={t('cloudComputers.runtimeRepairHint')}
            >
              {repairRuntime.isPending ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Wrench size={13} />
              )}
              {t('cloudComputers.installOrRepair')}
            </Button>
          </span>
        ) : null}
      </div>
      <div ref={terminalHostRef} className="min-h-0 flex-1 overflow-hidden p-2" />
    </section>
  )
}

function CloudComputerVncPanel({ computer }: { computer: CloudComputerSummary }) {
  const { t } = useTranslation()
  const hostRef = useRef<HTMLDivElement | null>(null)
  const rfbRef = useRef<{ disconnect: () => void; focus?: () => void } | null>(null)
  const reconnectRef = useRef<{ attempt: number; timer: number | null }>({
    attempt: 0,
    timer: null,
  })
  const [status, setStatus] = useState<VncStatus>('connecting')
  const [error, setError] = useState<string | null>(null)
  const [runtimeHint, setRuntimeHint] = useState<string | null>(null)
  const [repairAvailable, setRepairAvailable] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const repairComponent = useMutation({
    mutationFn: () =>
      fetchApi<CloudComputerRepairResponse>(`/api/cloud-computers/${computer.id}/desktop/repair`, {
        method: 'POST',
      }),
    onSuccess: (response) => {
      setError(null)
      setRepairAvailable(Boolean(response.repairAvailable))
      setRuntimeHint(t('cloudComputers.desktopRepairHint'))
      setRetryKey((value) => value + 1)
    },
    onError: (err: Error) => {
      setStatus('error')
      setError(err.message)
    },
  })

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let disposed = false
    setStatus('connecting')
    setError(null)
    setRuntimeHint(null)
    setRepairAvailable(false)

    const scheduleReconnect = () => {
      if (disposed || reconnectRef.current.timer !== null) return
      const delay = cloudComputerReconnectDelay(reconnectRef.current.attempt)
      reconnectRef.current.attempt += 1
      setStatus('connecting')
      setError(null)
      setRuntimeHint(t('cloudComputers.desktopStarting'))
      reconnectRef.current.timer = window.setTimeout(() => {
        reconnectRef.current.timer = null
        if (!disposed) setRetryKey((value) => value + 1)
      }, delay)
    }

    const connectVnc = async () => {
      try {
        const fetchSession = () =>
          fetchApi<CloudComputerVncSession>(`/api/cloud-computers/${computer.id}/desktop/session`, {
            method: 'POST',
          })
        let session = await fetchSession()
        if (disposed) return
        setRepairAvailable(Boolean(session.repairAvailable))
        if (!session.runtimeEnsured && session.repairAvailable) {
          setRuntimeHint(t('cloudComputers.desktopStarting'))
          session = await prepareCloudComputerComponent({
            initialSession: session,
            repair: () =>
              fetchApi<CloudComputerRepairResponse>(
                `/api/cloud-computers/${computer.id}/desktop/repair`,
                { method: 'POST' },
              ),
            session: fetchSession,
            isDisposed: () => disposed,
          })
        }
        if (!session.runtimeEnsured) {
          setRuntimeHint(
            session.repairAvailable
              ? t('cloudComputers.desktopRepairHint')
              : t('cloudComputers.desktopRuntimeHint'),
          )
          throw new Error(t('cloudComputers.desktopServiceUnavailable'))
        }
        if (disposed) return
        host.replaceChildren()
        const rfb = new RFB(host, session.websocketUrl, { shared: true })
        rfb.scaleViewport = true
        rfb.resizeSession = true
        rfb.clipViewport = true
        rfb.addEventListener('connect', () => {
          reconnectRef.current.attempt = 0
          setStatus('connected')
          setError(null)
          setRuntimeHint(null)
          rfb.focus()
        })
        rfb.addEventListener('disconnect', () => {
          if (disposed) return
          scheduleReconnect()
        })
        rfb.addEventListener('securityfailure', () => {
          if (!disposed) scheduleReconnect()
        })
        rfbRef.current = rfb
      } catch (err) {
        if (disposed) return
        setStatus('error')
        if (err instanceof ApiError && err.status === 404) {
          setError(t('cloudComputers.desktopInstallRequired'))
        } else if (shouldRetryCloudComputerConnection(err)) {
          scheduleReconnect()
        } else {
          setError(err instanceof Error ? err.message : String(err))
        }
      }
    }

    void connectVnc()

    return () => {
      disposed = true
      if (reconnectRef.current.timer !== null) {
        window.clearTimeout(reconnectRef.current.timer)
        reconnectRef.current.timer = null
      }
      rfbRef.current?.disconnect()
      rfbRef.current = null
      host.replaceChildren()
    }
  }, [computer.id, retryKey, t])

  const statusLabel = t(`cloudComputers.desktopStatus.${status}`)
  const connectionFailed = t('cloudComputers.desktopConnectionFailed')

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-black">
      <div
        ref={hostRef}
        className="min-h-0 flex-1 overflow-hidden bg-black [&_canvas]:h-full [&_canvas]:w-full"
      />
      {status === 'error' || runtimeHint ? (
        <div
          className={cn(
            'flex shrink-0 items-center justify-between gap-3 border-t border-zinc-800 bg-zinc-950 px-3 py-2 text-xs',
            status === 'error' ? 'text-danger' : 'text-zinc-400',
          )}
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            <span className="truncate">
              {status === 'error' ? (error ?? connectionFailed) : runtimeHint}
            </span>
          </span>
          {repairAvailable ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 px-2 text-xs"
              disabled={repairComponent.isPending}
              onClick={() => repairComponent.mutate()}
              title={statusLabel}
            >
              {repairComponent.isPending ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Wrench size={13} />
              )}
              {t('cloudComputers.installOrRepair')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function cdpPageState(result: Record<string, unknown>): CloudComputerBrowserPage | null {
  const remote = result.result
  if (!remote || typeof remote !== 'object' || Array.isArray(remote)) return null
  const value = (remote as Record<string, unknown>).value
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const page = value as Record<string, unknown>
  if (typeof page.url !== 'string' || typeof page.title !== 'string') return null
  return { url: page.url, title: page.title }
}

function browserPointerButton(button: number) {
  if (button === 1) return 'middle'
  if (button === 2) return 'right'
  return 'left'
}

function browserKeyModifiers(event: KeyboardEvent<HTMLDivElement>) {
  return (
    (event.altKey ? 1 : 0) |
    (event.ctrlKey ? 2 : 0) |
    (event.metaKey ? 4 : 0) |
    (event.shiftKey ? 8 : 0)
  )
}

function CloudComputerBrowserPanel({ computer }: { computer: CloudComputerSummary }) {
  const { t } = useTranslation()
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const clientRef = useRef<CloudBrowserCdpClient | null>(null)
  const lastFrameAtRef = useRef(0)
  const lastPointerMoveAtRef = useRef(0)
  const reconnectRef = useRef<{ attempt: number; timer: number | null }>({
    attempt: 0,
    timer: null,
  })
  const [status, setStatus] = useState<BrowserStatus>('connecting')
  const [image, setImage] = useState<string | null>(null)
  const [page, setPage] = useState<CloudComputerBrowserPage | null>(null)
  const [address, setAddress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [runtimeHint, setRuntimeHint] = useState<string | null>(null)
  const [repairAvailable, setRepairAvailable] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const [actionPending, setActionPending] = useState(false)

  const repairComponent = useMutation({
    mutationFn: () =>
      fetchApi<CloudComputerRepairResponse>(`/api/cloud-computers/${computer.id}/browser/repair`, {
        method: 'POST',
      }),
    onSuccess: (response) => {
      setError(null)
      setRepairAvailable(Boolean(response.repairAvailable))
      setRuntimeHint(t('cloudComputers.browserRepairHint'))
      setRetryKey((value) => value + 1)
    },
    onError: () => {
      setStatus('error')
      setError(t('cloudComputers.browserConnectionFailed'))
    },
  })

  useEffect(() => {
    let disposed = false
    let unsubscribe: (() => void) | null = null
    setStatus('connecting')
    setImage(null)
    setPage(null)
    setError(null)
    setRuntimeHint(null)
    setRepairAvailable(false)

    const scheduleReconnect = () => {
      if (disposed || reconnectRef.current.timer !== null) return
      const delay = cloudComputerReconnectDelay(reconnectRef.current.attempt)
      reconnectRef.current.attempt += 1
      setStatus('connecting')
      setError(null)
      setRuntimeHint(t('cloudComputers.browserStarting'))
      reconnectRef.current.timer = window.setTimeout(() => {
        reconnectRef.current.timer = null
        if (!disposed) setRetryKey((value) => value + 1)
      }, delay)
    }

    const refreshPageState = async (client: CloudBrowserCdpClient) => {
      const result = await client.command('Runtime.evaluate', {
        expression: '({ title: document.title || "", url: location.href || "" })',
        returnByValue: true,
      })
      if (disposed) return
      const nextPage = cdpPageState(result)
      if (!nextPage) return
      setPage(nextPage)
      setAddress(nextPage.url)
    }

    const startBrowser = async () => {
      try {
        const fetchSession = () =>
          fetchApi<CloudComputerBrowserSession>(
            `/api/cloud-computers/${computer.id}/browser/session`,
            { method: 'POST' },
          )
        let session = await fetchSession()
        if (disposed) return
        setRepairAvailable(Boolean(session.repairAvailable))
        if (!session.runtimeEnsured && session.repairAvailable) {
          setRuntimeHint(t('cloudComputers.browserStarting'))
          session = await prepareCloudComputerComponent({
            initialSession: session,
            repair: () =>
              fetchApi<CloudComputerRepairResponse>(
                `/api/cloud-computers/${computer.id}/browser/repair`,
                { method: 'POST' },
              ),
            session: fetchSession,
            isDisposed: () => disposed,
          })
        }
        if (!session.runtimeEnsured) {
          setRuntimeHint(
            session.repairAvailable
              ? t('cloudComputers.browserRepairHint')
              : t('cloudComputers.browserRuntimeHint'),
          )
          throw new Error(t('cloudComputers.browserConnectionFailed'))
        }
        const client = await CloudBrowserCdpClient.connect(session.websocketUrl)
        if (disposed) {
          client.close()
          return
        }
        clientRef.current = client
        unsubscribe = client.onEvent((browserEvent) => {
          if (disposed) return
          if (browserEvent.method === 'Shadow.connectionClosed') {
            scheduleReconnect()
            return
          }
          if (browserEvent.method === 'Page.screencastFrame') {
            const data = browserEvent.params.data
            const sessionId = browserEvent.params.sessionId
            if (typeof sessionId === 'number') {
              void client.command('Page.screencastFrameAck', { sessionId }).catch(() => undefined)
            }
            if (typeof data !== 'string') return
            const now = Date.now()
            if (now - lastFrameAtRef.current < 65) return
            lastFrameAtRef.current = now
            setImage(`data:image/jpeg;base64,${data}`)
            setStatus('connected')
            setError(null)
            setRuntimeHint(null)
            return
          }
          if (
            browserEvent.method === 'Page.loadEventFired' ||
            browserEvent.method === 'Page.frameNavigated'
          ) {
            void refreshPageState(client).catch(() => undefined)
          }
        })
        await client.command('Page.enable')
        await client.command('Runtime.enable')
        await client.command('Page.bringToFront')
        await client.command('Page.startScreencast', {
          format: 'jpeg',
          quality: 75,
          maxWidth: 1440,
          maxHeight: 900,
          everyNthFrame: 1,
        })
        await refreshPageState(client)
        if (!disposed) {
          reconnectRef.current.attempt = 0
          setStatus('connected')
        }
      } catch (err) {
        if (disposed) return
        setStatus('error')
        if (err instanceof ApiError && err.status === 404) {
          setError(t('cloudComputers.browserInstallRequired'))
        } else if (shouldRetryCloudComputerConnection(err)) {
          scheduleReconnect()
        } else {
          setError(t('cloudComputers.browserConnectionFailed'))
        }
      }
    }

    void startBrowser()
    return () => {
      disposed = true
      if (reconnectRef.current.timer !== null) {
        window.clearTimeout(reconnectRef.current.timer)
        reconnectRef.current.timer = null
      }
      unsubscribe?.()
      const client = clientRef.current
      clientRef.current = null
      if (client) {
        void client.command('Page.stopScreencast').catch(() => undefined)
        client.close()
      }
    }
  }, [computer.id, retryKey, t])

  const sendInput = (method: string, params: Record<string, unknown>) => {
    const client = clientRef.current
    if (!client) return
    void client.command(method, params).catch(() => {
      setStatus('error')
      setError(t('cloudComputers.browserConnectionFailed'))
    })
  }

  const runBrowserCommand = async (method: string, params: Record<string, unknown> = {}) => {
    const client = clientRef.current
    if (!client) {
      setRetryKey((value) => value + 1)
      return
    }
    setActionPending(true)
    try {
      await client.command(method, params)
      setError(null)
    } catch {
      setStatus('error')
      setError(t('cloudComputers.browserConnectionFailed'))
    } finally {
      setActionPending(false)
    }
  }

  const navigate = () => {
    const nextUrl = address.trim()
    if (!nextUrl || actionPending) return
    const url = /^(https?:|about:|data:)/i.test(nextUrl) ? nextUrl : `https://${nextUrl}`
    void runBrowserCommand('Page.navigate', { url })
  }

  const browserPoint = (event: PointerEvent<HTMLImageElement> | WheelEvent<HTMLImageElement>) => {
    const imageElement = event.currentTarget
    const rect = imageElement.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * imageElement.naturalWidth,
      y: ((event.clientY - rect.top) / rect.height) * imageElement.naturalHeight,
    }
  }

  const handlePointerDown = (event: PointerEvent<HTMLImageElement>) => {
    event.preventDefault()
    surfaceRef.current?.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
    sendInput('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      ...browserPoint(event),
      button: browserPointerButton(event.button),
      buttons: event.buttons,
      clickCount: 1,
    })
  }

  const handlePointerUp = (event: PointerEvent<HTMLImageElement>) => {
    event.preventDefault()
    sendInput('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      ...browserPoint(event),
      button: browserPointerButton(event.button),
      buttons: event.buttons,
      clickCount: 1,
    })
  }

  const handlePointerMove = (event: PointerEvent<HTMLImageElement>) => {
    const now = Date.now()
    if (now - lastPointerMoveAtRef.current < 32) return
    lastPointerMoveAtRef.current = now
    sendInput('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      ...browserPoint(event),
      button: 'none',
      buttons: event.buttons,
    })
  }

  const handleWheel = (event: WheelEvent<HTMLImageElement>) => {
    event.preventDefault()
    sendInput('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      ...browserPoint(event),
      deltaX: event.deltaX,
      deltaY: event.deltaY,
    })
  }

  const handleSurfaceKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) return
    event.preventDefault()
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      sendInput('Input.insertText', { text: event.key })
      return
    }
    const params = {
      key: event.key,
      code: event.code,
      modifiers: browserKeyModifiers(event),
    }
    sendInput('Input.dispatchKeyEvent', { type: 'keyDown', ...params })
    sendInput('Input.dispatchKeyEvent', { type: 'keyUp', ...params })
  }

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const text = event.clipboardData.getData('text')
    if (!text) return
    event.preventDefault()
    sendInput('Input.insertText', { text })
  }

  const statusLabel = t(`cloudComputers.browserStatus.${status}`)

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-bg-primary">
      <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle bg-bg-secondary px-3 py-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          disabled={actionPending}
          onClick={() => void runBrowserCommand('Page.reload')}
          title={t('common.refresh')}
        >
          {actionPending ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        </Button>
        <input
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') navigate()
          }}
          placeholder={t('cloudComputers.browserAddressPlaceholder')}
          className="h-9 min-w-0 flex-1 rounded-md border border-border-subtle bg-bg-base px-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-primary"
        />
        <Button size="sm" disabled={actionPending || !address.trim()} onClick={navigate}>
          <Globe2 size={14} />
          {t('cloudComputers.browserGo')}
        </Button>
      </div>
      <div
        ref={surfaceRef}
        role="application"
        aria-label={t('cloudComputers.browser')}
        className="min-h-0 flex-1 overflow-auto bg-black outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        tabIndex={0}
        onKeyDown={handleSurfaceKeyDown}
        onPaste={handlePaste}
        title={page?.title || statusLabel}
      >
        {image ? (
          <img
            src={image}
            alt={page?.title || t('cloudComputers.browser')}
            className="mx-auto block max-w-full cursor-default select-none touch-none"
            draggable={false}
            onContextMenu={(event) => event.preventDefault()}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onWheel={handleWheel}
          />
        ) : (
          <LoadingDesktop />
        )}
      </div>
      {status === 'error' || runtimeHint ? (
        <div
          className={cn(
            'flex shrink-0 items-center justify-between gap-3 border-t border-border-subtle bg-bg-secondary px-3 py-2 text-xs',
            status === 'error' ? 'text-danger' : 'text-text-muted',
          )}
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            <span className="truncate">
              {status === 'error'
                ? (error ?? t('cloudComputers.browserConnectionFailed'))
                : runtimeHint}
            </span>
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 px-2 text-xs"
            disabled={repairComponent.isPending}
            onClick={() => {
              if (repairAvailable) repairComponent.mutate()
              else setRetryKey((value) => value + 1)
            }}
            title={statusLabel}
          >
            {repairComponent.isPending ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Wrench size={13} />
            )}
            {repairAvailable ? t('cloudComputers.installOrRepair') : t('common.retry')}
          </Button>
        </div>
      ) : null}
    </section>
  )
}

function buddyDisplayName(agent: CloudComputerBuddy) {
  return agent.name || agent.botUser?.displayName || agent.botUser?.username || agent.id
}

function CloudComputerBuddiesApp({
  computer,
  spaceId,
  onOpenSettings,
}: {
  computer: CloudComputerSummary
  spaceId?: string
  onOpenSettings: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [showCreateBuddy, setShowCreateBuddy] = useState(false)
  const [buddyName, setBuddyName] = useState('')
  const [buddyDescription, setBuddyDescription] = useState('')
  const [buddyAvatarUrl, setBuddyAvatarUrl] = useState('')
  const [runtimeId, setRuntimeId] = useState('openclaw')
  const [openingBuddyId, setOpeningBuddyId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{
    kind: 'success' | 'error'
    text: string
  } | null>(null)
  const runtimeReady = computer.capabilities?.buddies ?? computer.status === 'deployed'
  const buddiesQuery = useQuery({
    queryKey: ['cloud-computer-buddies', computer.id],
    queryFn: () =>
      fetchApi<CloudComputerBuddiesResponse>(
        `/api/cloud-computers/${encodeURIComponent(computer.id)}/buddies`,
      ),
  })
  const runtimesQuery = useQuery({
    queryKey: ['cloud-computer-runtimes', computer.id],
    queryFn: () =>
      fetchApi<{ runtimes: CloudComputerRuntimeCatalogEntry[] }>(
        `/api/cloud-computers/${encodeURIComponent(computer.id)}/runtimes`,
      ),
  })
  useEffect(() => {
    if (computer.status !== 'deployed') return
    void queryClient.invalidateQueries({
      queryKey: ['cloud-computer-buddies', computer.id],
    })
  }, [computer.id, computer.status, queryClient])
  const toggleBuddy = useMutation({
    mutationFn: (agent: CloudComputerBuddy) =>
      fetchApi<{ ok: true; buddy: CloudComputerBuddy | null }>(
        `/api/cloud-computers/${encodeURIComponent(computer.id)}/buddies/${encodeURIComponent(
          agent.id,
        )}/${agent.status === 'running' ? 'stop' : 'start'}`,
        {
          method: 'POST',
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cloud-computer-buddies', computer.id] })
    },
  })
  const removeBuddy = useMutation({
    mutationFn: (agent: CloudComputerBuddy) =>
      fetchApi<{ ok: true; cloudComputerId: string; buddy: CloudComputerBuddy }>(
        `/api/cloud-computers/${encodeURIComponent(computer.id)}/buddies/${encodeURIComponent(
          agent.id,
        )}`,
        { method: 'DELETE' },
      ),
    onSuccess: (result) => {
      setFeedback({ kind: 'success', text: t('cloudComputers.buddyRemoveQueued') })
      queryClient.setQueryData<CloudComputerBuddiesResponse>(
        ['cloud-computer-buddies', computer.id],
        (current) => ({
          ok: true,
          cloudComputerId: result.cloudComputerId,
          buddies: (current?.buddies ?? []).map((buddy) =>
            buddy.id === result.buddy.id ? { ...buddy, status: 'removing' } : buddy,
          ),
        }),
      )
      queryClient.invalidateQueries({ queryKey: ['cloud-computers'] })
    },
    onError: (error: Error) => {
      setFeedback({
        kind: 'error',
        text: error.message || t('cloudComputers.buddyRemoveFailed'),
      })
    },
  })
  const resolveCurrentServer = async () => {
    const osSpaceSlug = currentOsSpaceSlug()
    if (!osSpaceSlug) throw new Error(t('cloudComputers.cover.noBuddy'))
    return spaceId
      ? { id: spaceId, slug: osSpaceSlug }
      : fetchApi<{ id: string; slug?: string | null }>(
          `/api/servers/${encodeURIComponent(osSpaceSlug)}`,
        )
  }
  const openBuddyConversation = async (buddy: CloudComputerBuddy) => {
    if (!buddy.botUser?.id || openingBuddyId) return
    setOpeningBuddyId(buddy.id)
    try {
      const channel = await fetchApi<{ id: string }>('/api/channels/dm', {
        method: 'POST',
        body: JSON.stringify({ userId: buddy.botUser.id }),
      })
      const server = await resolveCurrentServer()
      openOsDirectMessage({
        serverId: server.id,
        serverSlug: server.slug ?? currentOsSpaceSlug() ?? '',
        channelId: channel.id,
        buddy,
      })
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('cloudComputers.cover.noBuddy'), 'error')
    } finally {
      setOpeningBuddyId(null)
    }
  }
  const openBuddyConfiguration = async (buddy: CloudComputerBuddy) => {
    if (!buddy.agentId) {
      showToast(t('cloudComputers.buddyPreparing'), 'info')
      return
    }
    try {
      const server = await resolveCurrentServer()
      openOsBuddySettings({
        serverId: server.id,
        serverSlug: server.slug ?? currentOsSpaceSlug() ?? '',
        agentId: buddy.agentId,
      })
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('common.error'), 'error')
    }
  }
  const createBuddy = useMutation({
    mutationFn: () =>
      fetchApi<CloudComputerCreateBuddyResponse>(
        `/api/cloud-computers/${encodeURIComponent(computer.id)}/buddies`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: buddyName.trim(),
            ...(buddyDescription.trim() ? { description: buddyDescription.trim() } : {}),
            ...(buddyAvatarUrl ? { avatarUrl: buddyAvatarUrl } : {}),
            runtimeId,
            ...(spaceId ? { serverId: spaceId } : {}),
          }),
        },
      ),
    onMutate: () => setFeedback(null),
    onSuccess: (result) => {
      setFeedback({ kind: 'success', text: t('cloudComputers.buddyCreateQueued') })
      setShowCreateBuddy(false)
      setBuddyName('')
      setBuddyDescription('')
      setBuddyAvatarUrl('')
      setRuntimeId('openclaw')
      queryClient.setQueryData<CloudComputerBuddiesResponse>(
        ['cloud-computer-buddies', computer.id],
        (current) => ({
          ok: true,
          cloudComputerId: result.cloudComputerId,
          buddies: [
            result.buddy,
            ...(current?.buddies ?? []).filter((buddy) => buddy.id !== result.buddy.id),
          ],
        }),
      )
      queryClient.invalidateQueries({ queryKey: ['cloud-computers'] })
    },
    onError: (error: Error) => {
      if (
        error instanceof ApiError &&
        error.code === 'cloud_computer_runtime_requires_configuration'
      ) {
        setFeedback(null)
        return
      }
      const serviceRestarting =
        error instanceof ApiError && (error.code === 'DEV_API_UNAVAILABLE' || error.status === 503)
      setFeedback({
        kind: 'error',
        text: serviceRestarting
          ? t('cloudComputers.buddyServiceRestarting')
          : error.message || t('cloudComputers.buddyCreateFailed'),
      })
    },
  })
  const buddies = buddiesQuery.data?.buddies ?? []
  const selectedRuntime = (runtimesQuery.data?.runtimes ?? []).find(
    (runtime) => runtime.id === runtimeId,
  )
  const requiredResourceTier = selectedRuntime?.minimumResourceTier
  const currentResourceTier = computer.configuration?.resourceTier ?? 'lightweight'
  const runtimeNeedsConfiguration = Boolean(
    requiredResourceTier &&
      cloudComputerResourceTierRank(currentResourceTier) <
        cloudComputerResourceTierRank(requiredResourceTier),
  )
  const runtimeConfigurationMessage = requiredResourceTier
    ? t('cloudComputers.buddyRuntimeNeedsConfiguration', {
        runtime: selectedRuntime?.label ?? runtimeId,
        tier: t(`cloudComputers.configuration.tiers.${requiredResourceTier}`),
      })
    : ''
  const canCreateBuddy =
    runtimeReady &&
    buddyName.trim().length > 0 &&
    !runtimeNeedsConfiguration &&
    !createBuddy.isPending

  return (
    <section className="flex h-full min-h-0 flex-col overflow-auto bg-bg-primary p-4">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-text-primary">
                {t('cloudComputers.buddyAccounts')}
              </h3>
              <p className="mt-1 text-xs text-text-muted">
                {t('cloudComputers.buddyAccountsDesc')}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="shrink-0"
              disabled={!runtimeReady}
              onClick={() => {
                setFeedback(null)
                setShowCreateBuddy((value) => !value)
              }}
            >
              <Plus size={14} />
              {t('cloudComputers.addBuddy')}
            </Button>
          </div>
          {showCreateBuddy ? (
            <form
              className="mb-3 rounded-lg border border-border-subtle bg-bg-secondary p-3"
              onSubmit={(event) => {
                event.preventDefault()
                if (canCreateBuddy) createBuddy.mutate()
              }}
            >
              <div className="mb-4 grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
                <AvatarEditor
                  value={buddyAvatarUrl}
                  userId={`${computer.id}:new-buddy`}
                  onChange={setBuddyAvatarUrl}
                />
                <div className="min-w-0 space-y-3">
                  <label
                    className="block text-xs font-semibold text-text-muted"
                    htmlFor={`cloud-computer-buddy-name-${computer.id}`}
                  >
                    {t('cloudComputers.buddyName')}
                  </label>
                  <Input
                    id={`cloud-computer-buddy-name-${computer.id}`}
                    value={buddyName}
                    onChange={(event) => setBuddyName(event.target.value)}
                    placeholder={t('cloudComputers.buddyNamePlaceholder')}
                    maxLength={80}
                    autoFocus
                  />
                  <label
                    className="block text-xs font-semibold text-text-muted"
                    htmlFor={`cloud-computer-buddy-description-${computer.id}`}
                  >
                    {t('cloudComputers.buddyDescription')}
                  </label>
                  <textarea
                    id={`cloud-computer-buddy-description-${computer.id}`}
                    value={buddyDescription}
                    onChange={(event) => setBuddyDescription(event.target.value)}
                    placeholder={t('cloudComputers.buddyDescriptionPlaceholder')}
                    className="min-h-20 w-full resize-y rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-primary"
                    maxLength={500}
                  />
                </div>
              </div>
              <fieldset className="mb-4 min-w-0">
                <legend className="mb-2 text-xs font-semibold text-text-muted">
                  {t('cloudComputers.buddyRuntime')}
                </legend>
                <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-5">
                  {(runtimesQuery.data?.runtimes ?? []).map((runtime) => (
                    <button
                      key={runtime.id}
                      type="button"
                      aria-pressed={runtimeId === runtime.id}
                      onClick={() => {
                        setRuntimeId(runtime.id)
                        setFeedback(null)
                      }}
                      className={cn(
                        'min-w-0 rounded-lg border px-2 py-2 text-xs font-bold transition-colors',
                        runtimeId === runtime.id
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border-subtle bg-bg-base text-text-secondary hover:border-primary/40 hover:text-text-primary',
                      )}
                    >
                      <span className="flex min-w-0 items-center justify-center gap-2">
                        <RuntimeIcon
                          runtimeId={runtime.id}
                          iconId={runtime.iconId}
                          label={runtime.label}
                          className="h-5 w-5 shrink-0"
                        />
                        <span className="truncate">{runtime.label}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>
              {runtimeNeedsConfiguration ? (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/25 bg-warning/8 px-3 py-3 text-left">
                  <div className="flex min-w-0 items-start gap-2">
                    <AlertCircle className="mt-0.5 shrink-0 text-warning" size={16} />
                    <p className="text-xs leading-5 text-text-secondary">
                      {runtimeConfigurationMessage}
                    </p>
                  </div>
                  <Button type="button" variant="secondary" size="sm" onClick={onOpenSettings}>
                    <Settings size={14} />
                    {t('cloudComputers.buddyRuntimeOpenConfiguration')}
                  </Button>
                </div>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowCreateBuddy(false)
                    setBuddyName('')
                    setBuddyDescription('')
                    setBuddyAvatarUrl('')
                    setRuntimeId('openclaw')
                    setFeedback(null)
                  }}
                >
                  {t('cloudComputers.cancelCreateBuddy')}
                </Button>
                <Button type="submit" size="sm" disabled={!canCreateBuddy}>
                  {createBuddy.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                  {createBuddy.isPending
                    ? t('cloudComputers.creatingBuddy')
                    : t('cloudComputers.createBuddy')}
                </Button>
              </div>
            </form>
          ) : null}
          {feedback && !runtimeNeedsConfiguration ? (
            <p
              className={cn(
                'mb-3 rounded-lg border px-3 py-2 text-sm',
                feedback.kind === 'error'
                  ? 'border-danger/20 bg-danger/7 text-danger'
                  : 'border-emerald-500/20 bg-emerald-500/7 text-emerald-500',
              )}
              aria-live="polite"
            >
              {feedback.text}
            </p>
          ) : null}
          {buddiesQuery.error ? (
            <div className="rounded-lg border border-danger/20 bg-danger/7 p-4 text-sm text-text-muted">
              <p className="font-bold text-danger">{t('cloudComputers.buddiesUnavailable')}</p>
              <p className="mt-1 text-xs">{(buddiesQuery.error as Error).message}</p>
              <Button className="mt-3" size="sm" onClick={() => buddiesQuery.refetch()}>
                {t('common.retry')}
              </Button>
            </div>
          ) : buddiesQuery.isLoading ? (
            <div className="rounded-lg border border-border-subtle bg-bg-secondary p-4">
              <LoadingDesktop />
            </div>
          ) : buddies.length === 0 ? (
            <div className="rounded-lg border border-border-subtle bg-bg-secondary p-4 text-sm text-text-muted">
              {t('cloudComputers.noBuddyAccounts')}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {buddies.map((agent) => {
                const isRunning = agent.status === 'running'
                const runtime = (runtimesQuery.data?.runtimes ?? []).find(
                  (candidate) => candidate.id === agent.kernelType,
                )
                return (
                  <ComputerBuddyRow
                    key={agent.id}
                    id={agent.botUser?.id ?? agent.id}
                    name={buddyDisplayName(agent)}
                    description={agent.description}
                    avatarUrl={agent.botUser?.avatarUrl ?? agent.avatarUrl}
                    online={isRunning}
                    runtimeId={agent.kernelType || 'unknown'}
                    runtimeLabel={
                      runtime?.label || agent.kernelType || t('cloudComputers.agentRuntimeUnknown')
                    }
                    runtimeIconId={runtime?.iconId}
                    opening={openingBuddyId === agent.id}
                    chatDisabled={!agent.botUser?.id || agent.status === 'removing'}
                    chatLabel={t('cloudComputers.cover.openBuddyChat', {
                      name: buddyDisplayName(agent),
                    })}
                    configureLabel={t('dm.configureBuddy')}
                    onOpenChat={() => void openBuddyConversation(agent)}
                    onConfigure={
                      agent.agentId ? () => void openBuddyConfiguration(agent) : undefined
                    }
                    actions={
                      agent.status === 'removing' ? (
                        <span className="flex items-center gap-1.5 px-2 text-xs font-semibold text-text-muted">
                          <Loader2 size={14} className="animate-spin" />
                          {t('cloudComputers.removingBuddy')}
                        </span>
                      ) : (
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={
                              !runtimeReady || toggleBuddy.isPending || removeBuddy.isPending
                            }
                            onClick={() => toggleBuddy.mutate(agent)}
                          >
                            {isRunning ? <Square size={14} /> : <Play size={14} />}
                            {isRunning
                              ? t('cloudComputers.stopBuddy')
                              : t('cloudComputers.startBuddy')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={t('cloudComputers.removeBuddy', {
                              name: buddyDisplayName(agent),
                            })}
                            disabled={toggleBuddy.isPending || removeBuddy.isPending}
                            onClick={async () => {
                              const confirmed = await useConfirmStore.getState().confirm({
                                title: t('cloudComputers.removeBuddyTitle'),
                                message: t('cloudComputers.removeBuddyConfirm', {
                                  name: buddyDisplayName(agent),
                                }),
                                confirmLabel: t('cloudComputers.removeBuddyAction'),
                                danger: true,
                              })
                              if (confirmed) removeBuddy.mutate(agent)
                            }}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      )
                    }
                  />
                )
              })}
            </div>
          )}
        </section>
      </div>
    </section>
  )
}

function CloudComputerBackupsApp({ computer }: { computer: CloudComputerSummary }) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [message, setMessage] = useState<string | null>(null)

  const backupsQuery = useQuery({
    queryKey: ['cloud-computer-backups', computer.id],
    queryFn: () =>
      fetchApi<CloudComputerBackupsResponse>(
        `/api/cloud-computers/${encodeURIComponent(computer.id)}/backups`,
      ),
  })

  const createBackup = useMutation({
    mutationFn: () =>
      fetchApi<{ ok: true }>(`/api/cloud-computers/${encodeURIComponent(computer.id)}/backups`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      setMessage(t('cloudComputers.backupQueued'))
      queryClient.invalidateQueries({ queryKey: ['cloud-computer-backups', computer.id] })
    },
    onError: (error: Error) => setMessage(error.message),
  })

  const restoreBackup = useMutation({
    mutationFn: (backupId: string) =>
      fetchApi<{ ok: true }>(`/api/cloud-computers/${encodeURIComponent(computer.id)}/restore`, {
        method: 'POST',
        body: JSON.stringify({ backupId }),
      }),
    onSuccess: () => {
      setMessage(t('cloudComputers.restoreQueued'))
      queryClient.invalidateQueries({ queryKey: ['cloud-computer-backups', computer.id] })
    },
    onError: (error: Error) => setMessage(error.message),
  })

  const backups = backupsQuery.data?.backups ?? []
  const canCreateBackup = computer.status === 'deployed' || computer.status === 'paused'
  const unavailableMessage = t('cloudComputers.backupUnavailable')

  return (
    <section className="flex h-full min-h-0 flex-col bg-bg-primary p-4">
      <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
        <p className="text-sm text-text-muted">{t('cloudComputers.backupsDesc')}</p>
        <Button
          variant="primary"
          size="sm"
          disabled={!canCreateBackup || createBackup.isPending}
          onClick={() => createBackup.mutate()}
          title={!canCreateBackup ? unavailableMessage : undefined}
        >
          {createBackup.isPending ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Archive size={15} />
          )}
          {t('cloudComputers.createBackup')}
        </Button>
      </div>
      {!canCreateBackup ? (
        <div className="mb-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-text-secondary">
          {unavailableMessage}
        </div>
      ) : null}
      {message ? (
        <div className="mb-3 rounded-lg border border-border-subtle bg-bg-secondary px-3 py-2 text-sm text-text-secondary">
          {message}
        </div>
      ) : null}
      {backupsQuery.error ? (
        <div className="grid h-full place-items-center text-center">
          <div className="max-w-sm rounded-xl border border-danger/20 bg-danger/7 p-4">
            <AlertCircle size={24} className="mx-auto text-danger" />
            <p className="mt-2 text-sm font-bold text-text-primary">
              {t('cloudComputers.backupsUnavailable')}
            </p>
            <p className="mt-1 text-xs text-text-muted">{(backupsQuery.error as Error).message}</p>
            <Button className="mt-3" size="sm" onClick={() => backupsQuery.refetch()}>
              {t('common.retry')}
            </Button>
          </div>
        </div>
      ) : backupsQuery.isLoading ? (
        <LoadingDesktop />
      ) : backups.length === 0 ? (
        <div className="grid h-full place-items-center text-center">
          <div className="max-w-sm">
            <Archive size={34} className="mx-auto text-text-muted" />
            <h3 className="mt-3 text-base font-bold text-text-primary">
              {t('cloudComputers.noBackupsTitle')}
            </h3>
            <p className="mt-2 text-sm text-text-muted">{t('cloudComputers.noBackupsDesc')}</p>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
            {backups.map((backup) => (
              <div
                key={backup.id}
                className="flex items-center gap-3 rounded-lg border border-border-subtle bg-bg-secondary p-3"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-info/12 text-info">
                  <Archive size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-bold text-text-primary">
                      {backup.agentId ?? t('cloudComputers.sharedWorkspace')}
                    </span>
                    <span className="text-xs text-text-muted">{backup.status}</span>
                  </div>
                  <p className="truncate text-xs text-text-muted">
                    {formatTimestamp(
                      backup.completedAt ?? backup.updatedAt ?? backup.createdAt,
                      i18n.language,
                    )}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={backup.status !== 'succeeded' || restoreBackup.isPending}
                  onClick={async () => {
                    const confirmed = await useConfirmStore.getState().confirm({
                      title: t('cloudComputers.restoreConfirmTitle'),
                      message: t('cloudComputers.restoreConfirmMessage'),
                      confirmLabel: t('cloudComputers.restoreBackup'),
                      danger: true,
                    })
                    if (confirmed) restoreBackup.mutate(backup.id)
                  }}
                >
                  {t('cloudComputers.restoreBackup')}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function CloudComputerSettingsApp({
  computer,
  onLeaveComputer,
}: {
  computer: CloudComputerSummary
  onLeaveComputer: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [name, setName] = useState(computer.name)
  const [resourceTier, setResourceTier] = useState<CloudComputerResourceProfile['id']>(
    computer.configuration?.resourceTier ?? 'lightweight',
  )
  const [configurationQuote, setConfigurationQuote] =
    useState<CloudComputerConfigurationQuote | null>(null)
  const [lifecycleMessage, setLifecycleMessage] = useState<string | null>(null)
  const updateSettings = useMutation({
    mutationFn: () =>
      fetchApi<CloudComputerSummary>(`/api/cloud-computers/${computer.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim() }),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData<CloudComputerSummary[]>(['cloud-computers'], (current) =>
        (current ?? []).map((item) => (item.id === updated.id ? updated : item)),
      )
      queryClient.invalidateQueries({ queryKey: ['cloud-computers'] })
    },
  })
  const resourceProfiles = useQuery({
    queryKey: ['cloud-computer-resource-profiles'],
    queryFn: () =>
      fetchApi<{ ok: true; profiles: CloudComputerResourceProfile[] }>(
        '/api/cloud-computers/resource-profiles',
      ),
  })
  const quoteConfiguration = useMutation({
    mutationFn: (tier: CloudComputerResourceProfile['id']) =>
      fetchApi<CloudComputerConfigurationQuote>(
        `/api/cloud-computers/${encodeURIComponent(computer.id)}/configuration/quote`,
        { method: 'POST', body: JSON.stringify({ resourceTier: tier }) },
      ),
    onSuccess: setConfigurationQuote,
  })
  const applyConfiguration = useMutation({
    mutationFn: (quoteToken: string) =>
      fetchApi<{ ok: true; cloudComputer: CloudComputerSummary }>(
        `/api/cloud-computers/${encodeURIComponent(computer.id)}/configuration`,
        { method: 'PATCH', body: JSON.stringify({ quoteToken }) },
      ),
    onSuccess: ({ cloudComputer }) => {
      setConfigurationQuote(null)
      queryClient.setQueryData<CloudComputerSummary[]>(['cloud-computers'], (current) =>
        (current ?? []).map((item) => (item.id === cloudComputer.id ? cloudComputer : item)),
      )
      queryClient.invalidateQueries({ queryKey: ['cloud-computers'] })
    },
  })
  const lifecycleAction = useMutation({
    mutationFn: (action: CloudComputerLifecycleAction) =>
      fetchApi<CloudComputerLifecycleResponse>(
        `/api/cloud-computers/${encodeURIComponent(computer.id)}${
          action === 'delete' ? '' : action === 'repair' ? '/runtime/repair' : `/${action}`
        }`,
        { method: action === 'delete' ? 'DELETE' : 'POST' },
      ),
    onSuccess: (response, action) => {
      if (response.status) {
        queryClient.setQueryData<CloudComputerSummary[]>(['cloud-computers'], (current) =>
          (current ?? []).map((item) =>
            item.id === computer.id ? { ...item, status: response.status ?? item.status } : item,
          ),
        )
      }
      setLifecycleMessage(t(`cloudComputers.lifecycle.${action}Queued`))
      queryClient.invalidateQueries({ queryKey: ['cloud-computers'] })
      queryClient.invalidateQueries({ queryKey: ['computers'] })
      if (action === 'delete') {
        queryClient.setQueryData<{ computers: ShadowComputer[] }>(['computers'], (current) =>
          current
            ? {
                ...current,
                computers: current.computers.map((item) =>
                  item.kind === 'cloud' && item.sourceId === computer.id
                    ? { ...item, status: response.status ?? 'destroying' }
                    : item,
                ),
              }
            : current,
        )
        onLeaveComputer()
      }
    },
    onError: (error: Error) => setLifecycleMessage(error.message),
  })

  useEffect(() => {
    setName(computer.name)
  }, [computer.name])

  useEffect(() => {
    setResourceTier(computer.configuration?.resourceTier ?? 'lightweight')
  }, [computer.configuration?.resourceTier])

  const trimmedName = name.trim()

  return (
    <section className="flex h-full min-h-0 flex-col overflow-auto bg-bg-primary p-4">
      <div className="mx-auto w-full max-w-xl py-4">
        <Settings size={28} className="text-text-muted" />
        <h3 className="mt-3 text-base font-bold text-text-primary">
          {t('cloudComputers.settingsTitle')}
        </h3>
        <p className="mt-2 text-sm text-text-muted">{t('cloudComputers.settingsDesc')}</p>
        <label className="mt-4 block text-left text-xs font-semibold text-text-muted">
          {t('cloudComputers.computerName')}
        </label>
        <div className="mt-2 flex gap-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            aria-label={t('cloudComputers.computerName')}
            className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-primary"
          />
          <Button
            variant="primary"
            size="sm"
            disabled={!trimmedName || trimmedName === computer.name || updateSettings.isPending}
            onClick={() => updateSettings.mutate()}
          >
            {updateSettings.isPending ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Save size={15} />
            )}
            {t('common.save')}
          </Button>
        </div>
        {updateSettings.error ? (
          <p className="mt-2 text-left text-sm text-danger">{updateSettings.error.message}</p>
        ) : null}
        <div className="mt-8 border-border-subtle border-t pt-5 text-left">
          <h4 className="text-sm font-bold text-text-primary">
            {t('cloudComputers.configuration.title')}
          </h4>
          <p className="mt-1 text-xs leading-5 text-text-muted">
            {t('cloudComputers.configuration.description')}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {(resourceProfiles.data?.profiles ?? []).map((profile) => (
              <button
                key={profile.id}
                type="button"
                className={cn(
                  'rounded-xl border p-3 text-left transition-colors',
                  resourceTier === profile.id
                    ? 'border-primary bg-primary/10'
                    : 'border-border-subtle bg-bg-base hover:border-text-muted',
                )}
                onClick={() => {
                  setResourceTier(profile.id)
                  setConfigurationQuote(null)
                  quoteConfiguration.mutate(profile.id)
                }}
              >
                <span className="block text-sm font-bold text-text-primary">
                  {t(`cloudComputers.configuration.tiers.${profile.id}`)}
                </span>
                <span className="mt-1 block text-xs text-text-muted">
                  {profile.cpu} · {profile.memory} · {profile.storageGi} GiB
                </span>
                <span className="mt-2 block text-xs font-semibold text-text-primary">
                  {t('cloudComputers.configuration.fromRate', {
                    count: profile.baseHourlyCredits,
                  })}
                </span>
              </button>
            ))}
          </div>
          {configurationQuote ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-subtle bg-bg-base p-3">
              <div>
                <p className="text-sm font-semibold text-text-primary">
                  {t('cloudComputers.configuration.quoteRate', {
                    count: configurationQuote.quote.hourlyCredits,
                  })}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  {t('cloudComputers.configuration.quoteDetail', {
                    buddies: configurationQuote.quote.buddyCount,
                    storage: configurationQuote.quote.storageGi,
                  })}
                </p>
              </div>
              <Button
                size="sm"
                disabled={applyConfiguration.isPending}
                onClick={() => applyConfiguration.mutate(configurationQuote.quoteToken)}
              >
                {applyConfiguration.isPending ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : null}
                {t('cloudComputers.configuration.apply')}
              </Button>
            </div>
          ) : null}
          {quoteConfiguration.isPending ? (
            <p className="mt-3 text-xs text-text-muted">
              {t('cloudComputers.configuration.calculating')}
            </p>
          ) : null}
          {quoteConfiguration.error || applyConfiguration.error ? (
            <p className="mt-2 text-sm text-danger">
              {(quoteConfiguration.error ?? applyConfiguration.error)?.message}
            </p>
          ) : null}
        </div>
        <div className="mt-8 border-border-subtle border-t pt-5 text-left">
          <h4 className="text-sm font-bold text-text-primary">
            {t('cloudComputers.lifecycle.title')}
          </h4>
          <p className="mt-1 text-xs leading-5 text-text-muted">
            {t('cloudComputers.lifecycle.desc')}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {computer.status === 'deployed' || computer.status === 'resuming' ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={lifecycleAction.isPending}
                onClick={() => lifecycleAction.mutate('pause')}
              >
                <Pause size={14} />
                {t('cloudComputers.lifecycle.pause')}
              </Button>
            ) : null}
            <Button
              variant="danger"
              size="sm"
              disabled={lifecycleAction.isPending || computer.status === 'destroying'}
              onClick={async () => {
                const confirmed = await useConfirmStore.getState().confirm({
                  title: t('cloudComputers.lifecycle.deleteTitle'),
                  message: t('cloudComputers.lifecycle.deleteMessage', { name: computer.name }),
                  confirmLabel: t('cloudComputers.lifecycle.delete'),
                  danger: true,
                })
                if (confirmed) lifecycleAction.mutate('delete')
              }}
            >
              <Trash2 size={14} />
              {t('cloudComputers.lifecycle.delete')}
            </Button>
          </div>
          {lifecycleMessage ? (
            <p className="mt-3 text-xs text-text-muted">{lifecycleMessage}</p>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function cloudComputerApps(t: TFunction) {
  return [
    { key: 'files' as const, icon: FolderOpen, label: t('cloudComputers.files') },
    { key: 'browser' as const, icon: Globe2, label: t('cloudComputers.browser') },
    { key: 'terminal' as const, icon: Terminal, label: t('cloudComputers.terminal') },
    { key: 'desktop' as const, icon: ScreenShare, label: t('cloudComputers.desktop') },
    { key: 'buddies' as const, icon: Bot, label: t('cloudComputers.buddies') },
    { key: 'backups' as const, icon: Archive, label: t('cloudComputers.backups') },
    {
      key: 'connectors' as const,
      icon: PlugZap,
      label: t('cloudComputers.connectors.title'),
    },
    { key: 'settings' as const, icon: Settings, label: t('cloudComputers.settings') },
  ] satisfies Array<{ key: CloudComputerApp; icon: LucideIcon; label: string }>
}

function CloudComputerBreadcrumbs({
  computer,
  appLabel,
  canBack,
  onBack,
  onComputerHome,
}: {
  computer: CloudComputerSummary
  appLabel?: string
  canBack: boolean
  onBack: () => void
  onComputerHome: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-white/[0.06] bg-transparent px-3">
      {canBack ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={t('cloudComputers.title')}
          title={t('cloudComputers.title')}
          onClick={onBack}
        >
          <ChevronLeft size={18} />
        </Button>
      ) : null}
      <nav
        className="flex min-w-0 items-center gap-2 text-sm"
        aria-label={t('cloudComputers.path')}
      >
        <button
          type="button"
          className="flex min-w-0 items-center gap-2 font-semibold text-text-primary hover:text-primary"
          onClick={onComputerHome}
        >
          <StatusDot status={computer.status} />
          <span className="truncate">{computer.name}</span>
        </button>
        {appLabel ? (
          <>
            <span className="text-text-muted">/</span>
            <span className="truncate font-semibold text-text-primary">{appLabel}</span>
          </>
        ) : null}
      </nav>
    </div>
  )
}

function CloudComputerAppView({
  app,
  computer,
  spaceId,
  canBack,
  onBack,
  onComputerHome,
  onLeaveComputer,
  onOpenApp,
}: {
  app: CloudComputerApp
  computer: CloudComputerSummary
  spaceId?: string
  canBack: boolean
  onBack: () => void
  onComputerHome: () => void
  onLeaveComputer: () => void
  onOpenApp: (app: CloudComputerApp) => void
}) {
  const { t } = useTranslation()
  const filesSource = useMemo(() => createCloudComputerWorkspaceSource(computer.id), [computer.id])
  const currentApp = cloudComputerApps(t).find((item) => item.key === app)
  const appEnabled =
    app === 'settings' ||
    app === 'backups' ||
    computer.readiness?.[app]?.state === 'ready' ||
    (!computer.readiness &&
      (computer.capabilities
        ? Boolean(computer.capabilities[app as keyof typeof computer.capabilities])
        : computer.status === 'deployed'))
  const toolReason = computer.readiness?.[app]?.reason

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-transparent">
      <CloudComputerBreadcrumbs
        computer={computer}
        appLabel={currentApp?.label ?? t('cloudComputers.settings')}
        canBack={canBack}
        onBack={onBack}
        onComputerHome={onComputerHome}
      />
      <CloudComputerStateBanner computer={computer} />
      <div className="min-h-0 flex-1 overflow-hidden">
        {!appEnabled ? (
          <div className="grid h-full place-items-center p-6">
            <div className="max-w-md rounded-2xl border border-border-subtle bg-bg-secondary p-6 text-center">
              <AlertCircle className="mx-auto text-warning" size={24} />
              <h3 className="mt-3 text-base font-bold text-text-primary">
                {t('cloudComputers.cover.toolUnavailable')}
              </h3>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                {toolReason
                  ? t(`cloudComputers.readinessReason.${toolReason}`, {
                      defaultValue: t('cloudComputers.cover.toolUnavailableDesc'),
                    })
                  : t('cloudComputers.cover.toolUnavailableDesc')}
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <Button size="sm" onClick={onComputerHome}>
                  {t('cloudComputers.cover.backToCover')}
                </Button>
                {computer.readiness?.[app]?.action === 'restore-backup' ? (
                  <Button variant="secondary" size="sm" onClick={() => onOpenApp('backups')}>
                    {t('cloudComputers.restoreBackup')}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ) : app === 'files' ? (
          <WorkspacePage
            key={filesSource.id}
            source={filesSource}
            embedded
            collapsibleSidebar
            onClose={onComputerHome}
          />
        ) : app === 'browser' ? (
          <CloudComputerBrowserPanel computer={computer} />
        ) : app === 'terminal' ? (
          <CloudComputerTerminalPanel computer={computer} />
        ) : app === 'desktop' ? (
          <CloudComputerVncPanel computer={computer} />
        ) : app === 'buddies' ? (
          <CloudComputerBuddiesApp
            computer={computer}
            spaceId={spaceId}
            onOpenSettings={() => onOpenApp('settings')}
          />
        ) : app === 'backups' ? (
          <CloudComputerBackupsApp computer={computer} />
        ) : app === 'connectors' ? (
          <CloudComputerConnectorsApp computerId={computer.id} />
        ) : (
          <CloudComputerSettingsApp computer={computer} onLeaveComputer={onLeaveComputer} />
        )}
      </div>
    </section>
  )
}

function CloudComputerCover({
  computer,
  spaceId,
  onOpenApp,
}: {
  computer: CloudComputerSummary
  spaceId?: string
  onOpenApp: (app: CloudComputerApp) => void
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const openRecharge = useRechargeStore((state) => state.openModalWithContext)
  const coverRef = useRef<HTMLElement | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState(computer.name)
  const capabilities = computer.capabilities ?? {
    files: computer.status === 'deployed',
    terminal: computer.status === 'deployed',
    browser: computer.status === 'deployed',
    desktop: computer.status === 'deployed',
    buddies: computer.status === 'deployed',
    backups: ['deployed', 'paused', 'failed'].includes(computer.status),
    connectors: computer.status === 'deployed',
    workspaceMounts: computer.status === 'deployed',
  }
  const healthState =
    computer.health?.state ??
    (computer.status === 'deployed'
      ? 'ready'
      : computer.status === 'failed'
        ? 'failed'
        : computer.status === 'paused'
          ? 'paused'
          : 'preparing')
  const canLoadPublishedApps = canLoadCloudComputerApps(computer.status)
  const buddiesQuery = useQuery({
    queryKey: ['cloud-computer-buddies', computer.id],
    enabled: capabilities.buddies,
    queryFn: () =>
      fetchApi<CloudComputerBuddiesResponse>(
        `/api/cloud-computers/${encodeURIComponent(computer.id)}/buddies`,
      ),
  })
  const appsQuery = useQuery({
    queryKey: ['cloud-computer-apps', computer.id],
    enabled: canLoadPublishedApps,
    queryFn: () =>
      fetchApi<{ ok: true; apps: CloudComputerAppResult[] }>(
        `/api/cloud-computers/${encodeURIComponent(computer.id)}/apps`,
      ),
  })
  const walletQuery = useQuery({
    queryKey: ['wallet'],
    enabled: Boolean(computer.cost?.hourlyCredits && computer.cost.hourlyCredits > 0),
    queryFn: () => fetchApi<{ balance: number }>('/api/wallet'),
  })
  const updateShellColor = useMutation({
    mutationFn: (shellColor: CloudComputerShellColor) =>
      fetchApi<CloudComputerSummary>(`/api/cloud-computers/${encodeURIComponent(computer.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ shellColor }),
      }),
    onMutate: (shellColor) => {
      queryClient.setQueryData<CloudComputerSummary[]>(['cloud-computers'], (current) =>
        (current ?? []).map((candidate) =>
          candidate.id === computer.id ? { ...candidate, appearance: { shellColor } } : candidate,
        ),
      )
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<CloudComputerSummary[]>(['cloud-computers'], (current) =>
        (current ?? []).map((candidate) => (candidate.id === updated.id ? updated : candidate)),
      )
    },
    onError: (error: Error) => {
      setMessage(error.message)
      queryClient.invalidateQueries({ queryKey: ['cloud-computers'] })
    },
  })
  const updateName = useMutation({
    mutationFn: () =>
      fetchApi<CloudComputerSummary>(`/api/cloud-computers/${encodeURIComponent(computer.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim() }),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData<CloudComputerSummary[]>(['cloud-computers'], (current) =>
        (current ?? []).map((candidate) => (candidate.id === updated.id ? updated : candidate)),
      )
      setEditingName(false)
      setMessage(null)
    },
    onError: (error: Error) => setMessage(error.message),
  })
  const openBuddyChat = useMutation({
    mutationFn: async (buddy: CloudComputerBuddy) => {
      if (!buddy.botUser?.id) throw new Error(t('cloudComputers.cover.noBuddy'))
      const channel = await fetchApi<{ id: string }>('/api/channels/dm', {
        method: 'POST',
        body: JSON.stringify({ userId: buddy.botUser.id }),
      })
      const osSpaceSlug = currentOsSpaceSlug()
      if (!osSpaceSlug) throw new Error(t('cloudComputers.cover.noBuddy'))
      const server = spaceId
        ? { id: spaceId, slug: osSpaceSlug }
        : await fetchApi<{ id: string; slug?: string | null }>(
            `/api/servers/${encodeURIComponent(osSpaceSlug)}`,
          )
      openOsDirectMessage({
        serverId: server.id,
        serverSlug: server.slug ?? osSpaceSlug,
        channelId: channel.id,
        buddy,
      })
    },
    onError: (error: Error) => setMessage(error.message),
  })
  const buddies = buddiesQuery.data?.buddies ?? []
  const apps = appsQuery.data?.apps ?? []
  const displayError = cloudComputerDisplayError(t, computer)
  const isDeleting = computer.operation?.kind === 'delete'
  const shellColor = computer.appearance?.shellColor ?? 'aqua'
  const hourlyCost = computer.cost?.hourlyCredits ?? 0
  const balance = walletQuery.data?.balance
  const remainingHours =
    typeof balance === 'number' && hourlyCost > 0 ? Math.floor(balance / hourlyCost) : null
  const showBalanceWarning =
    healthState === 'ready' && remainingHours !== null && remainingHours <= 24
  const openBalance = () =>
    openRecharge({
      source: 'cloud-computer',
      cloudComputerId: computer.id,
      cloudComputerName: computer.name,
      hourlyCost,
      resumeAfterPayment: healthState === 'paused',
    })

  useEffect(() => {
    setName(computer.name)
  }, [computer.name])

  useGSAP(
    () => {
      const motion = gsap.matchMedia()
      motion.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.fromTo(
          '.cloud-cover-hero',
          { autoAlpha: 0, y: 14, scale: 0.992 },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            duration: 0.52,
            ease: 'power2.out',
            clearProps: 'transform,opacity,visibility',
          },
        )
        gsap.fromTo(
          '.cloud-cover-copy > *',
          { autoAlpha: 0, y: 8 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.35,
            stagger: 0.045,
            delay: 0.1,
            ease: 'power2.out',
            clearProps: 'transform,opacity,visibility',
          },
        )
        if (healthState === 'ready') {
          gsap.to('.cloud-cover-shell', {
            y: -3,
            rotation: 0.3,
            duration: 2.6,
            ease: 'sine.inOut',
            repeat: -1,
            yoyo: true,
          })
        }
      })
      return () => motion.revert()
    },
    {
      scope: coverRef,
      dependencies: [computer.id, healthState],
      revertOnUpdate: true,
    },
  )

  return (
    <section
      ref={coverRef}
      className="h-full overflow-y-auto bg-[radial-gradient(circle_at_16%_0%,rgba(255,255,255,0.035),transparent_34%)] p-5"
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        <div
          className="cloud-cover-hero relative overflow-hidden rounded-[34px] border p-6 shadow-[0_28px_90px_rgba(0,0,0,0.22)] sm:p-8"
          style={{
            borderColor: `${CLOUD_COMPUTER_SHELL_PALETTE[shellColor].shell}45`,
            background: `radial-gradient(circle at 15% 18%, ${CLOUD_COMPUTER_SHELL_PALETTE[shellColor].shell}2e, transparent 32%), linear-gradient(145deg, rgba(255,255,255,0.055), rgba(255,255,255,0.018))`,
          }}
        >
          <div className="relative grid gap-8 md:grid-cols-[210px_minmax(0,1fr)] md:items-center">
            <div className="flex flex-col items-center justify-center">
              <span className="cloud-cover-shell will-change-transform">
                <CloudComputerShell
                  color={shellColor}
                  status={computer.status}
                  size="lg"
                  label={computer.name}
                />
              </span>
              <div
                className="mt-3 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/20 px-2.5 py-1.5 shadow-inner"
                role="group"
                aria-label={t('cloudComputers.appearance.shellColor')}
              >
                {CLOUD_COMPUTER_SHELL_COLORS.map((color) => (
                  <button
                    type="button"
                    key={color}
                    className={cn(
                      'h-3.5 w-3.5 rounded-full border transition hover:scale-125',
                      color === shellColor
                        ? 'border-white ring-2 ring-white/30'
                        : 'border-white/25',
                      'disabled:cursor-wait disabled:opacity-60',
                    )}
                    style={{ backgroundColor: CLOUD_COMPUTER_SHELL_PALETTE[color].shell }}
                    aria-label={t(`cloudComputers.appearance.colors.${color}`)}
                    aria-pressed={color === shellColor}
                    title={t(`cloudComputers.appearance.colors.${color}`)}
                    disabled={updateShellColor.isPending}
                    onClick={() => updateShellColor.mutate(color)}
                  />
                ))}
              </div>
            </div>
            <div className="cloud-cover-copy min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-black/15 px-2.5 py-1 text-[11px] font-black text-text-muted">
                  <StatusDot status={computer.status} />
                  {isDeleting
                    ? t(`cloudComputers.operation.${computer.operation?.stage}`)
                    : t(`cloudComputers.health.${healthState}`)}
                </span>
              </div>
              {editingName ? (
                <form
                  className="mt-3 flex min-w-0 max-w-xl items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (name.trim() && name.trim() !== computer.name) updateName.mutate()
                  }}
                >
                  <input
                    autoFocus
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={80}
                    aria-label={t('cloudComputers.computerName')}
                    className="h-10 min-w-0 flex-1 rounded-xl border border-white/15 bg-black/20 px-3 text-lg font-black text-text-primary outline-none focus:border-primary"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!name.trim() || name.trim() === computer.name || updateName.isPending}
                  >
                    {updateName.isPending ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Save size={14} />
                    )}
                    {t('common.save')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={updateName.isPending}
                    onClick={() => {
                      setName(computer.name)
                      setEditingName(false)
                    }}
                  >
                    {t('common.cancel')}
                  </Button>
                </form>
              ) : (
                <div className="mt-3 flex min-w-0 items-center gap-2">
                  <h2 className="truncate text-2xl font-black tracking-tight text-text-primary">
                    {computer.name}
                  </h2>
                  <button
                    type="button"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-text-muted transition hover:bg-white/[0.07] hover:text-text-primary"
                    aria-label={t('cloudComputers.computerName')}
                    onClick={() => setEditingName(true)}
                  >
                    <Pencil size={14} />
                  </button>
                </div>
              )}
              <p className="mt-1.5 max-w-2xl text-sm leading-6 text-text-muted">
                {isDeleting
                  ? t('cloudComputers.operation.deleteNotice')
                  : computer.operation?.kind === 'update'
                    ? t('cloudComputers.recovery.updatingDesc')
                    : healthState === 'ready'
                      ? t('cloudComputers.cover.readyDesc')
                      : healthState === 'failed'
                        ? displayError
                        : t(`cloudComputers.cover.${healthState}Desc`)}
              </p>
              {isDeleting && computer.operation ? (
                <div className="mt-4 max-w-xl rounded-2xl border border-warning/20 bg-warning/7 px-4 py-3">
                  <div className="flex items-center justify-between gap-3 text-xs font-bold text-text-secondary">
                    <span>{t(`cloudComputers.operation.${computer.operation.stage}`)}</span>
                    <span>{computer.operation.progress}%</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/20">
                    <div
                      className="h-full rounded-full bg-warning transition-[width] duration-500"
                      style={{ width: `${computer.operation.progress}%` }}
                    />
                  </div>
                </div>
              ) : null}
              {!isDeleting && computer.cost && computer.cost.hourlyCredits > 0 ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-black/10 px-3 py-1.5 font-semibold text-text-muted">
                    {t('cloudComputers.cover.hourlyCost', {
                      count: computer.cost.hourlyCredits,
                    })}
                  </span>
                  {showBalanceWarning ? (
                    <span className="rounded-full bg-warning/10 px-3 py-1.5 font-semibold text-warning">
                      {t('recharge.balanceRunway', {
                        balance: balance?.toLocaleString(),
                        hours: remainingHours,
                      })}
                    </span>
                  ) : null}
                  {showBalanceWarning ? (
                    <button
                      type="button"
                      className="font-bold text-primary hover:underline"
                      onClick={openBalance}
                    >
                      {t('recharge.addBalance')}
                    </button>
                  ) : null}
                </div>
              ) : null}
              {healthState !== 'ready' && !isDeleting ? (
                <CloudComputerStateBanner computer={computer} compact />
              ) : null}
              {healthState === 'ready' ? (
                <div className="mt-6">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-black tracking-wide text-text-muted">
                      {t('cloudComputers.cover.buddiesTitle', { count: buddies.length })}
                    </p>
                    {buddies.length === 0 ? (
                      <button
                        type="button"
                        className="text-xs font-bold text-primary hover:underline"
                        onClick={() => onOpenApp('buddies')}
                      >
                        {t('cloudComputers.addBuddy')}
                      </button>
                    ) : null}
                  </div>
                  {buddies.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {buddies.map((buddy) => {
                        const opening =
                          openBuddyChat.isPending && openBuddyChat.variables?.id === buddy.id
                        return (
                          <button
                            type="button"
                            key={buddy.id}
                            disabled={openBuddyChat.isPending || !buddy.botUser?.id}
                            onClick={() => openBuddyChat.mutate(buddy)}
                            className="group/buddy flex min-w-0 items-center gap-2.5 rounded-2xl border border-white/[0.08] bg-black/15 py-2 pr-3 pl-2 text-left transition hover:-translate-y-0.5 hover:border-white/[0.16] hover:bg-white/[0.055] disabled:cursor-not-allowed disabled:opacity-55"
                            aria-label={t('cloudComputers.cover.openBuddyChat', {
                              name: buddyDisplayName(buddy),
                            })}
                          >
                            <UserAvatar
                              size="sm"
                              userId={buddy.botUser?.id ?? buddy.id}
                              avatarUrl={buddy.botUser?.avatarUrl}
                              displayName={buddyDisplayName(buddy)}
                              className="h-8 w-8 border border-white/10"
                            />
                            <span className="max-w-36 truncate text-sm font-bold text-text-primary">
                              {buddyDisplayName(buddy)}
                            </span>
                            {opening ? (
                              <Loader2 size={14} className="animate-spin text-primary" />
                            ) : (
                              <MessageCircle
                                size={14}
                                className="text-text-muted transition group-hover/buddy:text-primary"
                              />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  ) : buddiesQuery.isLoading ? (
                    <div className="mt-2 h-12 w-44 animate-pulse rounded-2xl bg-white/[0.05]" />
                  ) : null}
                </div>
              ) : null}
              {message ? <p className="mt-2 text-xs text-text-muted">{message}</p> : null}
              {buddiesQuery.error ? (
                <p className="mt-2 text-xs font-semibold text-danger">
                  {(buddiesQuery.error as Error).message}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {canLoadPublishedApps && appsQuery.error ? (
          <section className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] px-4 py-3">
            <p className="text-xs font-semibold text-text-muted">
              {t('cloudComputers.cover.recentAppsUnavailable')}
            </p>
            <Button variant="ghost" size="sm" onClick={() => appsQuery.refetch()}>
              <RefreshCw size={14} />
              {t('common.retry')}
            </Button>
          </section>
        ) : apps.length > 0 ? (
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-text-primary">
                  {t('cloudComputers.cover.recentApps')}
                </h3>
                <p className="mt-0.5 text-xs text-text-muted">
                  {t('cloudComputers.cover.recentAppsDesc')}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => appsQuery.refetch()}>
                <RefreshCw size={14} />
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {apps.slice(0, 4).map((app) => (
                <article
                  key={app.id}
                  className="flex items-center gap-3 border-border-subtle border-b py-3 last:border-b-0"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Globe2 size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-text-primary">{app.name}</p>
                    <p className="truncate text-xs text-text-muted">
                      {t(`cloudComputers.cover.appStatus.${app.status}`, {
                        defaultValue: app.status,
                      })}
                      {app.updatedAt ? ` · ${formatTimestamp(app.updatedAt, i18n.language)}` : ''}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(app.stableBaseUrl, '_blank', 'noopener,noreferrer')}
                  >
                    {t('cloudComputers.cover.openApp')}
                  </Button>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </section>
  )
}

function CloudComputerDesktop({
  computer,
  activeApp,
  spaceId,
  canBack,
  onBack,
  onOpenApp,
  onComputerHome,
}: {
  computer: CloudComputerSummary
  activeApp: CloudComputerApp | null
  spaceId?: string
  canBack: boolean
  onBack: () => void
  onOpenApp: (app: CloudComputerApp) => void
  onComputerHome: () => void
}) {
  const { t } = useTranslation()
  const apps = cloudComputerApps(t)

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-transparent">
      <aside className="flex h-full w-[216px] shrink-0 flex-col border-r border-white/[0.07] bg-black/10 p-3">
        <nav className="flex min-h-0 flex-1 flex-col" aria-label={t('cloudComputers.path')}>
          <button
            type="button"
            onClick={onComputerHome}
            aria-current={activeApp === null ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-[15px] px-3 py-3 text-left transition',
              activeApp === null
                ? 'bg-primary/13 text-primary ring-1 ring-inset ring-primary/18'
                : 'text-text-primary hover:bg-white/[0.05]',
            )}
          >
            <CloudComputerShell
              color={computer.appearance?.shellColor ?? 'aqua'}
              status={computer.status}
              size="sm"
              label={computer.name}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-black">{computer.name}</span>
              <span className="mt-0.5 flex items-center gap-1.5 text-[10px] font-bold text-text-muted">
                <StatusDot status={computer.status} />
                {t(`cloudComputers.status.${computer.status}`, {
                  defaultValue: t('cloudComputers.status.unknown'),
                })}
              </span>
            </span>
          </button>
          <div className="my-3 h-px bg-white/[0.07]" />
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {apps.map((app) => {
              const Icon = app.icon
              const enabled =
                app.key === 'settings' ||
                app.key === 'backups' ||
                (computer.capabilities
                  ? Boolean(computer.capabilities[app.key as keyof typeof computer.capabilities])
                  : computer.status === 'deployed')
              return (
                <button
                  type="button"
                  key={app.key}
                  onClick={() => onOpenApp(app.key)}
                  title={
                    enabled
                      ? app.label
                      : t(
                          `cloudComputers.readinessReason.${computer.readiness?.[app.key]?.reason ?? 'runtime_unavailable'}`,
                        )
                  }
                  className={cn(
                    'flex h-9 w-full items-center gap-3 rounded-xl px-3 text-left text-xs font-black transition',
                    activeApp === app.key
                      ? 'bg-white/[0.075] text-text-primary ring-1 ring-inset ring-white/[0.075]'
                      : 'text-text-muted hover:bg-white/[0.045] hover:text-text-primary',
                    !enabled && 'text-text-muted/60',
                  )}
                >
                  <Icon size={15} className={activeApp === app.key ? 'text-primary' : undefined} />
                  <span className="min-w-0 flex-1 truncate">{app.label}</span>
                  {activeApp === app.key ? (
                    <ChevronRight size={13} className="text-primary" />
                  ) : !enabled ? (
                    <AlertCircle size={13} className="text-warning" />
                  ) : null}
                </button>
              )
            })}
          </div>
        </nav>
      </aside>
      <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
        {activeApp ? (
          <CloudComputerAppView
            app={activeApp}
            computer={computer}
            spaceId={spaceId}
            canBack={canBack}
            onBack={onBack}
            onComputerHome={onComputerHome}
            onLeaveComputer={onBack}
            onOpenApp={onOpenApp}
          />
        ) : (
          <section className="flex h-full min-h-0 flex-col overflow-hidden">
            <CloudComputerBreadcrumbs
              computer={computer}
              canBack={canBack}
              onBack={onBack}
              onComputerHome={onComputerHome}
            />
            <div className="min-h-0 flex-1 overflow-hidden">
              <CloudComputerCover computer={computer} spaceId={spaceId} onOpenApp={onOpenApp} />
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

export function CloudComputersPage({
  initialComputerId,
  initialApp,
  spaceId,
  createOnly = false,
  embeddedCreate = false,
  openCreateOnMount = false,
  onBack,
  onCreateBack,
  onCreateClose,
  onCreated,
}: CloudComputersPageProps = {}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [desktopComputerId, setDesktopComputerId] = useState<string | null>(
    initialComputerId ?? null,
  )
  const [activeApp, setActiveApp] = useState<CloudComputerApp | null>(initialApp ?? null)
  const [createModalOpen, setCreateModalOpen] = useState(openCreateOnMount)
  const createInFlightRef = useRef(false)
  const buddyHandshakeAbortRef = useRef<AbortController | null>(null)

  useEffect(
    () => () => {
      buddyHandshakeAbortRef.current?.abort()
    },
    [],
  )

  useEffect(() => {
    if (openCreateOnMount) setCreateModalOpen(true)
  }, [openCreateOnMount])

  const computerQuery = useQuery({
    queryKey: ['cloud-computers'],
    enabled: !createOnly,
    queryFn: () => fetchApi<CloudComputerSummary[]>('/api/cloud-computers?limit=100&offset=0'),
    refetchInterval: (query) => {
      const data = query.state.data
      return data?.some((computer) =>
        ['pending', 'deploying', 'cancelling', 'resuming', 'destroying'].includes(computer.status),
      )
        ? 3000
        : false
    },
  })

  // Route/window input seeds the selection only when that input changes. Treating it as a
  // continuously controlled value makes a list refresh overwrite the id returned by create.
  useEffect(() => {
    if (initialComputerId) {
      setDesktopComputerId(initialComputerId)
      setActiveApp(initialApp ?? null)
    }
  }, [initialApp, initialComputerId])

  const desktopComputer =
    computerQuery.data?.find((computer) => computer.id === desktopComputerId) ?? null

  const openCreatedBuddyConversation = async (computer: CloudComputerSummary, buddyId: string) => {
    buddyHandshakeAbortRef.current?.abort()
    const controller = new AbortController()
    buddyHandshakeAbortRef.current = controller
    showToast(t('cloudComputers.buddyGreetingPreparing'), 'info')
    try {
      const buddy = await waitForCloudComputerBuddy({
        expectedId: buddyId,
        signal: controller.signal,
        load: async () => {
          const response = await fetchApi<CloudComputerBuddiesResponse>(
            `/api/cloud-computers/${encodeURIComponent(computer.id)}/buddies`,
          )
          return response.buddies
        },
      })
      if (controller.signal.aborted) return
      if (!buddy?.botUser?.id) throw new Error(t('cloudComputers.buddyGreetingTimeout'))

      const channel = await fetchApi<{ id: string }>('/api/channels/dm', {
        method: 'POST',
        body: JSON.stringify({ userId: buddy.botUser.id }),
      })
      await fetchApi(`/api/channels/${channel.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: getBuddyIntroPrompt(t) }),
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['direct-channels'] }),
        queryClient.invalidateQueries({ queryKey: ['messages', channel.id] }),
        queryClient.invalidateQueries({ queryKey: ['cloud-computer-buddies', computer.id] }),
      ])

      const osSpaceSlug = currentOsSpaceSlug()
      if (!osSpaceSlug) throw new Error('Cloud Computer is not attached to an OS Space')
      const server = spaceId
        ? { id: spaceId, slug: osSpaceSlug }
        : await fetchApi<{ id: string; slug?: string | null }>(
            `/api/servers/${encodeURIComponent(osSpaceSlug)}`,
          )
      openOsDirectMessage({
        serverId: server.id,
        serverSlug: server.slug ?? osSpaceSlug,
        channelId: channel.id,
        buddy,
      })
    } catch (error) {
      if (!controller.signal.aborted) {
        showToast(
          error instanceof Error && error.message === t('cloudComputers.buddyGreetingTimeout')
            ? error.message
            : t('cloudComputers.buddyGreetingFailed'),
          'error',
        )
      }
    } finally {
      if (buddyHandshakeAbortRef.current === controller) buddyHandshakeAbortRef.current = null
    }
  }

  const createComputer = useMutation({
    mutationFn: (input: CloudComputerCreateInput) =>
      fetchApi<CloudComputerSummary>('/api/cloud-computers', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: async (computer, input) => {
      queryClient.setQueryData<CloudComputerSummary[]>(['cloud-computers'], (current) => [
        computer,
        ...(current ?? []).filter((item) => item.id !== computer.id),
      ])
      setDesktopComputerId(computer.id)
      setActiveApp(null)
      setCreateModalOpen(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['cloud-computers'] }),
        queryClient.invalidateQueries({ queryKey: ['computers'] }),
      ])
      onCreated?.(computer)
      if (input.buddy && computer.initialBuddy) {
        void openCreatedBuddyConversation(computer, computer.initialBuddy.id)
      }
    },
  })

  const openApp = (app: CloudComputerApp) => {
    if (!desktopComputerId) return
    setActiveApp(app)
  }

  const backToComputerHome = () => {
    setActiveApp(null)
  }

  const submitCreateComputer = (input: CloudComputerCreateInput) => {
    if (createComputer.isPending || createInFlightRef.current) return
    createInFlightRef.current = true
    createComputer.mutate(input, {
      onSettled: () => {
        createInFlightRef.current = false
      },
    })
  }

  return (
    <>
      {!createOnly ? (
        <div className="h-full min-h-0 w-full min-w-0 overflow-hidden bg-transparent text-text-primary">
          {computerQuery.isLoading ? (
            <LoadingDesktop />
          ) : desktopComputer ? (
            <CloudComputerDesktop
              computer={desktopComputer}
              activeApp={activeApp}
              spaceId={spaceId}
              canBack={Boolean(onBack)}
              onBack={onBack ?? backToComputerHome}
              onOpenApp={openApp}
              onComputerHome={backToComputerHome}
            />
          ) : (
            <div className="grid h-full place-items-center px-6 text-center">
              <div>
                <Monitor size={34} className="mx-auto text-text-muted/55" />
                <p className="mt-3 text-sm font-bold text-text-muted">
                  {computerQuery.isError ? t('computers.loadFailed') : t('computers.empty')}
                </p>
                {onBack ? (
                  <Button variant="ghost" size="sm" className="mt-3" onClick={onBack}>
                    <ChevronLeft size={15} />
                    {t('computers.back')}
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      ) : null}
      <CloudComputerCreateModal
        open={createModalOpen}
        creating={createComputer.isPending}
        error={createComputer.error?.message ?? null}
        spaceId={spaceId}
        embedded={embeddedCreate}
        onBack={onCreateBack}
        onClose={() => {
          setCreateModalOpen(false)
          onCreateClose?.()
        }}
        onSubmit={submitCreateComputer}
      />
    </>
  )
}
