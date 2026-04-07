import {
  Accordion,
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  ProgressBar,
  SectionHeader,
} from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ExternalLink, HelpCircle, History, Target, Trophy } from 'lucide-react'
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

  const completionRate = data ? (data.summary.completedTasks / data.summary.totalTasks) * 100 : 0

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl pb-20">
      <SectionHeader
        title="任务中心"
        description="完成任务赚取虾币，支持一次性任务与活动任务。"
        icon={Target}
      />

      {/* Progress Summary */}
      <Card className="p-8 bg-gradient-to-br from-primary/10 via-bg-secondary to-bg-secondary border-primary/20 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-primary/10 transition-colors" />
        <div className="relative z-10 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-black text-text-muted uppercase tracking-widest mb-1">
                总进度
              </p>
              <h3 className="text-3xl font-black text-text-primary tracking-tight">
                {data?.summary.completedTasks ?? 0} / {data?.summary.totalTasks ?? 0}{' '}
                <span className="text-sm text-text-muted opacity-40 ml-2">已完成</span>
              </h3>
            </div>
            <div className="w-16 h-16 rounded-3xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
              <Trophy size={32} strokeWidth={2.5} />
            </div>
          </div>
          <ProgressBar value={completionRate} variant="primary" showLabel className="h-3" />
        </div>
      </Card>

      <section className="space-y-6">
        <Divider label="当前任务" />

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {data?.tasks.map((task) => (
              <Accordion
                type="single"
                key={task.key}
                title={task.title}
                icon={Target}
                className={task.completed ? 'opacity-60' : ''}
              >
                <div className="flex flex-col md:flex-row md:items-start gap-6">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      {task.type === 'repeatable' && <Badge variant="info">可重复</Badge>}
                      {task.completed && <Badge variant="success">已完成</Badge>}
                    </div>
                    <p className="text-sm font-bold text-text-secondary leading-relaxed mb-4">
                      {task.description}
                    </p>

                    <div className="p-4 bg-bg-tertiary/50 rounded-2xl border border-border-subtle">
                      <p className="text-[11px] font-black uppercase text-text-muted tracking-widest mb-2 flex items-center gap-2">
                        <HelpCircle size={12} /> 操作教程
                      </p>
                      <p className="text-xs font-bold text-text-secondary whitespace-pre-wrap leading-relaxed italic opacity-80">
                        {taskGuides[task.key] || '暂无教程'}
                      </p>
                    </div>
                  </div>

                  <div className="w-full md:w-48 flex flex-col gap-3 shrink-0">
                    <Card className="p-4 flex flex-col items-center justify-center text-center bg-bg-tertiary/50 shadow-inner">
                      <span className="text-[11px] font-black uppercase text-text-muted tracking-widest mb-1">
                        奖励
                      </span>
                      <PriceDisplay
                        amount={task.reward}
                        size={20}
                        className="font-black text-success"
                      />
                    </Card>

                    {task.claimable ? (
                      <Button
                        variant="primary"
                        onClick={() => claimMutation.mutate(task.key)}
                        disabled={claimMutation.isPending}
                        loading={claimMutation.isPending}
                        icon={Trophy}
                        className="w-full"
                      >
                        领取奖励
                      </Button>
                    ) : task.completed && task.type !== 'repeatable' ? (
                      <Button variant="ghost" disabled className="w-full">
                        已领取
                      </Button>
                    ) : canNavigate(task.key) ? (
                      <Button
                        variant="secondary"
                        onClick={() => handleNavigateTask(task.key)}
                        icon={ExternalLink}
                        className="w-full"
                      >
                        {getActionLabel(task.key)}
                      </Button>
                    ) : (
                      <Badge variant="neutral" className="py-3 text-center opacity-50">
                        暂不可用
                      </Badge>
                    )}
                  </div>
                </div>
              </Accordion>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-6 pt-10">
        <Divider label="奖励记录" />

        <Card className="overflow-hidden bg-transparent border-none">
          {rewardLogs && rewardLogs.length > 0 ? (
            <div className="space-y-2">
              {rewardLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-5 bg-bg-tertiary/50 rounded-2xl hover:bg-bg-modifier-hover transition-colors border border-border-subtle"
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
              title="暂无记录"
              description="完成第一个任务后，奖励记录将显示在这里。"
              icon={History}
              className="py-12"
            />
          )}
        </Card>
      </section>
    </div>
  )
}
