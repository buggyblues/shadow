import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { PriceDisplay } from '../../components/shop/ui/currency'
import { fetchApi } from '../../lib/api'
import { useUIStore } from '../../stores/ui.store'

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
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { setPendingAction } = useUIStore()
  const [expandedTask, setExpandedTask] = useState<string | null>(null)

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-center'] })
      queryClient.invalidateQueries({ queryKey: ['task-referral-summary'] })
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
        return '去创建服务器'
      case 'create_channel':
        return '去创建频道'
      case 'first_message':
        return '去发消息'
      case 'create_buddy':
        return '去创建 Buddy'
      case 'list_buddy':
        return '去挂单 Buddy'
      case 'rent_buddy':
        return '去租赁 Buddy'
      case 'list_product':
        return '去上架商品'
      case 'invite_signup':
        return '去邀请好友'
      default:
        return '去完成'
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

  return (
    <>
      <h2 className="text-2xl font-bold text-text-primary mb-2">任务中心</h2>
      <p className="text-text-muted text-sm mb-6">完成任务赚取虾币，支持一次性任务与活动任务。</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-bg-secondary rounded-xl border border-border-subtle p-4">
          <p className="text-[11px] text-text-muted uppercase font-bold">任务总数</p>
          <p className="text-lg font-extrabold text-text-primary">
            {data?.summary.totalTasks ?? 0}
          </p>
        </div>
        <div className="bg-bg-secondary rounded-xl border border-border-subtle p-4">
          <p className="text-[11px] text-text-muted uppercase font-bold">可领取</p>
          <p className="text-lg font-extrabold text-emerald-400">
            {data?.summary.claimableTasks ?? 0}
          </p>
        </div>
        <div className="bg-bg-secondary rounded-xl border border-border-subtle p-4">
          <p className="text-[11px] text-text-muted uppercase font-bold">已完成</p>
          <p className="text-lg font-extrabold text-primary">{data?.summary.completedTasks ?? 0}</p>
        </div>
      </div>

      <div className="bg-bg-secondary rounded-xl border border-border-subtle p-5 mb-6">
        <p className="text-xs text-text-muted uppercase font-bold mb-1">当前虾币</p>
        <div className="flex items-center gap-2">
          <PriceDisplay amount={data?.wallet.balance ?? 0} size={20} />
        </div>
      </div>

      {isLoading ? (
        <div className="text-center text-text-muted py-12">加载任务中...</div>
      ) : (
        <div className="space-y-3">
          {data?.tasks.map((task) => (
            <div
              key={task.key}
              className="bg-bg-secondary rounded-xl border border-border-subtle p-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm font-bold text-text-primary">{task.title}</p>
                  <p className="text-xs text-text-muted mt-1">{task.description}</p>
                  <div className="text-xs text-emerald-400 mt-1 inline-flex items-center gap-1">
                    <span>奖励：</span>
                    <PriceDisplay amount={task.reward} size={12} />
                  </div>
                </div>

                {task.type === 'repeatable' ? (
                  task.claimedCount > 0 ? (
                    <span className="text-xs px-2 py-1 rounded bg-emerald-500/15 text-emerald-400">
                      已完成 {task.claimedCount} 次
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => navigate({ to: '/settings/invite' })}
                      className="text-xs px-2 py-1 rounded bg-primary/20 hover:bg-primary/30 text-primary"
                    >
                      {getActionLabel(task.key)}
                    </button>
                  )
                ) : task.claimable ? (
                  <button
                    type="button"
                    onClick={() => claimMutation.mutate(task.key)}
                    disabled={claimMutation.isPending}
                    className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-bold disabled:opacity-50"
                  >
                    领取
                  </button>
                ) : task.completed ? (
                  <span className="text-xs px-2 py-1 rounded bg-green-500/15 text-green-400">
                    已领取
                  </span>
                ) : (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {canNavigate(task.key) && (
                      <button
                        type="button"
                        onClick={() => handleNavigateTask(task.key)}
                        className="text-xs px-2 py-1 rounded bg-zinc-500/20 hover:bg-zinc-500/30 text-zinc-200"
                      >
                        {getActionLabel(task.key)}
                      </button>
                    )}
                    {taskGuides[task.key] && (
                      <button
                        type="button"
                        onClick={() => setExpandedTask(expandedTask === task.key ? null : task.key)}
                        className={`text-xs px-2 py-1 rounded ${
                          !canNavigate(task.key)
                            ? 'bg-primary/20 hover:bg-primary/30 text-primary font-bold'
                            : 'bg-primary/10 hover:bg-primary/20 text-primary'
                        }`}
                      >
                        {expandedTask === task.key ? '收起' : '查看教程'}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {expandedTask === task.key && taskGuides[task.key] && (
                <div className="mt-3 pt-3 border-t border-border-subtle animate-in slide-in-from-top-2 duration-200">
                  <div className="bg-bg-tertiary rounded-lg p-3">
                    <p className="text-xs font-bold text-text-muted uppercase mb-2">教程步骤</p>
                    <p className="text-xs text-text-secondary whitespace-pre-wrap leading-relaxed">
                      {taskGuides[task.key]}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 bg-bg-secondary rounded-xl border border-border-subtle p-5">
        <h3 className="text-sm font-bold text-text-primary mb-3">奖励记录</h3>
        {rewardLogs && rewardLogs.length > 0 ? (
          <div className="space-y-2">
            {rewardLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between rounded-lg bg-bg-tertiary px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-xs text-text-primary truncate">{log.note || log.rewardKey}</p>
                  <p className="text-[11px] text-text-muted">
                    {new Date(log.createdAt).toLocaleString()}
                  </p>
                </div>
                <PriceDisplay amount={log.amount} size={13} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-text-muted">暂无奖励记录</p>
        )}
      </div>
    </>
  )
}
