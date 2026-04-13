import { Cpu, Layers, Settings, Users, Zap } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Breadcrumb } from '@/components/Breadcrumb'
import { CodeBlock } from '@/components/CodeBlock'
import { EmptyState } from '@/components/EmptyState'
import { cn } from '@/lib/utils'
import { Badge } from './Badge'
import { type TabItem, Tabs } from './Tabs'

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

function TemplateAgentCard({ agent, index }: { agent: TemplateAgentInfo; index: number }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-lg overflow-hidden hover:border-gray-700 transition-colors">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-start justify-between text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-900/30 border border-blue-800/50 flex items-center justify-center text-xs font-bold text-blue-400">
            {index + 1}
          </div>
          <div>
            <h4 className="text-sm font-medium text-white flex items-center gap-2">
              {agent.identity?.name ?? agent.name}
              {agent.runtime && (
                <Badge variant="default" size="sm">
                  {agent.runtime}
                </Badge>
              )}
            </h4>
            {(agent.role ?? agent.description) && (
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                {agent.role ?? agent.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {agent.model && (
            <Badge variant="default" size="sm" icon={<Cpu size={10} />}>
              {agent.model}
            </Badge>
          )}
          {agent.integrations && agent.integrations.length > 0 && (
            <Badge variant="info" size="sm" icon={<Layers size={10} />}>
              {agent.integrations.length}
            </Badge>
          )}
          <span
            className={cn('text-gray-500 transition-transform text-xs', expanded && 'rotate-90')}
          >
            ▸
          </span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-800/50 pt-3">
          {agent.identity?.personality && (
            <div>
              <h5 className="text-[10px] uppercase text-gray-600 font-semibold mb-1.5">
                {t('templateDetail.identity')}
              </h5>
              <p className="text-xs text-gray-400 bg-gray-950 rounded p-2.5 leading-relaxed line-clamp-4">
                {agent.identity.personality}
              </p>
            </div>
          )}

          {agent.integrations && agent.integrations.length > 0 && (
            <div>
              <h5 className="text-[10px] uppercase text-gray-600 font-semibold mb-1.5">
                {t('templateDetail.integrations')}
              </h5>
              <div className="flex flex-wrap gap-2">
                {agent.integrations.map((integration) => (
                  <span
                    key={integration.name}
                    className="flex items-center gap-1.5 text-xs bg-purple-900/20 text-purple-300 border border-purple-800/40 px-2.5 py-1 rounded-md"
                  >
                    <Zap size={10} /> {integration.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {agent.resources && (
            <div>
              <h5 className="text-[10px] uppercase text-gray-600 font-semibold mb-1.5">
                {t('templateDetail.resources')}
              </h5>
              <div className="grid grid-cols-2 gap-2">
                {agent.resources.requests && (
                  <div className="bg-gray-950 rounded p-2">
                    <span className="text-[10px] text-gray-600 block mb-1">
                      {t('templateDetail.requests')}
                    </span>
                    {Object.entries(agent.resources.requests).map(([key, value]) => (
                      <div key={key} className="text-xs text-gray-400 flex justify-between gap-2">
                        <span className="text-gray-600">{key}</span>
                        <span className="font-mono">{value}</span>
                      </div>
                    ))}
                  </div>
                )}
                {agent.resources.limits && (
                  <div className="bg-gray-950 rounded p-2">
                    <span className="text-[10px] text-gray-600 block mb-1">
                      {t('templateDetail.limits')}
                    </span>
                    {Object.entries(agent.resources.limits).map(([key, value]) => (
                      <div key={key} className="text-xs text-gray-400 flex justify-between gap-2">
                        <span className="text-gray-600">{key}</span>
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
              <h5 className="text-[10px] uppercase text-gray-600 font-semibold mb-1.5 flex items-center gap-1">
                <Settings size={10} /> {t('storeDetail.configuration')}
              </h5>
              <pre className="text-xs text-gray-500 bg-gray-950 rounded p-2.5 overflow-x-auto max-h-40">
                {JSON.stringify(agent.configuration, null, 2)}
              </pre>
            </div>
          )}

          {agent.env && Object.keys(agent.env).length > 0 && (
            <div>
              <h5 className="text-[10px] uppercase text-gray-600 font-semibold mb-1.5">
                {t('templateDetail.environment')}
              </h5>
              <div className="space-y-1">
                {Object.entries(agent.env).map(([key, value]) => (
                  <div key={key} className="text-xs font-mono flex gap-2">
                    <span className="text-yellow-400/80">{key}</span>
                    <span className="text-gray-600">=</span>
                    <span className="text-gray-500 truncate">{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {agent.tools && agent.tools.length > 0 && (
            <div>
              <h5 className="text-[10px] uppercase text-gray-600 font-semibold mb-1.5">
                {t('templateDetail.tools')}
              </h5>
              <div className="flex flex-wrap gap-1.5">
                {agent.tools.map((tool) => (
                  <span
                    key={tool}
                    className="text-[10px] text-gray-500 bg-gray-800 px-2 py-0.5 rounded font-mono"
                  >
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
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
    return (
      <EmptyState icon={<Users size={32} />} title={emptyTitle} description={emptyDescription} />
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500 mb-4">
        {introText ?? t('templateDetail.agentsCount', { count: agents.length })}
      </p>
      {agents.map((agent, index) => (
        <TemplateAgentCard key={agent.id} agent={agent} index={index} />
      ))}
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
      <p className="text-sm text-gray-500">{description}</p>
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
    <div className="p-6 max-w-6xl mx-auto">
      <Breadcrumb items={breadcrumbItems} className="mb-4" />

      <div className="flex flex-col lg:flex-row gap-6 mb-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-4 mb-4">
            <div className="shrink-0">{heroIcon}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h1 className="text-2xl font-bold">{title}</h1>
                {titleMeta}
                {titleActions}
              </div>
              <div className="text-sm text-gray-400 leading-relaxed">{description}</div>
              {supportingText && <div className="mt-2">{supportingText}</div>}
              {badges && <div className="flex items-center gap-2 flex-wrap mt-3">{badges}</div>}
            </div>
          </div>

          {chips && <div className="flex flex-wrap gap-3 mb-4">{chips}</div>}
          {actions && <div className="flex items-center gap-3 flex-wrap">{actions}</div>}
        </div>

        <div className="lg:w-72 shrink-0">{sidebar}</div>
      </div>

      <Tabs items={tabs} active={activeTab} onChange={onTabChange} className="mb-6" />

      <div className="min-h-[400px]">{children}</div>
    </div>
  )
}
