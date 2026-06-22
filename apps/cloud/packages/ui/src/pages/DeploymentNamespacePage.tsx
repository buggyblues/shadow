import {
  Badge,
  Button,
  Card,
  GlassPanel,
  Input,
  Modal,
  ModalBody,
  ModalButtonGroup,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  Textarea,
} from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import {
  Archive,
  Box,
  CheckCircle,
  ChevronRight,
  Cookie,
  DollarSign,
  Download,
  FileText,
  FolderOpen,
  GitBranch,
  Github,
  Info,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  RotateCcw,
  Save,
  Server,
  Terminal,
  Trash2,
  Upload,
  Variable,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DangerConfirmDialog } from '@/components/DangerConfirmDialog'
import { DashboardEmptyState } from '@/components/DashboardEmptyState'
import { DashboardTabsList } from '@/components/DashboardTabsList'
import { EnvVarEditorDialog } from '@/components/EnvVarEditorDialog'
import { LogsPanel } from '@/components/LogsPanel'
import { LogsPanelHeaderActions } from '@/components/LogsPanelHeaderActions'
import { MetricCardContent, MetricCardWrapper } from '@/components/MetricCard'
import { PageShell } from '@/components/PageShell'
import { StatsGrid } from '@/components/StatsGrid'
import { StatusBadge } from '@/components/StatusBadge'
import { useSSEStream } from '@/hooks/useSSEStream'
import {
  type Deployment,
  type DeploymentBackup,
  type DeploymentManifestInfo,
  type DeploymentRedeployOptions,
  type EnvVarListEntry,
  type Pod,
  type ProviderUsageSummary,
} from '@/lib/api'
import { useApiClient } from '@/lib/api-context'
import { formatDisplayCost, formatTokenCount, formatUsdCost } from '@/lib/store-data'
import { cn, formatTimestamp, getAge, isDeploymentReady } from '@/lib/utils'
import { useAppStore } from '@/stores/app'
import { useToast } from '@/stores/toast'

function getPodStatusType(status: string): 'success' | 'warning' | 'error' | 'info' {
  if (status === 'Running') return 'success'
  if (status === 'Pending') return 'warning'
  if (status === 'Failed') return 'error'
  if (status === 'Succeeded') return 'info'
  return 'warning'
}

function formatTokenLabel(value: number | null, locale: string, tokenLabel: string): string {
  if (value === null) return '—'
  return `${formatTokenCount(value, locale)} ${tokenLabel}`
}

function getWorkloadKindDisplay(
  t: (key: string, options?: Record<string, unknown>) => string,
  workloadKind?: Deployment['workloadKind'] | null,
): string {
  if (workloadKind === 'agent-sandbox') return t('deployments.workloadKindAgentRuntime')
  if (workloadKind === 'deployment' || !workloadKind) return t('deployments.workloadKindDeployment')
  return workloadKind
}

function errorDetail(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function getProviderMetricDisplay(
  provider: ProviderUsageSummary,
  options: {
    billingUnit: 'usd' | 'shrimp'
    locale: string
    tokenLabel: string
  },
): { primary: string; secondary: string | null } {
  const tokenText =
    provider.totalTokens !== null
      ? formatTokenLabel(provider.totalTokens, options.locale, options.tokenLabel)
      : null
  const usageText = provider.usageLabel ?? provider.raw ?? null

  if (options.billingUnit === 'shrimp') {
    return {
      primary: tokenText ?? usageText ?? '—',
      secondary: usageText && usageText !== tokenText ? usageText : null,
    }
  }

  const usdText = formatUsdCost(provider.amountUsd, options.locale)
  return {
    primary: usdText,
    secondary: tokenText ?? usageText,
  }
}

type CookieJarImportResult = {
  envKey: string
  value: string
  cookieCount: number
  originCount: number
  format: 'playwright' | 'netscape'
}

function parseCookieJarInput(raw: string, envKey: string): CookieJarImportResult {
  const text = raw.trim()
  if (!text) throw new Error('empty')

  try {
    const parsed = JSON.parse(text) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>
      const cookies = Array.isArray(record.cookies) ? record.cookies : []
      const origins = Array.isArray(record.origins) ? record.origins : []
      return {
        envKey,
        value: JSON.stringify({ cookies, origins }),
        cookieCount: cookies.length,
        originCount: origins.length,
        format: 'playwright',
      }
    }
    if (Array.isArray(parsed)) {
      return {
        envKey,
        value: JSON.stringify({ cookies: parsed, origins: [] }),
        cookieCount: parsed.length,
        originCount: 0,
        format: 'playwright',
      }
    }
  } catch {
    // Fall through to Netscape cookies.txt parsing.
  }

  const cookies = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const parts = line.split('\t')
      if (parts.length < 7) throw new Error('invalid')
      const [domain, _includeSubdomains, path, secure, expires, name, ...valueParts] = parts
      const expiresNumber = Number.parseInt(expires ?? '0', 10)
      return {
        name,
        value: valueParts.join('\t'),
        domain,
        path: path || '/',
        expires: Number.isFinite(expiresNumber) && expiresNumber > 0 ? expiresNumber : -1,
        httpOnly: false,
        secure: secure?.toUpperCase() === 'TRUE',
      }
    })

  if (cookies.length === 0) throw new Error('invalid')

  return {
    envKey,
    value: JSON.stringify({ cookies, origins: [] }),
    cookieCount: cookies.length,
    originCount: 0,
    format: 'netscape',
  }
}

function PodsPanel({
  namespace,
  agent,
  enabled,
  deployment,
  onResume,
  resumePending,
  resumeDisabledReason,
}: {
  namespace: string
  agent: string | null
  enabled: boolean
  deployment?: Deployment | null
  onResume?: () => void
  resumePending?: boolean
  resumeDisabledReason?: string
}) {
  const api = useApiClient()
  const { t } = useTranslation()
  const { data: pods, isLoading } = useQuery({
    queryKey: ['pods', namespace, agent],
    queryFn: () => api.deployments.pods(namespace, agent ?? ''),
    enabled: enabled && Boolean(agent),
    refetchInterval: 10_000,
  })

  if (!agent) {
    return (
      <DashboardEmptyState
        icon={Box}
        title={t('deployments.noAgentSelected')}
        cardVariant="glass"
      />
    )
  }

  if (isLoading) {
    return (
      <div className="py-10 text-center text-text-muted text-sm">
        <Loader2 size={16} className="animate-spin inline mr-2" />
        {t('common.loading')}
      </div>
    )
  }

  if (!pods || pods.length === 0) {
    const paused = deployment?.runtimeState === 'paused'
    return (
      <DashboardEmptyState
        icon={Box}
        title={
          paused ? t('deployments.pausedNoPodsTitle') : t('deployments.noPodsForAgent', { agent })
        }
        description={paused ? t('deployments.pausedNoPodsDescription') : undefined}
        action={
          paused && onResume ? (
            <Button
              type="button"
              variant="glass"
              size="sm"
              onClick={onResume}
              title={resumeDisabledReason}
              disabled={resumePending || Boolean(resumeDisabledReason)}
            >
              {resumePending ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
              {t('deployments.resumeAgent')}
            </Button>
          ) : undefined
        }
        cardVariant="glass"
      />
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">
        {t('deployments.selectedPodsCount', { count: pods.length })}
      </p>

      <Card variant="glassPanel">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-text-muted">
                {t('clusters.status')}
              </TableHead>
              <TableHead className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-text-muted">
                {t('monitoring.name')}
              </TableHead>
              <TableHead className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-text-muted">
                {t('deployments.restarts')}
              </TableHead>
              <TableHead className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-text-muted">
                {t('deployments.age')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pods.map((pod) => (
              <TableRow key={pod.name}>
                <TableCell>
                  <StatusBadge
                    dotStatus={getPodStatusType(pod.status)}
                    dotLabel={pod.status}
                    badgeVariant={pod.status === 'Running' ? 'success' : 'warning'}
                    badgeText={pod.status}
                  />
                </TableCell>
                <TableCell>{pod.name}</TableCell>
                <TableCell>{pod.restarts}</TableCell>
                <TableCell>{getAge(pod.age)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

function BackupsPanel({
  namespace,
  agent,
  deployment,
}: {
  namespace: string
  agent: string | null
  deployment?: Deployment | null
}) {
  const api = useApiClient()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [restoreCandidate, setRestoreCandidate] = useState<DeploymentBackup | null>(null)
  const [fastBackupPolling, setFastBackupPolling] = useState(false)
  const [backupTarget, setBackupTarget] = useState<'system' | 'github'>('system')
  const [githubConnectionId, setGithubConnectionId] = useState('')
  const [githubRepository, setGithubRepository] = useState('')
  const [githubBranch, setGithubBranch] = useState('main')
  const [githubPathPrefix, setGithubPathPrefix] = useState('shadow-backups')
  const [githubToken, setGithubToken] = useState('')
  const [githubConnectOpen, setGithubConnectOpen] = useState(false)
  const [githubAdvancedOpen, setGithubAdvancedOpen] = useState(false)

  const githubConnectionsQuery = useQuery({
    queryKey: ['github-connections'],
    queryFn: api.github.connections,
  })
  const githubConnections = githubConnectionsQuery.data?.connections ?? []
  const selectedGithubConnectionId = githubConnectionId || githubConnections[0]?.id || ''
  const githubRepositoriesQuery = useQuery({
    queryKey: ['github-repositories', selectedGithubConnectionId],
    queryFn: () => api.github.repositories(selectedGithubConnectionId),
    enabled: backupTarget === 'github' && Boolean(selectedGithubConnectionId),
  })
  const githubRepositories = githubRepositoriesQuery.data?.repositories ?? []
  const backupRepositoryOptions = useMemo(() => {
    const writable = githubRepositories.filter((repo) => repo.permissions?.push)
    return writable.length > 0 ? writable : githubRepositories
  }, [githubRepositories])

  useEffect(() => {
    if (!githubConnectionId && githubConnections[0]?.id) {
      setGithubConnectionId(githubConnections[0].id)
    }
  }, [githubConnectionId, githubConnections])

  useEffect(() => {
    if (backupTarget !== 'github' || githubRepository || backupRepositoryOptions.length === 0) {
      return
    }
    const repo = backupRepositoryOptions[0]
    setGithubRepository(repo.repository)
    if (repo.defaultBranch) setGithubBranch(repo.defaultBranch)
  }, [backupRepositoryOptions, backupTarget, githubRepository])

  const backupsQuery = useQuery({
    queryKey: ['deployment-backups', namespace, agent],
    queryFn: () => api.deployments.backups(namespace, agent ?? ''),
    enabled: Boolean(agent),
    refetchInterval: fastBackupPolling ? 3_000 : 15_000,
  })

  const backupMutation = useMutation({
    mutationFn: () =>
      api.deployments.createBackup(
        namespace,
        agent ?? '',
        backupTarget === 'github'
          ? {
              target: {
                type: 'github',
                repository: githubRepository.trim(),
                branch: githubBranch.trim() || undefined,
                pathPrefix: githubPathPrefix.trim() || undefined,
                ...(selectedGithubConnectionId
                  ? { connectionId: selectedGithubConnectionId }
                  : { token: githubToken.trim() }),
              },
            }
          : undefined,
      ),
    onSuccess: () => {
      setFastBackupPolling(true)
      setGithubToken('')
      toast.success(t('deployments.backupCreated'))
    },
    onError: (err) => toast.error(`${t('deployments.backupFailed')}: ${errorDetail(err)}`),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['deployment-backups', namespace, agent] })
    },
  })

  const githubConnectMutation = useMutation({
    mutationFn: () => api.github.connect({ token: githubToken.trim() }),
    onSuccess: (result) => {
      setGithubConnectionId(result.connection.id)
      setGithubToken('')
      setGithubConnectOpen(false)
      queryClient.invalidateQueries({ queryKey: ['github-connections'] })
      toast.success(t('deployments.githubConnected'))
    },
    onError: (err) => toast.error(`${t('deployments.githubConnectFailed')}: ${errorDetail(err)}`),
  })

  const restoreMutation = useMutation({
    mutationFn: (backup: DeploymentBackup) =>
      api.deployments.restore(namespace, agent ?? '', {
        backupId: backup.restoreKey ?? backup.id,
        ...(backup.driver === 'git' && selectedGithubConnectionId
          ? { target: { type: 'github' as const, connectionId: selectedGithubConnectionId } }
          : {}),
      }),
    onSuccess: () => {
      setFastBackupPolling(true)
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      queryClient.invalidateQueries({ queryKey: ['pods', namespace, agent] })
      queryClient.invalidateQueries({ queryKey: ['deployment-backups', namespace, agent] })
      setRestoreCandidate(null)
      toast.success(t('deployments.restoreQueued'))
    },
    onError: (err) => toast.error(`${t('deployments.restoreFailed')}: ${errorDetail(err)}`),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['deployment-backups', namespace, agent] })
    },
  })

  const backups: DeploymentBackup[] = backupsQuery.data?.backups ?? []
  const hasGitBackups = backups.some((backup) => backup.driver === 'git')
  const hasActiveBackupOperation = backups.some(
    (backup) => backup.status === 'pending' || backup.status === 'running',
  )
  useEffect(() => {
    setFastBackupPolling(hasActiveBackupOperation)
  }, [hasActiveBackupOperation])
  const backupAllowed = deployment?.status
    ? deployment.status === 'deployed' || deployment.status === 'paused'
    : deployment?.runtimeState === 'running' || deployment?.runtimeState === 'paused'
  const backupDisabledReason = !backupAllowed
    ? t('deployments.backupUnavailableRuntime')
    : hasActiveBackupOperation
      ? t('deployments.backupUnavailableActiveOperation')
      : backupTarget === 'github' && !selectedGithubConnectionId
        ? t('deployments.githubBackupConnectionRequired')
        : backupTarget === 'github' && githubRepositoriesQuery.isLoading
          ? t('common.loading')
          : backupTarget === 'github' && !githubRepository.trim()
            ? t('deployments.githubBackupRepositoryRequired')
            : null

  if (!agent) {
    return (
      <DashboardEmptyState
        icon={Archive}
        title={t('deployments.noAgentSelected')}
        cardVariant="glass"
      />
    )
  }

  const backupArtifact = (backup: DeploymentBackup) => backup.snapshotName ?? backup.objectKey
  const backupDriverLabel = (driver: string) => {
    if (driver === 'git') return t('deployments.backupDriverGit')
    if (driver === 'restic') return t('deployments.backupDriverObject')
    if (driver === 'volumeSnapshot') return t('deployments.backupDriverVolumeSnapshot')
    return driver
  }
  const backupStatusLabel = (status: string) => {
    if (status === 'pending') return t('deployments.backupStatusPending')
    if (status === 'running') return t('deployments.backupStatusRunning')
    if (status === 'succeeded') return t('deployments.backupStatusSucceeded')
    if (status === 'failed') return t('deployments.backupStatusFailed')
    if (status === 'expired') return t('deployments.backupStatusExpired')
    return status
  }
  const backupPhaseLabel = (phase: string | null | undefined) => {
    if (!phase) return null
    if (phase === 'completed' || phase === 'failed') return null
    if (phase === 'queued') return t('deployments.backupPhaseQueued')
    if (phase === 'checking-snapshot-api') return t('deployments.backupPhaseCheckingSnapshotApi')
    if (phase === 'snapshot-creating') return t('deployments.backupPhaseSnapshotCreating')
    if (phase === 'snapshot-waiting') return t('deployments.backupPhaseSnapshotWaiting')
    if (phase === 'object-archiving') return t('deployments.backupPhaseObjectArchiving')
    if (phase === 'object-storing') return t('deployments.backupPhaseObjectStoring')
    if (phase === 'git-cloning') return t('deployments.backupPhaseGitCloning')
    if (phase === 'git-pushing') return t('deployments.backupPhaseGitPushing')
    if (phase === 'restoring-pausing') return t('deployments.backupPhaseRestoringPausing')
    if (phase === 'restoring-pvc') return t('deployments.backupPhaseRestoringPvc')
    if (phase === 'restoring-resuming') return t('deployments.backupPhaseRestoringResuming')
    if (phase === 'restore-failed') return t('deployments.backupPhaseRestoreFailed')
    return phase
  }
  const restoreDisabledReason = (backup: DeploymentBackup, artifact: string | null) => {
    if (restoreMutation.isPending) return t('deployments.restoreUnavailableActiveOperation')
    if (backup.status !== 'succeeded') {
      return t('deployments.restoreUnavailableStatus', {
        status: backupStatusLabel(backup.status),
      })
    }
    if (!artifact) return t('deployments.restoreUnavailableArtifact')
    if (backup.driver === 'git' && !selectedGithubConnectionId) {
      return t('deployments.githubConnectionRequired')
    }
    return undefined
  }
  const renderRestoreButton = (
    backup: DeploymentBackup,
    artifact: string | null,
    className?: string,
  ) => {
    const disabledReason = restoreDisabledReason(backup, artifact)
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={className}
        title={disabledReason}
        onClick={() => setRestoreCandidate(backup)}
        disabled={Boolean(disabledReason)}
      >
        {restoreMutation.isPending && restoreCandidate?.id === backup.id ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <RotateCcw size={12} />
        )}
        {t('deployments.restoreBackup')}
      </Button>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-text-primary">{t('deployments.backupsTitle')}</p>
          <p className="mt-1 text-xs text-text-muted">
            {t('deployments.backupsDescription', { agent })}
          </p>
        </div>
        <Button
          type="button"
          variant="glass"
          size="sm"
          onClick={() => backupMutation.mutate()}
          title={backupDisabledReason ?? undefined}
          disabled={backupMutation.isPending || Boolean(backupDisabledReason)}
        >
          {backupMutation.isPending ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Download size={12} />
          )}
          {t('deployments.createBackup')}
        </Button>
      </div>
      <Card variant="glassPanel" className="space-y-3 p-4">
        <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted">
              {t('deployments.backupTarget')}
            </label>
            <Select
              value={backupTarget}
              onValueChange={(value) => setBackupTarget(value === 'github' ? 'github' : 'system')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">
                  <Archive size={12} />
                  {t('deployments.backupTargetSystem')}
                </SelectItem>
                <SelectItem value="github">
                  <Github size={12} />
                  {t('deployments.backupTargetGithub')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {backupTarget === 'github' ? (
            <div className="grid gap-3 md:grid-cols-2">
              {githubConnections.length > 0 ? (
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className="block text-xs font-medium text-text-muted">
                      {t('deployments.githubConnection')}
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => setGithubConnectOpen((open) => !open)}
                    >
                      <Github size={12} />
                      {t('deployments.githubConnectAnother')}
                    </Button>
                  </div>
                  <Select value={selectedGithubConnectionId} onValueChange={setGithubConnectionId}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('deployments.githubConnectionPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {githubConnections.map((connection) => (
                        <SelectItem key={connection.id} value={connection.id}>
                          <Github size={12} />
                          {connection.name || connection.accountLogin}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {githubConnections.length === 0 || githubConnectOpen ? (
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-text-muted">
                    {t('deployments.githubBackupToken')}
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      type="password"
                      value={githubToken}
                      onChange={(event) => setGithubToken(event.target.value)}
                      placeholder={
                        selectedGithubConnectionId
                          ? t('deployments.githubBackupTokenOptionalPlaceholder')
                          : t('deployments.githubBackupTokenPlaceholder')
                      }
                      autoComplete="new-password"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => githubConnectMutation.mutate()}
                      disabled={!githubToken.trim() || githubConnectMutation.isPending}
                      loading={githubConnectMutation.isPending}
                    >
                      <Github size={12} />
                      {t('deployments.githubConnect')}
                    </Button>
                  </div>
                </div>
              ) : null}
              {selectedGithubConnectionId ? (
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-text-muted">
                    {t('deployments.githubBackupRepository')}
                  </label>
                  {githubRepositoriesQuery.isLoading ? (
                    <div className="flex min-h-10 items-center gap-2 rounded-lg border border-border-subtle bg-bg-secondary/40 px-3 text-text-muted text-sm">
                      <Loader2 size={14} className="animate-spin" />
                      {t('deployments.githubRepositoryLoading')}
                    </div>
                  ) : backupRepositoryOptions.length > 0 ? (
                    <Select
                      value={githubRepository}
                      onValueChange={(value) => {
                        setGithubRepository(value)
                        const repo = backupRepositoryOptions.find(
                          (item) => item.repository === value,
                        )
                        if (repo?.defaultBranch) setGithubBranch(repo.defaultBranch)
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={t('deployments.githubBackupRepositoryPlaceholder')}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {backupRepositoryOptions.map((repo) => (
                          <SelectItem key={repo.repository} value={repo.repository}>
                            <Github size={12} />
                            {repo.repository}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={githubRepository}
                      onChange={(event) => setGithubRepository(event.target.value)}
                      placeholder={
                        githubRepositoriesQuery.isError
                          ? t('deployments.githubRepositoryFallbackPlaceholder')
                          : t('deployments.githubBackupRepositoryPlaceholder')
                      }
                      autoComplete="off"
                    />
                  )}
                </div>
              ) : (
                <div className="md:col-span-2 rounded-lg border border-border-subtle bg-bg-secondary/40 px-3 py-3 text-text-muted text-sm">
                  {t('deployments.githubBackupConnectFirst')}
                </div>
              )}
              <div className="md:col-span-2 text-text-muted text-xs">
                {t('deployments.githubBackupEncryptedDescription')}
              </div>
              <div className="md:col-span-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="px-0"
                  onClick={() => setGithubAdvancedOpen((open) => !open)}
                >
                  <ChevronRight
                    size={14}
                    className={cn('transition-transform', githubAdvancedOpen && 'rotate-90')}
                  />
                  {t('deployments.githubAdvancedSettings')}
                </Button>
              </div>
              {githubAdvancedOpen ? (
                <div className="grid gap-3 md:col-span-2 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-text-muted">
                      {t('deployments.githubBackupBranch')}
                    </label>
                    <Input
                      value={githubBranch}
                      onChange={(event) => setGithubBranch(event.target.value)}
                      placeholder="main"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-text-muted">
                      {t('deployments.githubBackupPathPrefix')}
                    </label>
                    <Input
                      value={githubPathPrefix}
                      onChange={(event) => setGithubPathPrefix(event.target.value)}
                      placeholder="shadow-backups"
                      autoComplete="off"
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex min-h-[68px] items-center text-text-muted text-xs">
              {t('deployments.backupTargetSystemDescription')}
            </div>
          )}
        </div>
      </Card>
      {hasGitBackups && !selectedGithubConnectionId && backupTarget !== 'github' ? (
        <Card variant="glassPanel" className="space-y-3 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
            <Github size={14} />
            {t('deployments.githubRestoreConnectionTitle')}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted">
              {t('deployments.githubBackupToken')}
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                type="password"
                value={githubToken}
                onChange={(event) => setGithubToken(event.target.value)}
                placeholder={t('deployments.githubBackupTokenPlaceholder')}
                autoComplete="new-password"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => githubConnectMutation.mutate()}
                disabled={!githubToken.trim() || githubConnectMutation.isPending}
                loading={githubConnectMutation.isPending}
              >
                <Github size={12} />
                {t('deployments.githubConnect')}
              </Button>
            </div>
          </div>
        </Card>
      ) : null}
      {backupDisabledReason ? (
        <p className="text-text-muted text-xs">{backupDisabledReason}</p>
      ) : null}
      {hasActiveBackupOperation ? (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-warning text-xs">
          <Loader2 size={13} className="mt-0.5 shrink-0 animate-spin" />
          <span>{t('deployments.backupActiveOperation')}</span>
        </div>
      ) : null}

      {backupsQuery.isLoading ? (
        <div className="py-10 text-center text-text-muted text-sm">
          <Loader2 size={16} className="animate-spin inline mr-2" />
          {t('common.loading')}
        </div>
      ) : backups.length === 0 ? (
        <DashboardEmptyState
          icon={Archive}
          title={t('deployments.noBackups')}
          cardVariant="glass"
        />
      ) : (
        <>
          <div className="space-y-3 lg:hidden">
            {backups.map((backup) => {
              const artifact = backupArtifact(backup)
              const phase = backupPhaseLabel(backup.phase)
              return (
                <Card key={backup.id} variant="glassPanel" className="space-y-3 p-4">
                  <div className="space-y-3">
                    <div className="min-w-0">
                      <Badge
                        variant={
                          backup.status === 'succeeded'
                            ? 'success'
                            : backup.status === 'failed'
                              ? 'danger'
                              : 'warning'
                        }
                        size="sm"
                      >
                        {backupStatusLabel(backup.status)}
                      </Badge>
                      <p className="mt-2 text-text-muted text-xs">
                        {backupDriverLabel(backup.driver)}
                      </p>
                      {phase ? (
                        <p className="mt-1 text-text-muted text-xs">
                          {t('deployments.backupPhase', { phase })}
                        </p>
                      ) : null}
                    </div>
                    {renderRestoreButton(backup, artifact, 'w-full justify-center')}
                  </div>
                  <dl className="space-y-2 text-xs">
                    <div>
                      <dt className="text-text-muted">{t('deployments.backupPvc')}</dt>
                      <dd
                        className="mt-1 truncate font-mono text-text-primary"
                        title={backup.pvcName}
                      >
                        {backup.pvcName}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-text-muted">{t('deployments.backupSnapshot')}</dt>
                      <dd
                        className="mt-1 truncate font-mono text-text-primary"
                        title={artifact ?? undefined}
                      >
                        {artifact ?? t('common.none')}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-text-muted">{t('deployments.backupCreatedAt')}</dt>
                      <dd className="mt-1 text-text-primary">
                        {formatTimestamp(backup.createdAt)}
                      </dd>
                      {backup.updatedAt ? (
                        <dd className="mt-1 text-text-muted">
                          {t('deployments.backupUpdatedAt')}: {formatTimestamp(backup.updatedAt)}
                        </dd>
                      ) : null}
                    </div>
                  </dl>
                  {backup.error ? (
                    <p className="break-words text-danger text-xs">{backup.error}</p>
                  ) : null}
                </Card>
              )
            })}
          </div>
          <Card variant="glassPanel" className="hidden overflow-x-auto lg:block">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-text-muted">
                    {t('deployments.backupStatus')}
                  </TableHead>
                  <TableHead className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-text-muted">
                    {t('deployments.backupDriver')}
                  </TableHead>
                  <TableHead className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-text-muted">
                    {t('deployments.backupPvc')}
                  </TableHead>
                  <TableHead className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-text-muted">
                    {t('deployments.backupSnapshot')}
                  </TableHead>
                  <TableHead className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-text-muted">
                    {t('deployments.backupCreatedAt')}
                  </TableHead>
                  <TableHead className="text-right text-[0.72rem] font-bold uppercase tracking-[0.08em] text-text-muted">
                    {t('deployments.backupActions')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {backups.map((backup) => {
                  const artifact = backupArtifact(backup)
                  const phase = backupPhaseLabel(backup.phase)
                  return (
                    <TableRow key={backup.id}>
                      <TableCell>
                        <Badge
                          variant={
                            backup.status === 'succeeded'
                              ? 'success'
                              : backup.status === 'failed'
                                ? 'danger'
                                : 'warning'
                          }
                          size="sm"
                        >
                          {backupStatusLabel(backup.status)}
                        </Badge>
                        {backup.error ? (
                          <p className="mt-1 max-w-[18rem] break-words text-danger text-xs">
                            {backup.error}
                          </p>
                        ) : null}
                        {phase ? (
                          <p className="mt-1 text-text-muted text-xs">
                            {t('deployments.backupPhase', { phase })}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell>{backupDriverLabel(backup.driver)}</TableCell>
                      <TableCell className="font-mono text-xs">
                        <span title={backup.pvcName} className="block max-w-[12rem] truncate">
                          {backup.pvcName}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {artifact ? (
                          <span title={artifact} className="block max-w-[18rem] truncate">
                            {artifact}
                          </span>
                        ) : (
                          t('common.none')
                        )}
                      </TableCell>
                      <TableCell>
                        <span>{formatTimestamp(backup.createdAt)}</span>
                        {backup.updatedAt ? (
                          <span className="mt-1 block text-text-muted text-xs">
                            {t('deployments.backupUpdatedAt')}: {formatTimestamp(backup.updatedAt)}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">
                        {renderRestoreButton(backup, artifact)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      <DangerConfirmDialog
        open={Boolean(restoreCandidate)}
        onOpenChange={(open) => {
          if (!open && !restoreMutation.isPending) setRestoreCandidate(null)
        }}
        title={t('deployments.restoreBackupConfirmTitle')}
        description={
          restoreCandidate
            ? t('deployments.restoreBackupConfirmDescription', {
                artifact: backupArtifact(restoreCandidate),
                pvc: restoreCandidate.pvcName,
              })
            : ''
        }
        confirmText={t('deployments.restoreBackupConfirmAction')}
        cancelText={t('common.cancel')}
        loading={restoreMutation.isPending}
        onConfirm={() => {
          if (restoreCandidate) restoreMutation.mutate(restoreCandidate)
        }}
      />
    </div>
  )
}

function NamespaceLogsTab({
  namespace,
  agent,
  deployment,
  deployments,
  onSelectAgent,
  onResume,
  resumePending,
  resumeDisabledReason,
}: {
  namespace: string
  agent: string | null
  deployment?: Deployment | null
  deployments: Deployment[]
  onSelectAgent: (agent: string) => void
  onResume?: () => void
  resumePending?: boolean
  resumeDisabledReason?: string
}) {
  const api = useApiClient()
  const { t } = useTranslation()
  const logRef = useRef<HTMLDivElement>(null)
  const {
    lines,
    entries: liveEntries,
    status,
    error,
    connect,
    disconnect,
    clear,
  } = useSSEStream({
    maxLines: 4000,
  })
  const [logMode, setLogMode] = useState<'recent' | 'live'>('recent')
  const [showLogTimestamps, setShowLogTimestamps] = useState(false)
  const isLiveMode = logMode === 'live'
  type NamespaceLogLine = string | { text: string; createdAt: string }

  const {
    data: history,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['deployment-log-history', namespace, logMode],
    queryFn: () => api.deployments.logsHistory(namespace, ''),
    enabled: logMode === 'recent' && deployments.length > 0,
  })

  useEffect(() => {
    disconnect()
    clear()
  }, [agent, namespace, disconnect, clear])

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [lines.length])

  const connected = status === 'connecting' || status === 'connected'
  const liveLines = useMemo(
    () =>
      liveEntries.map((entry) => ({
        text: entry.text.startsWith('i18n:') ? t(entry.text.slice(5)) : entry.text,
        createdAt: entry.createdAt,
      })),
    [liveEntries, t],
  )
  const recentLines = isLoading || !history ? [] : history.lines
  const linesToShow = isLiveMode ? liveLines : recentLines

  const getLineText = (line: NamespaceLogLine): string =>
    typeof line === 'string' ? line : line.text

  const handleConnect = () => {
    if (!agent) return
    connect(api.deployments.logsUrl(namespace, agent))
  }

  const handleDownload = () => {
    if (linesToShow.length === 0) return
    const content = linesToShow.map(getLineText).join('\n')
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${namespace}-${isLiveMode ? (agent ?? 'live') : 'recent'}-${Date.now()}.log`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  if (deployments.length === 0) {
    return (
      <DashboardEmptyState
        icon={FileText}
        cardVariant="glass"
        title={t('deployments.noDeploymentsInNamespace')}
        description={t('deployments.noDeploymentsInNamespaceDescription', { namespace })}
      />
    )
  }

  return (
    <div className="space-y-6 min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="shrink-0">
          <Tabs value={logMode} onChange={(value) => setLogMode(value as 'recent' | 'live')}>
            <DashboardTabsList
              className="w-fit"
              activeId={logMode}
              onSelect={(value) => setLogMode(value as 'recent' | 'live')}
              tabs={[
                { id: 'recent', label: t('deployments.recentLogs') },
                { id: 'live', label: t('deployments.liveLogs') },
              ]}
            />
          </Tabs>
        </div>

        <div className="ml-auto flex shrink-0 flex-col justify-end gap-2">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {isLiveMode ? (
              <Select
                value={agent ?? ''}
                onValueChange={(value) => {
                  onSelectAgent(value)
                }}
              >
                <SelectTrigger className="w-[240px]">
                  <SelectValue placeholder={t('deployments.agentSelector')} />
                </SelectTrigger>
                <SelectContent>
                  {deployments.map((deployment) => (
                    <SelectItem
                      key={`${deployment.namespace}/${deployment.name}`}
                      value={deployment.name}
                    >
                      {deployment.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
        </div>
      </div>

      {deployment?.runtimeState === 'paused' && (
        <div className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-warning sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Pause size={14} className="mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold">{t('deployments.pausedLogsTitle')}</p>
              <p className="mt-1 text-xs text-warning/80">
                {t('deployments.pausedLogsDescription')}
              </p>
            </div>
          </div>
          {onResume ? (
            <Button
              type="button"
              variant="glass"
              size="sm"
              onClick={onResume}
              title={resumeDisabledReason}
              disabled={resumePending || Boolean(resumeDisabledReason)}
              className="self-start sm:self-center"
            >
              {resumePending ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
              {t('deployments.resumeAgent')}
            </Button>
          ) : null}
        </div>
      )}

      {error && logMode === 'live' && (
        <div className="rounded-lg border border-danger/25 bg-danger/8 px-4 py-3 text-xs text-danger">
          {error}
        </div>
      )}

      <LogsPanel
        headerLeft={
          <div>
            <p className="text-xs text-text-muted">
              {namespace}
              {history?.podName ? ` · ${history.podName}` : ''}
              {isLiveMode && agent ? ` / ${agent}` : ''}
            </p>
          </div>
        }
        headerRight={
          <LogsPanelHeaderActions
            showTimestampsToggle={false}
            showTimestamps={showLogTimestamps}
            onShowTimestampsChange={setShowLogTimestamps}
            showTimestampsLabel={t('deploy.showTimestamps')}
            hideTimestampsLabel={t('deploy.hideTimestamps')}
            actions={[
              ...(isLiveMode && (liveLines.length > 0 || connected)
                ? [
                    {
                      id: 'clear',
                      type: 'button' as const,
                      icon: <XCircle size={11} />,
                      label: t('common.clearAll'),
                      onClick: () => {
                        disconnect()
                        clear()
                      },
                    },
                  ]
                : []),
              {
                id: isLiveMode ? 'stream' : 'refresh',
                type: 'toolbar' as const,
                icon: (
                  <RefreshCw size={12} className={isLiveMode && connected ? 'animate-spin' : ''} />
                ),
                label: isLiveMode
                  ? connected
                    ? t('deployments.streaming')
                    : t('deployments.connectLogs')
                  : t('common.refresh'),
                onClick: isLiveMode ? handleConnect : () => void refetch(),
                variant: isLiveMode ? (connected ? 'secondary' : 'primary') : 'ghost',
              },
              {
                id: 'download',
                type: 'toolbar' as const,
                icon: <Download size={12} />,
                label: t('deploy.download'),
                onClick: handleDownload,
                variant: 'ghost',
              },
            ]}
          />
        }
        lines={linesToShow}
        showTimestamps={showLogTimestamps}
        footerRight={
          isLiveMode ? (
            <LogsPanelHeaderActions
              showTimestamps={showLogTimestamps}
              onShowTimestampsChange={setShowLogTimestamps}
              showTimestampsLabel={t('deploy.showTimestamps')}
              hideTimestampsLabel={t('deploy.hideTimestamps')}
            />
          ) : null
        }
        emptyText={
          isLiveMode
            ? connected
              ? t('deployments.waitingForLogs')
              : t('deployments.connectLiveLogs')
            : isLoading
              ? t('common.loading')
              : t('deployments.noLogsYet')
        }
        bodyRef={logRef}
        collapseRepeats
        footerLeft={<span>{t('deploy.logLinesReceived', { count: linesToShow.length })}</span>}
        bodyClassName="max-h-[16rem]"
      />
    </div>
  )
}

function CookieJarImportDialog({
  isSubmitting,
  onClose,
  onImport,
}: {
  isSubmitting: boolean
  onClose: () => void
  onImport: (data: CookieJarImportResult) => void
}) {
  const { t } = useTranslation()
  const [envKey, setEnvKey] = useState('AGENT_BROWSER_STORAGE_STATE_JSON')
  const [raw, setRaw] = useState('')
  const [error, setError] = useState<string | null>(null)

  const parsed = useMemo(() => {
    try {
      return raw.trim() ? parseCookieJarInput(raw, envKey.trim()) : null
    } catch {
      return null
    }
  }, [envKey, raw])

  useEffect(() => {
    setError(null)
  }, [envKey, raw])

  const handleImport = () => {
    try {
      const result = parseCookieJarInput(raw, envKey.trim())
      setError(null)
      onImport(result)
    } catch {
      setError(t('deployments.cookieJarInvalid'))
    }
  }

  const handleFile = async (file: File | null | undefined) => {
    if (!file) return
    setRaw(await file.text())
  }

  return (
    <Modal open onClose={onClose}>
      <ModalContent maxWidth="max-w-2xl">
        <ModalHeader
          icon={<Cookie size={18} />}
          title={t('deployments.cookieJarImportTitle')}
          subtitle={t('deployments.cookieJarImportDescription')}
          onClose={onClose}
        />
        <ModalBody>
          <Input
            label={t('deployments.cookieJarEnvKey')}
            value={envKey}
            onChange={(event) => setEnvKey(event.target.value)}
            placeholder="AGENT_BROWSER_STORAGE_STATE_JSON"
          />
          <div className="space-y-1.5">
            <p className="ml-1 text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted">
              {t('deployments.cookieJarFile')}
            </p>
            <Input
              type="file"
              accept=".json,.txt"
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
          </div>
          <div className="space-y-1.5">
            <p className="ml-1 text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted">
              {t('deployments.cookieJarPaste')}
            </p>
            <Textarea
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              placeholder={t('deployments.cookieJarPastePlaceholder')}
              className="min-h-[220px] font-mono text-xs"
              error={Boolean(error)}
            />
            {error ? (
              <p className="text-xs text-danger">{error}</p>
            ) : parsed ? (
              <p className="text-xs text-text-muted">
                {t('deployments.cookieJarParsed', {
                  format: parsed.format,
                  cookies: parsed.cookieCount,
                  origins: parsed.originCount,
                })}
              </p>
            ) : (
              <p className="text-xs text-text-muted">{t('deployments.cookieJarFormats')}</p>
            )}
          </div>
        </ModalBody>
        <ModalFooter>
          <ModalButtonGroup>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={!raw.trim() || !envKey.trim() || isSubmitting}
              onClick={handleImport}
            >
              {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {t('deployments.cookieJarImportAction')}
            </Button>
          </ModalButtonGroup>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

function NamespaceEnvironmentTab({ namespace }: { namespace: string }) {
  const api = useApiClient()
  const { t } = useTranslation()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | 'cookie' | null>(null)
  const [editEntry, setEditEntry] = useState<{
    key: string
    value: string
    isSecret: boolean
  } | null>(null)
  const [deleteKey, setDeleteKey] = useState<string | null>(null)

  const scopedQuery = useQuery({
    queryKey: ['deployment-env', namespace, 'scoped'],
    queryFn: () => api.deployments.env.list(namespace, 'scoped'),
  })

  const effectiveQuery = useQuery({
    queryKey: ['deployment-env', namespace, 'effective'],
    queryFn: () => api.deployments.env.list(namespace, 'effective'),
  })

  const scopedEntries = scopedQuery.data?.envVars ?? []
  const fallbackEntries = useMemo(() => {
    const scopedScope = scopedQuery.data?.scope
    return (effectiveQuery.data?.envVars ?? []).filter((entry) => entry.scope !== scopedScope)
  }, [effectiveQuery.data?.envVars, scopedQuery.data?.scope])

  const saveMutation = useMutation({
    mutationFn: async (form: { key: string; value: string; isSecret: boolean }) => {
      await api.deployments.env.upsert(namespace, form.key, form.value, form.isSecret)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['deployment-env', namespace],
      })
      setDialogMode(null)
      setEditEntry(null)
      toast.success(t('secrets.valueSaved'))
    },
    onError: () => toast.error(t('secrets.valueSaveFailed')),
  })

  const deleteMutation = useMutation({
    mutationFn: (key: string) => api.deployments.env.delete(namespace, key),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['deployment-env', namespace],
      })
      setDeleteKey(null)
      toast.success(t('secrets.valueDeleted'))
    },
    onError: () => toast.error(t('secrets.valueDeleteFailed')),
  })

  const cookieJarMutation = useMutation({
    mutationFn: async (data: CookieJarImportResult) => {
      await api.deployments.env.upsert(namespace, data.envKey, data.value, true)
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['deployment-env', namespace],
      })
      setDialogMode(null)
      toast.success(
        t('deployments.cookieJarImported', {
          key: data.envKey,
          cookies: data.cookieCount,
        }),
      )
    },
    onError: () => toast.error(t('deployments.cookieJarImportFailed')),
  })

  const handleEditStart = async (entry: EnvVarListEntry) => {
    try {
      const { envVar } = await api.deployments.env.getOne(namespace, entry.key)
      setEditEntry({
        key: envVar.key,
        value: envVar.value,
        isSecret: envVar.isSecret,
      })
      setDialogMode('edit')
    } catch {
      toast.error(t('secrets.valueLoadFailed'))
    }
  }

  if (scopedQuery.isLoading || effectiveQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-14 text-text-muted text-sm">
        <Loader2 size={16} className="animate-spin mr-2" />
        {t('common.loading')}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card variant="glassPanel" className="p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-text-primary">
            <Variable size={14} className="text-primary" />
            {t('deployments.envGuideScopedTitle')}
          </div>
          <p className="text-xs leading-relaxed text-text-muted">
            {t('deployments.envGuideScopedDescription')}
          </p>
        </Card>
        <Card variant="glassPanel" className="p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-text-primary">
            <GitBranch size={14} className="text-accent" />
            {t('deployments.envGuideGlobalTitle')}
          </div>
          <p className="text-xs leading-relaxed text-text-muted">
            {t('deployments.envGuideGlobalDescription')}
          </p>
        </Card>
        <Card variant="glassPanel" className="p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary">
            <Cookie size={14} className="text-warning" />
            {t('deployments.cookieJarTitle')}
          </div>
          <p className="mb-3 text-xs leading-relaxed text-text-muted">
            {t('deployments.cookieJarDescription')}
          </p>
          <button
            type="button"
            onPointerDown={() => setDialogMode('cookie')}
            onClick={() => setDialogMode('cookie')}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-4 text-xs font-black uppercase tracking-widest text-text-primary shadow-[0_8px_32px_rgba(0,0,0,0.1),inset_0_1px_1px_rgba(255,255,255,0.05)] transition-all hover:-translate-y-0.5 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10"
          >
            <Upload size={12} />
            {t('deployments.cookieJarImportAction')}
          </button>
        </Card>
      </div>

      <div>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              {t('deployments.scopedEnvTitle')}
            </h3>
            <p className="text-xs text-text-muted">{t('deployments.scopedEnvDescription')}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              onPointerDown={() => setDialogMode('cookie')}
              onClick={() => setDialogMode('cookie')}
              variant="glass"
              size="sm"
              className="transition-[background-color,border-color,color,box-shadow,transform] duration-[160ms] ease active:translate-y-[0.5px] focus-visible:outline-none"
            >
              <Upload size={11} />
              {t('deployments.cookieJarImportAction')}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setEditEntry(null)
                setDialogMode('create')
              }}
              variant="primary"
              size="sm"
              className="transition-[background-color,border-color,color,box-shadow,transform] duration-[160ms] ease active:translate-y-[0.5px] focus-visible:outline-none"
            >
              <Plus size={11} />
              {t('common.add')}
            </Button>
          </div>
        </div>

        {scopedEntries.length === 0 ? (
          <DashboardEmptyState
            icon={Variable}
            title={t('deployments.noScopedEnv')}
            cardVariant="glass"
          />
        ) : (
          <Card variant="glassPanel">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-text-muted">
                    {t('secrets.keyName')}
                  </TableHead>
                  <TableHead className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-text-muted">
                    {t('secrets.secretValue')}
                  </TableHead>
                  <TableHead className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-text-muted">
                    {t('secrets.secret')}
                  </TableHead>
                  <TableHead className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-text-muted">
                    {t('common.actions')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scopedEntries.map((entry) => (
                  <TableRow key={entry.key}>
                    <TableCell>{entry.key}</TableCell>
                    <TableCell>{entry.maskedValue}</TableCell>
                    <TableCell>
                      {entry.isSecret ? (
                        <Badge variant="warning" size="sm">
                          {t('secrets.secret')}
                        </Badge>
                      ) : (
                        <Badge variant="neutral" size="sm">
                          {t('deployments.plainText')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          onClick={() => void handleEditStart(entry)}
                          variant="ghost"
                          size="icon"
                          className="transition-[background-color,border-color,color,box-shadow,transform] duration-[160ms] ease active:translate-y-[0.5px] focus-visible:outline-none"
                        >
                          <Pencil size={12} />
                        </Button>
                        <Button
                          type="button"
                          onClick={() => setDeleteKey(entry.key)}
                          variant="ghost"
                          size="icon"
                          className="transition-[background-color,border-color,color,box-shadow,transform] duration-[160ms] ease active:translate-y-[0.5px] focus-visible:outline-none"
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-2">
          {t('deployments.fallbackEnvTitle')}
        </h3>
        <p className="text-xs text-text-muted mb-3">{t('deployments.fallbackEnvDescription')}</p>

        {fallbackEntries.length === 0 ? (
          <DashboardEmptyState
            icon={Variable}
            title={t('deployments.noFallbackEnv')}
            cardVariant="glass"
          />
        ) : (
          <Card variant="glassPanel">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-text-muted">
                    {t('secrets.keyName')}
                  </TableHead>
                  <TableHead className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-text-muted">
                    {t('secrets.secretValue')}
                  </TableHead>
                  <TableHead className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-text-muted">
                    {t('secrets.scope')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fallbackEntries.map((entry) => (
                  <TableRow key={`${entry.scope}-${entry.key}`}>
                    <TableCell>{entry.key}</TableCell>
                    <TableCell>{entry.maskedValue}</TableCell>
                    <TableCell>
                      <Badge variant="neutral" size="sm">
                        {entry.scope === 'global'
                          ? t('deployments.globalFallback')
                          : t('deployments.namespaceScoped')}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      {(dialogMode === 'create' || dialogMode === 'edit') && (
        <EnvVarEditorDialog
          mode={dialogMode}
          initial={editEntry ?? undefined}
          isSubmitting={saveMutation.isPending}
          titleCreate={t('deployments.addScopedEnv')}
          titleEdit={t('deployments.editScopedEnv')}
          subtitleCreate={t('deployments.scopedEnvDescription')}
          subtitleEdit={t('deployments.scopedEnvDescription')}
          onSubmit={(form) => saveMutation.mutate(form)}
          onClose={() => {
            setDialogMode(null)
            setEditEntry(null)
          }}
        />
      )}

      <DangerConfirmDialog
        open={Boolean(deleteKey)}
        onOpenChange={(open) => {
          if (!open) setDeleteKey(null)
        }}
        title={t('common.delete')}
        description={deleteKey ? t('deployments.deleteScopedEnvConfirm', { key: deleteKey }) : ''}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteKey) {
            deleteMutation.mutate(deleteKey)
          }
        }}
      />

      {dialogMode === 'cookie' && (
        <CookieJarImportDialog
          isSubmitting={cookieJarMutation.isPending}
          onClose={() => setDialogMode(null)}
          onImport={(data) => cookieJarMutation.mutate(data)}
        />
      )}
    </div>
  )
}

function NamespaceCostTab({ namespace }: { namespace: string }) {
  const api = useApiClient()
  const { t, i18n } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: ['namespace-costs', namespace],
    queryFn: () => api.deployments.namespaceCosts(namespace),
    refetchInterval: 30_000,
    staleTime: 10_000,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-14 text-text-muted text-sm">
        <Loader2 size={16} className="animate-spin mr-2" />
        {t('common.loading')}
      </div>
    )
  }

  if (!data) {
    return (
      <DashboardEmptyState
        icon={DollarSign}
        cardVariant="glass"
        title={t('deployments.costUnavailable')}
        description={t('deployments.costUnavailableDescription')}
      />
    )
  }

  const translateCostMessage = (message: string) =>
    message.startsWith('i18n:') ? t(message.slice(5)) : message

  return (
    <div className="space-y-6">
      <StatsGrid className="mb-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
        <MetricCardWrapper>
          <MetricCardContent
            label={t('deployments.tokenCost')}
            value={formatUsdCost(data.totalUsd, i18n.language)}
            icon={<DollarSign size={13} />}
            iconClassName="text-success"
            valueClassName="text-success"
          />
        </MetricCardWrapper>
        <MetricCardWrapper>
          <MetricCardContent
            label={t('deployments.totalTokens')}
            value={formatTokenCount(data.totalTokens, i18n.language)}
            icon={<Terminal size={13} />}
            iconClassName="text-accent"
            valueClassName="text-accent"
          />
        </MetricCardWrapper>
        <MetricCardWrapper>
          <MetricCardContent
            label={t('deployments.availableAgents')}
            value={data.availableAgents}
            icon={<CheckCircle size={13} />}
            iconClassName="text-primary"
            valueClassName="text-primary"
          />
        </MetricCardWrapper>
        <MetricCardWrapper>
          <MetricCardContent
            label={t('deployments.unavailableAgents')}
            value={data.unavailableAgents}
            icon={<XCircle size={13} />}
            iconClassName={data.unavailableAgents > 0 ? 'text-warning' : 'text-text-muted'}
            valueClassName={data.unavailableAgents > 0 ? 'text-warning' : 'text-text-muted'}
          />
        </MetricCardWrapper>
      </StatsGrid>

      <div className="text-xs text-text-muted">
        {t('deployments.generatedAt')}: {formatTimestamp(data.generatedAt)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {data.agents.map((agent) => (
          <Card key={agent.agentName} variant="glassPanel" className="min-w-0 p-5">
            <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-mono text-text-primary">{agent.agentName}</p>
                  <Badge variant={agent.totalUsd !== null ? 'success' : 'neutral'} size="sm">
                    {agent.source}
                  </Badge>
                </div>
                <p className="text-xs text-text-muted mt-1">{agent.podName ?? t('common.none')}</p>
              </div>
              <div className="min-w-0 text-left md:max-w-[14rem] md:text-right">
                <p className="break-words text-lg font-semibold leading-tight text-success">
                  {formatDisplayCost(agent, {
                    locale: i18n.language,
                    shrimpUnitLabel: t('deploy.shrimpCoins'),
                  })}
                </p>
                <p className="text-xs text-text-muted">{t('deployments.totalCost')}</p>
                <p className="mt-1 text-xs text-text-muted">
                  {formatTokenLabel(agent.totalTokens, i18n.language, t('deployments.tokens'))}
                </p>
              </div>
            </div>

            {agent.providers.length > 0 ? (
              <div className="space-y-2">
                {agent.providers.map((provider) => {
                  const providerDisplay = getProviderMetricDisplay(provider, {
                    billingUnit: data.billingUnit,
                    locale: i18n.language,
                    tokenLabel: t('deployments.tokens'),
                  })

                  return (
                    <div
                      key={`${agent.agentName}-${provider.provider}`}
                      className="flex flex-col gap-1 text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                    >
                      <span className="text-text-secondary">{provider.provider}</span>
                      <div className="min-w-0 text-left sm:text-right">
                        <p className="break-words text-text-secondary">{providerDisplay.primary}</p>
                        {providerDisplay.secondary ? (
                          <p className="break-words text-text-muted">{providerDisplay.secondary}</p>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs text-text-muted">{t('deployments.noProvidersReported')}</p>
            )}

            {agent.message && (
              <p className="text-xs text-warning mt-3">{translateCostMessage(agent.message)}</p>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}

function manifestStatusVariant(
  status: DeploymentManifestInfo['drift']['status'],
): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'up-to-date') return 'success'
  if (status === 'template-updated') return 'warning'
  if (status === 'missing-template') return 'danger'
  return 'neutral'
}

function NamespaceManifestPanel({
  namespace,
  latestTaskId,
}: {
  namespace: string
  latestTaskId: number | string | null
}) {
  const api = useApiClient()
  const { t } = useTranslation()
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const manifestQuery = useQuery({
    queryKey: ['deployment-manifest', namespace],
    queryFn: () => api.deployments.manifest(namespace),
    staleTime: 10_000,
  })

  const redeployWithOptions = async (options: DeploymentRedeployOptions) => {
    if (!latestTaskId) throw new Error('No deployment task found')
    return api.deployTasks.redeployToTaskId(latestTaskId, options)
  }

  const snapshotRedeployMutation = useMutation({
    mutationFn: () => redeployWithOptions({ mode: 'snapshot' }),
    onSuccess: (taskId) => {
      if (!taskId) return
      queryClient.invalidateQueries({ queryKey: ['deploy-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      navigate({ to: '/deploy-tasks/$taskId', params: { taskId: String(taskId) } })
    },
    onError: (err) => toast.error(`${t('deployments.redeployFailed')}: ${errorDetail(err)}`),
  })

  const templateRedeployMutation = useMutation({
    mutationFn: () =>
      redeployWithOptions({
        mode: 'template',
        templateSlug: manifestQuery.data?.templateSlug ?? undefined,
      }),
    onSuccess: (taskId) => {
      if (!taskId) return
      queryClient.invalidateQueries({ queryKey: ['deploy-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      queryClient.invalidateQueries({ queryKey: ['deployment-manifest', namespace] })
      navigate({ to: '/deploy-tasks/$taskId', params: { taskId: String(taskId) } })
    },
    onError: (err) => toast.error(`${t('deployments.redeployFailed')}: ${errorDetail(err)}`),
  })

  const syncTemplateMutation = useMutation({
    mutationFn: async () => {
      const result = await api.deployments.syncTemplate(namespace, {
        name: manifestQuery.data?.template?.name ?? manifestQuery.data?.templateSlug ?? namespace,
      })
      return result
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['deployment-manifest', namespace] })
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      toast.success(
        result.action === 'updated'
          ? t('deployments.templateUpdated')
          : t('deployments.templateForked', { name: result.template.slug }),
      )
    },
    onError: (err) => toast.error(`${t('deployments.templateSyncFailed')}: ${errorDetail(err)}`),
  })

  const syncAndRedeployMutation = useMutation({
    mutationFn: async () => {
      const result = await api.deployments.syncTemplate(namespace, {
        name: manifestQuery.data?.template?.name ?? manifestQuery.data?.templateSlug ?? namespace,
      })
      return redeployWithOptions({ mode: 'template', templateSlug: result.template.slug })
    },
    onSuccess: (taskId) => {
      queryClient.invalidateQueries({ queryKey: ['deployment-manifest', namespace] })
      queryClient.invalidateQueries({ queryKey: ['deploy-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      if (taskId) navigate({ to: '/deploy-tasks/$taskId', params: { taskId: String(taskId) } })
    },
    onError: (err) =>
      toast.error(`${t('deployments.templateSyncRedeployFailed')}: ${errorDetail(err)}`),
  })

  const info = manifestQuery.data
  const actionPending =
    snapshotRedeployMutation.isPending ||
    templateRedeployMutation.isPending ||
    syncTemplateMutation.isPending ||
    syncAndRedeployMutation.isPending
  const templateSlug = info?.templateSlug ?? t('common.none')
  const canRedeployTemplate = Boolean(
    latestTaskId && info?.templateSlug && info?.drift.templateAvailable,
  )

  return (
    <Card variant="glassPanel" className="p-5">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <GitBranch size={15} className="text-primary" />
            <h3 className="text-sm font-semibold text-text-primary">
              {t('deployments.templateManifestTitle')}
            </h3>
          </div>
          <p className="mt-1 text-xs text-text-muted">
            {t('deployments.templateManifestDescription')}
          </p>
        </div>
        <Badge variant={manifestStatusVariant(info?.drift.status ?? 'unknown')} size="sm">
          {t(`deployments.manifestDrift.${info?.drift.status ?? 'unknown'}`)}
        </Badge>
      </div>

      {manifestQuery.isLoading ? (
        <div className="flex items-center py-6 text-sm text-text-muted">
          <Loader2 size={15} className="mr-2 animate-spin" />
          {t('common.loading')}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="min-w-0 rounded-xl border border-border-subtle bg-bg-secondary/40 p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">
                {t('deployments.templateSlug')}
              </p>
              <p className="mt-1 truncate font-mono text-sm text-text-primary">{templateSlug}</p>
            </div>
            <div className="min-w-0 rounded-xl border border-border-subtle bg-bg-secondary/40 p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">
                {t('deployments.manifestRevision')}
              </p>
              <p className="mt-1 text-sm text-text-primary">
                {info?.manifest?.revision ?? t('common.none')}
              </p>
            </div>
            <div className="min-w-0 rounded-xl border border-border-subtle bg-bg-secondary/40 p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">
                {t('deployments.configHash')}
              </p>
              <p className="mt-1 truncate font-mono text-sm text-text-primary">
                {info?.drift.configHash ?? t('common.none')}
              </p>
            </div>
            <div className="min-w-0 rounded-xl border border-border-subtle bg-bg-secondary/40 p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">
                {t('deployments.templateUpdatedAt')}
              </p>
              <p className="mt-1 text-sm text-text-primary">
                {info?.template?.updatedAt
                  ? formatTimestamp(info.template.updatedAt)
                  : t('common.none')}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="glass"
              size="sm"
              disabled={!latestTaskId || actionPending}
              onClick={() => snapshotRedeployMutation.mutate()}
            >
              {snapshotRedeployMutation.isPending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <RotateCcw size={12} />
              )}
              {t('deployments.redeploySnapshot')}
            </Button>
            <Button
              type="button"
              variant="glass"
              size="sm"
              disabled={!canRedeployTemplate || actionPending}
              onClick={() => templateRedeployMutation.mutate()}
            >
              {templateRedeployMutation.isPending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Rocket size={12} />
              )}
              {t('deployments.redeployLatestTemplate')}
            </Button>
            <Button
              type="button"
              variant="glass"
              size="sm"
              disabled={!info || actionPending}
              onClick={() => syncTemplateMutation.mutate()}
            >
              {syncTemplateMutation.isPending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Save size={12} />
              )}
              {t('deployments.saveEditableTemplate')}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={!latestTaskId || !info || actionPending}
              onClick={() => syncAndRedeployMutation.mutate()}
            >
              {syncAndRedeployMutation.isPending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Rocket size={12} />
              )}
              {t('deployments.saveTemplateAndRedeploy')}
            </Button>
          </div>
        </>
      )}
    </Card>
  )
}

function NamespaceInfoTab({
  namespace,
  agent,
  deployment,
  deployments,
  pods,
  latestTaskId,
}: {
  namespace: string
  agent: string | null
  deployment?: Deployment | null
  deployments: Deployment[]
  pods: Pod[] | undefined
  latestTaskId: number | string | null
}) {
  const { t } = useTranslation()
  const readyAgents = deployments.filter((deployment) => isDeploymentReady(deployment.ready)).length
  const totalRestarts = pods?.reduce((sum, pod) => sum + Number(pod.restarts), 0) ?? 0

  return (
    <div className="space-y-6">
      <NamespaceManifestPanel namespace={namespace} latestTaskId={latestTaskId} />

      <Card variant="glassPanel" className="overflow-hidden p-0">
        <div className="px-5 py-3 flex items-center justify-between border-b border-border-subtle">
          <span className="text-xs text-text-muted">{t('deployments.namespaceLabel')}</span>
          <span className="text-sm font-mono text-text-secondary">{namespace}</span>
        </div>
        <div className="px-5 py-3 flex items-center justify-between border-b border-border-subtle">
          <span className="text-xs text-text-muted">{t('deployments.agents')}</span>
          <span className="text-sm text-text-secondary">{deployments.length}</span>
        </div>
        <div className="px-5 py-3 flex items-center justify-between border-b border-border-subtle">
          <span className="text-xs text-text-muted">{t('deployments.readyAgents')}</span>
          <span className="text-sm text-success">{readyAgents}</span>
        </div>
        <div className="px-5 py-3 flex items-center justify-between border-b border-border-subtle">
          <span className="text-xs text-text-muted">{t('deployments.currentAgent')}</span>
          <span className="text-sm font-mono text-text-secondary">{agent ?? t('common.none')}</span>
        </div>
        <div className="px-5 py-3 flex items-center justify-between border-b border-border-subtle">
          <span className="text-xs text-text-muted">{t('deployments.workloadKind')}</span>
          <span className="text-sm text-text-secondary">
            {getWorkloadKindDisplay(t, deployment?.workloadKind)}
          </span>
        </div>
        <div className="px-5 py-3 flex items-center justify-between border-b border-border-subtle">
          <span className="text-xs text-text-muted">{t('deployments.runtimeStateLabel')}</span>
          <span className="text-sm text-text-secondary">
            {t(`deployments.runtimeState.${deployment?.runtimeState ?? 'unknown'}`)}
          </span>
        </div>
        <div className="px-5 py-3 flex items-center justify-between border-b border-border-subtle">
          <span className="text-xs text-text-muted">{t('deployments.sandboxName')}</span>
          <span
            className="text-sm text-text-secondary"
            title={deployment?.sandboxName ?? undefined}
          >
            {deployment?.sandboxName ? t('deployments.runtimeReady') : t('common.none')}
          </span>
        </div>
        <div className="px-5 py-3 flex items-center justify-between border-b border-border-subtle">
          <span className="text-xs text-text-muted">{t('deployments.statePvc')}</span>
          <span className="text-sm text-text-secondary" title={deployment?.statePvc ?? undefined}>
            {deployment?.statePvc ? t('deployments.stateSaved') : t('common.none')}
          </span>
        </div>
        <div className="px-5 py-3 flex items-center justify-between border-b border-border-subtle">
          <span className="text-xs text-text-muted">{t('deployments.serviceFQDN')}</span>
          <span className="break-all text-right text-sm font-mono text-text-secondary">
            {deployment?.serviceFQDN ?? t('common.none')}
          </span>
        </div>
        <div className="px-5 py-3 flex items-center justify-between border-b border-border-subtle">
          <span className="text-xs text-text-muted">{t('deployments.lastActiveAt')}</span>
          <span className="text-right text-sm text-text-secondary">
            {deployment?.lastActiveAt ? formatTimestamp(deployment.lastActiveAt) : t('common.none')}
          </span>
        </div>
        <div className="px-5 py-3 flex items-center justify-between border-b border-border-subtle">
          <span className="text-xs text-text-muted">{t('deployments.pausedAt')}</span>
          <span className="text-right text-sm text-text-secondary">
            {deployment?.pausedAt ? formatTimestamp(deployment.pausedAt) : t('common.none')}
          </span>
        </div>
        <div className="px-5 py-3 flex items-center justify-between border-b border-border-subtle">
          <span className="text-xs text-text-muted">{t('deployments.selectedPods')}</span>
          <span className="text-sm text-text-secondary">{pods?.length ?? 0}</span>
        </div>
        <div className="px-5 py-3 flex items-center justify-between">
          <span className="text-xs text-text-muted">{t('deployments.totalRestarts')}</span>
          <span
            className={cn('text-sm', totalRestarts > 0 ? 'text-warning' : 'text-text-secondary')}
          >
            {totalRestarts}
          </span>
        </div>
      </Card>
    </div>
  )
}

export function DeploymentNamespacePage() {
  const api = useApiClient()
  const { t, i18n } = useTranslation()
  const { namespace } = useParams({ strict: false }) as { namespace: string }
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const addActivity = useAppStore((state) => state.addActivity)
  const [activeTab, setActiveTab] = useState('agents')
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [destroyOpen, setDestroyOpen] = useState(false)

  const {
    data: deployments,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['deployments'],
    queryFn: api.deployments.list,
    refetchInterval: 10_000,
    staleTime: 5_000,
  })

  const namespaceDeployments = useMemo(() => {
    return (deployments ?? [])
      .filter((deployment) => deployment.namespace === namespace)
      .sort((left, right) => left.name.localeCompare(right.name))
  }, [deployments, namespace])

  const selectedDeployment = useMemo(() => {
    if (!selectedAgent) return null
    return namespaceDeployments.find((deployment) => deployment.name === selectedAgent) ?? null
  }, [namespaceDeployments, selectedAgent])

  useEffect(() => {
    if (namespaceDeployments.length === 0) {
      setSelectedAgent(null)
      return
    }
    setSelectedAgent((current) => {
      if (current && namespaceDeployments.some((deployment) => deployment.name === current)) {
        return current
      }
      return namespaceDeployments[0]?.name ?? null
    })
  }, [namespaceDeployments])

  const selectedPodsQuery = useQuery({
    queryKey: ['pods', namespace, selectedAgent],
    queryFn: () => api.deployments.pods(namespace, selectedAgent ?? ''),
    enabled: Boolean(selectedAgent),
    refetchInterval: 10_000,
  })

  const namespaceCostQuery = useQuery({
    queryKey: ['namespace-costs', namespace],
    queryFn: () => api.deployments.namespaceCosts(namespace),
    refetchInterval: 30_000,
    staleTime: 10_000,
  })

  const deployTasksQuery = useQuery({
    queryKey: ['deploy-tasks'],
    queryFn: api.deployTasks.list,
    refetchInterval: 10_000,
    staleTime: 5_000,
  })

  const latestTask = useMemo(() => {
    return (deployTasksQuery.data?.tasks ?? [])
      .filter((item) => item.task.namespace === namespace)
      .sort((left, right) => {
        const leftTime = Date.parse(left.task.createdAt ?? left.task.updatedAt ?? '') || 0
        const rightTime = Date.parse(right.task.createdAt ?? right.task.updatedAt ?? '') || 0
        return rightTime - leftTime
      })[0]
  }, [deployTasksQuery.data?.tasks, namespace])

  const redeployMutation = useMutation({
    mutationFn: async () => {
      if (!latestTask) return null
      return api.deployTasks.redeployToTaskId(latestTask.task.id)
    },
    onSuccess: (nextTaskId) => {
      if (!nextTaskId) {
        toast.error(t('deployments.noTaskToRedeploy'))
        return
      }
      queryClient.invalidateQueries({ queryKey: ['deploy-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      navigate({ to: '/deploy-tasks/$taskId', params: { taskId: String(nextTaskId) } })
    },
    onError: () => toast.error(t('deployments.redeployFailed')),
  })

  const destroyMutation = useMutation({
    mutationFn: () => api.destroy({ namespace }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      queryClient.invalidateQueries({ queryKey: ['deploy-tasks'] })
      toast.success(t('deployments.destroyQueued', { namespace }))
      addActivity({
        type: 'destroy',
        title: t('deploymentDetail.destroyQueuedActivityTitle', { namespace }),
        namespace,
      })
      if (result.taskId) {
        navigate({ to: '/deploy-tasks/$taskId', params: { taskId: String(result.taskId) } })
      } else {
        navigate({ to: '/deployments' })
      }
    },
    onError: () => toast.error(t('deployments.destroyNamespaceFailed')),
  })

  const pauseMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAgent) throw new Error('No selected agent')
      return api.deployments.pause(namespace, selectedAgent)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      queryClient.invalidateQueries({ queryKey: ['pods', namespace, selectedAgent] })
      toast.success(t('deployments.pauseQueued', { agent: selectedAgent }))
      addActivity({
        type: 'scale',
        title: t('deployments.pauseQueued', { agent: selectedAgent }),
        namespace,
      })
    },
    onError: (err) => toast.error(`${t('deployments.pauseFailed')}: ${errorDetail(err)}`),
  })

  const resumeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAgent) throw new Error('No selected agent')
      return api.deployments.resume(namespace, selectedAgent)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      queryClient.invalidateQueries({ queryKey: ['pods', namespace, selectedAgent] })
      toast.success(t('deployments.resumeQueued', { agent: selectedAgent }))
      addActivity({
        type: 'scale',
        title: t('deployments.resumeQueued', { agent: selectedAgent }),
        namespace,
      })
    },
    onError: (err) => toast.error(`${t('deployments.resumeFailed')}: ${errorDetail(err)}`),
  })

  const backupMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAgent) throw new Error('No selected agent')
      return api.deployments.createBackup(namespace, selectedAgent)
    },
    onSuccess: () => {
      toast.success(t('deployments.backupCreated'))
      addActivity({
        type: 'scale',
        title: t('deployments.backupCreated'),
        namespace,
      })
    },
    onError: (err) => toast.error(`${t('deployments.backupFailed')}: ${errorDetail(err)}`),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['deployment-backups', namespace, selectedAgent] })
    },
  })

  const readyAgents = namespaceDeployments.filter((deployment) =>
    isDeploymentReady(deployment.ready),
  ).length
  const pausedAgents = namespaceDeployments.filter(
    (deployment) => deployment.runtimeState === 'paused',
  ).length
  const selectedPods = selectedPodsQuery.data ?? []
  const selectedRuntimeState = selectedDeployment?.runtimeState ?? 'unknown'
  const selectedBackupAllowed = selectedDeployment?.status
    ? selectedDeployment.status === 'deployed' || selectedDeployment.status === 'paused'
    : selectedRuntimeState === 'running' || selectedRuntimeState === 'paused'
  const selectedResumeDisabledReason = !selectedAgent
    ? t('deployments.noAgentSelected')
    : resumeMutation.isPending
      ? t('deployments.runtimeActionInProgress')
      : undefined
  const selectedPauseDisabledReason = !selectedAgent
    ? t('deployments.noAgentSelected')
    : pauseMutation.isPending
      ? t('deployments.runtimeActionInProgress')
      : selectedRuntimeState === 'resuming'
        ? t('deployments.pauseUnavailableResuming')
        : undefined
  const selectedBackupDisabledReason = !selectedAgent
    ? t('deployments.noAgentSelected')
    : backupMutation.isPending
      ? t('deployments.runtimeActionInProgress')
      : !selectedBackupAllowed
        ? t('deployments.backupUnavailableRuntime')
        : undefined

  const tabs = [
    {
      id: 'agents',
      label: t('deployments.agents'),
      icon: <Box size={13} />,
      count: namespaceDeployments.length,
    },
    {
      id: 'logs',
      label: t('deployments.tabLogs'),
      icon: <FileText size={13} />,
    },
    { id: 'env', label: t('deployments.tabEnv'), icon: <Variable size={13} /> },
    {
      id: 'backups',
      label: t('deployments.tabBackups'),
      icon: <Archive size={13} />,
    },
    {
      id: 'cost',
      label: t('deployments.costTab'),
      icon: <DollarSign size={13} />,
    },
    { id: 'info', label: t('deployments.tabInfo'), icon: <Info size={13} /> },
  ]

  if (!isLoading && namespaceDeployments.length === 0) {
    return (
      <PageShell
        breadcrumb={[{ label: t('deployments.title'), to: '/deployments' }, { label: namespace }]}
        breadcrumbPosition="inside"
        title={namespace}
        actions={
          <Button asChild variant="primary" size="sm">
            <Link to="/store">
              <Rocket size={14} />
              {t('clusters.browseAgentStore')}
            </Link>
          </Button>
        }
        narrow
      >
        <DashboardEmptyState
          icon={FolderOpen}
          cardVariant="glass"
          title={t('deployments.noDeploymentsInNamespace')}
          description={t('deployments.noDeploymentsInNamespaceDescription', {
            namespace,
          })}
          action={null}
        />
      </PageShell>
    )
  }

  return (
    <PageShell
      breadcrumb={[{ label: t('deployments.title'), to: '/deployments' }, { label: namespace }]}
      breadcrumbPosition="inside"
      title={namespace}
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {selectedDeployment?.workloadKind === 'agent-sandbox' &&
            selectedRuntimeState === 'paused' && (
              <Button
                type="button"
                onClick={() => resumeMutation.mutate()}
                title={selectedResumeDisabledReason}
                disabled={Boolean(selectedResumeDisabledReason)}
                variant="glass"
                size="sm"
              >
                {resumeMutation.isPending ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Play size={12} />
                )}
                {t('deployments.resumeAgent')}
              </Button>
            )}
          {selectedDeployment?.workloadKind === 'agent-sandbox' &&
            selectedRuntimeState !== 'paused' && (
              <Button
                type="button"
                onClick={() => pauseMutation.mutate()}
                title={selectedPauseDisabledReason}
                disabled={Boolean(selectedPauseDisabledReason)}
                variant="glass"
                size="sm"
              >
                {pauseMutation.isPending ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Pause size={12} />
                )}
                {t('deployments.pauseAgent')}
              </Button>
            )}
          {selectedAgent && (
            <Button
              type="button"
              onClick={() => backupMutation.mutate()}
              title={selectedBackupDisabledReason}
              disabled={Boolean(selectedBackupDisabledReason)}
              variant="glass"
              size="sm"
            >
              {backupMutation.isPending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Download size={12} />
              )}
              {t('deployments.backupAgent')}
            </Button>
          )}
          <Button
            type="button"
            onClick={() => {
              void refetch()
              void queryClient.invalidateQueries({
                queryKey: ['namespace-costs', namespace],
              })
            }}
            variant="ghost"
            size="sm"
          >
            <RefreshCw size={12} />
            {t('common.refresh')}
          </Button>
          <Button
            type="button"
            onClick={() => redeployMutation.mutate()}
            disabled={!latestTask || redeployMutation.isPending}
            variant="primary"
            size="sm"
          >
            {redeployMutation.isPending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Rocket size={12} />
            )}
            {t('deployTask.redeploy')}
          </Button>
          <Button type="button" onClick={() => setDestroyOpen(true)} variant="ghost" size="sm">
            <Trash2 size={12} />
            {t('clusters.destroy')}
          </Button>
        </div>
      }
      headerContent={
        <>
          <StatsGrid className="mb-4 grid-cols-1 md:mb-5 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCardWrapper>
              <MetricCardContent
                label={t('deployments.agents')}
                value={namespaceDeployments.length}
                icon={<Box size={13} />}
                iconClassName="text-text-primary"
                valueClassName="text-text-primary"
              />
            </MetricCardWrapper>
            <MetricCardWrapper>
              <MetricCardContent
                label={t('deployments.readyAgents')}
                value={readyAgents}
                icon={<CheckCircle size={13} />}
                iconClassName="text-success"
                valueClassName="text-success"
              />
            </MetricCardWrapper>
            <MetricCardWrapper>
              <MetricCardContent
                label={t('deployments.pausedAgents')}
                value={pausedAgents}
                icon={<Pause size={13} />}
                iconClassName="text-warning"
                valueClassName="text-warning"
              />
            </MetricCardWrapper>
            <MetricCardWrapper>
              <MetricCardContent
                label={t('deployments.selectedPods')}
                value={selectedPods.length}
                icon={<Server size={13} />}
                iconClassName="text-primary"
                valueClassName="text-primary"
              />
            </MetricCardWrapper>
            <MetricCardWrapper>
              <MetricCardContent
                label={t('deployments.tokenCost')}
                value={formatUsdCost(namespaceCostQuery.data?.totalUsd ?? null, i18n.language)}
                icon={<DollarSign size={13} />}
                iconClassName="text-accent"
                valueClassName="text-accent"
              />
            </MetricCardWrapper>
          </StatsGrid>

          <div className="mt-1">
            <Tabs value={activeTab} onChange={setActiveTab}>
              <DashboardTabsList tabs={tabs} activeId={activeTab} onSelect={setActiveTab} />
            </Tabs>
          </div>
        </>
      }
      narrow
    >
      <GlassPanel className="rounded-2xl p-4 md:p-5 lg:p-6">
        <div className="space-y-6">
          <div className="min-h-[38vh]">
            {activeTab === 'agents' && (
              <PodsPanel
                namespace={namespace}
                agent={selectedAgent}
                enabled={!isLoading}
                deployment={selectedDeployment}
                onResume={() => resumeMutation.mutate()}
                resumePending={resumeMutation.isPending}
                resumeDisabledReason={selectedResumeDisabledReason}
              />
            )}
            {activeTab === 'logs' && (
              <NamespaceLogsTab
                namespace={namespace}
                agent={selectedAgent}
                deployment={selectedDeployment}
                deployments={namespaceDeployments}
                onSelectAgent={setSelectedAgent}
                onResume={() => resumeMutation.mutate()}
                resumePending={resumeMutation.isPending}
                resumeDisabledReason={selectedResumeDisabledReason}
              />
            )}
            {activeTab === 'env' && <NamespaceEnvironmentTab namespace={namespace} />}
            {activeTab === 'backups' && (
              <BackupsPanel
                namespace={namespace}
                agent={selectedAgent}
                deployment={selectedDeployment}
              />
            )}
            {activeTab === 'cost' && <NamespaceCostTab namespace={namespace} />}
            {activeTab === 'info' && (
              <NamespaceInfoTab
                namespace={namespace}
                agent={selectedAgent}
                deployment={selectedDeployment}
                deployments={namespaceDeployments}
                pods={selectedPodsQuery.data}
                latestTaskId={latestTask?.task.id ?? null}
              />
            )}
          </div>
        </div>
      </GlassPanel>

      <DangerConfirmDialog
        open={destroyOpen}
        onOpenChange={setDestroyOpen}
        title={t('clusters.destroyNamespace')}
        description={t('clusters.destroyWarning', { namespace })}
        confirmText={destroyMutation.isPending ? t('clusters.destroying') : t('clusters.destroy')}
        cancelText={t('common.cancel')}
        loading={destroyMutation.isPending}
        onConfirm={() => destroyMutation.mutate()}
      />
    </PageShell>
  )
}
