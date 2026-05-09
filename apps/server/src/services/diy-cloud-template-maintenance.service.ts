import { CLOUD_SAAS_RUNTIME_KEY, validateCloudSaasConfigSnapshot } from '@shadowob/cloud'
import { assertCloudTemplatePolicy } from './cloud-template-policy.service'

export type DiyCloudTemplateMaintenanceInput = {
  slug: string
  title: string
  description: string
  buddyName: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function cloneTemplate(template: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(template)) as Record<string, unknown>
}

export function repairDiyCloudTemplateShape(
  template: Record<string, unknown>,
  input: DiyCloudTemplateMaintenanceInput,
) {
  const next = cloneTemplate(template)
  next.version = typeof next.version === 'string' ? next.version : '1.0.0'
  next.name = typeof next.name === 'string' && next.name ? next.name : input.slug
  next.title = typeof next.title === 'string' && next.title ? next.title : input.title
  next.description =
    typeof next.description === 'string' && next.description ? next.description : input.description
  next.environment =
    typeof next.environment === 'string' && next.environment ? next.environment : 'production'

  const use = Array.isArray(next.use) ? next.use.filter(isRecord) : []
  if (!use.some((entry) => entry.plugin === 'model-provider')) {
    use.unshift({ plugin: 'model-provider' })
  }
  if (!use.some((entry) => entry.plugin === 'shadowob')) {
    use.push({
      plugin: 'shadowob',
      options: {
        servers: [
          {
            id: 'diy-hq',
            name: input.title,
            slug: input.slug,
            channels: [
              { id: 'briefing', title: 'Briefing', type: 'text' },
              { id: 'actions', title: 'Actions', type: 'text' },
            ],
          },
        ],
        buddies: [{ id: 'diy-buddy', name: input.buddyName }],
        bindings: [
          {
            targetId: 'diy-buddy',
            targetType: 'buddy',
            servers: ['diy-hq'],
            channels: ['briefing', 'actions'],
            agentId: 'diy-buddy-agent',
          },
        ],
      },
    })
  }
  next.use = use

  const deployments = isRecord(next.deployments) ? next.deployments : {}
  const agents = Array.isArray(deployments.agents) ? deployments.agents.filter(isRecord) : []
  if (agents.length === 0) {
    agents.push({
      id: 'diy-buddy-agent',
      runtime: 'openclaw',
      description: input.description,
      identity: {
        name: input.buddyName,
        personality: 'Precise, operational, and cautious.',
        systemPrompt: input.description,
      },
      resources: {
        requests: { cpu: '100m', memory: '256Mi' },
        limits: { cpu: '1000m', memory: '1Gi' },
      },
    })
  }
  next.deployments = {
    ...deployments,
    namespace:
      typeof deployments.namespace === 'string' && deployments.namespace
        ? deployments.namespace
        : input.slug,
    agents: agents.map((agent, index) => ({
      ...agent,
      id: typeof agent.id === 'string' && agent.id ? agent.id : `diy-agent-${index + 1}`,
      runtime: typeof agent.runtime === 'string' && agent.runtime ? agent.runtime : 'openclaw',
    })),
  }

  next[CLOUD_SAAS_RUNTIME_KEY] = {
    ...(isRecord(next[CLOUD_SAAS_RUNTIME_KEY])
      ? (next[CLOUD_SAAS_RUNTIME_KEY] as Record<string, unknown>)
      : {}),
    modelProviderMode: 'official',
    officialModelProxy: true,
  }

  return next
}

export function validateDiyCloudTemplateCandidate(template: Record<string, unknown>) {
  validateCloudSaasConfigSnapshot(template)
  assertCloudTemplatePolicy(template)
}
