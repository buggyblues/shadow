import { Badge, Button, Card, EmptyState, NativeSelect, Search } from '@shadowob/ui'
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
import { PageShell } from '@/components/PageShell'
import { useDebounce } from '@/hooks/useDebounce'
import { api } from '@/lib/api'
import { getRelativeTime } from '@/lib/utils'
import { type ActivityEntry, type ActivityType, useAppStore } from '@/stores/app'

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_ICON: Record<ActivityType, React.ReactNode> = {
  deploy: <Rocket size={12} />,
  destroy: <Trash2 size={12} />,
  scale: <BarChart3 size={12} />,
  config: <Shield size={12} />,
  init: <Box size={12} />,
  settings: <Settings size={12} />,
}

const TYPE_VARIANT: Record<ActivityType, 'success' | 'danger' | 'info' | 'warning' | 'neutral'> = {
  deploy: 'success',
  destroy: 'danger',
  scale: 'info',
  config: 'warning',
  init: 'neutral',
  settings: 'neutral',
}

const ALL_TYPES: ActivityType[] = ['deploy', 'destroy', 'scale', 'config', 'init', 'settings']

// ── Activity Item ─────────────────────────────────────────────────────────────

function ActivityItem({ activity }: { activity: ActivityEntry }) {
  const { t } = useTranslation()
  const time = new Date(activity.timestamp)
  const isValidDate = !Number.isNaN(time.getTime())

  return (
    <div className="flex gap-4 py-4 border-b border-border-subtle last:border-0 hover:bg-bg-modifier-hover transition-colors px-4 -mx-4 rounded-lg">
      {/* Icon */}
      <div className="mt-1 p-2 bg-bg-secondary border border-border-subtle rounded-lg shrink-0">
        {TYPE_ICON[activity.type]}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-medium text-text-primary">{activity.title}</p>
          <Badge variant={TYPE_VARIANT[activity.type]} size="sm">
            {t(`activity.types.${activity.type}`)}
          </Badge>
        </div>
        {activity.detail && <p className="text-xs text-text-muted mb-1">{activity.detail}</p>}
        <div className="flex items-center gap-3 text-xs text-text-muted">
          <span className="flex items-center gap-1">
            <Clock size={10} />
            {isValidDate ? time.toLocaleString() : '—'}
          </span>
          {activity.namespace && <span className="font-mono">ns: {activity.namespace}</span>}
          {activity.template && <span className="font-mono">tmpl: {activity.template}</span>}
        </div>
      </div>

      {/* Relative time */}
      <span className="text-xs text-text-muted shrink-0 mt-1">
        {isValidDate ? getRelativeTime(activity.timestamp) : ''}
      </span>
    </div>
  )
}

// ── Stats Bar ─────────────────────────────────────────────────────────────────

function StatsBar({ activities }: { activities: ActivityEntry[] }) {
  const { t } = useTranslation()
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
    <div className="flex items-center gap-6 text-xs text-text-muted mb-6">
      <span className="flex items-center gap-2">
        <Activity size={12} />
        {activities.length} {t('activity.total')} {t('activity.activities')}
      </span>
      <span>|</span>
      <span>
        {today} {t('activity.today')}
      </span>
      {counts.deploy ? (
        <>
          <span>|</span>
          <span className="text-green-500">
            {counts.deploy} {t('activity.deploys')}
          </span>
        </>
      ) : null}
      {counts.destroy ? (
        <>
          <span>|</span>
          <span className="text-red-500">
            {counts.destroy} {t('activity.destroys')}
          </span>
        </>
      ) : null}
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
    <PageShell
      breadcrumb={[]}
      title={t('activity.title')}
      description={t('activity.description')}
      actions={
        activities.length > 0 ? (
          <Button type="button" onClick={clearActivities} variant="ghost" size="sm">
            <Trash2 size={12} />
            {t('common.clearAll')}
          </Button>
        ) : undefined
      }
      headerContent={
        <div className="flex items-center gap-3 flex-wrap">
          <Search
            value={search}
            onChange={setSearch}
            placeholder={t('activity.searchActivities')}
          />
          <div className="flex items-center gap-2">
            <Filter size={12} className="text-text-muted" />
            <NativeSelect
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as ActivityType | 'all')}
            >
              <option value="all">{t('activity.allTypes')}</option>
              {ALL_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`activity.types.${type}`)}
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
      }
    >
      <StatsBar activities={activities} />

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
            <p className="text-center text-xs text-text-muted py-4">
              {t('activity.showingMostRecent')}
            </p>
          )}
        </Card>
      )}
    </PageShell>
  )
}
