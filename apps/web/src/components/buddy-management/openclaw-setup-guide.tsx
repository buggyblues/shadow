import { Button, cn } from '@shadowob/ui'
import { BookOpen, Bot, Check, Copy, Key, MessageSquare, PlugZap, Terminal } from 'lucide-react'
import { useState } from 'react'
import {
  createConnectorPlans,
  type ConnectorPlan,
  type ShadowConnectorTarget,
} from '@shadowob/connector'
import type { Agent } from './types'

/* ── OpenClaw Setup Guide ─────────────────────────────── */

function CopyBlock({
  content,
  label,
  t,
}: {
  content: string
  label?: string
  t: (key: string) => string
}) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="relative group">
      {label && (
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted mb-1">
          {label}
        </p>
      )}
      <pre className="bg-bg-deep/50 backdrop-blur-sm rounded-2xl p-3 pr-10 font-mono text-xs text-text-secondary border border-border-subtle overflow-x-auto whitespace-pre-wrap break-all">
        {content}
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-bg-tertiary/50 text-text-muted hover:text-text-primary hover:bg-bg-modifier-hover transition opacity-0 group-hover:opacity-100"
        title={t('common.copy')}
      >
        {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
      </button>
    </div>
  )
}

export function OpenClawSetupGuide({
  agent,
  generatedToken,
  onGenerateToken,
  generatingToken,
  t,
}: {
  agent: Agent
  generatedToken: string | null
  onGenerateToken: () => void
  generatingToken: boolean
  t: (key: string) => string
}) {
  const token = (agent.config?.lastToken as string | undefined) ?? generatedToken ?? ''
  const hasToken = !!token.trim()
  const serverUrl = window.location.origin
  const [activeTab, setActiveTab] = useState<'manual' | 'chat'>('manual')
  const [activeTarget, setActiveTarget] = useState<ShadowConnectorTarget>('openclaw')
  const plans = createConnectorPlans({
    serverUrl,
    token,
    projectName: agent.botUser?.username ?? agent.id,
    workDir: '.',
  })
  const activePlan =
    plans.find((plan) => plan.target === activeTarget) ?? (plans[0] as ConnectorPlan | undefined)
  const connectorCliCommand = activePlan?.connectCommand ?? ''
  const targetMeta: Record<
    ShadowConnectorTarget,
    { icon: typeof Terminal; label: string; desc: string }
  > = {
    openclaw: {
      icon: Terminal,
      label: t('agentMgmt.connectorOpenClaw'),
      desc: t('agentMgmt.connectorOpenClawDesc'),
    },
    hermes: {
      icon: Bot,
      label: t('agentMgmt.connectorHermes'),
      desc: t('agentMgmt.connectorHermesDesc'),
    },
    'cc-connect': {
      icon: PlugZap,
      label: t('agentMgmt.connectorCcConnect'),
      desc: t('agentMgmt.connectorCcConnectDesc'),
    },
  }

  if (!hasToken) {
    return (
      <div className="bg-bg-tertiary/40 rounded-[20px] p-6 border border-border-subtle shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <BookOpen size={16} className="text-primary" />
          <h3 className="text-sm font-black text-text-primary uppercase tracking-[0.15em]">
            {t('agentMgmt.connectorGuideTitle')}
          </h3>
        </div>
        <p className="text-sm text-text-muted font-bold italic mb-5">
          {t('agentMgmt.setupTokenWarning')}
        </p>
        <Button
          variant="primary"
          size="sm"
          onClick={onGenerateToken}
          disabled={generatingToken}
          className="rounded-[12px]"
        >
          <Key size={14} />
          {generatingToken ? t('agentMgmt.generating') : t('agentMgmt.generateToken')}
        </Button>
      </div>
    )
  }

  return (
    <div className="bg-bg-tertiary/40 rounded-[20px] p-6 border border-border-subtle shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <BookOpen size={16} className="text-primary" />
        <h3 className="text-sm font-black text-text-primary uppercase tracking-[0.15em]">
          {t('agentMgmt.connectorGuideTitle')}
        </h3>
      </div>
      <p className="text-sm text-text-muted font-bold italic mb-5">
        {t('agentMgmt.connectorGuideDesc')}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-5">
        {plans.map((plan) => {
          const meta = targetMeta[plan.target]
          const Icon = meta.icon
          return (
            <button
              key={plan.target}
              type="button"
              onClick={() => setActiveTarget(plan.target)}
              className={cn(
                'min-h-[76px] rounded-[14px] border p-3 text-left transition',
                activeTarget === plan.target
                  ? 'border-primary/50 bg-primary/10 text-text-primary shadow-sm'
                  : 'border-border-subtle bg-bg-deep/40 text-text-muted hover:text-text-secondary',
              )}
            >
              <span className="flex items-center gap-2 text-xs font-black uppercase tracking-widest">
                <Icon size={14} />
                {meta.label}
              </span>
              <span className="mt-1 block text-[11px] leading-4 font-bold text-text-muted">
                {meta.desc}
              </span>
            </button>
          )
        })}
      </div>

      {/* Tab selector */}
      <div className="flex gap-1 mb-5 bg-bg-deep/50 backdrop-blur-sm rounded-full p-1 border border-border-subtle">
        <button
          type="button"
          onClick={() => setActiveTab('manual')}
          className={cn(
            'flex items-center gap-1.5 flex-1 px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest transition',
            activeTab === 'manual'
              ? 'bg-primary/15 text-primary shadow-sm'
              : 'text-text-muted hover:text-text-secondary',
          )}
        >
          <Terminal size={12} />
          {t('agentMgmt.setupManual')}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('chat')}
          className={cn(
            'flex items-center gap-1.5 flex-1 px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest transition',
            activeTab === 'chat'
              ? 'bg-primary/15 text-primary shadow-sm'
              : 'text-text-muted hover:text-text-secondary',
          )}
        >
          <MessageSquare size={12} />
          {t('agentMgmt.setupChat')}
        </button>
      </div>

      {activeTab === 'manual' && activePlan ? (
        <>
          <div className="mb-4">
            <p className="text-xs font-black text-text-secondary mb-2 uppercase tracking-widest">
              {t('agentMgmt.connectorCliTitle')}
            </p>
            <CopyBlock content={connectorCliCommand} t={t} />
          </div>

          <div className="mb-4">
            <p className="text-xs font-black text-text-secondary mb-2 uppercase tracking-widest">
              {t('agentMgmt.setupBashTitle')}
            </p>
            <CopyBlock content={activePlan.quickCommand} t={t} />
          </div>

          <div className="h-px bg-bg-tertiary/50 my-4" />

          <p className="text-[11px] font-black text-text-muted uppercase tracking-[0.2em] mb-3">
            {t('agentMgmt.setupStepByStep')}
          </p>

          {activePlan.commands.map((command, index) => (
            <div className="mb-3" key={`${activePlan.target}-${command.label}`}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs font-black flex items-center justify-center">
                  {index + 1}
                </span>
                <span className="text-sm font-black text-text-primary">
                  {t('agentMgmt.connectorStepCommand')}
                </span>
              </div>
              <div className="ml-7">
                <CopyBlock content={command.command} t={t} />
              </div>
            </div>
          ))}

          <div className="h-px bg-bg-tertiary/50 my-4" />
          <div className="space-y-3">
            {activePlan.configBlocks.map((block) => (
              <CopyBlock
                key={`${activePlan.target}-${block.label}`}
                content={block.content}
                label={block.label}
                t={t}
              />
            ))}
          </div>
        </>
      ) : activePlan ? (
        <>
          <p className="text-xs text-text-muted font-bold italic mb-3">
            {t('agentMgmt.setupChatDesc')}
          </p>
          <CopyBlock content={activePlan.aiPrompt} t={t} />
        </>
      ) : null}

      {/* Capabilities */}
      {activePlan && (
        <div className="mt-4 pt-4 border-t border-border-subtle">
          <p className="text-[11px] font-black text-text-muted uppercase tracking-[0.2em] mb-2">
            {t('docs.openclawCapabilities')}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {activePlan.capabilities.map((cap) => (
              <div
                key={cap}
                className="flex items-center gap-1.5 text-xs text-text-secondary font-bold"
              >
                <Check size={12} className="text-success" />
                {t(`agentMgmt.connectorCap_${cap}`)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Link to full docs */}
      {activePlan && (
        <div className="mt-4 pt-3 border-t border-border-subtle">
          <a
            href={activePlan.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:text-primary-hover font-black flex items-center gap-1 transition uppercase tracking-widest"
          >
            <BookOpen size={12} />
            {t('agentMgmt.openclawFullDocs')}
          </a>
        </div>
      )}
    </div>
  )
}
