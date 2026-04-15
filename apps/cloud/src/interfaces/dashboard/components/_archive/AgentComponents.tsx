import { Badge, Button, EmptyState } from '@shadowob/ui'
import { Code, Cpu, Layers, Server, Settings, Users, Zap } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AgentInfo {
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

// ── Parse agents from template data ───────────────────────────────────────────

export function parseAgents(templateData: unknown): AgentInfo[] {
  if (!templateData || typeof templateData !== 'object') return []
  const data = templateData as Record<string, unknown>
  const agents: AgentInfo[] = []

  const deployments = data.deployments as Record<string, unknown> | undefined
  const deplAgents = deployments?.agents as unknown[] | undefined
  const sourceAgents = Array.isArray(deplAgents)
    ? deplAgents
    : Array.isArray(data.agents)
      ? data.agents
      : []

  // Fallback: check for 'team.members' or 'members'
  const team = data.team as Record<string, unknown> | undefined
  const members = (team?.members ?? data.members) as unknown[] | undefined
  const finalSource = sourceAgents.length > 0 ? sourceAgents : Array.isArray(members) ? members : []

  for (const a of finalSource) {
    if (typeof a !== 'object' || a === null) continue
    const agent = a as Record<string, unknown>
    agents.push({
      id: String(agent.id ?? agent.name ?? 'unknown'),
      name: String(
        agent.name ?? (agent.identity as Record<string, unknown>)?.name ?? agent.id ?? 'Unknown',
      ),
      role: agent.role
        ? String(agent.role)
        : agent.description
          ? String(agent.description)
          : undefined,
      description: agent.description ? String(agent.description) : undefined,
      tools: Array.isArray(agent.tools) ? agent.tools.map(String) : undefined,
      model: agent.model ? String(agent.model) : undefined,
      runtime: agent.runtime ? String(agent.runtime) : undefined,
      identity: agent.identity as AgentInfo['identity'],
      integrations: agent.integrations as AgentInfo['integrations'],
      configuration: agent.configuration as AgentInfo['configuration'],
      resources: agent.resources as AgentInfo['resources'],
      env: agent.env as AgentInfo['env'],
    })
  }

  return agents
}

// ── Agent Card ────────────────────────────────────────────────────────────────

export function AgentCard({ agent, index }: { agent: AgentInfo; index: number }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-lg overflow-hidden hover:border-gray-700 transition-colors">
      <Button
        type="button"
        onClick={() => setExpanded(!expanded)}
        variant="ghost"
        className="!w-full !px-4 !py-3 !flex !items-start !justify-between !text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-900/30 border border-blue-800/50 flex items-center justify-center text-xs font-bold text-blue-400">
            {index + 1}
          </div>
          <div>
            <h4 className="text-sm font-medium text-white flex items-center gap-2">
              {agent.identity?.name ?? agent.name}
              {agent.runtime && (
                <Badge variant="neutral" size="sm">
                  {agent.runtime}
                </Badge>
              )}
            </h4>
            {(agent.role || agent.description) && (
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                {agent.role ?? agent.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {agent.model && (
            <Badge variant="neutral" size="sm" className="gap-1">
              <Cpu size={10} />
              {agent.model}
            </Badge>
          )}
          {agent.integrations && agent.integrations.length > 0 && (
            <Badge variant="info" size="sm" className="gap-1">
              <Layers size={10} />
              {agent.integrations.length}
            </Badge>
          )}
          <span
            className={cn('text-gray-500 transition-transform text-xs', expanded && 'rotate-90')}
          >
            ▸
          </span>
        </div>
      </Button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-800/50 pt-3">
          {/* Identity */}
          {agent.identity && (agent.identity.personality || agent.identity.systemPrompt) && (
            <div>
              <h5 className="text-[10px] uppercase text-gray-600 font-semibold mb-1.5 flex items-center gap-1">
                <Users size={10} /> {t('storeDetail.identity')}
              </h5>
              {agent.identity.personality && (
                <p className="text-xs text-gray-400 bg-gray-950 rounded p-2.5 leading-relaxed line-clamp-4">
                  {agent.identity.personality}
                </p>
              )}
              {agent.identity.systemPrompt && (
                <details className="mt-2">
                  <summary className="text-[10px] text-gray-500 cursor-pointer hover:text-gray-400">
                    {t('storeDetail.systemPrompt')}
                  </summary>
                  <p className="text-xs text-gray-500 bg-gray-950 rounded p-2.5 mt-1 leading-relaxed max-h-32 overflow-y-auto">
                    {agent.identity.systemPrompt}
                  </p>
                </details>
              )}
            </div>
          )}

          {/* Integrations */}
          {agent.integrations && agent.integrations.length > 0 && (
            <div>
              <h5 className="text-[10px] uppercase text-gray-600 font-semibold mb-1.5 flex items-center gap-1">
                <Layers size={10} /> {t('storeDetail.integrations')}
              </h5>
              <div className="flex flex-wrap gap-2">
                {agent.integrations.map((intg) => (
                  <span
                    key={intg.name}
                    className="flex items-center gap-1.5 text-xs bg-purple-900/20 text-purple-300 border border-purple-800/40 px-2.5 py-1 rounded-md"
                  >
                    <Zap size={10} /> {intg.name}
                    {intg.credentials && (
                      <span className="text-purple-500 text-[10px]">
                        ({Object.keys(intg.credentials).length} {t('storeDetail.credentials')})
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Resources */}
          {agent.resources && (
            <div>
              <h5 className="text-[10px] uppercase text-gray-600 font-semibold mb-1.5 flex items-center gap-1">
                <Server size={10} /> {t('storeDetail.resources')}
              </h5>
              <div className="grid grid-cols-2 gap-2">
                {agent.resources.requests && (
                  <div className="bg-gray-950 rounded p-2">
                    <span className="text-[10px] text-gray-600 block mb-1">
                      {t('templateDetail.requests')}
                    </span>
                    {Object.entries(agent.resources.requests).map(([k, v]) => (
                      <div key={k} className="text-xs text-gray-400 flex justify-between">
                        <span className="text-gray-600">{k}</span>
                        <span className="font-mono">{v}</span>
                      </div>
                    ))}
                  </div>
                )}
                {agent.resources.limits && (
                  <div className="bg-gray-950 rounded p-2">
                    <span className="text-[10px] text-gray-600 block mb-1">
                      {t('templateDetail.limits')}
                    </span>
                    {Object.entries(agent.resources.limits).map(([k, v]) => (
                      <div key={k} className="text-xs text-gray-400 flex justify-between">
                        <span className="text-gray-600">{k}</span>
                        <span className="font-mono">{v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Configuration */}
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

          {/* Tools */}
          {agent.tools && agent.tools.length > 0 && (
            <div>
              <h5 className="text-[10px] uppercase text-gray-600 font-semibold mb-1.5">
                {t('storeDetail.tools')}
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

          {/* Environment variables */}
          {agent.env && Object.keys(agent.env).length > 0 && (
            <div>
              <h5 className="text-[10px] uppercase text-gray-600 font-semibold mb-1.5 flex items-center gap-1">
                <Code size={10} /> {t('templateDetail.environment')}
              </h5>
              <div className="space-y-1">
                {Object.entries(agent.env).map(([k, v]) => (
                  <div key={k} className="text-xs font-mono flex gap-2">
                    <span className="text-yellow-400/80">{k}</span>
                    <span className="text-gray-600">=</span>
                    <span className="text-gray-500 truncate">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Agents Tab ────────────────────────────────────────────────────────────────

export function AgentsTab({ agents }: { agents: AgentInfo[] }) {
  const { t } = useTranslation()

  if (agents.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title={t('storeDetail.agentDetailsUnavailable')}
        description={t('storeDetail.deployToSeeConfig')}
      />
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500 mb-4">
        {t('storeDetail.includesAgents', { count: agents.length })}
      </p>
      {agents.map((agent, i) => (
        <AgentCard key={agent.id ?? agent.name} agent={agent} index={i} />
      ))}
    </div>
  )
}
