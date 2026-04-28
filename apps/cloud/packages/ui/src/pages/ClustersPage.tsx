import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  EmptyState,
  Search,
} from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Box,
  CheckCircle,
  ChevronRight,
  FolderOpen,
  Layers,
  RefreshCw,
  Rocket,
  Trash2,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DashboardLoadingState } from '@/components/DashboardState'
import { IconActionButton } from '@/components/IconActionButton'
import { PageShell } from '@/components/PageShell'
import { StatCard } from '@/components/StatCard'
import { StatsGrid } from '@/components/StatsGrid'
import { StatusDot } from '@/components/StatusDot'
import { useDebounce } from '@/hooks/useDebounce'
import { api, type Deployment } from '@/lib/api'
import { getAge, groupBy, isDeploymentReady, pluralize } from '@/lib/utils'
import { useAppStore } from '@/stores/app'
import { useToast } from '@/stores/toast'

// ── Types ─────────────────────────────────────────────────────────────────────

interface NamespaceGroup {
  namespace: string
  deployments: Deployment[]
  readyCount: number
  totalCount: number
}

// ── Namespace Card ────────────────────────────────────────────────────────────

function NamespaceCard({
  group,
  isDestroying,
  isDiscovered,
  onDestroy,
}: {
  group: NamespaceGroup
  isDestroying: boolean
  isDiscovered: boolean
  onDestroy: (ns: string) => void
}) {
  const { t } = useTranslation()
  const readyLabel = `${group.readyCount}/${group.totalCount} ${t('clusters.ready').toLowerCase()}`

  return (
    <div className="bg-bg-secondary border border-border-subtle rounded-xl overflow-hidden hover:border-border-dim transition-colors">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-900/20 rounded-lg">
            <FolderOpen size={16} className="text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm">{group.namespace}</h3>
              {isDiscovered && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-900/30 text-yellow-400 border border-yellow-800/50">
                  {t('clusters.discovered')}
                </span>
              )}
            </div>
            <p className="text-xs text-text-muted">
              {group.totalCount} {pluralize(group.totalCount, 'deployment')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusDot
            status={group.readyCount === group.totalCount ? 'success' : 'warning'}
            label={readyLabel}
          />
          <IconActionButton
            type="button"
            label={t('clusters.destroyNamespace')}
            onClick={() => onDestroy(group.namespace)}
            variant="ghost"
            disabled={isDestroying}
            withTooltip={false}
            className="h-7 w-7 rounded-lg text-text-muted hover:text-text-primary"
            icon={
              isDestroying ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />
            }
          />
        </div>
      </div>

      {/* Deployment rows */}
      <div className="divide-y divide-border-subtle">
        {group.deployments.map((dep) => (
          <DeploymentRow key={`${dep.namespace}/${dep.name}`} dep={dep} />
        ))}
      </div>
    </div>
  )
}

function DeploymentRow({ dep }: { dep: Deployment }) {
  const ready = isDeploymentReady(dep.ready)

  return (
    <div className="px-5 py-3 flex items-center justify-between hover:bg-bg-modifier-hover transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <StatusDot status={ready ? 'success' : 'warning'} />
        <div className="min-w-0">
          <Link
            to="/deployments/$namespace"
            params={{ namespace: dep.namespace }}
            className="text-sm font-mono text-blue-400 hover:text-blue-300 transition-colors truncate block"
          >
            {dep.name}
          </Link>
          <span className="text-xs text-text-muted">{getAge(dep.age)}</span>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <Badge variant={ready ? 'success' : 'warning'} size="sm">
          {dep.ready}
        </Badge>

        <Link
          to="/deployments/$namespace"
          params={{ namespace: dep.namespace }}
          className="text-text-muted hover:text-text-primary transition-colors"
        >
          <ChevronRight size={14} />
        </Link>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function ClustersPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const toast = useToast()
  const addActivity = useAppStore((s) => s.addActivity)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)
  const [destroyNs, setDestroyNs] = useState<string | null>(null)
  const [hiddenNamespaces, setHiddenNamespaces] = useState<string[]>([])

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

  const { data: nsInfo } = useQuery({
    queryKey: ['namespaces'],
    queryFn: api.deployments.namespaces,
    staleTime: 30_000,
  })

  const destroyMutation = useMutation({
    mutationFn: (ns: string) => api.destroy({ namespace: ns }),
    onMutate: async (ns) => {
      await queryClient.cancelQueries({ queryKey: ['deployments'] })
      const previousDeployments = queryClient.getQueryData<Deployment[]>(['deployments'])
      const previousHiddenNamespaces = hiddenNamespaces

      setDestroyNs(ns)

      setHiddenNamespaces((current) => (current.includes(ns) ? current : [...current, ns]))
      queryClient.setQueryData<Deployment[]>(['deployments'], (current) =>
        (current ?? []).filter((deployment) => deployment.namespace !== ns),
      )

      return { previousDeployments, previousHiddenNamespaces }
    },
    onSuccess: async (_, ns) => {
      toast.success(t('deploymentDetail.destroySuccess', { namespace: ns }))
      addActivity({
        type: 'destroy',
        title: t('deploymentDetail.destroyActivityTitle', { namespace: ns }),
        namespace: ns,
      })
      setDestroyNs(null)
      // Keep namespace hidden — k8s deletion is async.
      // Delay invalidation to let k8s finish cleanup before re-fetching.
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['deployments'] })
      }, 5_000)
    },
    onError: (_error, _ns, context) => {
      if (context?.previousDeployments) {
        queryClient.setQueryData(['deployments'], context.previousDeployments)
      }
      setHiddenNamespaces(context?.previousHiddenNamespaces ?? [])
      setDestroyNs(null)
      toast.error(t('deployments.destroyNamespaceFailed'))
    },
  })

  useEffect(() => {
    const namespaces = new Set((deployments ?? []).map((deployment) => deployment.namespace))
    setHiddenNamespaces((current) => current.filter((namespace) => namespaces.has(namespace)))
  }, [deployments])

  // Compute groups
  const groups: NamespaceGroup[] = useMemo(() => {
    const deps = (deployments ?? []).filter(
      (deployment) => !hiddenNamespaces.includes(deployment.namespace),
    )
    const grouped = groupBy(deps, (d) => d.namespace)
    let result = Object.entries(grouped).map(([namespace, deps]) => ({
      namespace,
      deployments: deps,
      readyCount: deps.filter((deployment) => isDeploymentReady(deployment.ready)).length,
      totalCount: deps.length,
    }))

    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      result = result.filter(
        (g) =>
          g.namespace.toLowerCase().includes(q) ||
          g.deployments.some((d) => d.name.toLowerCase().includes(q)),
      )
    }

    return result.sort((a, b) => a.namespace.localeCompare(b.namespace))
  }, [deployments, debouncedSearch, hiddenNamespaces])

  const visibleDeployments = (deployments ?? []).filter(
    (deployment) => !hiddenNamespaces.includes(deployment.namespace),
  )
  const total = visibleDeployments.length
  const ready = visibleDeployments.filter((deployment) =>
    isDeploymentReady(deployment.ready),
  ).length
  const namespaceCount = groups.length

  return (
    <PageShell
      breadcrumb={[]}
      title={t('clusters.title')}
      description={t('clusters.description')}
      actions={
        <div className="flex items-center gap-2">
          <Button type="button" onClick={() => refetch()} variant="ghost" size="sm">
            <RefreshCw size={12} />
            {t('common.refresh')}
          </Button>
          <Button asChild variant="primary" size="sm">
            <Link to="/store">
              <Rocket size={12} />
              {t('common.deployNew')}
            </Link>
          </Button>
        </div>
      }
      headerContent={
        <div className="space-y-4">
          <StatsGrid className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={t('clusters.totalDeployments')}
              value={total}
              icon={<Box size={13} />}
              color="default"
            />
            <StatCard
              label={t('clusters.ready')}
              value={ready}
              icon={<CheckCircle size={13} />}
              color="green"
            />
            <StatCard
              label={t('clusters.notReady')}
              value={total - ready}
              icon={<XCircle size={13} />}
              color={total - ready > 0 ? 'yellow' : 'default'}
            />
            <StatCard
              label={t('overview.namespaces')}
              value={namespaceCount}
              icon={<FolderOpen size={13} />}
              color="blue"
            />
          </StatsGrid>

          <Search value={search} onChange={setSearch} placeholder={t('common.search') + '...'} />
        </div>
      }
    >
      {isLoading && <DashboardLoadingState rows={2} />}

      {!isLoading && groups.length === 0 && (
        <EmptyState
          icon={Layers}
          title={t('clusters.noClustersFound')}
          description={
            debouncedSearch ? t('clusters.noNamespacesMatch') : t('clusters.noDeploymentsYet')
          }
          action={
            <Button asChild variant="primary" size="sm">
              <Link to="/store">
                <Rocket size={14} />
                {t('clusters.browseAgentStore')}
              </Link>
            </Button>
          }
        />
      )}

      {!isLoading && groups.length > 0 && (
        <div className="space-y-4">
          {groups.map((group) => (
            <NamespaceCard
              key={group.namespace}
              group={group}
              isDestroying={destroyMutation.isPending && destroyNs === group.namespace}
              isDiscovered={nsInfo?.discovered?.includes(group.namespace) ?? false}
              onDestroy={setDestroyNs}
            />
          ))}
        </div>
      )}

      <AlertDialog
        open={Boolean(destroyNs)}
        onOpenChange={(open) => {
          if (!open) setDestroyNs(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('clusters.destroyNamespace')}</AlertDialogTitle>
            <AlertDialogDescription>
              {destroyNs ? t('clusters.destroyWarning', { namespace: destroyNs }) : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="ghost">{t('common.cancel')}</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="danger"
                loading={destroyMutation.isPending}
                onClick={() => destroyNs && destroyMutation.mutate(destroyNs)}
              >
                {destroyMutation.isPending ? t('clusters.destroying') : t('clusters.destroy')}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  )
}
