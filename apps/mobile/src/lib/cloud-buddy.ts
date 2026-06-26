import { fetchApi } from './api'

export type CloudBuddyRuntimeId =
  | 'openclaw'
  | 'hermes'
  | 'claude-code'
  | 'codex'
  | 'opencode'
  | 'gemini'

export type BuddyMode = 'private' | 'shareable'

export type CloudBuddyAgent = {
  id: string
  name: string | null
  username?: string | null
  status: string
  lastHeartbeat: string | null
  kernelType?: string | null
  config?: Record<string, unknown> | null
  botUser?: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
  } | null
}

type CloudDeployment = {
  id: string
  namespace: string
  status: string
  errorMessage?: string | null
  provisionedBuddies?: ProvisionedBuddySummary[]
}

type ProvisionedBuddySummary = {
  id: string
  agentId: string
  userId?: string | null
  namespace?: string | null
  deploymentId?: string | null
}

type CloudTemplate = {
  version: string
  name: string
  title: string
  description: string
  environment: string
  use: Array<Record<string, unknown>>
  deployments: {
    namespace: string
    agents: Array<Record<string, unknown>>
  }
  metadata: Record<string, unknown>
}

const CLOUD_DEPLOYMENT_POLL_INTERVAL_MS = 2500
const CLOUD_DEPLOYMENT_TIMEOUT_MS = 120_000
const AGENT_ONLINE_POLL_INTERVAL_MS = 2500
const AGENT_ONLINE_TIMEOUT_MS = 90_000

export const CLOUD_BUDDY_RUNTIME_LABELS: Record<CloudBuddyRuntimeId, string> = {
  openclaw: 'OpenClaw',
  hermes: 'Hermes Agent',
  'claude-code': 'Claude Code',
  codex: 'Codex CLI',
  opencode: 'OpenCode',
  gemini: 'Gemini CLI',
}

export const CLOUD_BUDDY_RUNTIMES: Array<{
  id: CloudBuddyRuntimeId
  label: string
  logo: string
}> = [
  { id: 'openclaw', label: CLOUD_BUDDY_RUNTIME_LABELS.openclaw, logo: 'O' },
  { id: 'hermes', label: CLOUD_BUDDY_RUNTIME_LABELS.hermes, logo: 'H' },
  { id: 'claude-code', label: CLOUD_BUDDY_RUNTIME_LABELS['claude-code'], logo: 'C' },
  { id: 'codex', label: CLOUD_BUDDY_RUNTIME_LABELS.codex, logo: 'X' },
  { id: 'opencode', label: CLOUD_BUDDY_RUNTIME_LABELS.opencode, logo: 'P' },
  { id: 'gemini', label: CLOUD_BUDDY_RUNTIME_LABELS.gemini, logo: 'G' },
]

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function randomCloudSuffix() {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.getRandomValues === 'function'
  ) {
    const bytes = new Uint8Array(8)
    globalThis.crypto.getRandomValues(bytes)
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 12)
  }
  const uuid =
    typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  return compactCloudName(uuid, 'buddy', 12)
}

function resolveProvisionedBuddyAgentId(deployment: CloudDeployment, buddyId: string) {
  return deployment.provisionedBuddies?.find((buddy) => buddy.id === buddyId)?.agentId ?? null
}

function compactCloudName(value: string, fallback: string, maxLength = 63) {
  const normalized =
    value
      .toLowerCase()
      .normalize('NFKC')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || fallback
  return normalized.slice(0, maxLength).replace(/-+$/g, '') || fallback
}

function compactCloudNameWithSuffix(prefix: string, value: string, suffix: string) {
  const normalizedSuffix = compactCloudName(suffix, 'x', 12)
  const suffixPart = `-${normalizedSuffix}`
  const base = compactCloudName(`${prefix}-${value}`, prefix, 63 - suffixPart.length)
  return `${base}${suffixPart}`.slice(0, 63).replace(/-+$/g, '') || `${prefix}-${normalizedSuffix}`
}

function cloudBuddySystemPrompt(input: {
  name: string
  description?: string
  runtimeLabel: string
  locale: string
}) {
  if (input.locale.startsWith('zh')) {
    return [
      `你是 ${input.name}，运行在 Shadow 云端的 ${input.runtimeLabel} Buddy。`,
      input.description
        ? `你的职责：${input.description}`
        : '你的职责是帮助用户澄清目标、拆解任务，并持续给出可执行的下一步。',
      '请用自然、简洁、可靠的方式回应。先确认用户真正想完成什么，再给出行动建议。',
    ].join('\n')
  }

  return [
    `You are ${input.name}, a ${input.runtimeLabel} Buddy running in Shadow Cloud.`,
    input.description
      ? `Your role: ${input.description}`
      : 'Your role is to clarify goals, break down tasks, and keep the next step actionable.',
    'Respond naturally and concisely. Clarify the goal before proposing execution.',
  ].join('\n')
}

function buildCloudBuddyTemplate(input: {
  name: string
  username: string
  description?: string
  avatarUrl?: string
  runtimeId: CloudBuddyRuntimeId
  templateSlug: string
  namespace: string
  buddyId: string
  locale: string
}) {
  const runtimeLabel = CLOUD_BUDDY_RUNTIME_LABELS[input.runtimeId]
  const description =
    input.description ||
    (input.locale.startsWith('zh')
      ? `${input.name} 会在 Shadow 云端运行，手机退出后也可以继续响应。`
      : `${input.name} runs in Shadow Cloud and can keep responding when your phone is closed.`)

  return {
    version: '1.0.0',
    name: input.templateSlug,
    title: input.name,
    description,
    environment: 'production',
    use: [
      { plugin: 'model-provider' },
      {
        plugin: 'shadowob',
        options: {
          buddies: [
            {
              id: input.buddyId,
              name: input.name,
              description,
              ...(input.avatarUrl ? { avatarUrl: input.avatarUrl } : {}),
            },
          ],
          bindings: [
            {
              targetId: input.buddyId,
              targetType: 'buddy',
              agentId: input.buddyId,
              servers: [],
              channels: [],
            },
          ],
        },
      },
    ],
    deployments: {
      namespace: input.namespace,
      agents: [
        {
          id: input.buddyId,
          runtime: input.runtimeId,
          description,
          identity: {
            name: input.name,
            personality: input.locale.startsWith('zh')
              ? '你是一个可靠、清晰、主动的 Shadow Buddy。'
              : 'You are a reliable, clear, proactive Shadow Buddy.',
            systemPrompt: cloudBuddySystemPrompt({
              name: input.name,
              description: input.description,
              runtimeLabel,
              locale: input.locale,
            }),
          },
          resources: {
            requests: {
              cpu: '100m',
              memory: '256Mi',
            },
            limits: {
              cpu: '1000m',
              memory: '1Gi',
            },
          },
          configuration: {},
        },
      ],
    },
    metadata: {
      createdFrom: 'shadow-mobile-create-buddy',
      buddyUsername: input.username,
      runtimeId: input.runtimeId,
    },
  } satisfies CloudTemplate
}

async function waitForCloudDeployment(
  deploymentId: string,
  messages: { failed: string; timeout: string },
) {
  const deadline = Date.now() + CLOUD_DEPLOYMENT_TIMEOUT_MS

  while (Date.now() < deadline) {
    const deployment = await fetchApi<CloudDeployment>(
      `/api/cloud-saas/deployments/${deploymentId}`,
    )
    if (deployment.status === 'deployed') return deployment
    if (deployment.status === 'failed' || deployment.status === 'destroyed') {
      throw new Error(
        deployment.errorMessage
          ? `${messages.failed}: ${deployment.errorMessage}`
          : messages.failed,
      )
    }
    await delay(CLOUD_DEPLOYMENT_POLL_INTERVAL_MS)
  }

  throw new Error(messages.timeout)
}

async function waitForAgentOnline(agentId: string, timeoutMessage: string) {
  const deadline = Date.now() + AGENT_ONLINE_TIMEOUT_MS

  while (Date.now() < deadline) {
    const agent = await fetchApi<CloudBuddyAgent>(`/api/agents/${agentId}`)
    if (agent.status === 'running' && agent.lastHeartbeat) return agent
    await delay(AGENT_ONLINE_POLL_INTERVAL_MS)
  }

  throw new Error(timeoutMessage)
}

export async function createCloudBuddy(input: {
  name: string
  username: string
  description?: string
  avatarUrl?: string
  runtimeId?: CloudBuddyRuntimeId
  buddyMode: BuddyMode
  allowedServerIds: string[]
  locale: string
  timezone?: string
  messages: {
    deploymentFailed: string
    deploymentTimeout: string
    onlineTimeout: string
  }
}) {
  const runtimeId = input.runtimeId ?? 'openclaw'
  const runtimeLabel = CLOUD_BUDDY_RUNTIME_LABELS[runtimeId]
  const buddyId = compactCloudName(input.username, 'buddy', 48)
  const suffix = randomCloudSuffix()
  const templateSlug = compactCloudNameWithSuffix('buddy', runtimeId, suffix)
  const namespace = compactCloudNameWithSuffix('buddy-cloud', runtimeId, suffix)
  const template = buildCloudBuddyTemplate({
    name: input.name,
    username: input.username,
    description: input.description,
    avatarUrl: input.avatarUrl,
    runtimeId,
    templateSlug,
    namespace,
    buddyId,
    locale: input.locale,
  })

  await fetchApi<CloudTemplate>('/api/cloud-saas/templates', {
    method: 'POST',
    body: JSON.stringify({
      slug: templateSlug,
      name: `${input.name} Cloud Buddy`,
      description: template.description,
      content: template,
      tags: ['buddy', 'cloud', runtimeId],
      category: 'buddy',
      baseCost: 0,
      githubSource: null,
    }),
  })

  const deployment = await fetchApi<CloudDeployment>('/api/cloud-saas/deployments', {
    method: 'POST',
    body: JSON.stringify({
      namespace,
      name: `${input.name} Cloud Buddy`,
      templateSlug,
      resourceTier: 'lightweight',
      agentCount: 1,
      configSnapshot: template,
      runtimeContext: {
        locale: input.locale,
        ...(input.timezone ? { timezone: input.timezone } : {}),
      },
    }),
  })

  const deployed = await waitForCloudDeployment(deployment.id, {
    failed: input.messages.deploymentFailed,
    timeout: input.messages.deploymentTimeout,
  })
  const provisionedAgentId = resolveProvisionedBuddyAgentId(deployed, buddyId)
  if (!provisionedAgentId) {
    throw new Error(input.messages.deploymentFailed)
  }

  const onlineAgent = await waitForAgentOnline(provisionedAgentId, input.messages.onlineTimeout)

  return {
    ...onlineAgent,
    kernelType: runtimeId,
    config: {
      ...(onlineAgent.config ?? {}),
      shadowob: { buddyId },
      cloud: {
        provider: 'shadow-cloud',
        runtimeId,
        runtimeLabel,
        templateSlug,
        deploymentId: deployed.id,
        namespace: deployed.namespace ?? namespace,
        status: deployed.status,
      },
    },
  }
}
