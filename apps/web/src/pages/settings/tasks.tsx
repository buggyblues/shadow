import { Badge, Button, EmptyState, ProgressBar } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  Check,
  ChevronDown,
  ExternalLink,
  HelpCircle,
  History,
  Sparkles,
  Trophy,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PriceDisplay } from '../../components/shop/ui/currency'
import { fetchApi } from '../../lib/api'
import { useUIStore } from '../../stores/ui.store'
import { SettingsCard, SettingsNotice, SettingsPanel, SettingsSectionBlock } from './_shared'
import { InviteSettings } from './invite'

type TaskSettingsSection = 'tasks' | 'invite'

const taskGuideKeys: Record<string, string> = {
  create_server: 'tasks.guides.createServer',
  create_channel: 'tasks.guides.createChannel',
  first_message: 'tasks.guides.firstMessage',
  create_buddy: 'tasks.guides.createBuddy',
  list_buddy: 'tasks.guides.listBuddy',
  rent_buddy: 'tasks.guides.rentBuddy',
  list_product: 'tasks.guides.listProduct',
  invite_signup: 'tasks.guides.inviteSignup',
}

export function TaskSettings({
  initialSection = 'tasks',
}: {
  initialSection?: TaskSettingsSection
} = {}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { setPendingAction } = useUIStore()
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set())
  const [claimedAnimating, setClaimedAnimating] = useState<string | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)
  const [activeSection, setActiveSection] = useState<TaskSettingsSection>(initialSection)

  useEffect(() => {
    setActiveSection(initialSection)
  }, [initialSection])

  const { data, isLoading } = useQuery({
    queryKey: ['task-center'],
    queryFn: () =>
      fetchApi<{
        wallet: { balance: number }
        summary: { totalTasks: number; claimableTasks: number; completedTasks: number }
        tasks: Array<{
          key: string
          title: string
          description: string
          reward: number
          type: 'one_time' | 'repeatable'
          completed: boolean
          claimable: boolean
          claimedCount: number
        }>
      }>('/api/tasks'),
  })

  const { data: rewardLogs } = useQuery({
    queryKey: ['task-reward-history'],
    queryFn: () =>
      fetchApi<
        Array<{
          id: string
          rewardKey: string
          amount: number
          note: string | null
          createdAt: string
        }>
      >('/api/tasks/rewards?limit=20'),
  })

  const { data: servers = [] } = useQuery({
    queryKey: ['servers'],
    queryFn: () =>
      fetchApi<
        Array<{ server: { id: string; name: string; slug: string | null; iconUrl: string | null } }>
      >('/api/servers'),
  })

  const claimMutation = useMutation({
    mutationFn: (taskKey: string) => fetchApi(`/api/tasks/${taskKey}/claim`, { method: 'POST' }),
    onMutate: (taskKey) => {
      setClaimedAnimating(taskKey)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-center'] })
      queryClient.invalidateQueries({ queryKey: ['task-referral-summary'] })
      queryClient.invalidateQueries({ queryKey: ['wallet'] })
      setTimeout(() => setClaimedAnimating(null), 1500)
    },
    onError: () => {
      setClaimedAnimating(null)
    },
  })

  const canNavigate = (taskKey: string): boolean => {
    switch (taskKey) {
      case 'create_channel':
      case 'first_message':
      case 'list_product':
        return !!servers[0]?.server?.slug
      default:
        return true
    }
  }

  const getActionLabel = (taskKey: string) => {
    switch (taskKey) {
      case 'create_server':
        return t('tasks.goCreateServer')
      case 'create_channel':
        return t('tasks.goCreateChannel')
      case 'first_message':
        return t('tasks.goSendMessage')
      case 'create_buddy':
        return t('tasks.goCreateBuddy')
      case 'list_buddy':
        return t('tasks.goListBuddy')
      case 'rent_buddy':
        return t('tasks.goRentBuddy')
      case 'list_product':
        return t('tasks.goListProduct')
      case 'invite_signup':
        return t('tasks.goInvite')
      default:
        return t('tasks.goComplete')
    }
  }

  const handleNavigateTask = (taskKey: string) => {
    switch (taskKey) {
      case 'create_server':
        setPendingAction('create-server')
        navigate({ to: '/discover' })
        break
      case 'create_channel': {
        const firstSlug = servers[0]?.server?.slug
        if (firstSlug) {
          setPendingAction('create-channel')
          navigate({ to: '/servers/$serverSlug', params: { serverSlug: firstSlug } })
        }
        break
      }
      case 'first_message': {
        const slug = servers[0]?.server?.slug
        if (slug) {
          navigate({ to: '/servers/$serverSlug', params: { serverSlug: slug } })
        }
        break
      }
      case 'create_buddy':
        setPendingAction('create-buddy')
        navigate({ to: '/settings/buddy/create', search: {} })
        break
      case 'list_buddy':
        navigate({ to: '/settings/buddy/market', search: {} })
        break
      case 'rent_buddy':
        navigate({ to: '/settings/buddy/market', search: {} })
        break
      case 'list_product': {
        const shopSlug = servers[0]?.server?.slug
        if (shopSlug) {
          navigate({ to: '/servers/$serverSlug/shop/admin', params: { serverSlug: shopSlug } })
        }
        break
      }
      case 'invite_signup':
        navigate({ to: '/settings/invite' })
        break
    }
  }

  const completionRate = data ? (data.summary.completedTasks / data.summary.totalTasks) * 100 : 0
  const totalEarned = rewardLogs?.reduce((sum, log) => sum + log.amount, 0) ?? 0

  return (
    <SettingsPanel>
      <div className="flex flex-wrap items-center gap-1 rounded-full bg-bg-tertiary/30 p-1">
        {(['tasks', 'invite'] as TaskSettingsSection[]).map((section) => (
          <button
            key={section}
            type="button"
            aria-pressed={activeSection === section}
            onClick={() => setActiveSection(section)}
            className={`rounded-full px-3 py-1.5 text-xs font-black transition ${
              activeSection === section
                ? 'bg-primary/15 text-primary shadow-sm'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            {section === 'tasks' ? t('tasks.currentTasks') : t('settings.tabInvite')}
          </button>
        ))}
      </div>
      {activeSection === 'invite' ? (
        <InviteSettings embedded />
      ) : (
        <>
          {/* Progress Summary */}
          <SettingsCard className="relative overflow-hidden group bg-gradient-to-br from-primary/10 via-[var(--glass-bg)] to-[var(--glass-bg)] border-primary/20">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-primary/10 transition-colors" />
            <div className="relative z-10 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-black text-text-muted uppercase tracking-[0.2em] mb-1">
                    {t('tasks.totalProgress')}
                  </p>
                  <h3 className="text-3xl font-black text-text-primary tracking-tight">
                    {data?.summary.completedTasks ?? 0} / {data?.summary.totalTasks ?? 0}{' '}
                    <span className="text-sm text-text-muted opacity-40 ml-2">
                      {t('tasks.completed')}
                    </span>
                  </h3>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-black text-text-muted uppercase tracking-[0.2em] mb-0.5">
                    {t('tasks.totalEarned')}
                  </p>
                  <PriceDisplay
                    amount={totalEarned}
                    size={20}
                    className="font-black text-success"
                  />
                </div>
              </div>
              <ProgressBar value={completionRate} variant="primary" showLabel className="h-3" />
            </div>
          </SettingsCard>

          {/* Tasks — split into active (top) and completed (bottom) */}
          <SettingsSectionBlock titleKey="tasks.currentTasks">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-2">
                {/* Claimable + In-progress tasks first */}
                {data?.tasks
                  .filter((task) => !task.completed || task.claimable)
                  .map((task) => {
                    const isExpanded = expandedTasks.has(task.key)
                    const isAnimating = claimedAnimating === task.key
                    return (
                      <SettingsCard
                        key={task.key}
                        className={`relative overflow-hidden transition-all duration-500 ${
                          task.claimable ? 'ring-1 ring-warning/40 bg-warning/5' : ''
                        } ${isAnimating ? 'scale-[1.02] ring-2 ring-success/50' : ''}`}
                      >
                        {/* Reward claim animation overlay */}
                        {isAnimating && (
                          <div className="absolute inset-0 flex items-center justify-center z-20 bg-success/10 backdrop-blur-sm rounded-3xl animate-in fade-in zoom-in-95 duration-300">
                            <div className="flex items-center gap-2 text-success font-black text-lg">
                              <Sparkles size={24} className="animate-spin" />
                              {t('tasks.claimSuccess')}
                            </div>
                          </div>
                        )}

                        {/* Collapsed header — always visible */}
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedTasks((prev) => {
                              const next = new Set(prev)
                              if (next.has(task.key)) next.delete(task.key)
                              else next.add(task.key)
                              return next
                            })
                          }}
                          className="w-full flex items-center gap-3 cursor-pointer"
                        >
                          <div className="flex-1 min-w-0 flex items-center gap-2 text-left">
                            <h4 className="text-sm font-black text-text-primary uppercase tracking-tight truncate">
                              {task.title}
                            </h4>
                            {task.type === 'repeatable' && (
                              <Badge variant="info">{t('tasks.repeatable')}</Badge>
                            )}
                            {task.claimable && (
                              <Badge variant="warning" className="animate-pulse">
                                {t('tasks.claimable')}
                              </Badge>
                            )}
                          </div>
                          <PriceDisplay
                            amount={task.reward}
                            size={14}
                            className="font-bold text-success shrink-0"
                          />
                          <ChevronDown
                            size={16}
                            className={`text-text-muted shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                          />
                        </button>

                        {/* Expanded detail */}
                        {isExpanded && (
                          <div className="mt-4 pt-4 border-t border-border-subtle space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                            <p className="text-sm font-bold text-text-secondary leading-relaxed">
                              {task.description}
                            </p>

                            {taskGuideKeys[task.key] && (
                              <SettingsNotice title={t('tasks.tutorial')}>
                                <p className="text-xs font-bold text-text-secondary whitespace-pre-wrap leading-relaxed italic opacity-80 flex items-start gap-1.5">
                                  <HelpCircle
                                    size={12}
                                    className="mt-0.5 shrink-0 text-primary/70"
                                  />
                                  <span>{t(taskGuideKeys[task.key]!)}</span>
                                </p>
                              </SettingsNotice>
                            )}

                            <div className="flex justify-end">
                              {task.claimable ? (
                                <Button
                                  variant="primary"
                                  onClick={() => claimMutation.mutate(task.key)}
                                  disabled={claimMutation.isPending}
                                  loading={claimMutation.isPending}
                                  icon={Trophy}
                                  className="shadow-lg shadow-primary/25"
                                >
                                  {t('tasks.claimReward')}
                                </Button>
                              ) : canNavigate(task.key) ? (
                                <Button
                                  variant="secondary"
                                  onClick={() => handleNavigateTask(task.key)}
                                  icon={ExternalLink}
                                >
                                  {getActionLabel(task.key)}
                                </Button>
                              ) : (
                                <Badge variant="neutral" className="py-2 opacity-50">
                                  {t('tasks.unavailable')}
                                </Badge>
                              )}
                            </div>
                          </div>
                        )}
                      </SettingsCard>
                    )
                  })}

                {/* Completed tasks — collapsible, default collapsed */}
                {data?.tasks.some((t) => t.completed && !t.claimable) && (
                  <div className="mt-6">
                    <button
                      type="button"
                      onClick={() => setShowCompleted((v) => !v)}
                      className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-text-muted/40 hover:text-text-muted/70 transition-colors mb-2 cursor-pointer"
                    >
                      <ChevronDown
                        size={14}
                        className={`transition-transform duration-200 ${showCompleted ? 'rotate-180' : ''}`}
                      />
                      {t('tasks.completedSection')} (
                      {data.tasks.filter((t) => t.completed && !t.claimable).length})
                    </button>
                    {showCompleted && (
                      <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                        {data?.tasks
                          .filter((task) => task.completed && !task.claimable)
                          .map((task) => (
                            <SettingsCard key={task.key} className="opacity-50 relative">
                              <div className="flex items-center gap-3">
                                <div className="w-6 h-6 rounded-full bg-success/15 flex items-center justify-center shrink-0">
                                  <Check size={14} className="text-success" />
                                </div>
                                <h4 className="text-sm font-black text-text-primary uppercase tracking-tight truncate flex-1 line-through decoration-1">
                                  {task.title}
                                </h4>
                                <PriceDisplay
                                  amount={task.reward}
                                  size={14}
                                  className="font-bold text-text-muted shrink-0"
                                />
                              </div>
                            </SettingsCard>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </SettingsSectionBlock>

          {/* Reward History */}
          <SettingsSectionBlock titleKey="tasks.rewardHistory">
            {rewardLogs && rewardLogs.length > 0 ? (
              <div className="space-y-2">
                {rewardLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between p-4 rounded-2xl bg-[var(--glass-bg)] backdrop-blur-xl border border-border-subtle hover:bg-bg-modifier-hover transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-black text-text-primary uppercase tracking-tight truncate">
                        {log.note || log.rewardKey}
                      </p>
                      <p className="text-[11px] font-bold text-text-muted mt-0.5 opacity-60">
                        {new Date(log.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <PriceDisplay
                      amount={log.amount}
                      size={16}
                      className="font-black text-primary"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title={t('tasks.noHistory')}
                description={t('tasks.noHistoryDesc')}
                icon={History}
                className="py-12"
              />
            )}
          </SettingsSectionBlock>
        </>
      )}
    </SettingsPanel>
  )
}
