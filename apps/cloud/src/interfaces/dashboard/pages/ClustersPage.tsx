import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { formatDistanceToNow, parseISO } from 'date-fns'
import {
  Box,
  CheckCircle,
  ChevronRight,
  FolderOpen,
  Layers,
  Minus,
  Plus,
  RefreshCw,
  Rocket,
  Trash2,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/Badge'
import { Breadcrumb } from '@/components/Breadcrumb'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmptyState } from '@/components/EmptyState'
import { SearchInput } from '@/components/SearchInput'
import { StatCard } from '@/components/StatCard'
import { StatusDot } from '@/components/StatusDot'
import { useDebounce } from '@/hooks/useDebounce'
import { api, type Deployment } from '@/lib/api'
import { groupBy, pluralize } from '@/lib/utils'
import { useAppStore } from '@/stores/app'
import { useToast } from '@/stores/toast'

// ── Types ─────────────────────────────────────────────────────────────────────

interface NamespaceGroup {
  namespace: string
  deployments: Deployment[]
  readyCount: number
  totalCount: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isDeploymentReady(dep: Deployment): boolean {
  const [r = 0, t = 0] = dep.ready.split('/').map(Number)
  return r === t && t > 0
}

function getAge(dep: Deployment): string {
  try {
    return formatDistanceToNow(parseISO(dep.age), { addSuffix: true })
  } catch {
    return dep.age
  }
}

// ── Namespace Card ────────────────────────────────────────────────────────────

function NamespaceCard({
  group,
  isDestroying,
  onDestroy,
}: {
  group: NamespaceGroup
  isDestroying: boolean
  onDestroy: (ns: string) => void
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-700 transition-colors">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-900/20 rounded-lg">
            <FolderOpen size={16} className="text-blue-400" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">{group.namespace}</h3>
            <p className="text-xs text-gray-500">
              {group.totalCount} {pluralize(group.totalCount, 'deployment')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusDot
            status={group.readyCount === group.totalCount ? 'success' : 'warning'}
            label={`${group.readyCount}/${group.totalCount} ready`}
          />
          <button
            type="button"
            onClick={() => onDestroy(group.namespace)}
            disabled={isDestroying}
            className="text-gray-600 hover:text-red-400 transition-colors p-1.5 rounded-md hover:bg-red-900/10"
            title="Destroy namespace"
          >
            {isDestroying ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
          </button>
        </div>
      </div>

      {/* Deployment rows */}
      <div className="divide-y divide-gray-800/50">
        {group.deployments.map((dep) => (
          <DeploymentRow key={`${dep.namespace}/${dep.name}`} dep={dep} />
        ))}
      </div>
    </div>
  )
}

function DeploymentRow({ dep }: { dep: Deployment }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const addActivity = useAppStore((s) => s.addActivity)
  const ready = isDeploymentReady(dep)
  const [replicas, setReplicas] = useState<number | null>(null)

  const currentReplicas =
    replicas ??
    (() => {
      const [r = 0] = dep.ready.split('/').map(Number)
      return r
    })()

  const scaleMutation = useMutation({
    mutationFn: (count: number) => api.deployments.scale(dep.namespace, dep.name, count),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      toast.success(`Scaled ${dep.name} to ${replicas} replicas`)
      addActivity({
        type: 'scale',
        title: `Scaled ${dep.name}`,
        detail: `Replicas: ${replicas}`,
        namespace: dep.namespace,
      })
    },
    onError: () => toast.error(`Failed to scale ${dep.name}`),
  })

  const handleScale = (delta: number) => {
    const next = Math.max(0, currentReplicas + delta)
    setReplicas(next)
    scaleMutation.mutate(next)
  }

  return (
    <div className="px-5 py-3 flex items-center justify-between hover:bg-gray-800/20 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <StatusDot status={ready ? 'success' : 'warning'} />
        <div className="min-w-0">
          <Link
            to="/deployments/$namespace/$id"
            params={{ namespace: dep.namespace, id: dep.name }}
            className="text-sm font-mono text-blue-400 hover:text-blue-300 transition-colors truncate block"
          >
            {dep.name}
          </Link>
          <span className="text-[10px] text-gray-600">{getAge(dep)}</span>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <Badge variant={ready ? 'success' : 'warning'} size="sm">
          {dep.ready}
        </Badge>

        {/* Scale controls inline */}
        <div className="flex items-center border border-gray-700 rounded">
          <button
            type="button"
            onClick={() => handleScale(-1)}
            disabled={scaleMutation.isPending || currentReplicas <= 0}
            className="px-1.5 py-0.5 text-gray-500 hover:text-white disabled:opacity-30 transition-colors"
          >
            <Minus size={11} />
          </button>
          <span className="text-[10px] font-mono px-1.5 min-w-[1.2rem] text-center">
            {currentReplicas}
          </span>
          <button
            type="button"
            onClick={() => handleScale(1)}
            disabled={scaleMutation.isPending}
            className="px-1.5 py-0.5 text-gray-500 hover:text-white disabled:opacity-30 transition-colors"
          >
            <Plus size={11} />
          </button>
        </div>

        <Link
          to="/deployments/$namespace/$id"
          params={{ namespace: dep.namespace, id: dep.name }}
          className="text-gray-600 hover:text-white transition-colors"
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
      await queryClient.invalidateQueries({ queryKey: ['deployments'] })
      toast.success(`Destroyed namespace ${ns}`)
      addActivity({
        type: 'destroy',
        title: `Destroyed namespace ${ns}`,
        namespace: ns,
      })
      setDestroyNs(null)
    },
    onError: (_error, _ns, context) => {
      if (context?.previousDeployments) {
        queryClient.setQueryData(['deployments'], context.previousDeployments)
      }
      setHiddenNamespaces(context?.previousHiddenNamespaces ?? [])
      setDestroyNs(null)
      toast.error('Failed to destroy namespace')
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
      readyCount: deps.filter(isDeploymentReady).length,
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
  const ready = visibleDeployments.filter(isDeploymentReady).length
  const namespaceCount = groups.length

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Breadcrumb items={[{ label: t('nav.clusters') }]} className="mb-4" />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">{t('clusters.title')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('clusters.description')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refetch()}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg px-3 py-1.5 transition-colors"
          >
            <RefreshCw size={12} />
            {t('common.refresh')}
          </button>
          <Link
            to="/store"
            className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-3 py-1.5 transition-colors"
          >
            <Rocket size={12} />
            {t('common.deployNew')}
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
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
      </div>

      {/* Search */}
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder={t('common.search') + '...'}
        className="mb-6 max-w-md"
      />

      {/* Content */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="bg-gray-900 border border-gray-800 rounded-xl p-5 animate-pulse"
            >
              <div className="h-5 w-32 bg-gray-800 rounded mb-4" />
              <div className="h-12 bg-gray-800 rounded" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && groups.length === 0 && (
        <EmptyState
          icon={<Layers size={40} />}
          title={t('clusters.noClustersFound')}
          description={
            debouncedSearch ? t('clusters.noNamespacesMatch') : t('clusters.noDeploymentsYet')
          }
          action={
            <Link
              to="/store"
              className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 border border-blue-800 hover:border-blue-600 rounded-lg px-4 py-2 transition-colors"
            >
              <Rocket size={14} />
              {t('clusters.browseAgentStore')}
            </Link>
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
              onDestroy={setDestroyNs}
            />
          ))}
        </div>
      )}

      {destroyNs && (
        <ConfirmDialog
          title={t('clusters.destroyNamespace')}
          message={t('clusters.destroyWarning', { namespace: destroyNs })}
          confirmLabel={t('clusters.destroy')}
          confirmingLabel={t('clusters.destroying')}
          confirmText={destroyNs}
          isConfirming={destroyMutation.isPending}
          onConfirm={() => destroyMutation.mutate(destroyNs)}
          onCancel={() => setDestroyNs(null)}
        />
      )}
    </div>
  )
}
