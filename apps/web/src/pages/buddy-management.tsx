import {
  Button,
  cn,
  Modal,
  ModalBody,
  ModalButtonGroup,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate, useSearch } from '@tanstack/react-router'
import {
  ArrowRight,
  ChevronDown,
  Clock,
  Cloud,
  Edit,
  Eye,
  LockKeyhole,
  MessageCircle,
  PackageMinus,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Store,
  Terminal,
  Trash2,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AgentDetail } from '../components/buddy-management/agent-detail'
import {
  CLOUD_RUNTIME_LABELS,
  type CloudBuddyRuntimeId,
  CreateAgentDialog,
  EditAgentDialog,
  getBuddyIntroPrompt,
  RuntimeIcon,
} from '../components/buddy-management/agent-dialogs'
import { DesktopConnectorDownloadCard } from '../components/buddy-management/desktop-connector-download-card'
import {
  type Agent,
  type BuddyMode,
  type ConnectorComputer,
  type ConnectorRuntimeInfo,
  connectorComputerDisplayName,
  connectorRuntimeDisplayDetail,
  getAgentBuddyMode,
  type TokenResponse,
} from '../components/buddy-management/types'
import { BuddyMarketContent } from '../components/buddy-market/buddy-market-content'
import { UserAvatar } from '../components/common/avatar'
import { OnlineRank } from '../components/common/online-rank'
import { fetchApi } from '../lib/api'
import { copyToClipboard } from '../lib/clipboard'
import { showToast } from '../lib/toast'
import { useAuthStore } from '../stores/auth.store'
import { useUIStore } from '../stores/ui.store'
import { CreateListingPage } from './create-listing'

type TranslateFn = ReturnType<typeof useTranslation>['t']

/* ── Embeddable Buddy Management Content (for Settings page) ── */

type MyBuddySettingsSection = 'buddies' | 'market'
type MarketWorkspaceSection = 'marketplace' | 'myRented' | 'outContracts' | 'myListings'

interface Contract {
  id: string
  contractNo: string
  listingId: string
  ownerId: string
  tenantId: string
  status: 'pending' | 'active' | 'completed' | 'cancelled' | 'violated' | 'disputed'
  startsAt: string | null
  expiresAt: string | null
  terminatedAt: string | null
  hourlyRate: number
  baseDailyRate?: number
  messageFee?: number
  pricingVersion?: number
  messageCount?: number
  depositAmount: number
  totalCost: number
  listing?: { title: string; deviceTier: string; osType: string } | null
  agentUserId?: string | null
  createdAt: string
}

interface MyListing {
  id: string
  title: string
  listingStatus: 'draft' | 'active' | 'paused' | 'expired' | 'closed'
  isListed: boolean
  deviceTier: string
  osType: string
  hourlyRate: number
  baseDailyRate?: number
  messageFee?: number
  pricingVersion?: number
  viewCount: number
  rentalCount: number
  createdAt: string
  isRented?: boolean
  activeTenantId?: string | null
  agent?: {
    status: string
    lastHeartbeat: string | null
    totalOnlineSeconds: number
  } | null
}

type ServerEntry = {
  server: {
    id: string
    name: string
    slug?: string | null
  }
}

type ConnectorBootstrapResult = {
  computer: ConnectorComputer
  command: string
}

type CreateBuddyTarget = 'local' | 'cloud'

const CLOUD_BUDDY_RUNTIME_OPTIONS: Array<{
  id: CloudBuddyRuntimeId
  label: string
  descriptionKey: string
}> = [
  {
    id: 'openclaw',
    label: CLOUD_RUNTIME_LABELS.openclaw,
    descriptionKey: 'agentMgmt.cloudRuntimeOpenClawDesc',
  },
  {
    id: 'hermes',
    label: CLOUD_RUNTIME_LABELS.hermes,
    descriptionKey: 'agentMgmt.cloudRuntimeHermesDesc',
  },
  {
    id: 'claude-code',
    label: CLOUD_RUNTIME_LABELS['claude-code'],
    descriptionKey: 'agentMgmt.cloudRuntimeClaudeCodeDesc',
  },
  {
    id: 'codex',
    label: CLOUD_RUNTIME_LABELS.codex,
    descriptionKey: 'agentMgmt.cloudRuntimeCodexDesc',
  },
  {
    id: 'opencode',
    label: CLOUD_RUNTIME_LABELS.opencode,
    descriptionKey: 'agentMgmt.cloudRuntimeOpenCodeDesc',
  },
  {
    id: 'gemini',
    label: CLOUD_RUNTIME_LABELS.gemini,
    descriptionKey: 'agentMgmt.cloudRuntimeGeminiDesc',
  },
]

function availableRuntimes(computer: ConnectorComputer | null | undefined) {
  return (computer?.runtimes ?? []).filter((runtime) => runtime.status === 'available')
}

function runtimeSortKey(runtime: ConnectorRuntimeInfo) {
  const priority: Record<string, number> = {
    openclaw: 0,
    hermes: 1,
    'claude-code': 2,
    codex: 3,
    opencode: 4,
    gemini: 5,
  }
  return priority[runtime.id] ?? 50
}

const STATUS_STYLES: Record<string, { labelKey: string; bg: string; text: string }> = {
  pending: { labelKey: 'marketplace.statusPending', bg: 'bg-warning/10', text: 'text-warning' },
  active: { labelKey: 'marketplace.statusActive', bg: 'bg-success/10', text: 'text-success' },
  completed: {
    labelKey: 'marketplace.statusCompleted',
    bg: 'bg-bg-secondary',
    text: 'text-text-secondary',
  },
  cancelled: {
    labelKey: 'marketplace.statusCancelled',
    bg: 'bg-bg-secondary',
    text: 'text-text-muted',
  },
  violated: { labelKey: 'marketplace.statusViolated', bg: 'bg-danger/10', text: 'text-danger' },
  disputed: { labelKey: 'marketplace.statusDisputed', bg: 'bg-warning/10', text: 'text-warning' },
}

const LISTING_STATUS: Record<string, { labelKey: string; bg: string; text: string }> = {
  draft: { labelKey: 'marketplace.listingDraft', bg: 'bg-bg-secondary', text: 'text-text-muted' },
  active: { labelKey: 'marketplace.listingActive', bg: 'bg-success/10', text: 'text-success' },
  paused: { labelKey: 'marketplace.listingPaused', bg: 'bg-warning/10', text: 'text-warning' },
  expired: {
    labelKey: 'marketplace.listingExpired',
    bg: 'bg-bg-secondary',
    text: 'text-text-muted',
  },
  closed: { labelKey: 'marketplace.listingClosed', bg: 'bg-danger/10', text: 'text-danger' },
}

const DEVICE_TIERS: Record<string, { icon: string; labelKey: string }> = {
  high_end: { icon: '🔥', labelKey: 'marketplace.deviceHighEnd' },
  mid_range: { icon: '⚡', labelKey: 'marketplace.deviceMidRange' },
  low_end: { icon: '💡', labelKey: 'marketplace.deviceLowEnd' },
}

function isAgentOnline(agent?: MyListing['agent']): boolean {
  if (!agent) return false
  if (agent.status !== 'running') return false
  if (!agent.lastHeartbeat) return false
  return Date.now() - new Date(agent.lastHeartbeat).getTime() < 90000
}

function formatOnlineDuration(seconds: number, t: TranslateFn): string {
  if (seconds < 3600) return `${Math.floor(seconds / 60)}${t('time.minutes')}`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}${t('time.hours')}`
  return `${Math.floor(seconds / 86400)}${t('time.days')}${Math.floor((seconds % 86400) / 3600)}${t('time.hours')}`
}

function getBuddyLevel(totalSeconds: number): number {
  if (totalSeconds <= 0) return 0

  const hours = totalSeconds / 3600
  let suns = 0
  let moons = 0
  let stars = 0

  if (hours >= 500) {
    suns = Math.min(Math.floor(hours / 500), 4)
    const remainAfterSuns = hours - suns * 500
    moons = Math.min(Math.floor(remainAfterSuns / 100), 3)
    const remainAfterMoons = remainAfterSuns - moons * 100
    stars = Math.min(Math.floor(remainAfterMoons / 16), 3)
  } else if (hours >= 100) {
    moons = Math.min(Math.floor(hours / 100), 3)
    const remain = hours - moons * 100
    stars = Math.min(Math.floor(remain / 16), 3)
  } else {
    stars = Math.min(Math.floor(hours / 16), 3)
  }

  if (suns === 0 && moons === 0 && stars === 0) {
    stars = hours >= 1 ? 1 : 0
  }

  return suns + moons + stars
}

function getAgentOnlineDotClass(agent: Agent): string {
  if (agent.status === 'error') return 'bg-danger'
  if (agent.status === 'stopped') return 'bg-text-muted/50'
  if (agent.lastHeartbeat && Date.now() - new Date(agent.lastHeartbeat).getTime() < 90000) {
    return 'bg-success'
  }
  return 'bg-text-muted/50'
}

function CreateBuddyFlowPanel({
  onClose,
  onSuccess,
  onError,
  t,
}: {
  onClose: () => void
  onSuccess: (agent: Agent) => void
  onError: (message?: string) => void
  t: TranslateFn
}) {
  const queryClient = useQueryClient()
  const [createBuddyTarget, setCreateBuddyTarget] = useState<CreateBuddyTarget>('local')
  const [selectedCloudRuntimeId, setSelectedCloudRuntimeId] =
    useState<CloudBuddyRuntimeId>('openclaw')
  const [selectedConnectorComputerId, setSelectedConnectorComputerId] = useState<string | null>(
    null,
  )
  const [selectedConnectorRuntimeId, setSelectedConnectorRuntimeId] = useState<string | null>(null)
  const [connectorSelectionConfirmed, setConnectorSelectionConfirmed] = useState(false)
  const [connectorCommand, setConnectorCommand] = useState<string | null>(null)
  const [isWaitingForDesktopConnector, setIsWaitingForDesktopConnector] = useState(false)
  const connectorBootstrapStartedRef = useRef(false)

  const { data: connectorData, isFetching: isConnectorFetching } = useQuery({
    queryKey: ['connector-computers'],
    queryFn: () => fetchApi<{ computers: ConnectorComputer[] }>('/api/connector/computers'),
    enabled: createBuddyTarget === 'local' && !connectorSelectionConfirmed,
    refetchInterval:
      createBuddyTarget === 'local' && !connectorSelectionConfirmed && isWaitingForDesktopConnector
        ? 3000
        : false,
  })

  const connectorComputers = connectorData?.computers ?? []
  const connectorRuntimeOptions = useMemo(
    () =>
      connectorComputers
        .flatMap((computer) =>
          availableRuntimes(computer).map((runtime) => ({
            key: `${computer.id}:${runtime.id}`,
            computer,
            runtime,
          })),
        )
        .sort(
          (a, b) =>
            runtimeSortKey(a.runtime) - runtimeSortKey(b.runtime) ||
            a.runtime.label.localeCompare(b.runtime.label),
        ),
    [connectorComputers],
  )
  const selectedConnectorRuntimeOption =
    connectorRuntimeOptions.find(
      (option) =>
        option.computer.id === selectedConnectorComputerId &&
        option.runtime.id === selectedConnectorRuntimeId,
    ) ??
    connectorRuntimeOptions[0] ??
    null
  const selectedConnectorComputer = selectedConnectorRuntimeOption?.computer ?? null
  const selectedConnectorRuntime = selectedConnectorRuntimeOption?.runtime ?? null
  const connectorRuntimeOptionKeys = connectorRuntimeOptions
    .map((option) => option.key)
    .join('\u0000')
  const selectedCloudRuntime =
    CLOUD_BUDDY_RUNTIME_OPTIONS.find((option) => option.id === selectedCloudRuntimeId) ??
    CLOUD_BUDDY_RUNTIME_OPTIONS[0]
  const canContinue =
    createBuddyTarget === 'cloud'
      ? Boolean(selectedCloudRuntime)
      : Boolean(selectedConnectorRuntime)

  const connectorBootstrap = useMutation({
    mutationFn: () =>
      fetchApi<ConnectorBootstrapResult>('/api/connector/computers/bootstrap', {
        method: 'POST',
        body: JSON.stringify({
          serverUrl: window.location.origin,
          name: t('agentMgmt.connectorDefaultComputerName'),
        }),
      }),
    onSuccess: (result) => {
      setConnectorCommand(result.command)
      queryClient.invalidateQueries({ queryKey: ['connector-computers'] })
    },
    onError: (error: Error) => {
      showToast(error.message || t('agentMgmt.connectorCreateFailed'), 'error')
    },
  })

  useEffect(() => {
    if (createBuddyTarget !== 'local' || connectorData === undefined) return
    if (
      connectorRuntimeOptions.length > 0 ||
      connectorCommand ||
      connectorBootstrap.isPending ||
      connectorBootstrapStartedRef.current
    ) {
      return
    }
    connectorBootstrapStartedRef.current = true
    connectorBootstrap.mutate()
  }, [
    connectorBootstrap,
    connectorCommand,
    connectorData,
    connectorRuntimeOptions.length,
    createBuddyTarget,
  ])

  useEffect(() => {
    if (createBuddyTarget !== 'local') return
    if (!connectorRuntimeOptionKeys) {
      if (selectedConnectorComputerId) setSelectedConnectorComputerId(null)
      if (selectedConnectorRuntimeId) setSelectedConnectorRuntimeId(null)
      return
    }
    if (!selectedConnectorRuntimeOption) return
    if (selectedConnectorComputerId !== selectedConnectorRuntimeOption.computer.id) {
      setSelectedConnectorComputerId(selectedConnectorRuntimeOption.computer.id)
    }
    if (selectedConnectorRuntimeId !== selectedConnectorRuntimeOption.runtime.id) {
      setSelectedConnectorRuntimeId(selectedConnectorRuntimeOption.runtime.id)
    }
  }, [
    connectorRuntimeOptionKeys,
    createBuddyTarget,
    selectedConnectorComputerId,
    selectedConnectorRuntimeId,
    selectedConnectorRuntimeOption,
  ])

  useEffect(() => {
    if (connectorRuntimeOptions.length > 0 && isWaitingForDesktopConnector) {
      setIsWaitingForDesktopConnector(false)
    }
  }, [connectorRuntimeOptions.length, isWaitingForDesktopConnector])

  if (connectorSelectionConfirmed && canContinue) {
    return (
      <div className="max-w-2xl mx-auto animate-in fade-in slide-in-from-right-4 duration-300">
        <CreateAgentDialog
          onClose={onClose}
          onSuccess={(agent) => {
            queryClient.invalidateQueries({ queryKey: ['agents'] })
            queryClient.invalidateQueries({ queryKey: ['direct-channels'] })
            queryClient.invalidateQueries({ queryKey: ['cloud-saas'] })
            onSuccess(agent)
          }}
          onError={onError}
          t={t}
          embedded
          quick
          onBack={() => setConnectorSelectionConfirmed(false)}
          connectorComputerId={
            createBuddyTarget === 'local' ? selectedConnectorComputer?.id : undefined
          }
          connectorRuntimeId={
            createBuddyTarget === 'local' ? selectedConnectorRuntime?.id : undefined
          }
          connectorRuntimeLabel={
            createBuddyTarget === 'local' ? selectedConnectorRuntime?.label : undefined
          }
          serverUrl={createBuddyTarget === 'local' ? window.location.origin : undefined}
          cloudRuntimeId={createBuddyTarget === 'cloud' ? selectedCloudRuntime?.id : undefined}
          cloudRuntimeLabel={
            createBuddyTarget === 'cloud' ? selectedCloudRuntime?.label : undefined
          }
        />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
      <div
        role="tablist"
        aria-label={t('agentMgmt.createRunTarget')}
        className="grid grid-cols-2 rounded-2xl border border-border-subtle bg-bg-deep/40 p-1"
      >
        {(['local', 'cloud'] as const).map((target) => {
          const selected = createBuddyTarget === target
          const Icon = target === 'cloud' ? Cloud : Terminal
          return (
            <button
              key={target}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => {
                setCreateBuddyTarget(target)
                setConnectorSelectionConfirmed(false)
                setIsWaitingForDesktopConnector(false)
              }}
              className={cn(
                'flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-black transition',
                selected
                  ? 'bg-primary/15 text-primary shadow-sm'
                  : 'text-text-muted hover:bg-bg-tertiary/60 hover:text-text-primary',
              )}
            >
              <Icon size={16} />
              <span>
                {t(
                  target === 'cloud'
                    ? 'agentMgmt.createRunTargetCloud'
                    : 'agentMgmt.createRunTargetLocal',
                )}
              </span>
            </button>
          )
        })}
      </div>

      {createBuddyTarget === 'local' ? (
        <>
          {connectorRuntimeOptions.length === 0 && (
            <DesktopConnectorDownloadCard
              connectorCommand={connectorCommand}
              isWaitingForConnector={isWaitingForDesktopConnector}
              onWaitingForConnectorChange={setIsWaitingForDesktopConnector}
              t={t}
            />
          )}

          {connectorComputers.some((computer) => computer.runtimes.length > 0) && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted">
                  {t('agentMgmt.connectorRuntime')}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    queryClient.invalidateQueries({ queryKey: ['connector-computers'] })
                  }
                  disabled={isConnectorFetching}
                >
                  <RefreshCw size={14} className={cn(isConnectorFetching && 'animate-spin')} />
                  {t('common.refresh')}
                </Button>
              </div>
              {connectorComputers.map((computer) => {
                const runtimes = [...computer.runtimes].sort(
                  (a, b) => runtimeSortKey(a) - runtimeSortKey(b) || a.label.localeCompare(b.label),
                )
                if (runtimes.length === 0) return null
                return (
                  <div key={computer.id} className="space-y-2">
                    <div className="text-xs font-black text-text-secondary">
                      {connectorComputerDisplayName(computer)}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {runtimes.map((runtime) => {
                        const optionKey = `${computer.id}:${runtime.id}`
                        const selected = selectedConnectorRuntimeOption?.key === optionKey
                        const available = runtime.status === 'available'
                        return (
                          <button
                            key={optionKey}
                            type="button"
                            disabled={!available}
                            onClick={() => {
                              if (!available) return
                              setSelectedConnectorComputerId(computer.id)
                              setSelectedConnectorRuntimeId(runtime.id)
                              setConnectorSelectionConfirmed(false)
                            }}
                            className={cn(
                              'rounded-2xl border px-4 py-3 text-left transition',
                              !available
                                ? 'border-border-subtle bg-bg-tertiary/20 opacity-75'
                                : selected
                                  ? 'border-primary/50 bg-primary/10'
                                  : 'border-border-subtle bg-bg-tertiary/40 hover:bg-bg-tertiary/70',
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-bg-deep/50">
                                <RuntimeIcon
                                  iconId={runtime.iconId}
                                  runtimeId={runtime.id}
                                  label={runtime.label}
                                  className="h-5 w-5"
                                />
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-black text-text-primary">
                                  {runtime.label}
                                </span>
                                <span
                                  className={cn(
                                    'mt-0.5 block text-xs text-text-muted',
                                    available ? 'truncate' : 'leading-5',
                                  )}
                                >
                                  {available
                                    ? connectorRuntimeDisplayDetail(computer, runtime)
                                    : t('agentMgmt.runtimeMissing')}
                                </span>
                              </span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-3">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted">
            {t('agentMgmt.cloudRuntime')}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {CLOUD_BUDDY_RUNTIME_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setSelectedCloudRuntimeId(option.id)
                  setConnectorSelectionConfirmed(false)
                }}
                className={cn(
                  'rounded-2xl border px-4 py-3 text-left transition',
                  selectedCloudRuntime?.id === option.id
                    ? 'border-primary/50 bg-primary/10'
                    : 'border-border-subtle bg-bg-tertiary/40 hover:bg-bg-tertiary/70',
                )}
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-bg-deep/50">
                    <RuntimeIcon runtimeId={option.id} label={option.label} className="h-6 w-6" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black text-text-primary">
                      {option.label}
                    </span>
                    <span className="mt-0.5 block text-xs leading-5 text-text-muted">
                      {t(option.descriptionKey)}
                    </span>
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-border-subtle pt-4">
        <Button variant="ghost" size="sm" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setConnectorSelectionConfirmed(true)}
          disabled={!canContinue}
        >
          {t('agentMgmt.connectorContinue')}
        </Button>
      </div>
    </div>
  )
}

export function MyBuddySettingsContent({
  initialSection = 'buddies',
}: {
  initialSection?: MyBuddySettingsSection
}) {
  const navigate = useNavigate()
  const handleSectionChange = (nextSection: MyBuddySettingsSection) => {
    navigate({
      to: nextSection === 'market' ? '/settings/buddy/market' : '/settings/buddy',
      search: {},
      replace: true,
    })
  }

  return (
    <div className="flex flex-1 min-w-0 min-h-0 flex-col gap-3">
      <div className="flex flex-1 min-h-0 gap-3">
        <BuddyManagementContent
          activeSection={initialSection}
          onSectionChange={handleSectionChange}
        />
      </div>
    </div>
  )
}

export function BuddyManagementContent({
  activeSection,
  onSectionChange,
}: {
  activeSection: MyBuddySettingsSection
  onSectionChange: (nextSection: 'buddies' | 'market') => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const searchParams = useSearch({ strict: false }) as {
    agent?: string
    agentId?: string
  }

  const routePath = location.pathname
  const normalizedRoutePath = routePath.replace(/\/+$/, '')
  const isBuddyCreatePath = normalizedRoutePath.endsWith('/settings/buddy/create')
  const isBuddyMarketPath = normalizedRoutePath.endsWith('/settings/buddy/market')
  const isBuddyDetailPath = normalizedRoutePath.endsWith('/settings/buddy/detail')
  const routeSectionFromPath: MyBuddySettingsSection | undefined = isBuddyMarketPath
    ? 'market'
    : isBuddyCreatePath || isBuddyDetailPath
      ? 'buddies'
      : undefined
  const effectiveSection: MyBuddySettingsSection = routeSectionFromPath ?? activeSection
  const isMarketActive = isBuddyMarketPath || effectiveSection === 'market'

  const showCreateMode = effectiveSection === 'buddies' && isBuddyCreatePath
  const detailAgentId =
    effectiveSection === 'buddies'
      ? (() => {
          if (typeof searchParams.agentId === 'string' && searchParams.agentId.trim()) {
            return searchParams.agentId.trim()
          }
          if (typeof searchParams.agent === 'string' && searchParams.agent.trim()) {
            return searchParams.agent.trim()
          }
          return undefined
        })()
      : undefined

  const isDetailMode = effectiveSection === 'buddies' && isBuddyDetailPath && !!detailAgentId

  const navigateBuddyView = (state: {
    section: MyBuddySettingsSection
    view?: 'create' | 'detail'
    agentId?: string
  }) => {
    const routeTo =
      state.section === 'market'
        ? '/settings/buddy/market'
        : state.view === 'create'
          ? '/settings/buddy/create'
          : state.view === 'detail'
            ? '/settings/buddy/detail'
            : '/settings/buddy'

    navigate({
      to: routeTo,
      search:
        state.section === 'market' || state.view === 'create'
          ? {}
          : state.view === 'detail' && state.agentId
            ? { agentId: state.agentId }
            : {},
      replace: true,
    })
  }

  const [showEdit, setShowEdit] = useState(false)
  const [activeListingAgent, setActiveListingAgent] = useState<{
    agentId: string
    listingId?: string
  } | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [generatedToken, setGeneratedToken] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; success: boolean } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const currentUserId = useAuthStore((state) => state.user?.id) ?? null

  // Listen for 'create-buddy' pending action from task center
  const pendingAction = useUIStore((s) => s.pendingAction)
  const setPendingAction = useUIStore((s) => s.setPendingAction)
  useEffect(() => {
    if (pendingAction === 'create-buddy') {
      navigate({ to: '/settings/buddy/create', search: {}, replace: true })
      setPendingAction(null)
    }
  }, [navigate, pendingAction, setPendingAction])

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => fetchApi<Agent[]>('/api/agents'),
    refetchInterval: 30000,
  })
  const { data: servers = [] } = useQuery({
    queryKey: ['servers', 'buddy-access'],
    queryFn: () => fetchApi<ServerEntry[]>('/api/servers'),
  })

  useEffect(() => {
    if (effectiveSection !== 'buddies') return
    if (!detailAgentId) {
      setSelectedAgent(null)
      return
    }

    const found = agents.find((agent) => agent.id === detailAgentId)
    setSelectedAgent(found ?? null)
  }, [effectiveSection, agents, detailAgentId])

  useEffect(() => {
    if (effectiveSection !== 'buddies') {
      setShowEdit(false)
      setActiveListingAgent(null)
      setSelectedAgent(null)
      setGeneratedToken(null)
      setDeleteConfirmId(null)
      setMessage(null)
    }
  }, [effectiveSection])

  const filteredAgents = agents.filter((agent) => {
    if (!searchQuery) return true
    const searchLower = searchQuery.toLowerCase()
    const name = (agent.botUser?.displayName ?? agent.botUser?.username ?? 'Node').toLowerCase()
    const id = agent.id.toLowerCase()
    return name.includes(searchLower) || id.includes(searchLower)
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/agents/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      setDeleteConfirmId(null)
      if (selectedAgent?.id === deleteConfirmId) setSelectedAgent(null)
      showMsg(t('agentMgmt.deleteSuccess'), true)
    },
    onError: () => showMsg(t('agentMgmt.deleteFailed'), false),
  })

  const tokenMutation = useMutation({
    mutationFn: (id: string) =>
      fetchApi<TokenResponse>(`/api/agents/${id}/token`, { method: 'POST' }),
    onSuccess: (data) => {
      setGeneratedToken(data.token)
      queryClient.invalidateQueries({ queryKey: ['agents'] })
    },
  })

  const toggleMutation = useMutation({
    mutationFn: (agent: Agent) =>
      fetchApi<Agent>(`/api/agents/${agent.id}/${agent.status === 'running' ? 'stop' : 'start'}`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      if (selectedAgent) {
        fetchApi<Agent>(`/api/agents/${selectedAgent.id}`).then((a) => setSelectedAgent(a))
      }
    },
  })

  const buddyAccessMutation = useMutation({
    mutationFn: ({
      agentId,
      buddyMode,
      allowedServerIds,
    }: {
      agentId: string
      buddyMode?: BuddyMode
      allowedServerIds?: string[]
    }) =>
      fetchApi<Agent>(`/api/agents/${agentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ buddyMode, allowedServerIds }),
      }),
    onSuccess: (agent) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      queryClient.invalidateQueries({ queryKey: ['my-buddies-for-invite'] })
      setSelectedAgent(agent)
      showMsg(t('agentMgmt.editSuccess'), true)
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  const messageOwnerMutation = useMutation({
    mutationFn: (agentUserId: string) =>
      fetchApi<{ id: string }>('/api/channels/dm', {
        method: 'POST',
        body: JSON.stringify({ userId: agentUserId }),
      }),
    onSuccess: (data) => {
      navigate({ to: '/dm/$dmChannelId', params: { dmChannelId: data.id } })
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  const showMsg = (text: string, success: boolean) => {
    setMessage({ text, success })
    setTimeout(() => setMessage(null), 3000)
  }

  const copyToken = async (token: string) => {
    const didCopy = await copyToClipboard(token, {
      successMessage: t('agentMgmt.tokenCopied'),
      errorMessage: t('chat.copyFailed'),
    })
    if (didCopy) showMsg(t('agentMgmt.tokenCopied'), true)
  }

  const openBuddyDm = async (agent: Agent) => {
    const userId = agent.botUser?.id ?? agent.userId
    try {
      const data = await fetchApi<{ id: string }>('/api/channels/dm', {
        method: 'POST',
        body: JSON.stringify({ userId }),
      })
      await new Promise((resolve) => window.setTimeout(resolve, 800))
      await fetchApi(`/api/channels/${data.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: getBuddyIntroPrompt(t) }),
      }).catch(() => null)
      queryClient.invalidateQueries({ queryKey: ['direct-channels'] })
      queryClient.invalidateQueries({ queryKey: ['messages', data.id] })
      navigate({ to: '/dm/$dmChannelId', params: { dmChannelId: data.id } })
    } catch (error) {
      showToast((error as Error).message || t('agentMgmt.createFailed'), 'error')
    }
  }

  // Main full-height split layout
  return (
    <>
      {/* Left Sidebar */}
      <div className="w-full md:w-72 lg:w-80 shrink-0 flex-col hidden md:flex">
        <div className="bg-[var(--glass-bg)] backdrop-blur-3xl border border-[var(--glass-line)] rounded-2xl flex-1 flex flex-col overflow-hidden shadow-sm">
          <div className="shrink-0 flex flex-col gap-2 p-3 border-b border-[var(--glass-line)]">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <input
                type="text"
                placeholder={t('agentMgmt.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-bg-tertiary/50 border border-border-subtle rounded-xl pl-8 pr-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 transition-shadow"
              />
            </div>
            <button
              type="button"
              onClick={() => navigateBuddyView({ section: 'buddies', view: 'create' })}
              className={cn(
                'w-full flex items-center justify-between rounded-xl border border-transparent px-3 py-2.5 text-left transition-all duration-200',
                showCreateMode
                  ? 'bg-primary/10 border-primary/40 shadow-sm'
                  : 'hover:bg-bg-tertiary/60 hover:border-border-dim',
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-primary',
                    showCreateMode ? 'bg-primary/25' : 'bg-primary/15',
                  )}
                >
                  <Plus size={14} />
                </span>
                <span
                  className={cn(
                    'text-sm font-bold',
                    showCreateMode ? 'text-primary' : 'text-text-primary',
                  )}
                >
                  {t('agentMgmt.newAgent')}
                </span>
              </div>
              <ArrowRight
                size={14}
                className={cn('shrink-0', showCreateMode ? 'text-primary' : 'text-text-muted')}
              />
            </button>
            <button
              type="button"
              onClick={() => onSectionChange('market')}
              className={cn(
                'w-full flex items-center justify-between rounded-xl border border-transparent px-3 py-2.5 text-left transition-all duration-200',
                isMarketActive
                  ? 'bg-warning/10 border-warning/40 shadow-sm'
                  : 'hover:bg-bg-tertiary/60 hover:border-border-dim',
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-warning',
                    isMarketActive ? 'bg-warning/25' : 'bg-warning/15',
                  )}
                >
                  <Store size={14} />
                </span>
                <span
                  className={cn(
                    'text-sm font-bold',
                    isMarketActive ? 'text-warning' : 'text-text-primary',
                  )}
                >
                  {t('marketplace.title')}
                </span>
              </div>
              <ArrowRight
                size={14}
                className={cn('shrink-0', isMarketActive ? 'text-warning' : 'text-text-muted')}
              />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {/* Message */}
            {message && (
              <div
                className={cn(
                  'mx-2 my-2 px-3 py-2 rounded-xl text-xs font-bold border',
                  message.success
                    ? 'bg-success/10 text-success border-success/20'
                    : 'bg-danger/10 text-danger border-danger/20',
                )}
              >
                {message.text}
              </div>
            )}

            {/* Agent list */}
            {isLoading ? (
              <div className="text-center text-text-muted font-bold italic py-8">
                {t('common.loading')}
              </div>
            ) : agents.length === 0 ? (
              <div className="text-center p-4">
                <p className="text-sm text-text-muted">{t('agentMgmt.noAgents')}</p>
              </div>
            ) : filteredAgents.length === 0 ? (
              <div className="text-center p-4">
                <p className="text-sm text-text-muted">{t('common.noResults')}</p>
              </div>
            ) : (
              filteredAgents.map((agent) => {
                const name = agent.botUser?.displayName ?? agent.botUser?.username ?? 'Node'
                const isSelected = detailAgentId === agent.id
                const isPrivateBuddy = getAgentBuddyMode(agent) === 'private'
                return (
                  <button
                    type="button"
                    key={agent.id}
                    onClick={() => {
                      if (detailAgentId === agent.id) {
                        onSectionChange('buddies')
                      } else {
                        navigateBuddyView({ section: 'buddies', view: 'detail', agentId: agent.id })
                      }
                      setActiveListingAgent(null)
                      setGeneratedToken(null)
                    }}
                    className={cn(
                      'flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left transition-all duration-200 border',
                      isSelected
                        ? 'bg-primary/10 border-primary/30 shadow-sm'
                        : 'border-transparent hover:bg-bg-tertiary/60 hover:border-border-dim',
                    )}
                  >
                    <div className="relative">
                      <UserAvatar
                        userId={agent.botUser?.id ?? agent.userId}
                        avatarUrl={agent.botUser?.avatarUrl}
                        displayName={name}
                        size="sm"
                      />
                      <span
                        className={cn(
                          'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-bg-secondary shadow-sm',
                          getAgentOnlineDotClass(agent),
                        )}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <p
                          className={cn(
                            'text-[14px] font-bold truncate transition-colors',
                            isSelected ? 'text-primary' : 'text-text-primary',
                          )}
                        >
                          {name}
                        </p>
                        {isPrivateBuddy && (
                          <LockKeyhole
                            size={12}
                            className="shrink-0 text-warning"
                            aria-label={t('agentMgmt.modePrivate')}
                          />
                        )}
                      </div>
                      <p className="flex items-center gap-1 text-[11px] text-text-muted truncate font-mono">
                        <span>
                          {t('agentMgmt.buddyLevel', {
                            level: getBuddyLevel(agent.totalOnlineSeconds),
                          })}
                        </span>
                        {agent.totalOnlineSeconds > 0 ? (
                          <OnlineRank totalSeconds={agent.totalOnlineSeconds} />
                        ) : null}
                      </p>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Right column: Details or placeholder */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/*
         * 统一三类子页面（Buddy 详情 / 新建 / 集市）右侧内容区 padding，避免状态切换时出现视觉抖动。
         */}
        <div className="bg-[var(--glass-bg)] backdrop-blur-3xl border border-[var(--glass-line)] rounded-2xl flex-1 overflow-y-auto shadow-sm relative px-3 py-4 md:px-4 md:py-6 lg:px-5 lg:py-8">
          {effectiveSection === 'market' ? (
            <BuddyRentalsPanel />
          ) : showCreateMode ? (
            <CreateBuddyFlowPanel
              onClose={() => onSectionChange('buddies')}
              onSuccess={(agent) => {
                queryClient.invalidateQueries({ queryKey: ['agents'] })
                showMsg(t('agentMgmt.createSuccess'), true)
                void openBuddyDm(agent)
              }}
              onError={(message) => showMsg(message || t('agentMgmt.createFailed'), false)}
              t={t}
            />
          ) : isDetailMode ? (
            <div className="max-w-2xl mx-auto animate-in fade-in slide-in-from-right-4 duration-300">
              {selectedAgent ? (
                activeListingAgent ? (
                  <CreateListingPage
                    listingId={activeListingAgent.listingId}
                    defaultAgentId={activeListingAgent.agentId}
                    embedded
                    onCancel={() => setActiveListingAgent(null)}
                    onSubmitSuccess={() => {
                      setActiveListingAgent(null)
                      queryClient.invalidateQueries({ queryKey: ['agents'] })
                      queryClient.invalidateQueries({ queryKey: ['marketplace'] })
                      setMessage({
                        text: activeListingAgent.listingId
                          ? t('marketplace.listingUpdated')
                          : t('marketplace.listingCreated'),
                        success: true,
                      })
                      setTimeout(() => setMessage(null), 3000)
                      if (selectedAgent) {
                        fetchApi<Agent>(`/api/agents/${selectedAgent.id}`).then((updatedAgent) =>
                          setSelectedAgent(updatedAgent),
                        )
                      }
                    }}
                  />
                ) : (
                  <AgentDetail
                    agent={selectedAgent}
                    generatedToken={generatedToken}
                    tokenMutation={tokenMutation}
                    onCopyToken={copyToken}
                    onDelete={() => setDeleteConfirmId(selectedAgent.id)}
                    onEdit={() => setShowEdit(true)}
                    onCreateListing={() =>
                      setActiveListingAgent({
                        agentId: selectedAgent.id,
                        listingId: selectedAgent.listingInfo?.listingId,
                      })
                    }
                    onMessageOwner={() =>
                      messageOwnerMutation.mutate(selectedAgent.botUser?.id || selectedAgent.userId)
                    }
                    isMessageOwnerPending={messageOwnerMutation.isPending}
                    currentUserId={currentUserId}
                    onToggle={(agent) => toggleMutation.mutate(agent)}
                    togglePending={toggleMutation.isPending}
                    onChangeBuddyMode={(buddyMode) =>
                      buddyAccessMutation.mutate({ agentId: selectedAgent.id, buddyMode })
                    }
                    onChangeAllowedServerIds={(allowedServerIds) =>
                      buddyAccessMutation.mutate({
                        agentId: selectedAgent.id,
                        allowedServerIds,
                      })
                    }
                    buddyModePending={buddyAccessMutation.isPending}
                    allowedServersPending={buddyAccessMutation.isPending}
                    servers={servers}
                    t={t}
                  />
                )
              ) : (
                <div className="relative h-full min-h-[240px]">
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-8 animate-in fade-in duration-300">
                    <Terminal size={48} className="mx-auto mb-4" strokeWidth={1} />
                    <p className="text-sm font-black uppercase tracking-[0.2em] mb-2">
                      {t('agentMgmt.selectBuddy')}
                    </p>
                    <p className="text-xs text-text-muted">{t('agentMgmt.selectBuddyDesc')}</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 animate-in fade-in duration-300">
              <div className="text-center opacity-40">
                <Terminal size={48} className="mx-auto mb-4" strokeWidth={1} />
                <p className="text-sm font-black uppercase tracking-[0.2em] mb-2">
                  {t('agentMgmt.selectBuddy')}
                </p>
                <p className="text-xs text-text-muted">{t('agentMgmt.selectBuddyDesc')}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showEdit && selectedAgent && (
        <EditAgentDialog
          agent={selectedAgent}
          onClose={() => setShowEdit(false)}
          onSuccess={(agent) => {
            queryClient.invalidateQueries({ queryKey: ['agents'] })
            setShowEdit(false)
            setSelectedAgent(agent)
            showMsg(t('agentMgmt.editSuccess'), true)
          }}
          onError={() => showMsg(t('agentMgmt.editFailed'), false)}
          t={t}
        />
      )}

      <Modal open={!!deleteConfirmId} onClose={() => setDeleteConfirmId(null)}>
        <ModalContent maxWidth="max-w-md">
          <ModalHeader title={t('common.confirm')} closeLabel={t('common.close')} />
          <ModalBody className="py-5">
            <p className="text-sm font-bold italic text-text-muted">
              {t('agentMgmt.deleteConfirm')}
            </p>
          </ModalBody>
          <ModalFooter>
            <ModalButtonGroup>
              <Button variant="ghost" size="sm" onClick={() => setDeleteConfirmId(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
                disabled={deleteMutation.isPending}
              >
                {t('common.delete')}
              </Button>
            </ModalButtonGroup>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  )
}

function BuddyRentalsPanel() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeWorkspaceTab, setActiveWorkspaceTab] =
    useState<MarketWorkspaceSection>('marketplace')

  // Fetch contracts as tenant
  const { data: rentingContracts, isLoading: isLoadingRenting } = useQuery({
    queryKey: ['marketplace', 'contracts', 'tenant'],
    queryFn: () => fetchApi<{ contracts: Contract[] }>('/api/marketplace/contracts?role=tenant'),
  })

  // Fetch contracts as owner
  const { data: rentingOutContracts, isLoading: isLoadingOut } = useQuery({
    queryKey: ['marketplace', 'contracts', 'owner'],
    queryFn: () => fetchApi<{ contracts: Contract[] }>('/api/marketplace/contracts?role=owner'),
  })

  // Fetch my listings
  const { data: myListings, isLoading: isLoadingListings } = useQuery({
    queryKey: ['marketplace', 'my-listings'],
    queryFn: () => fetchApi<{ listings: MyListing[] }>('/api/marketplace/my-listings'),
  })

  // Toggle listing status
  const toggleMutation = useMutation({
    mutationFn: ({ id, listingStatus }: { id: string; listingStatus: string }) =>
      fetchApi(`/api/marketplace/listings/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingStatus }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace'] })
      showToast(t('marketplace.statusUpdated'), 'success')
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  // Delete listing
  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/marketplace/listings/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace'] })
      showToast(t('marketplace.listingDeleted'), 'success')
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  // Delist listing (toggle isListed to false)
  const delistMutation = useMutation({
    mutationFn: (id: string) =>
      fetchApi(`/api/marketplace/listings/${id}/toggle`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isListed: false }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace'] })
      showToast(t('marketplace.delistSuccess'), 'success')
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  // Relist listing (toggle isListed to true)
  const relistMutation = useMutation({
    mutationFn: (id: string) =>
      fetchApi(`/api/marketplace/listings/${id}/toggle`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isListed: true }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace'] })
      showToast(t('marketplace.relistSuccess'), 'success')
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  // Start chat with a rented Buddy.
  const startChatMutation = useMutation({
    mutationFn: (agentUserId: string) =>
      fetchApi<{ id: string }>('/api/channels/dm', {
        method: 'POST',
        body: JSON.stringify({ userId: agentUserId }),
      }),
    onSuccess: (data) => {
      navigate({ to: '/dm/$dmChannelId', params: { dmChannelId: data.id } })
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  const myRentedCount = rentingContracts?.contracts?.length ?? 0
  const outContractCount = rentingOutContracts?.contracts?.length ?? 0
  const myListingsCount = myListings?.listings?.length ?? 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select
          id="workspaceFilter"
          value={activeWorkspaceTab}
          onChange={(event) =>
            setActiveWorkspaceTab(event.currentTarget.value as MarketWorkspaceSection)
          }
          className="w-full md:w-auto rounded-xl border border-border-subtle bg-bg-secondary/60 px-3 py-2.5 text-sm font-black text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="marketplace">{t('marketplace.title')}</option>
          <option value="myRented">
            {t('marketplace.renting')} ({isLoadingRenting ? t('common.loading') : myRentedCount})
          </option>
          <option value="outContracts">
            {t('marketplace.outContracts')} ({isLoadingOut ? t('common.loading') : outContractCount}
            )
          </option>
          <option value="myListings">
            {t('marketplace.myListings')} (
            {isLoadingListings ? t('common.loading') : myListingsCount})
          </option>
        </select>
      </div>

      <div className="mt-4">
        {activeWorkspaceTab === 'myRented' ? (
          <RentalContractSection
            titleKey="marketplace.renting"
            contracts={rentingContracts?.contracts}
            isLoading={isLoadingRenting}
            startChatMutation={startChatMutation}
            isTenantView
            t={t}
          />
        ) : null}

        {activeWorkspaceTab === 'outContracts' ? (
          <RentalContractSection
            titleKey="marketplace.outContracts"
            contracts={rentingOutContracts?.contracts}
            isLoading={isLoadingOut}
            t={t}
          />
        ) : null}

        {activeWorkspaceTab === 'myListings' ? (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-[0.15em] text-text-secondary">
                {t('marketplace.myListings')}
              </h3>
              <Link
                to="/settings/buddy/create"
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-400 to-amber-500 text-text-primary font-bold hover:from-amber-500 hover:to-amber-600 transition-all shadow-sm hover:shadow-md"
              >
                <Store className="w-4 h-4" />
                {t('marketplace.createListing')}
              </Link>
            </div>
            <ListingsSection
              myListings={myListings}
              isLoadingListings={isLoadingListings}
              t={t}
              toggleMutation={toggleMutation}
              delistMutation={delistMutation}
              relistMutation={relistMutation}
              deleteMutation={deleteMutation}
            />
          </section>
        ) : null}

        {activeWorkspaceTab === 'marketplace' ? <BuddyMarketContent /> : null}
      </div>
    </div>
  )
}

function RentalContractSection({
  titleKey,
  contracts,
  isLoading,
  isTenantView,
  startChatMutation,
  t,
}: {
  titleKey: string
  contracts: Contract[] | undefined
  isLoading: boolean
  isTenantView?: boolean
  startChatMutation?: {
    mutate: (agentUserId: string) => void
    isPending: boolean
  }
  t: TranslateFn
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black uppercase tracking-[0.15em] text-text-secondary">
          {t(titleKey)}
        </h3>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          [0, 1, 2].map((n) => (
            <div
              key={`skel-${n}`}
              className="bg-bg-secondary/60 rounded-2xl border-2 border-border/20 p-6 animate-pulse h-28"
            />
          ))
        ) : !contracts?.length ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">📋</div>
            <p className="text-text-muted font-bold">{t('marketplace.noContracts')}</p>
          </div>
        ) : (
          contracts.map((c) => {
            const st = STATUS_STYLES[c.status] ?? STATUS_STYLES.pending!
            const isActive = c.status === 'active'
            const contractMeta =
              c.startsAt && c.expiresAt
                ? `${Math.round((new Date(c.expiresAt).getTime() - new Date(c.startsAt).getTime()) / 3600000)}h`
                : t('marketplace.unlimited')
            const priceText =
              c.pricingVersion === 2 ? `${c.baseDailyRate ?? 0} 🦐/d` : `${c.hourlyRate} 🦐/h`
            const cardAvatarUserId = c.agentUserId || c.ownerId || c.id

            return (
              <div
                key={c.id}
                className="relative overflow-hidden rounded-2xl border-2 border-border/20 bg-bg-secondary/80 backdrop-blur shadow-md hover:shadow-lg transition-all"
              >
                <div
                  className={`absolute inset-y-0 left-0 w-1 ${
                    isActive ? 'bg-success/70' : 'bg-text-muted/45'
                  }`}
                />
                <div className="pl-3">
                  <Link to={`/marketplace/contracts/${c.id}`} className="block">
                    <div className="p-5 pb-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative">
                            <UserAvatar
                              userId={cardAvatarUserId}
                              displayName={c.listing?.title || c.contractNo}
                              size="sm"
                              className={isActive ? 'ring-2 ring-success/50' : ''}
                            />
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-bg-secondary ${
                                isActive ? 'bg-success' : 'bg-text-muted/40'
                              }`}
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <span
                                className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${st.bg} ${st.text}`}
                              >
                                {t(st.labelKey)}
                              </span>
                              <span className="text-xs text-text-muted font-mono">
                                #{c.contractNo}
                              </span>
                            </div>
                            <h3 className="font-black text-base line-clamp-2">
                              {c.listing?.title || t('marketplace.unknownListing')}
                            </h3>
                            <p className="mt-1 text-xs text-text-muted">
                              {new Date(c.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <p className="text-[11px] text-text-muted font-bold uppercase tracking-[0.14em]">
                            {isActive ? t('marketplace.totalCost') : t('marketplace.expectedCost')}
                          </p>
                          <p className="text-lg font-black text-warning leading-tight">
                            {c.totalCost} 🦐
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <div className="rounded-xl border border-border-subtle bg-bg-secondary/70 p-2.5">
                          <p className="text-[10px] uppercase tracking-[0.15em] text-text-muted font-black">
                            {t('marketplace.duration')}
                          </p>
                          <div className="mt-1 inline-flex items-center gap-1.5 text-sm font-bold">
                            <Clock className="w-3.5 h-3.5" />
                            {contractMeta}
                          </div>
                        </div>
                        <div className="rounded-xl border border-border-subtle bg-bg-secondary/70 p-2.5">
                          <p className="text-[10px] uppercase tracking-[0.15em] text-text-muted font-black">
                            {t('marketplace.rate')}
                          </p>
                          <p className="mt-1 text-sm font-black">{priceText}</p>
                        </div>
                      </div>
                    </div>
                  </Link>

                  {(isActive || c.expiresAt) && (
                    <div className="px-5 pt-4 pb-3 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle">
                      <div>
                        {c.expiresAt ? (
                          <RentalCountdown expiresAt={c.expiresAt} />
                        ) : (
                          <span className="text-xs text-text-muted font-medium">
                            {t('marketplace.unlimitedUsage')}
                          </span>
                        )}
                      </div>
                      {isTenantView && c.agentUserId ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault()
                            startChatMutation?.mutate(c.agentUserId as string)
                          }}
                          disabled={!startChatMutation || startChatMutation.isPending}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-primary to-primary text-white text-sm font-bold hover:from-primary hover:to-primary transition-all shadow-md hover:shadow-lg disabled:opacity-50"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          {t('marketplace.useBuddy')}
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}

function ListingsSection({
  myListings,
  isLoadingListings,
  t,
  toggleMutation,
  delistMutation,
  relistMutation,
  deleteMutation,
}: {
  myListings: { listings: MyListing[] } | undefined
  isLoadingListings: boolean
  t: TranslateFn
  toggleMutation: { mutate: (p: { id: string; listingStatus: string }) => void }
  delistMutation: { mutate: (id: string) => void }
  relistMutation: { mutate: (id: string) => void }
  deleteMutation: { mutate: (id: string) => void }
}) {
  const [showOffline, setShowOffline] = useState(false)

  if (isLoadingListings) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map((n) => (
          <div
            key={`lskel-${n}`}
            className="bg-bg-secondary/60 rounded-2xl border-2 border-border/20 p-6 animate-pulse h-24"
          />
        ))}
      </div>
    )
  }

  if (!myListings?.listings?.length) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4">📦</div>
        <p className="text-text-muted font-bold">{t('marketplace.noListings')}</p>
      </div>
    )
  }

  const onlineListings = myListings.listings.filter((l) => isAgentOnline(l.agent))
  const offlineListings = myListings.listings.filter((l) => !isAgentOnline(l.agent))

  return (
    <div className="space-y-4">
      {onlineListings.map((l) => (
        <ListingCard
          key={l.id}
          listing={l}
          t={t}
          toggleMutation={toggleMutation}
          delistMutation={delistMutation}
          relistMutation={relistMutation}
          deleteMutation={deleteMutation}
        />
      ))}

      {offlineListings.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowOffline(!showOffline)}
            className="flex items-center gap-2 text-sm font-bold text-text-muted hover:text-text-secondary transition-colors w-full"
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform ${showOffline ? 'rotate-180' : ''}`}
            />
            {t('marketplace.offlineListings')} ({offlineListings.length})
          </button>
          {showOffline &&
            offlineListings.map((l) => (
              <ListingCard
                key={l.id}
                listing={l}
                t={t}
                toggleMutation={toggleMutation}
                delistMutation={delistMutation}
                relistMutation={relistMutation}
                deleteMutation={deleteMutation}
              />
            ))}
        </>
      )}
    </div>
  )
}

function ListingCard({
  listing: l,
  t,
  toggleMutation,
  delistMutation,
  relistMutation,
  deleteMutation,
}: {
  listing: MyListing
  t: TranslateFn
  toggleMutation: { mutate: (p: { id: string; listingStatus: string }) => void }
  delistMutation: { mutate: (id: string) => void }
  relistMutation: { mutate: (id: string) => void }
  deleteMutation: { mutate: (id: string) => void }
}) {
  const online = isAgentOnline(l.agent)

  let statusBadge: { label: string; bg: string; text: string }
  if (l.isRented) {
    statusBadge = {
      label: t('marketplace.listingRented'),
      bg: 'bg-warning/10',
      text: 'text-warning',
    }
  } else if (!l.isListed && l.listingStatus === 'active') {
    statusBadge = {
      label: t('marketplace.listingUnlisted'),
      bg: 'bg-bg-secondary',
      text: 'text-text-muted',
    }
  } else {
    const ls = LISTING_STATUS[l.listingStatus] ?? LISTING_STATUS.draft!
    statusBadge = { label: t(ls.labelKey), bg: ls.bg, text: ls.text }
  }

  return (
    <div className="bg-bg-secondary/80 backdrop-blur rounded-2xl border-2 border-border/20 shadow-md p-6">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-bold ${statusBadge.bg} ${statusBadge.text}`}
            >
              {statusBadge.label}
            </span>
            <span className="flex items-center gap-1.5 text-xs">
              <span
                className={`w-2 h-2 rounded-full ${online ? 'bg-success animate-pulse' : 'bg-text-muted/30'}`}
              />
              <span className={online ? 'text-success font-bold' : 'text-text-muted'}>
                {online ? t('marketplace.online') : t('marketplace.offline')}
              </span>
            </span>
            {l.agent?.totalOnlineSeconds ? (
              <span className="text-xs text-text-muted flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {t('marketplace.totalOnline')} {formatOnlineDuration(l.agent.totalOnlineSeconds, t)}
              </span>
            ) : null}
            <span className="text-xs text-text-muted">
              {(() => {
                const d = DEVICE_TIERS[l.deviceTier]
                return d ? `${d.icon} ${t(d.labelKey)}` : ''
              })()} · {l.osType}
            </span>
          </div>
          <h3 className="font-bold text-lg">{l.title}</h3>
          <div className="flex items-center gap-4 text-sm text-text-muted mt-1">
            <span>
              {l.pricingVersion === 2 ? `${l.baseDailyRate ?? 0} 🦐/d` : `${l.hourlyRate} 🦐/h`}
            </span>
            <span className="flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" /> {l.viewCount}
            </span>
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" /> {l.rentalCount}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {l.isRented ? null : (
            <>
              {l.listingStatus === 'active' && l.isListed && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(t('marketplace.confirmDelist'))) {
                      delistMutation.mutate(l.id)
                    }
                  }}
                  className="p-2 rounded-lg text-danger hover:bg-danger/10 transition-colors"
                  title={t('marketplace.delistBuddy')}
                >
                  <PackageMinus className="w-4 h-4" />
                </button>
              )}
              {l.listingStatus === 'active' && !l.isListed && (
                <button
                  type="button"
                  onClick={() => relistMutation.mutate(l.id)}
                  className="p-2 rounded-lg text-success hover:bg-success/10 transition-colors"
                  title={t('marketplace.relistBuddy')}
                >
                  <Play className="w-4 h-4" />
                </button>
              )}
              {l.listingStatus === 'active' && l.isListed && (
                <button
                  type="button"
                  onClick={() => toggleMutation.mutate({ id: l.id, listingStatus: 'paused' })}
                  className="p-2 rounded-lg text-warning hover:bg-warning/10 transition-colors"
                  title={t('marketplace.pause')}
                >
                  <Pause className="w-4 h-4" />
                </button>
              )}
              {l.listingStatus === 'paused' && (
                <button
                  type="button"
                  onClick={() => toggleMutation.mutate({ id: l.id, listingStatus: 'active' })}
                  className="p-2 rounded-lg text-success hover:bg-success/10 transition-colors"
                  title={t('marketplace.resume')}
                >
                  <Play className="w-4 h-4" />
                </button>
              )}
            </>
          )}
          <Link
            to={`/marketplace/edit/${l.id}`}
            className="p-2 rounded-lg text-text-muted hover:bg-bg-secondary transition-colors"
            title={t('marketplace.edit')}
          >
            <Edit className="w-4 h-4" />
          </Link>
          {(l.listingStatus === 'draft' ||
            l.listingStatus === 'paused' ||
            l.listingStatus === 'closed') && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(t('marketplace.confirmDelete'))) {
                  deleteMutation.mutate(l.id)
                }
              }}
              className="p-2 rounded-lg text-danger hover:bg-danger/10 transition-colors"
              title={t('marketplace.delete')}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function RentalCountdown({ expiresAt }: { expiresAt: string }) {
  const { t } = useTranslation()
  const [remaining, setRemaining] = useState(() => calcRemaining(expiresAt))

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining(calcRemaining(expiresAt))
    }, 1000)
    return () => clearInterval(timer)
  }, [expiresAt])

  if (remaining <= 0) {
    return <span className="text-xs font-bold text-danger">{t('marketplace.expired')}</span>
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs font-mono font-bold text-primary">
      <Clock className="w-3 h-3" />
      {formatCountdown(remaining, t)}
    </span>
  )
}

function calcRemaining(expiresAt: string): number {
  return Math.max(0, new Date(expiresAt).getTime() - Date.now())
}

function formatCountdown(ms: number, t: TranslateFn): string {
  const totalSec = Math.floor(ms / 1000)
  const d = Math.floor(totalSec / 86400)
  const h = Math.floor((totalSec % 86400) / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (d > 0) return `${d}${t('time.dayShort')} ${h}${t('time.hourShort')} ${m}${t('time.minShort')}`
  if (h > 0) return `${h}${t('time.hourShort')} ${m}${t('time.minShort')} ${s}${t('time.secShort')}`
  return `${m}${t('time.minShort')} ${s}${t('time.secShort')}`
}
