#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const RUNTIME_LABELS = {
  openclaw: 'OpenClaw',
  hermes: 'Hermes Agent',
  'claude-code': 'Claude Code',
  opencode: 'OpenCode',
}

const DEFAULT_RUNTIMES = Object.keys(RUNTIME_LABELS)
const DEFAULT_TIMEOUT_MS = 120_000
const DEFAULT_REPLY_TIMEOUT_MS = 90_000

function parseArgs(argv) {
  const args = {
    runtimes: [],
    profile: 'default',
    locale: 'zh-CN',
    timezone: 'Asia/Shanghai',
    kubeContext: process.env.KUBECONFIG_CONTEXT ?? 'kind-agent-sandbox',
    skipReply: false,
    buddyId: null,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--runtime') {
      args.runtimes.push(argv[++i])
      continue
    }
    if (arg === '--all') {
      args.runtimes = [...DEFAULT_RUNTIMES]
      continue
    }
    if (arg === '--profile') {
      args.profile = argv[++i]
      continue
    }
    if (arg === '--locale') {
      args.locale = argv[++i]
      continue
    }
    if (arg === '--timezone') {
      args.timezone = argv[++i]
      continue
    }
    if (arg === '--kube-context') {
      args.kubeContext = argv[++i]
      continue
    }
    if (arg === '--skip-reply') {
      args.skipReply = true
      continue
    }
    if (arg === '--buddy-id') {
      args.buddyId = argv[++i]
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  if (args.runtimes.length === 0) args.runtimes = ['openclaw']
  for (const runtime of args.runtimes) {
    if (!RUNTIME_LABELS[runtime]) throw new Error(`Unknown runtime: ${runtime}`)
  }
  return args
}

function readProfile(profileName) {
  const configPath = join(homedir(), '.shadowob', 'shadowob.config.json')
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  const profile = config.profiles?.[profileName]
  if (!profile?.serverUrl || !profile?.token) {
    throw new Error(`Profile "${profileName}" is missing serverUrl/token`)
  }
  return profile
}

function compactCloudName(value, fallback, maxLength = 63) {
  const normalized =
    value
      .toLowerCase()
      .normalize('NFKC')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || fallback
  return normalized.slice(0, maxLength).replace(/-+$/g, '') || fallback
}

function compactCloudNameWithSuffix(prefix, value, suffix, maxLength = 63) {
  const normalizedSuffix = compactCloudName(suffix, 'x', 12)
  const suffixPart = `-${normalizedSuffix}`
  const base = compactCloudName(`${prefix}-${value}`, prefix, maxLength - suffixPart.length)
  return (
    `${base}${suffixPart}`.slice(0, maxLength).replace(/-+$/g, '') ||
    `${prefix}-${normalizedSuffix}`
  )
}

function cloudBuddySystemPrompt(input) {
  if (input.locale.startsWith('zh')) {
    return [
      `你是 ${input.name}，运行在 Shadow 云端的 ${input.runtimeLabel} Buddy。`,
      input.description
        ? `你的职责：${input.description}`
        : '你的职责是帮助用户澄清目标、拆解任务，并持续给出可执行的下一步。',
      '请用自然、简洁、可靠的方式回应。',
    ].join('\n')
  }
  return [
    `You are ${input.name}, a ${input.runtimeLabel} Buddy running in Shadow Cloud.`,
    input.description
      ? `Your role: ${input.description}`
      : 'Your role is to clarify goals, break down tasks, and keep the next step actionable.',
    'Respond naturally and concisely.',
  ].join('\n')
}

function buildCloudBuddyTemplate(input) {
  const runtimeLabel = RUNTIME_LABELS[input.runtimeId]
  const description = input.description || `${input.name} local cloud runner smoke test Buddy.`
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
            requests: { cpu: '250m', memory: '512Mi' },
            limits: { cpu: '2000m', memory: '2Gi' },
          },
          configuration: {},
        },
      ],
    },
    metadata: {
      createdFrom: 'local-runner-smoke',
      buddyUsername: input.username,
      runtimeId: input.runtimeId,
    },
  }
}

function podSnapshot(namespace, kubeContext) {
  try {
    return execFileSync(
      'kubectl',
      [
        '--context',
        kubeContext,
        '-n',
        namespace,
        'get',
        'pods',
        '-o',
        'custom-columns=NAME:.metadata.name,READY:.status.containerStatuses[*].ready,PHASE:.status.phase',
        '--no-headers',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim()
  } catch {
    return ''
  }
}

function normalizeErrorBody(data) {
  if (typeof data === 'string') return data.slice(0, 500)
  if (!data || typeof data !== 'object') return data
  return {
    ok: data.ok,
    error: data.error,
    code: data.code,
    status: data.status,
    message: data.message,
  }
}

class Api {
  constructor(profile) {
    this.baseUrl = profile.serverUrl.replace(/\/+$/, '')
    this.headers = {
      authorization: `Bearer ${profile.token}`,
      'content-type': 'application/json',
    }
  }

  async request(method, pathname, body) {
    const res = await fetch(`${this.baseUrl}${pathname}`, {
      method,
      headers: this.headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    let data
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = text
    }
    if (!res.ok) {
      throw new Error(
        `${method} ${pathname} -> ${res.status}: ${JSON.stringify(normalizeErrorBody(data))}`,
      )
    }
    return data
  }
}

async function waitForDeployment(api, deploymentId, namespace, kubeContext, startedAt) {
  const deadline = Date.now() + DEFAULT_TIMEOUT_MS
  let last = ''
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2500))
    const deployment = await api.request('GET', `/api/cloud-saas/deployments/${deploymentId}`)
    const pods = podSnapshot(namespace, kubeContext)
    const status = `${deployment.status}|${pods}`
    if (status !== last) {
      console.log(
        JSON.stringify({
          phase: 'poll',
          deploymentId,
          status: deployment.status,
          error: deployment.errorMessage ?? null,
          pods: pods || null,
          elapsedMs: Date.now() - startedAt,
        }),
      )
      last = status
    }
    if (deployment.status === 'deployed') return deployment
    if (deployment.status === 'failed' || deployment.status === 'destroyed') {
      throw new Error(`deployment ${deployment.status}: ${deployment.errorMessage ?? ''}`)
    }
  }
  throw new Error(`deployment timeout after ${DEFAULT_TIMEOUT_MS}ms`)
}

async function waitForReply(api, channelId, userMessageId, botUserId, options = {}) {
  const deadline = Date.now() + DEFAULT_REPLY_TIMEOUT_MS
  const ignoreMessageIds = new Set(options.ignoreMessageIds ?? [])
  const acceptReply = typeof options.acceptReply === 'function' ? options.acceptReply : () => true
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    const page = await api.request('GET', `/api/channels/${channelId}/messages?limit=50`)
    const messages = Array.isArray(page.messages) ? page.messages : Array.isArray(page) ? page : []
    const candidates = messages.filter((message) => {
      if (message.id === userMessageId) return false
      if (ignoreMessageIds.has(message.id)) return false
      if (message.authorId === botUserId) return true
      if (message.author?.id === botUserId) return true
      return false
    })
    for (const reply of candidates) {
      if (acceptReply(reply)) return reply
      ignoreMessageIds.add(reply.id)
    }
  }
  throw new Error(`reply timeout after ${DEFAULT_REPLY_TIMEOUT_MS}ms`)
}

async function collectBotMessageIds(api, channelId, botUserId) {
  const page = await api.request('GET', `/api/channels/${channelId}/messages?limit=50`)
  const messages = Array.isArray(page.messages) ? page.messages : Array.isArray(page) ? page : []
  return messages
    .filter((message) => message.authorId === botUserId || message.author?.id === botUserId)
    .map((message) => message.id)
    .filter(Boolean)
}

async function resolveRuntimeAgent(api, createdAgentId, buddyId, runtimeId) {
  const page = await api.request('GET', '/api/agents?limit=500')
  const agents = Array.isArray(page) ? page : Array.isArray(page.agents) ? page.agents : []
  const candidates = agents.filter(
    (agent) => agent?.kernelType === runtimeId && agent?.config?.shadowob?.buddyId === buddyId,
  )
  const runtimeAgent =
    candidates.find((agent) => agent.id !== createdAgentId && agent.status === 'running') ??
    candidates.find((agent) => agent.id !== createdAgentId) ??
    candidates[0]
  if (runtimeAgent?.id) return api.request('GET', `/api/agents/${runtimeAgent.id}`)
  return api.request('GET', `/api/agents/${createdAgentId}`)
}

function assertUsableReply(runtimeId, reply) {
  const content = typeof reply.content === 'string' ? reply.content : ''
  const providerError =
    /No inference provider configured/i.test(content) ||
    /Provider authentication failed/i.test(content) ||
    /Not logged in/i.test(content) ||
    /Please run\s+\/login/i.test(content) ||
    /Non-retryable error/i.test(content) ||
    /HTTP 40[013]/i.test(content) ||
    /jwt malformed/i.test(content) ||
    /MODEL_PROXY_UNAUTHORIZED/i.test(content) ||
    /Model not found/i.test(content) ||
    /Performing one time database migration/i.test(content) ||
    /sqlite-migration/i.test(content) ||
    /Database migration complete/i.test(content) ||
    /^📚\s*skill_view:/i.test(content) ||
    /^❌\s*错误:/i.test(content)
  const homeChannelPrompt = /No home channel is set for Shadowob/i.test(content)
  if (providerError || homeChannelPrompt) {
    throw new Error(
      `${runtimeId} returned setup/error text instead of a usable reply: ${content.slice(0, 220)}`,
    )
  }
}

async function runRuntime(runtimeId, options, api) {
  const startedAt = Date.now()
  const nonce = `${runtimeId.replace(/[^a-z0-9]/g, '')}-${Date.now().toString(36).slice(-6)}`
  const name = `${RUNTIME_LABELS[runtimeId]} Smoke ${nonce}`
  const username = compactCloudNameWithSuffix(`${runtimeId}-smoke`, nonce, nonce, 30)
  const buddyId =
    options.buddyId ?? compactCloudNameWithSuffix(`${runtimeId}-buddy`, nonce, nonce, 48)
  const runtimeLabel = RUNTIME_LABELS[runtimeId]

  const createdAgent = await api.request('POST', '/api/agents', {
    name,
    username,
    description: 'Local cloud runner smoke test',
    kernelType: runtimeId,
    config: {
      shadowob: { buddyId },
      cloud: {
        provider: 'shadow-cloud',
        runtimeId,
        runtimeLabel,
        status: 'deploying',
      },
    },
    buddyMode: 'private',
    allowedServerIds: [],
  })

  const suffix = compactCloudName(createdAgent.id, 'buddy', 8)
  const templateSlug = compactCloudNameWithSuffix('buddy', buddyId, suffix)
  const namespace = compactCloudNameWithSuffix('buddy-cloud', buddyId, suffix)
  const template = buildCloudBuddyTemplate({
    name,
    username,
    description: 'Local cloud runner smoke test',
    runtimeId,
    templateSlug,
    namespace,
    buddyId,
    locale: options.locale,
  })

  await api.request('POST', '/api/cloud-saas/templates', {
    slug: templateSlug,
    name: `${name} Cloud Buddy`,
    description: template.description,
    content: template,
    tags: ['buddy', 'cloud', runtimeId, 'smoke'],
    category: 'buddy',
    baseCost: 0,
    githubSource: null,
  })

  const deployment = await api.request('POST', '/api/cloud-saas/deployments', {
    namespace,
    name: `${name} Cloud Buddy`,
    templateSlug,
    resourceTier: 'lightweight',
    agentCount: 1,
    configSnapshot: template,
    runtimeContext: {
      locale: options.locale,
      ...(options.timezone ? { timezone: options.timezone } : {}),
    },
  })

  console.log(
    JSON.stringify({
      phase: 'created',
      runtimeId,
      agentId: createdAgent.id,
      botUserId: createdAgent.botUser?.id ?? createdAgent.userId,
      deploymentId: deployment.id,
      namespace,
      elapsedMs: Date.now() - startedAt,
    }),
  )

  const deployed = await waitForDeployment(
    api,
    deployment.id,
    namespace,
    options.kubeContext,
    startedAt,
  )

  const agent = await resolveRuntimeAgent(api, createdAgent.id, buddyId, runtimeId)
  const botUserId =
    agent.botUser?.id ?? agent.userId ?? createdAgent.botUser?.id ?? createdAgent.userId

  const result = {
    runtimeId,
    agentId: createdAgent.id,
    botUserId,
    deploymentId: deployed.id,
    namespace: deployed.namespace ?? namespace,
    deployElapsedMs: Date.now() - startedAt,
  }

  if (options.skipReply) return { ...result, reply: null }

  const dm = await api.request('POST', '/api/channels/dm', { userId: botUserId })
  const channelId = dm.id
  const ignoredReplyIds = new Set()
  if (runtimeId === 'hermes') {
    const home = await api.request('POST', `/api/channels/${channelId}/messages`, {
      content: '/sethome',
    })
    await waitForReply(api, channelId, home.id, botUserId, {
      acceptReply(reply) {
        const content = typeof reply.content === 'string' ? reply.content : ''
        return /home channel/i.test(content) && /(set|locked)/i.test(content)
      },
    })
    for (const messageId of await collectBotMessageIds(api, channelId, botUserId)) {
      ignoredReplyIds.add(messageId)
    }
  }
  const sent = await api.request('POST', `/api/channels/${channelId}/messages`, {
    content: `local runner smoke ${runtimeId}: reply with one short sentence`,
  })
  const reply = await waitForReply(api, channelId, sent.id, botUserId, {
    ignoreMessageIds: ignoredReplyIds,
  })
  assertUsableReply(runtimeId, reply)
  return {
    ...result,
    channelId,
    sentMessageId: sent.id,
    reply: {
      id: reply.id,
      authorId: reply.authorId ?? reply.author?.id,
      contentPreview: typeof reply.content === 'string' ? reply.content.slice(0, 160) : '',
    },
    totalElapsedMs: Date.now() - startedAt,
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const profile = readProfile(options.profile)
  const api = new Api(profile)
  const results = []
  for (const runtimeId of options.runtimes) {
    console.log(JSON.stringify({ phase: 'start', runtimeId }))
    const result = await runRuntime(runtimeId, options, api)
    results.push(result)
    console.log(JSON.stringify({ phase: 'ok', ...result }))
  }
  console.log(JSON.stringify({ phase: 'done', results }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
