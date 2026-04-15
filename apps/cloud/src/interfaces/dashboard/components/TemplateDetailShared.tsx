import { Badge, Button, EmptyState, Tabs, TabsList, TabsTrigger } from '@shadowob/ui'
import { ChevronRight, Cpu, Layers, Settings, Users, Zap } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Breadcrumb } from '@/components/Breadcrumb'
import { CodeBlock } from '@/components/CodeBlock'
import { cn } from '@/lib/utils'

export interface TemplateAgentInfo {
  id: string
  name: string
  role?: string
  description?: string
  tools?: string[]
  model?: string
  runtime?: string
  identity?: { name?: string; personality?: string; systemPrompt?: string }
  integrations?: Array<{ name: string; credentials?: Record<string, string> }>
  configuration?: Record<string, unknown>
  resources?: { requests?: Record<string, string>; limits?: Record<string, string> }
  env?: Record<string, string>
}

export interface TabItem {
  id: string
  label: string
  icon?: ReactNode
  count?: number
}

function getAgentName(agent: Record<string, unknown>): string {
  const identity = agent.identity as TemplateAgentInfo['identity'] | undefined
  return String(agent.name ?? identity?.name ?? agent.id ?? 'Unknown')
}

function getAgentModel(agent: Record<string, unknown>): string | undefined {
  const model = agent.model
  if (typeof model === 'string') return model
  if (
    model &&
    typeof model === 'object' &&
    'preferred' in model &&
    typeof model.preferred === 'string'
  ) {
    return model.preferred
  }
  return undefined
}

function mapAgent(agent: Record<string, unknown>): TemplateAgentInfo {
  return {
    id: String(agent.id ?? agent.name ?? 'unknown'),
    name: getAgentName(agent),
    role:
      typeof agent.role === 'string'
        ? agent.role
        : typeof agent.description === 'string'
          ? agent.description
          : undefined,
    description: typeof agent.description === 'string' ? agent.description : undefined,
    tools: Array.isArray(agent.tools) ? agent.tools.map(String) : undefined,
    model: getAgentModel(agent),
    runtime: typeof agent.runtime === 'string' ? agent.runtime : undefined,
    identity: agent.identity as TemplateAgentInfo['identity'],
    integrations: agent.integrations as TemplateAgentInfo['integrations'],
    configuration: agent.configuration as TemplateAgentInfo['configuration'],
    resources: agent.resources as TemplateAgentInfo['resources'],
    env: agent.env as TemplateAgentInfo['env'],
  }
}

export function parseTemplateAgents(templateData: unknown): TemplateAgentInfo[] {
  if (!templateData || typeof templateData !== 'object') return []

  const data = templateData as Record<string, unknown>
  const deployments = data.deployments as Record<string, unknown> | undefined
  const deploymentAgents = deployments?.agents as unknown[] | undefined

  if (Array.isArray(deploymentAgents) && deploymentAgents.length > 0) {
    return deploymentAgents
      .filter(
        (agent): agent is Record<string, unknown> => typeof agent === 'object' && agent !== null,
      )
      .map(mapAgent)
  }

  if (Array.isArray(data.agents) && data.agents.length > 0) {
    return data.agents
      .filter(
        (agent): agent is Record<string, unknown> => typeof agent === 'object' && agent !== null,
      )
      .map(mapAgent)
  }

  const team = data.team as Record<string, unknown> | undefined
  const members = (team?.members ?? data.members) as unknown[] | undefined
  if (Array.isArray(members)) {
    return members
      .filter(
        (member): member is Record<string, unknown> =>
          typeof member === 'object' && member !== null,
      )
      .map(mapAgent)
  }

  return []
}

// CSS grid-template-rows expand/collapse — no JS layout measurement needed
function ExpandBody({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateRows: open ? '1fr' : '0fr',
        transition: 'grid-template-rows 260ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      <div style={{ overflow: 'hidden' }}>{children}</div>
    </div>
  )
}

function TemplateAgentCard({ agent, index }: { agent: TemplateAgentInfo; index: number }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-bg-modifier-hover/40',
          expanded && 'bg-bg-modifier-hover/20',
        )}
      >
        {/* Index badge */}
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black"
          style={{
            background: 'rgba(0,243,255,0.08)',
            border: '1px solid rgba(0,243,255,0.14)',
            color: 'var(--color-nf-cyan)',
          }}
        >
          {index + 1}
        </div>

        {/* Name + description */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-black uppercase tracking-[0.08em] text-text-primary">
              {agent.identity?.name ?? agent.name}
            </span>
            {agent.runtime && (
              <Badge variant="neutral" size="sm">
                {agent.runtime}
              </Badge>
            )}
            {agent.model && (
              <Badge variant="neutral" size="sm" className="gap-1">
                <Cpu size={9} />
                {agent.model}
              </Badge>
            )}
          </div>
          {(agent.role ?? agent.description) && (
            <p className="mt-0.5 line-clamp-1 text-[11px] uppercase tracking-[0.12em] text-text-muted">
              {agent.role ?? agent.description}
            </p>
          )}
        </div>

        {/* Right: integration count + chevron */}
        <div className="flex shrink-0 items-center gap-2">
          {agent.integrations && agent.integrations.length > 0 && (
            <Badge variant="info" size="sm" className="gap-1">
              <Layers size={9} />
              {agent.integrations.length}
            </Badge>
          )}
          <ChevronRight
            size={14}
            className={cn(
              'text-text-muted transition-transform duration-200',
              expanded && 'rotate-90',
            )}
          />
        </div>
      </button>

      <ExpandBody open={expanded}>
        <div className="space-y-3 border-t border-border-subtle px-5 pb-5 pt-4">
          {agent.identity?.personality && (
            <div>
              <h5 className="mb-1.5 text-micro font-black uppercase tracking-[0.16em] text-text-muted">
                {t('templateDetail.identity')}
              </h5>
              <p className="glass-surface line-clamp-4 rounded-[18px] px-3 py-3 text-xs leading-6 text-text-secondary">
                {agent.identity.personality}
              </p>
            </div>
          )}

          {agent.integrations && agent.integrations.length > 0 && (
            <div>
              <h5 className="mb-1.5 text-micro font-black uppercase tracking-[0.16em] text-text-muted">
                {t('templateDetail.integrations')}
              </h5>
              <div className="flex flex-wrap gap-2">
                {agent.integrations.map((integration) => (
                  <Button
                    key={integration.name}
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="pointer-events-none !h-8 !gap-1.5 !px-3 !text-xs"
                  >
                    <Zap size={10} /> {integration.name}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {agent.resources && (
            <div>
              <h5 className="mb-1.5 text-micro font-black uppercase tracking-[0.16em] text-text-muted">
                {t('templateDetail.resources')}
              </h5>
              <div className="grid grid-cols-2 gap-2">
                {agent.resources.requests && (
                  <div className="glass-surface rounded-[18px] px-3 py-3">
                    <span className="mb-1 block text-micro font-semibold text-text-muted">
                      {t('templateDetail.requests')}
                    </span>
                    {Object.entries(agent.resources.requests).map(([key, value]) => (
                      <div
                        key={key}
                        className="flex justify-between gap-2 text-xs text-text-secondary"
                      >
                        <span className="text-text-muted">{key}</span>
                        <span className="font-mono">{value}</span>
                      </div>
                    ))}
                  </div>
                )}
                {agent.resources.limits && (
                  <div className="glass-surface rounded-[18px] px-3 py-3">
                    <span className="mb-1 block text-micro font-semibold text-text-muted">
                      {t('templateDetail.limits')}
                    </span>
                    {Object.entries(agent.resources.limits).map(([key, value]) => (
                      <div
                        key={key}
                        className="flex justify-between gap-2 text-xs text-text-secondary"
                      >
                        <span className="text-text-muted">{key}</span>
                        <span className="font-mono">{value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {agent.configuration && (
            <div>
              <h5 className="mb-1.5 flex items-center gap-1 text-micro font-black uppercase tracking-[0.16em] text-text-muted">
                <Settings size={10} /> {t('storeDetail.configuration')}
              </h5>
              <CodeBlock
                code={JSON.stringify(agent.configuration, null, 2)}
                language="json"
                maxHeight="160px"
              />
            </div>
          )}

          {agent.env && Object.keys(agent.env).length > 0 && (
            <div>
              <h5 className="mb-1.5 text-micro font-black uppercase tracking-[0.16em] text-text-muted">
                {t('templateDetail.environment')}
              </h5>
              <div className="space-y-1">
                {Object.entries(agent.env).map(([key, value]) => (
                  <div key={key} className="flex gap-2 font-mono text-xs">
                    <span style={{ color: 'var(--color-nf-yellow)' }}>{key}</span>
                    <span className="text-text-muted">=</span>
                    <span className="truncate text-text-secondary">{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {agent.tools && agent.tools.length > 0 && (
            <div>
              <h5 className="mb-1.5 text-micro font-black uppercase tracking-[0.16em] text-text-muted">
                {t('templateDetail.tools')}
              </h5>
              <div className="flex flex-wrap gap-1.5">
                {agent.tools.map((tool) => (
                  <span
                    key={tool}
                    className="glass-surface rounded-full px-2 py-1 text-micro font-mono text-text-secondary"
                  >
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </ExpandBody>
    </div>
  )
}

export function TemplateAgentsTab({
  agents,
  emptyTitle,
  emptyDescription,
  introText,
}: {
  agents: TemplateAgentInfo[]
  emptyTitle: string
  emptyDescription: string
  introText?: string
}) {
  const { t } = useTranslation()

  if (agents.length === 0) {
    return <EmptyState icon={Users} title={emptyTitle} description={emptyDescription} />
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted">
        {introText ?? t('templateDetail.agentsCount', { count: agents.length })}
      </p>
      <div className="overflow-hidden rounded-[24px] border border-border-subtle divide-y divide-border-subtle">
        {agents.map((agent, index) => (
          <TemplateAgentCard key={agent.id} agent={agent} index={index} />
        ))}
      </div>
    </div>
  )
}

export function TemplateConfigTab({
  templateData,
  description,
  title,
}: {
  templateData: unknown
  description: string
  title: string
}) {
  const { t } = useTranslation()
  const configStr = templateData ? JSON.stringify(templateData, null, 2) : 'Loading...'

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">{description}</p>
      <CodeBlock
        code={templateData ? configStr : t('common.loading')}
        language="json"
        title={title}
        showLineNumbers
        maxHeight="600px"
      />
    </div>
  )
}

export function TemplateDetailShell({
  breadcrumbItems,
  heroIcon,
  title,
  titleMeta,
  titleActions,
  description,
  supportingText,
  badges,
  chips,
  actions,
  sidebar,
  tabs,
  activeTab,
  onTabChange,
  children,
}: {
  breadcrumbItems: Array<{ label: string; to?: string }>
  heroIcon: ReactNode
  title: string
  titleMeta?: ReactNode
  titleActions?: ReactNode
  description: ReactNode
  supportingText?: ReactNode
  badges?: ReactNode
  chips?: ReactNode
  actions?: ReactNode
  sidebar: ReactNode
  tabs: TabItem[]
  activeTab: string
  onTabChange: (id: string) => void
  children: ReactNode
}) {
  return (
    <div className="dashboard-page-shell space-y-5">
      <Breadcrumb items={breadcrumbItems} className="mb-1" />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
        <div className="min-w-0 space-y-5">
          <div className="glass-panel p-6">
            <div className="flex flex-col gap-5 md:flex-row md:items-start">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[28px] border border-border-subtle bg-bg-secondary/50">
                {heroIcon}
              </div>

              <div className="min-w-0 flex-1 space-y-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <h1 className="dashboard-page-title text-text-primary">{title}</h1>
                      {titleMeta}
                    </div>

                    <div className="dashboard-page-description max-w-3xl text-text-secondary">
                      {description}
                    </div>

                    {supportingText && <div>{supportingText}</div>}
                  </div>

                  {titleActions && <div className="shrink-0">{titleActions}</div>}
                </div>

                {badges && <div className="flex flex-wrap items-center gap-2.5">{badges}</div>}
                {chips && <div className="flex flex-wrap gap-2.5">{chips}</div>}
                {actions && (
                  <div className="flex flex-wrap items-center gap-2.5 pt-1">{actions}</div>
                )}
              </div>
            </div>
          </div>

          <Tabs value={activeTab} onChange={onTabChange}>
            <TabsList className="dashboard-tabs-list">
              {tabs.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id} className="dashboard-tabs-trigger">
                  {tab.icon && <span className="dashboard-tab-icon">{tab.icon}</span>}
                  <span>{tab.label}</span>
                  {typeof tab.count === 'number' && (
                    <span className="dashboard-tabs-count text-micro">{tab.count}</span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div>{children}</div>
        </div>

        <div className="w-full xl:sticky xl:top-6 xl:shrink-0">{sidebar}</div>
      </div>
    </div>
  )
}
