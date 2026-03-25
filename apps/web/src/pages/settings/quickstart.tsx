import { useNavigate } from '@tanstack/react-router'
import {
  BookOpen,
  Bot,
  ChevronRight,
  Compass,
  ExternalLink,
  Heart,
  HelpCircle,
  Home,
  MessageCircle,
  Plus,
  Sparkles,
  User,
  Zap,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function QuickstartSettings() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const quickActions = [
    {
      icon: Compass,
      title: t('guide.discoverTitle'),
      desc: t('guide.discoverDesc'),
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      action: () => navigate({ to: '/discover' }),
    },
    {
      icon: Bot,
      title: 'Buddy 管理',
      desc: '创建和配置你的 AI 助手',
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-500/10',
      action: () => navigate({ to: '/settings/buddy' }),
    },
    {
      icon: Sparkles,
      title: 'Buddy 集市',
      desc: '浏览和租赁 AI 助手',
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
      action: () => {
        window.location.href = '/buddies'
      },
    },
  ]

  const guideSteps = [
    {
      step: 1,
      title: '创建或加入服务器',
      desc: '服务器是你的社群空间。你可以创建自己的服务器，或通过邀请链接加入他人的服务器。',
      icon: Plus,
      action: () => navigate({ to: '/discover' }),
      actionLabel: '发现服务器',
    },
    {
      step: 2,
      title: '设置个人资料',
      desc: '上传头像、设置昵称，让其他人更容易认识你。',
      icon: User,
      action: () => navigate({ to: '/settings/profile' }),
      actionLabel: '编辑资料',
    },
    {
      step: 3,
      title: '开始聊天',
      desc: '在服务器的频道中发消息，或与好友进行私信交流。支持文字、图片、文件等多种格式。',
      icon: MessageCircle,
      action: () => navigate({ to: '/settings/friends' }),
      actionLabel: '开始聊天',
    },
  ]

  const buddySteps = [
    {
      step: 1,
      title: '创建 Buddy',
      desc: 'Buddy 是你的 AI 助手。在「Buddy 管理」中创建一个新 Buddy，设置名称和描述。',
    },
    {
      step: 2,
      title: '配置技能',
      desc: '为 Buddy 安装技能，让它具备各种能力：搜索网页、控制设备、处理文件等。',
    },
    {
      step: 3,
      title: '连接 OpenClaw',
      desc: '下载 OpenClaw 桌面端，用它可以连接你的 Buddy 并在本地运行。',
    },
    {
      step: 4,
      title: '上架集市（可选）',
      desc: '将你的 Buddy 上架到集市，让其他人也可以租赁使用。',
    },
  ]

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="text-center py-8">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-bg-secondary border border-border-subtle mb-4">
          <img src="/Logo.svg" alt="Shadow" className="w-12 h-12 opacity-90" />
        </div>
        <h1 className="text-2xl font-extrabold text-text-primary mb-2">
          {t('common.welcomeTitle')}
        </h1>
        <p className="text-text-secondary text-[15px] max-w-md mx-auto">
          {t('common.welcomeDesc')}
        </p>
      </div>

      {/* Quick Actions */}
      <section>
        <h2 className="text-lg font-bold text-text-primary mb-4 flex items-center gap-2">
          <Zap size={18} className="text-amber-400" />
          快速开始
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {quickActions.map((item, idx) => (
            <button
              key={idx}
              onClick={item.action}
              className="group relative bg-bg-secondary hover:bg-bg-tertiary border border-border-subtle rounded-xl p-5 text-left transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
            >
              <div
                className={`inline-flex items-center justify-center w-10 h-10 rounded-lg ${item.bgColor} mb-3`}
              >
                <item.icon size={20} className={item.color} />
              </div>
              <h3 className="font-bold text-text-primary text-[15px] mb-1 group-hover:text-primary transition-colors">
                {item.title}
              </h3>
              <p className="text-text-muted text-[13px]">{item.desc}</p>
              <ChevronRight
                size={16}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity"
              />
            </button>
          ))}
        </div>
      </section>

      {/* New User Guide */}
      <section>
        <h2 className="text-lg font-bold text-text-primary mb-4 flex items-center gap-2">
          <Sparkles size={18} className="text-primary" />
          新手指南
        </h2>
        <div className="bg-bg-secondary rounded-xl border border-border-subtle overflow-hidden">
          {guideSteps.map((step, idx) => (
            <div
              key={step.step}
              className={`flex items-start gap-4 p-5 ${idx < guideSteps.length - 1 ? 'border-b border-border-subtle' : ''}`}
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm shrink-0">
                {step.step}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-text-primary text-[14px] mb-1">
                      {step.title}
                    </h3>
                    <p className="text-text-muted text-[13px] leading-relaxed">{step.desc}</p>
                  </div>
                  <button
                    onClick={step.action}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold transition"
                  >
                    {step.actionLabel}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Buddy Guide */}
      <section>
        <h2 className="text-lg font-bold text-text-primary mb-4 flex items-center gap-2">
          <Bot size={18} className="text-cyan-400" />
          Buddy 入门
        </h2>
        <div className="bg-bg-secondary rounded-xl border border-border-subtle p-5">
          <div className="flex items-start gap-4 mb-4">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-cyan-500/10 shrink-0">
              <Bot size={20} className="text-cyan-400" />
            </div>
            <div>
              <h3 className="font-semibold text-text-primary mb-1">什么是 Buddy？</h3>
              <p className="text-text-muted text-[13px] leading-relaxed">
                Buddy 是你的个人 AI
                助手。它可以帮你搜索信息、处理文档、控制设备，甚至可以作为智能客服为你服务。
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            {buddySteps.map((step) => (
              <div key={step.step} className="flex items-start gap-3 p-3 rounded-lg bg-bg-tertiary">
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-cyan-500/10 text-cyan-400 font-bold text-xs shrink-0">
                  {step.step}
                </div>
                <div>
                  <h4 className="font-medium text-text-primary text-[13px] mb-0.5">{step.title}</h4>
                  <p className="text-text-muted text-[12px]">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border-subtle">
            <button
              onClick={() => navigate({ to: '/settings/buddy' })}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-white font-bold text-sm transition"
            >
              <Bot size={16} />
              创建 Buddy
            </button>
            <a
              href="/buddies"
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-bg-tertiary hover:bg-bg-modifier-hover text-text-primary font-bold text-sm transition"
            >
              <ExternalLink size={16} />
              浏览集市
            </a>
          </div>
        </div>
      </section>

      {/* Help Section */}
      <section>
        <h2 className="text-lg font-bold text-text-primary mb-4 flex items-center gap-2">
          <HelpCircle size={18} className="text-violet-400" />
          需要帮助？
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a
            href="/product/index.html"
            className="flex items-center gap-4 p-4 bg-bg-secondary hover:bg-bg-tertiary border border-border-subtle rounded-xl transition group"
          >
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-violet-500/10">
              <BookOpen size={20} className="text-violet-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-text-primary text-[14px] group-hover:text-primary transition-colors">
                文档中心
              </h3>
              <p className="text-text-muted text-[12px]">查看详细使用教程和 API 文档</p>
            </div>
            <ExternalLink
              size={16}
              className="text-text-muted group-hover:text-primary transition-colors"
            />
          </a>
          <a
            href="/?forceHome=true"
            className="flex items-center gap-4 p-4 bg-bg-secondary hover:bg-bg-tertiary border border-border-subtle rounded-xl transition group"
          >
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-amber-500/10">
              <Home size={20} className="text-amber-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-text-primary text-[14px] group-hover:text-primary transition-colors">
                返回官网
              </h3>
              <p className="text-text-muted text-[12px]">访问 Shadow 官方首页</p>
            </div>
            <ExternalLink
              size={16}
              className="text-text-muted group-hover:text-primary transition-colors"
            />
          </a>
        </div>
      </section>

      {/* Footer Tips */}
      <div className="flex items-center justify-center gap-2 py-4 text-text-muted text-xs">
        <Heart size={12} className="text-pink-400" />
        <span>遇到问题？在任意频道中 @管理员 获取帮助</span>
      </div>
    </div>
  )
}
