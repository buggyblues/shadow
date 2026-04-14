import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  ArrowUpDown,
  BarChart3,
  Box,
  Clock,
  Filter,
  Rocket,
  Settings,
  Shield,
  Trash2,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, EmptyState, NativeSelect, Search } from '@shadowob/ui'
import { Breadcrumb } from '@/components/Breadcrumb'
import { useDebounce } from '@/hooks/useDebounce'
import { api } from '@/lib/api'
import { getRelativeTime, pluralize } from '@/lib/utils'
import { type ActivityEntry, type ActivityType, useAppStore } from '@/stores/app'

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<
  ActivityType,
  { label: string; icon: React.ReactNode; variant: 'success' | 'danger' | 'info' | 'warning' | 'neutral' }
> = {
  deploy: {
    label: 'Deploy',
    icon: <Rocket size={12} />,
    variant: 'success',
  },
  destroy: {
    label: 'Destroy',
    icon: <Trash2 size={12} />,
    variant: 'danger',
  },
  scale: {
    label: 'Scale',
    icon: <BarChart3 size={12} />,
    variant: 'info',
  },
  config: {
    label: 'Config',
    icon: <Shield size={12} />,
    variant: 'warning',
  },
  init: {
    label: 'Init',
    icon: <Box size={12} />,
    variant: 'neutral',
  },
  settings: {
    label: 'Settings',
    icon: <Settings size={12} />,
    variant: 'neutral',
  },
}

const ALL_TYPES: ActivityType[] = ['deploy', 'destroy', 'scale', 'config', 'init', 'settings']

// ── Activity Item ─────────────────────────────────────────────────────────────

function ActivityItem({ activity }: { activity: ActivityEntry }) {
  const config = TYPE_CONFIG[activity.type]
  const time = new Date(activity.timestamp)
  const isValidDate = !Number.isNaN(time.getTime())

  return (
    <div className="flex gap-4 py-4 border-b border-gray-800/50 last:border-0 hover:bg-gray-800/10 transition-colors px-4 -mx-4 rounded-lg">
      {/* Icon */}
      <div className="mt-1 p-2 bg-gray-900 border border-gray-800 rounded-lg shrink-0">
        {config.icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-medium text-gray-200">{activity.title}</p>
          <Badge variant={config.variant} size="sm">
            {config.label}
          </Badge>
        </div>
        {activity.detail && <p className="text-xs text-gray-500 mb-1">{activity.detail}</p>}
        <div className="flex items-center gap-3 text-xs text-gray-600">
          <span className="flex items-center gap-1">
            <Clock size={10} />
            {isValidDate ? time.toLocaleString() : '—'}
          </span>
          {activity.namespace && <span className="font-mono">ns: {activity.namespace}</span>}
          {activity.template && <span className="font-mono">tmpl: {activity.template}</span>}
        </div>
      </div>

      {/* Relative time */}
      <span className="text-xs text-gray-600 shrink-0 mt-1">
        {isValidDate ? getRelativeTime(activity.timestamp) : ''}
      </span>
    </div>
  )
}

// ── Stats Bar ─────────────────────────────────────────────────────────────────

function StatsBar({ activities }: { activities: ActivityEntry[] }) {
  const counts = useMemo(() => {
    const result: Record<string, number> = {}
    for (const a of activities) {
      result[a.type] = (result[a.type] ?? 0) + 1
    }
    return result
  }, [activities])

  const today = useMemo(() => {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    return activities.filter((a) => a.timestamp >= startOfDay.getTime()).length
  }, [activities])

  return (
    <div className="flex items-center gap-6 text-xs text-gray-500 mb-6">
      <span className="flex items-center gap-2">
        <Activity size={12} />
        {activities.length} total {pluralize(activities.length, 'activity', 'activities')}
      </span>
      <span>|</span>
      <span>{today} today</span>
      {counts.deploy && (
        <>
          <span>|</span>
          <span className="text-green-500">{counts.deploy} deploys</span>
        </>
      )}
      {counts.destroy && (
        <>
          <span>|</span>
          <span className="text-red-500">{counts.destroy} destroys</span>
        </>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function ActivityPage() {
  const { t } = useTranslation()
  const { data: activityData } = useQuery({
    queryKey: ['activity'],
    queryFn: () => api.activity.list(),
    staleTime: 10_000,
  })
  // Map API response (createdAt: string) to ActivityEntry (timestamp: number)
  const activities = useMemo(() => {
    return (activityData?.activities ?? []).map((a: Record<string, unknown>) => ({
      ...a,
      timestamp:
        a.timestamp ?? (a.createdAt ? new Date(a.createdAt as string).getTime() : Date.now()),
    })) as ActivityEntry[]
  }, [activityData])
  const clearActivities = useAppStore((s) => s.clearActivities)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<ActivityType | 'all'>('all')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest')
  const debouncedSearch = useDebounce(search)

  const filtered = useMemo(() => {
    let list = activities

    // Type filter
    if (typeFilter !== 'all') {
      list = list.filter((a) => a.type === typeFilter)
    }

    // Search
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      list = list.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.detail?.toLowerCase().includes(q) ||
          a.namespace?.toLowerCase().includes(q) ||
          a.template?.toLowerCase().includes(q),
      )
    }

    // Sort
    if (sortOrder === 'oldest') {
      list = [...list].reverse()
    }

    return list
  }, [activities, typeFilter, debouncedSearch, sortOrder])

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Breadcrumb items={[{ label: t('activity.title') }]} className="mb-4" />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">{t('activity.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('activity.description')}</p>
        </div>
        {activities.length > 0 && (
          <Button
            type="button"
            onClick={clearActivities}
            variant="ghost"
            size="sm"
          >
            <Trash2 size={12} />
            {t('common.clearAll')}
          </Button>
        )}
      </div>

      <StatsBar activities={activities} />

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <Search
          value={search}
          onChange={setSearch}
          placeholder={t('activity.searchActivities')}
        />

        <div className="flex items-center gap-2">
          <Filter size={12} className="text-gray-600" />
          <NativeSelect
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as ActivityType | 'all')}
          >
            <option value="all">{t('activity.allTypes')}</option>
            {ALL_TYPES.map((type) => (
              <option key={type} value={type}>
                {TYPE_CONFIG[type].label}
              </option>
            ))}
          </NativeSelect>
        </div>

        <Button
          type="button"
          onClick={() => setSortOrder((s) => (s === 'newest' ? 'oldest' : 'newest'))}
          variant="ghost"
          size="sm"
        >
          <ArrowUpDown size={11} />
          {sortOrder === 'newest' ? t('activity.newestFirst') : t('activity.oldestFirst')}
        </Button>
      </div>

      {/* Activity List */}
      {filtered.length === 0 && (
        <EmptyState
          icon={Activity}
          title={t('activity.noActivityRecorded')}
          description={
            activities.length === 0
              ? t('activity.operationsWillAppear')
              : t('activity.noActivitiesMatch')
          }
        />
      )}

      {filtered.length > 0 && (
        <Card variant="surface">
          {filtered.map((activity) => (
            <ActivityItem key={activity.id} activity={activity} />
          ))}

          {filtered.length >= 100 && (
            <p className="text-center text-xs text-gray-600 py-4">
              {t('activity.showingMostRecent')}
            </p>
          )}
        </Card>
      )}
    </div>
  )
}
