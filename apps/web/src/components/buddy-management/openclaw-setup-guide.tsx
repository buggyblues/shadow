import {
  type ConnectorPlan,
  createConnectorPlans,
  type ShadowConnectorTarget,
} from '@shadowob/connector/browser'
import { Button, DecorativeImage, cn } from '@shadowob/ui'
import { ArrowRight, BookOpen, Check, ChevronDown, MessageSquare, Terminal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ConfigCodeBlock } from './config-code-block'
import type { Agent } from './types'

/* ── OpenClaw Setup Guide ─────────────────────────────── */

const HAS_TOKEN = /\b(?:token|secret|api[_-]?key|authorization)\b/i

const hasTokenConfig = (content: string): boolean => HAS_TOKEN.test(content)

const connectorIconSources: Record<ShadowConnectorTarget, string> = {
  openclaw: '/connectors/openclaw.svg',
  hermes: '/connectors/hermes-agent.png',
  'cc-connect': '/connectors/cc-connect.svg',
}

export function OpenClawSetupGuide({
  agent,
  generatedToken,
  onGenerateToken,
  generatingToken,
  t,
  compact = false,
  focusConnectButton = false,
}: {
  agent: Agent
  generatedToken: string | null
  onGenerateToken: () => void
  generatingToken: boolean
  t: (key: string) => string
  compact?: boolean
  focusConnectButton?: boolean
}) {
  const token = (agent.config?.lastToken as string | undefined) ?? generatedToken ?? ''
  const hasToken = !!token.trim()
  const serverUrl = window.location.origin
  const [activeTab, setActiveTab] = useState<'manual' | 'chat'>('manual')
  const [activeTarget, setActiveTarget] = useState<ShadowConnectorTarget>('openclaw')
  const [showStepByStep, setShowStepByStep] = useState(false)
  const [failedIcons, setFailedIcons] = useState<Partial<Record<ShadowConnectorTarget, boolean>>>(
    {},
  )
  const plans = createConnectorPlans({
    serverUrl,
    token,
    projectName: agent.botUser?.username ?? agent.id,
    workDir: '.',
  })
  const activePlan =
    plans.find((plan) => plan.target === activeTarget) ?? (plans[0] as ConnectorPlan | undefined)
  const connectorCliCommand = activePlan?.connectCommand ?? ''
  const connectArrowRef = useRef<SVGSVGElement | null>(null)

  useEffect(() => {
    if (hasToken) return
    const arrow = connectArrowRef.current
    if (!arrow) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const animation = arrow.animate(
      [
        { transform: 'translateX(0px)' },
        { transform: 'translateX(4px)' },
        { transform: 'translateX(0px)' },
      ],
      {
        duration: 1100,
        easing: 'ease-in-out',
        iterations: Number.POSITIVE_INFINITY,
      },
    )

    return () => {
      animation.cancel()
    }
  }, [hasToken])

  useEffect(() => {
    setShowStepByStep(false)
  }, [activeTab, activeTarget])
  const targetMeta: Record<
    ShadowConnectorTarget,
    { fallbackIcon: typeof Terminal; label: string; desc: string; iconClassName?: string }
  > = {
    openclaw: {
      fallbackIcon: Terminal,
      label: t('agentMgmt.connectorOpenClaw'),
      desc: t('agentMgmt.connectorOpenClawDesc'),
    },
    hermes: {
      fallbackIcon: Terminal,
      label: t('agentMgmt.connectorHermes'),
      desc: t('agentMgmt.connectorHermesDesc'),
    },
    'cc-connect': {
      fallbackIcon: Terminal,
      label: t('agentMgmt.connectorCcConnect'),
      desc: t('agentMgmt.connectorCcConnectDesc'),
    },
  }

  if (!hasToken) {
    const connectButton = (
      <div className="relative">
        {focusConnectButton ? (
          <svg
            aria-hidden="true"
            viewBox="0 0 56 56"
            className="pointer-events-none absolute -left-1.5 -top-1.5 h-11 w-11 text-primary/55"
          >
            <circle cx="28" cy="28" r="6" fill="none" stroke="currentColor" strokeWidth="2">
              <animate attributeName="r" values="6;18;6" dur="2.2s" repeatCount="indefinite" />
              <animate
                attributeName="opacity"
                values="0.55;0;0.55"
                dur="2.2s"
                repeatCount="indefinite"
              />
            </circle>
          </svg>
        ) : null}
        <Button
          variant="secondary"
          size="sm"
          onClick={onGenerateToken}
          disabled={generatingToken}
          className="relative flex w-full min-h-12 items-center justify-center gap-2 rounded-[14px] border-0 px-5 py-2.5 text-[15px] font-semibold shadow-sm transition-transform duration-200 will-change-transform hover:translate-y-[-1px] active:translate-y-[0px]"
        >
          {generatingToken ? t('agentMgmt.generating') : t('agentMgmt.connectButton')}
          <ArrowRight ref={connectArrowRef} size={16} className="opacity-70" strokeWidth={2.25} />
        </Button>
      </div>
    )
    if (compact) return <div className="space-y-1.5">{connectButton}</div>
    const content = (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-text-primary">
          {t('agentMgmt.connectorGuideTitle')}
        </h3>
        <p className="text-sm text-text-secondary leading-6">
          {t('agentMgmt.connectorLegacyGuideDesc')}
        </p>
        <div className="pt-1">{connectButton}</div>
      </div>
    )
    return (
      <div className="bg-bg-tertiary/40 rounded-[20px] p-6 border border-border-subtle shadow-sm">
        {content}
      </div>
    )
  }

  const content = (
    <>
      {!compact ? (
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-black text-text-primary uppercase tracking-[0.15em]">
            {t('agentMgmt.connectorGuideTitle')}
          </h3>
        </div>
      ) : null}
      {!compact && (
        <p className="text-sm text-text-muted font-bold italic mb-5">
          {t('agentMgmt.connectorLegacyGuideDesc')}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
        {plans.map((plan) => {
          const meta = targetMeta[plan.target]
          const FallbackIcon = meta.fallbackIcon
          const iconFailed = failedIcons[plan.target]
          return (
            <button
              key={plan.target}
              type="button"
              onClick={() => setActiveTarget(plan.target)}
              className={cn(
                'rounded-[14px] border p-3 text-left transition',
                compact ? 'min-h-[58px]' : 'min-h-[76px]',
                activeTarget === plan.target
                  ? 'border-primary/50 bg-primary/10 text-text-primary shadow-sm'
                  : 'border-border-subtle bg-bg-deep/40 text-text-muted hover:text-text-secondary',
              )}
            >
              <span className="flex items-start gap-3">
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border bg-bg-tertiary/50',
                    activeTarget === plan.target
                      ? 'border-primary/40 shadow-[0_0_18px_rgba(0,198,209,0.14)]'
                      : 'border-border-subtle/80',
                  )}
                >
                  {iconFailed ? (
                    <FallbackIcon size={16} className="text-primary" />
                  ) : (
                    <DecorativeImage
                      src={connectorIconSources[plan.target]}
                      className={cn('h-5 w-5 object-contain', meta.iconClassName)}
                      loading="lazy"
                      onError={() =>
                        setFailedIcons((current) => ({ ...current, [plan.target]: true }))
                      }
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-black uppercase tracking-widest">
                    {meta.label}
                  </span>
                  <span
                    className={cn(
                      'mt-1 block text-[11px] leading-4 font-bold text-text-muted',
                      compact && 'line-clamp-2',
                    )}
                  >
                    {meta.desc}
                  </span>
                </span>
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
            <ConfigCodeBlock
              content={connectorCliCommand}
              mode={hasTokenConfig(connectorCliCommand) ? 'single' : 'multi'}
              t={t}
            />
          </div>

          <div className="rounded-[16px] border border-border-subtle bg-bg-deep/25">
            <button
              type="button"
              onClick={() => setShowStepByStep((open) => !open)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <span className="text-[11px] font-black text-text-muted uppercase tracking-[0.2em]">
                {t('agentMgmt.setupStepByStep')}
              </span>
              <ChevronDown
                size={15}
                className={cn(
                  'text-text-muted transition-transform',
                  showStepByStep && 'rotate-180',
                )}
              />
            </button>
            {showStepByStep && (
              <div className="space-y-3 border-t border-border-subtle px-4 py-4">
                {activePlan.commands.map((command, index) => (
                  <div key={`${activePlan.target}-${command.label}`}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs font-black flex items-center justify-center">
                        {index + 1}
                      </span>
                      <span className="text-sm font-black text-text-primary">
                        {t('agentMgmt.connectorStepCommand')}
                      </span>
                    </div>
                    <div className="ml-7">
                      <ConfigCodeBlock
                        content={command.command}
                        mode={hasTokenConfig(command.command) ? 'single' : 'multi'}
                        foldMode="expanded"
                        t={t}
                      />
                    </div>
                  </div>
                ))}

                <div className="h-px bg-bg-tertiary/50" />
                <div className="space-y-3">
                  {activePlan.configBlocks.map((block) => (
                    <ConfigCodeBlock
                      key={`${activePlan.target}-${block.label}`}
                      content={block.content}
                      label={block.label}
                      t={t}
                      mode={hasTokenConfig(block.content) ? 'single' : 'multi'}
                      foldMode="expanded"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      ) : activePlan ? (
        <>
          <p className="text-xs text-text-muted font-bold italic mb-3">
            {t('agentMgmt.setupChatDesc')}
          </p>
          <ConfigCodeBlock
            content={activePlan.aiPrompt}
            mode={hasTokenConfig(activePlan.aiPrompt) ? 'single' : 'multi'}
            t={t}
          />
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
    </>
  )
  if (compact) return <div className="space-y-4">{content}</div>
  return (
    <div className="bg-bg-tertiary/40 rounded-[20px] p-6 border border-border-subtle shadow-sm">
      {content}
    </div>
  )
}
