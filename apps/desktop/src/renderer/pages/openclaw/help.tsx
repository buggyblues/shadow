/**
 * OpenClaw Help Center
 *
 * Quick-start guide for initializing, binding Buddy, and chatting in channels.
 */

import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Globe,
  HelpCircle,
  Link2,
  MessageSquare,
  Play,
  Settings2,
  Zap,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { OpenClawTopBar } from './openclaw-brand'
import type { OpenClawPage } from './openclaw-layout'

interface HelpPageProps {
  onNavigate: (page: OpenClawPage) => void
}

export function HelpPage({ onNavigate }: HelpPageProps) {
  const { t } = useTranslation()

  return (
    <div className="flex-1 overflow-y-auto no-scrollbar">
      <OpenClawTopBar
        title={t('openclaw.help.title', '帮助中心')}
        subtitle={t('openclaw.help.subtitle', '快速上手 OpenClaw，释放 AI 龙虾的全部潜能')}
      />

      <div className="px-6 pb-8 space-y-8 max-w-4xl">
        {/* ─── Quick Start Steps ─── */}
        <section className="space-y-4">
          <h2 className="text-lg font-black text-text-primary flex items-center gap-2">
            <Zap size={20} className="text-amber-400" />
            {t('openclaw.help.quickStart', '快速开始')}
          </h2>

          <div className="space-y-3">
            <StepCard
              step={1}
              icon={Play}
              title={t('openclaw.help.step1Title', '启动龙虾服务')}
              description={t(
                'openclaw.help.step1Desc',
                '前往仪表盘，点击「启动」按钮，等待龙虾服务启动完毕。首次启动会自动安装所需依赖。',
              )}
              action={t('openclaw.help.goToDashboard', '前往仪表盘')}
              onAction={() => onNavigate('dashboard')}
            />
            <StepCard
              step={2}
              icon={Bot}
              title={t('openclaw.help.step2Title', '创建智能体 (Claw)')}
              description={t(
                'openclaw.help.step2Desc',
                '在「我的龙虾」页面创建一个智能体，配置名称、模型和技能。智能体是处理消息的核心角色。',
              )}
              action={t('openclaw.help.goToAgents', '前往我的龙虾')}
              onAction={() => onNavigate('agents')}
            />
            <StepCard
              step={3}
              icon={Settings2}
              title={t('openclaw.help.step3Title', '配置模型提供商')}
              description={t(
                'openclaw.help.step3Desc',
                '添加至少一个 AI 模型提供商（如 OpenAI、Claude 等），填入 API Key，为智能体提供语言模型支持。',
              )}
              action={t('openclaw.help.goToModels', '前往模型配置')}
              onAction={() => onNavigate('models')}
            />
            <StepCard
              step={4}
              icon={Link2}
              title={t('openclaw.help.step4Title', '绑定 Buddy 连接')}
              description={t(
                'openclaw.help.step4Desc',
                '前往 Buddy 连接页面，添加你的 Shadow 服务器地址和 Token，选择要绑定的智能体，点击保存并连接。',
              )}
              action={t('openclaw.help.goToBuddy', '前往 Buddy 连接')}
              onAction={() => onNavigate('buddy')}
            />
            <StepCard
              step={5}
              icon={MessageSquare}
              title={t('openclaw.help.step5Title', '在频道中对话')}
              description={t(
                'openclaw.help.step5Desc',
                'Buddy 连接成功后，你的智能体会自动加入 Shadow 频道。在频道中 @提及你的智能体即可开始对话。',
              )}
            />
          </div>
        </section>

        {/* ─── FAQ ─── */}
        <section className="space-y-4">
          <h2 className="text-lg font-black text-text-primary flex items-center gap-2">
            <HelpCircle size={20} className="text-primary" />
            {t('openclaw.help.faq', '常见问题')}
          </h2>

          <div className="space-y-3">
            <FaqCard
              question={t('openclaw.help.faq1Q', '什么是 Buddy？')}
              answer={t(
                'openclaw.help.faq1A',
                'Buddy 是 Shadow 平台的智能体代理。通过 Buddy 连接，你的本地 AI 智能体可以加入远程 Shadow 频道，像真实用户一样参与对话。',
              )}
            />
            <FaqCard
              question={t('openclaw.help.faq2Q', '如何获取 Buddy Token？')}
              answer={t(
                'openclaw.help.faq2A',
                '在 Shadow 网页端或桌面端进入「设置 → Buddy」，创建一个新的 Buddy，然后点击「生成 Token」即可获取。将 Token 粘贴到 Buddy 连接配置中。',
              )}
            />
            <FaqCard
              question={t('openclaw.help.faq3Q', '龙虾服务启动失败怎么办？')}
              answer={t(
                'openclaw.help.faq3A',
                '请检查调试控制台中的日志信息。常见原因包括：端口被占用、网络问题、依赖安装失败。可以尝试重新安装或更换端口。',
              )}
            />
            <FaqCard
              question={t('openclaw.help.faq4Q', '如何让智能体使用技能？')}
              answer={t(
                'openclaw.help.faq4A',
                '在技能商店中安装所需技能，然后在「我的龙虾」中编辑智能体，勾选要启用的技能即可。技能会扩展智能体的能力，如搜索网页、执行代码等。',
              )}
            />
            <FaqCard
              question={t('openclaw.help.faq5Q', '可以连接多个 IM 平台吗？')}
              answer={t(
                'openclaw.help.faq5A',
                '可以，在「IM 通道」页面可以配置 Telegram、Discord、Slack 等多个平台。每个平台独立配置，你的智能体会同时在所有已配置的平台上工作。',
              )}
            />
          </div>
        </section>

        {/* ─── Architecture Overview ─── */}
        <section className="rounded-2xl border border-border-subtle bg-bg-secondary p-6 space-y-4">
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <Globe size={16} className="text-text-muted" />
            {t('openclaw.help.architecture', '架构总览')}
          </h2>
          <div className="flex items-center justify-center gap-3 py-4 flex-wrap">
            <ArchNode label={t('openclaw.help.archUser', '用户')} icon="👤" />
            <ArrowRight size={16} className="text-text-muted shrink-0" />
            <ArchNode label="Shadow" icon="💬" />
            <ArrowRight size={16} className="text-text-muted shrink-0" />
            <ArchNode label="Buddy" icon="🔗" highlight />
            <ArrowRight size={16} className="text-text-muted shrink-0" />
            <ArchNode label={t('openclaw.help.archGateway', '龙虾服务')} icon="🦞" highlight />
            <ArrowRight size={16} className="text-text-muted shrink-0" />
            <ArchNode label={t('openclaw.help.archAgent', '智能体')} icon="🤖" />
          </div>
          <p className="text-xs text-text-muted text-center">
            {t(
              'openclaw.help.archDesc',
              '用户在 Shadow 频道发送消息 → 通过 Buddy 连接转发 → 龙虾服务处理 → 智能体生成回复 → 返回频道',
            )}
          </p>
        </section>
      </div>
    </div>
  )
}

/* ─── Sub-components ─── */

function StepCard({
  step,
  icon: Icon,
  title,
  description,
  action,
  onAction,
}: {
  step: number
  icon: typeof Play
  title: string
  description: string
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="flex gap-4 rounded-2xl border border-border-subtle bg-bg-secondary p-5 group hover:border-primary/30 transition-all">
      <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 text-sm font-black text-primary">
        {step}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Icon size={16} className="text-text-muted" />
          <h3 className="text-sm font-bold text-text-primary">{title}</h3>
        </div>
        <p className="text-xs text-text-muted leading-relaxed">{description}</p>
        {action && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary/80 transition-colors"
          >
            {action}
            <ArrowRight size={12} />
          </button>
        )}
      </div>
      <div className="w-5 h-5 rounded-full border-2 border-border-subtle flex items-center justify-center shrink-0 mt-0.5">
        <CheckCircle2
          size={14}
          className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity"
        />
      </div>
    </div>
  )
}

function FaqCard({ question, answer }: { question: string; answer: string }) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-secondary p-5">
      <h3 className="text-sm font-bold text-text-primary mb-2">{question}</h3>
      <p className="text-xs text-text-muted leading-relaxed">{answer}</p>
    </div>
  )
}

function ArchNode({
  label,
  icon,
  highlight,
}: {
  label: string
  icon: string
  highlight?: boolean
}) {
  return (
    <div
      className={`flex flex-col items-center gap-1.5 px-4 py-3 rounded-2xl border ${
        highlight ? 'border-primary/30 bg-primary/5' : 'border-border-subtle bg-bg-secondary'
      }`}
    >
      <span className="text-xl">{icon}</span>
      <span className="text-[11px] font-bold text-text-secondary whitespace-nowrap">{label}</span>
    </div>
  )
}
