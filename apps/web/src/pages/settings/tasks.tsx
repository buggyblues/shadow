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
  Target,
  Trophy,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PriceDisplay } from '../../components/shop/ui/currency'
import { fetchApi } from '../../lib/api'
import { useUIStore } from '../../stores/ui.store'
import { SettingsCard, SettingsGroup, SettingsHeader, SettingsPanel } from './_shared'

const taskGuides: Record<string, string> = {
  create_server:
    '1. 进入「发现」页面\n2. 点击「创建服务器」按钮\n3. 填写服务器名称、头像等信息\n4. 服务器创建后会自动包含一个默认频道',
  create_channel:
    '1. 进入已加入的服务器\n2. 在频道列表上方点击 ＋ 号\n3. 输入频道名称，选择频道类型（文字/语音/公告）\n4. 设置频道权限（公开/私密）',
  first_message:
    '1. 进入任意服务器的频道\n2. 在底部消息输入框中输入内容\n3. 按回车键或点击发送按钮即可\n4. 支持 Markdown 格式、表情、图片等',
  create_buddy:
    '1. 进入「Buddy 管理」页面\n2. 点击「创建 Buddy」按钮\n3. 填写 Buddy 名称、描述等信息\n4. 创建后可通过 OpenClaw 连接 Buddy',
  list_buddy:
    '1. 进入「Buddy 管理」页面\n2. 选择要挂单的 Buddy\n3. 点击「上架到集市」\n4. 填写设备信息、技能标签和费率',
  rent_buddy:
    '1. 进入「Buddy 集市」页面（/buddies）\n2. 浏览可租赁的 Buddy 列表\n3. 点击感兴趣的 Buddy 查看详情\n4. 确认费用后签署租赁合同',
  list_product:
    '1. 进入已加入的服务器\n2. 点击侧边栏的「商店管理」\n3. 点击「上架商品」按钮\n4. 填写商品信息、规格和价格',
  invite_signup:
    '1. 进入「邀请好友」页面\n2. 复制你的专属邀请链接\n3. 分享给朋友注册\n4. 好友注册成功后双方均可获得虾币奖励',
}

export function TaskSettings() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { setPendingAction } = useUIStore()
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set())
  const [claimedAnimating, setClaimedAnimating] = useState<string | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)

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
        return t('tasks.goCreateServer', '去创建服务器')
      case 'create_channel':
        return t('tasks.goCreateChannel', '去创建频道')
      case 'first_message':
        return t('tasks.goSendMessage', '去发消息')
      case 'create_buddy':
        return t('tasks.goCreateBuddy', '去创建 Buddy')
      case 'list_buddy':
        return t('tasks.goListBuddy', '去挂单 Buddy')
      case 'rent_buddy':
        return t('tasks.goRentBuddy', '去租赁 Buddy')
      case 'list_product':
        return t('tasks.goListProduct', '去上架商品')
      case 'invite_signup':
        return t('tasks.goInvite', '去邀请好友')
      default:
        return t('tasks.goComplete', '去完成')
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
        navigate({ to: '/settings/buddy' })
        break
      case 'list_buddy':
        navigate({ to: '/settings/buddy' })
        break
      case 'rent_buddy':
        window.location.href = '/buddies'
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
      <SettingsHeader
        titleKey="settings.tabTasks"
        titleFallback="任务中心"
        descKey="tasks.desc"
        descFallback="完成任务赚取虾币，支持一次性任务与活动任务。"
        icon={Target}
      />

      {/* Progress Summary */}
      <SettingsCard className="relative overflow-hidden group bg-gradient-to-br from-primary/10 via-[var(--glass-bg)] to-[var(--glass-bg)] border-primary/20">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-primary/10 transition-colors" />
        <div className="relative z-10 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-black text-text-muted uppercase tracking-[0.2em] mb-1">
                {t('tasks.totalProgress', '总进度')}
              </p>
              <h3 className="text-3xl font-black text-text-primary tracking-tight">
                {data?.summary.completedTasks ?? 0} / {data?.summary.totalTasks ?? 0}{' '}
                <span className="text-sm text-text-muted opacity-40 ml-2">
                  {t('tasks.completed', '已完成')}
                </span>
              </h3>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-black text-text-muted uppercase tracking-[0.2em] mb-0.5">
                {t('tasks.totalEarned', '已赚取')}
              </p>
              <PriceDisplay amount={totalEarned} size={20} className="font-black text-success" />
            </div>
          </div>
          <ProgressBar value={completionRate} variant="primary" showLabel className="h-3" />
        </div>
      </SettingsCard>

      {/* Tasks — split into active (top) and completed (bottom) */}
      <SettingsGroup labelKey="tasks.currentTasks" labelFallback="当前任务">
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
                          {t('tasks.claimSuccess', '奖励已领取！')}
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
                          <Badge variant="info">{t('tasks.repeatable', '可重复')}</Badge>
                        )}
                        {task.claimable && (
                          <Badge variant="warning" className="animate-pulse">
                            {t('tasks.claimable', '可领取')}
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

                        {taskGuides[task.key] && (
                          <div className="p-3 bg-bg-tertiary/50 rounded-xl border border-border-subtle">
                            <p className="text-[11px] font-black uppercase text-text-muted tracking-widest mb-1.5 flex items-center gap-1.5">
                              <HelpCircle size={11} /> {t('tasks.tutorial', '操作教程')}
                            </p>
                            <p className="text-xs font-bold text-text-secondary whitespace-pre-wrap leading-relaxed italic opacity-80">
                              {taskGuides[task.key]}
                            </p>
                          </div>
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
                              {t('tasks.claimReward', '领取奖励')}
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
                              {t('tasks.unavailable', '暂不可用')}
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
                  {t('tasks.completedSection', '已完成')} (
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
      </SettingsGroup>

      {/* Reward History */}
      <SettingsGroup labelKey="tasks.rewardHistory" labelFallback="奖励记录">
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
                <PriceDisplay amount={log.amount} size={16} className="font-black text-primary" />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title={t('tasks.noHistory', '暂无记录')}
            description={t('tasks.noHistoryDesc', '完成第一个任务后，奖励记录将显示在这里。')}
            icon={History}
            className="py-12"
          />
        )}
      </SettingsGroup>
    </SettingsPanel>
  )
}
