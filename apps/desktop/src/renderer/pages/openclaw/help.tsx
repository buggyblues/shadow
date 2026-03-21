/**
 * OpenClaw Help Center
 *
 * Quick-start guide for initializing, binding Buddy, and chatting in channels.
 */

import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight,
  Bot,
  Globe,
  HelpCircle,
  Link2,
  MessageSquare,
  Users,
  Wand2,
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
        {/* ─── Setup Wizard Banner ─── */}
        <button
          type="button"
          onClick={() => onNavigate('onboard')}
          className="w-full rounded-2xl border border-primary/30 bg-primary/5 p-5 text-left hover:border-primary/50 hover:bg-primary/10 transition-all cursor-pointer group"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Wand2 size={24} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-text-primary group-hover:text-primary transition-colors">
                {t('openclaw.help.wizardTitle', '初始设置向导')}
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                {t(
                  'openclaw.help.wizardDesc',
                  '首次使用？通过设置向导快速完成模型配置、创建智能体、关联 Buddy，一键启动。',
                )}
              </p>
            </div>
            <ArrowRight
              size={16}
              className="text-text-muted group-hover:text-primary transition-colors shrink-0"
            />
          </div>
        </button>

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
                'Buddy 是虾豆平台的智能体代理。通过 Buddy 连接，你的本地 AI 智能体可以加入远程虾豆频道，像真实用户一样参与对话。每个 Buddy 连接会绑定一个本地智能体，当其他用户在频道中 @提及 Buddy 时，消息将被转发到本地智能体进行处理和回复。',
              )}
            />
            <FaqCard
              question={t('openclaw.help.faqApiKeyQ', '模型 API Key 配置不生效？')}
              answer={t(
                'openclaw.help.faqApiKeyA',
                '请检查以下几点：1) 确认 API Key 已正确粘贴，没有多余的空格或换行。2) 确认所选模型提供商与 Key 匹配（如 OpenAI Key 不能用于 Claude）。3) 如果使用自定义 Base URL，请确认地址可以正常访问。4) 保存配置后需要等待网关重新加载，或手动重启网关。',
              )}
            />
            <FaqCard
              question={t('openclaw.help.faq3Q', '龙虾服务启动失败怎么办？')}
              answer={t(
                'openclaw.help.faq3A',
                '请检查调试控制台中的日志信息。常见原因包括：1) 端口被占用 — 可在仪表盘查看当前端口号，关闭占用进程后重试。2) 依赖安装失败 — 检查网络连接后重新安装。3) 配置文件损坏 — 可在仪表盘中重置配置。如果问题持续，可尝试在调试页面查看详细日志。',
              )}
            />
            <FaqCard
              question={t('openclaw.help.faqBuddyConnQ', 'Buddy 连接失败怎么办？')}
              answer={t(
                'openclaw.help.faqBuddyConnA',
                '请依次检查：1) 网关是否已启动（仪表盘显示「运行中」）。2) 网络是否正常，能否访问虾豆服务器。3) Token 是否过期 — 可以尝试重新生成 Token。4) 如果显示「心跳超时」，可能是网络不稳定导致的临时断连，稍后会自动重连。',
              )}
            />
            <FaqCard
              question={t('openclaw.help.faq4Q', '如何让智能体使用技能？')}
              answer={t(
                'openclaw.help.faq4A',
                '前往「技能商店」浏览并安装所需技能（如网页搜索、代码执行、图片生成等），然后在「我的龙虾」中编辑智能体，在技能列表中勾选要启用的技能即可。一个智能体可以同时启用多个技能，技能会自动被模型作为工具调用。',
              )}
            />
            <FaqCard
              question={t('openclaw.help.faq5Q', '可以连接多个 IM 平台吗？')}
              answer={t(
                'openclaw.help.faq5A',
                '可以。在「IM 通道」页面可以配置 Telegram、Discord、Slack 等多个平台。每个平台独立配置，你的智能体会同时在所有已配置的平台上工作。不同平台的消息是独立处理的，不会互相干扰。',
              )}
            />
            <FaqCard
              question={t('openclaw.help.faqConfigQ', '配置文件在哪里？')}
              answer={t(
                'openclaw.help.faqConfigA',
                'OpenClaw 的配置文件位于 ~/.shadowob/openclaw.json，工作区文件位于 ~/.shadowob/workspace/ 目录下。一般情况下不需要手动编辑这些文件，所有配置都可以通过界面完成。',
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
            <ArchNode label={t('openclaw.help.archUser', '用户')} icon={Users} />
            <ArrowRight size={16} className="text-text-muted shrink-0" />
            <ArchNode label="虾豆" icon={MessageSquare} />
            <ArrowRight size={16} className="text-text-muted shrink-0" />
            <ArchNode label="Buddy" icon={Link2} highlight />
            <ArrowRight size={16} className="text-text-muted shrink-0" />
            <ArchNode label={t('openclaw.help.archGateway', '龙虾服务')} icon={Zap} highlight />
            <ArrowRight size={16} className="text-text-muted shrink-0" />
            <ArchNode label={t('openclaw.help.archAgent', '智能体')} icon={Bot} />
          </div>
          <p className="text-xs text-text-muted text-center">
            {t(
              'openclaw.help.archDesc',
              '用户在虾豆频道发送消息 → 通过 Buddy 连接转发 → 龙虾服务处理 → 智能体生成回复 → 返回频道',
            )}
          </p>
        </section>
      </div>
    </div>
  )
}

/* ─── Sub-components ─── */

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
  icon: Icon,
  highlight,
}: {
  label: string
  icon: LucideIcon
  highlight?: boolean
}) {
  return (
    <div
      className={`flex flex-col items-center gap-1.5 px-4 py-3 rounded-2xl border ${
        highlight ? 'border-primary/30 bg-primary/5' : 'border-border-subtle bg-bg-secondary'
      }`}
    >
      <Icon size={20} className={highlight ? 'text-primary' : 'text-text-muted'} />
      <span className="text-[11px] font-bold text-text-secondary whitespace-nowrap">{label}</span>
    </div>
  )
}
