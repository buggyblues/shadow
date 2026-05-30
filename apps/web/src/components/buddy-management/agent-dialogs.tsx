import {
  Button,
  cn,
  Input,
  Modal,
  ModalBody,
  ModalButtonGroup,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Switch,
} from '@shadowob/ui'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Cloud,
  Code2,
  Cpu,
  Loader2,
  type LucideIcon,
  Sparkles,
  Terminal,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { fetchApi } from '../../lib/api'
import { toPinyinSlug } from '../../lib/pinyin'
import { AvatarEditor } from '../common/avatar-editor'
import {
  type Agent,
  type BuddyMode,
  connectorRuntimeInstallCommand,
  connectorRuntimeInstallCommandList,
  getAgentAllowedServerIds,
  getAgentBuddyMode,
} from './types'

type ServerEntry = {
  server: {
    id: string
    name: string
    slug?: string | null
  }
}

function deriveBuddyUsername(name: string) {
  return toPinyinSlug(name, 'buddy')
}

type BuddyModeControlStyle = 'cards' | 'switch'
type QuickCreateStep = 'basic' | 'advanced'
export type CloudBuddyRuntimeId =
  | 'openclaw'
  | 'hermes'
  | 'claude-code'
  | 'codex'
  | 'opencode'
  | 'gemini'

type CloudDeployment = {
  id: string
  namespace: string
  status: string
  templateSlug?: string | null
  errorMessage?: string | null
}

type ConnectorJob = {
  id: string
  status: string
  error?: string | null
}

type AgentStatusResponse = Pick<Agent, 'id' | 'status' | 'lastHeartbeat'>

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

export const CLOUD_RUNTIME_LABELS: Record<CloudBuddyRuntimeId, string> = {
  openclaw: 'OpenClaw',
  hermes: 'Hermes Agent',
  'claude-code': 'Claude Code',
  codex: 'Codex CLI',
  opencode: 'OpenCode',
  gemini: 'Gemini CLI',
}

const RUNTIME_ICON_SOURCES: Record<string, string> = {
  openclaw: new URL('../../assets/runtime-icons/openclaw.svg', import.meta.url).toString(),
  hermes: new URL('../../assets/runtime-icons/hermes-agent.png', import.meta.url).toString(),
  'claude-code': new URL('../../assets/runtime-icons/claude-code.svg', import.meta.url).toString(),
  codex: new URL('../../assets/runtime-icons/codex.svg', import.meta.url).toString(),
  opencode: new URL('../../assets/runtime-icons/opencode.svg', import.meta.url).toString(),
  gemini: new URL('../../assets/runtime-icons/gemini.svg', import.meta.url).toString(),
  cursor: new URL('../../assets/runtime-icons/cursor.svg', import.meta.url).toString(),
  kimi: new URL('../../assets/runtime-icons/kimi.png', import.meta.url).toString(),
  copilot: new URL('../../assets/runtime-icons/copilot.svg', import.meta.url).toString(),
  antigravity: new URL('../../assets/runtime-icons/antigravity.png', import.meta.url).toString(),
  'cc-connect': new URL('../../assets/runtime-icons/cc-connect.svg', import.meta.url).toString(),
}

const RUNTIME_ICON_COMPONENTS: Record<string, LucideIcon> = {
  openclaw: Bot,
  hermes: Sparkles,
  'claude-code': Code2,
  codex: Terminal,
  opencode: Code2,
  gemini: Sparkles,
  cursor: Cpu,
  kimi: Sparkles,
  copilot: Code2,
  antigravity: Cpu,
  'cc-connect': Terminal,
}

const BUDDY_INTRO_PROMPT_KEY = 'agentMgmt.buddyIntroPrompt'
const DEFAULT_BUDDY_INTRO_PROMPT = '你好，请介绍一下你自己，并告诉我你能帮我做什么。'

export function getBuddyIntroPrompt(t: (key: string) => string) {
  const message = t(BUDDY_INTRO_PROMPT_KEY)
  return message === BUDDY_INTRO_PROMPT_KEY ? DEFAULT_BUDDY_INTRO_PROMPT : message
}

export function getRuntimeIconSrc(runtimeId: string) {
  return RUNTIME_ICON_SOURCES[runtimeId] ?? null
}

export function RuntimeIcon({
  runtimeId,
  className,
}: {
  runtimeId: string
  label: string
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const src = failed ? null : getRuntimeIconSrc(runtimeId)
  const Icon = RUNTIME_ICON_COMPONENTS[runtimeId] ?? Terminal
  if (src) {
    return (
      <img
        src={src}
        alt=""
        aria-hidden="true"
        className={cn('object-contain', className)}
        onError={() => setFailed(true)}
      />
    )
  }
  return <Icon aria-hidden="true" className={cn('text-current', className)} />
}

export function RuntimeInstallHint({
  runtimeId,
  t,
}: {
  runtimeId: string
  t: (key: string) => string
}) {
  const command = connectorRuntimeInstallCommand(runtimeId)
  if (!command) return <span>{t('agentMgmt.runtimeInstallGuide')}</span>
  return (
    <span>
      {t('agentMgmt.runtimeInstallCommand')}{' '}
      <code className="rounded-md border border-border-subtle bg-bg-deep/70 px-1.5 py-0.5 text-[10px] text-text-primary">
        {command}
      </code>
    </span>
  )
}

export function RuntimeInstallHelpButton({
  runtimeId,
  t,
}: {
  runtimeId: string
  t: (key: string) => string
}) {
  const commands = connectorRuntimeInstallCommandList(runtimeId)
  const primaryCommand = commands[0] ?? connectorRuntimeInstallCommand(runtimeId)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-bg-deep/75 text-text-secondary transition hover:border-primary/50 hover:text-primary"
          aria-label={t('agentMgmt.runtimeInstallHelp')}
        >
          <CircleHelp size={16} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <div className="space-y-2">
          <p className="text-sm font-black text-text-primary">
            {t('agentMgmt.runtimeInstallHelp')}
          </p>
          <p className="text-xs leading-5 text-text-muted">
            {t('agentMgmt.runtimeInstallPopoverDesc')}
          </p>
          {primaryCommand ? (
            <code className="block whitespace-pre-wrap rounded-xl border border-border-subtle bg-bg-deep/85 px-3 py-2 text-[11px] leading-5 text-text-primary">
              {commands.join('\n')}
            </code>
          ) : (
            <p className="text-xs text-text-muted">{t('agentMgmt.runtimeInstallGuide')}</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

const CLOUD_DEPLOYMENT_POLL_INTERVAL_MS = 3000
const CLOUD_DEPLOYMENT_TIMEOUT_MS = 10 * 60 * 1000
const CONNECTOR_JOB_POLL_INTERVAL_MS = 1500
const CONNECTOR_JOB_TIMEOUT_MS = 2 * 60 * 1000
const AGENT_ONLINE_POLL_INTERVAL_MS = 1500
const AGENT_ONLINE_TIMEOUT_MS = 90 * 1000

class CloudDeploymentWaitError extends Error {
  shouldRollback: boolean

  constructor(message: string, shouldRollback: boolean) {
    super(message)
    this.name = 'CloudDeploymentWaitError'
    this.shouldRollback = shouldRollback
  }
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
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
      throw new CloudDeploymentWaitError(
        deployment.errorMessage
          ? `${messages.failed}: ${deployment.errorMessage}`
          : messages.failed,
        true,
      )
    }
    await delay(CLOUD_DEPLOYMENT_POLL_INTERVAL_MS)
  }

  throw new CloudDeploymentWaitError(messages.timeout, false)
}

async function waitForConnectorJob(jobId: string, messages: { failed: string; timeout: string }) {
  const deadline = Date.now() + CONNECTOR_JOB_TIMEOUT_MS

  while (Date.now() < deadline) {
    const response = await fetchApi<{ job: ConnectorJob }>(`/api/connector/jobs/${jobId}`)
    const job = response.job
    if (job.status === 'completed') return job
    if (job.status === 'failed') {
      throw new Error(job.error ? `${messages.failed}: ${job.error}` : messages.failed)
    }
    await delay(CONNECTOR_JOB_POLL_INTERVAL_MS)
  }

  throw new Error(messages.timeout)
}

async function waitForAgentOnline(agentId: string, messages: { timeout: string }) {
  const deadline = Date.now() + AGENT_ONLINE_TIMEOUT_MS

  while (Date.now() < deadline) {
    const agent = await fetchApi<AgentStatusResponse>(`/api/agents/${agentId}`)
    if (agent.status === 'running' && agent.lastHeartbeat) return agent
    await delay(AGENT_ONLINE_POLL_INTERVAL_MS)
  }

  throw new Error(messages.timeout)
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
  runtimeId: CloudBuddyRuntimeId
  templateSlug: string
  namespace: string
  buddyId: string
  locale: string
}) {
  const runtimeLabel = CLOUD_RUNTIME_LABELS[input.runtimeId]
  const description =
    input.description ||
    (input.locale.startsWith('zh')
      ? `${input.name} 会在 Shadow 云端运行，电脑关闭后也可以继续响应。`
      : `${input.name} runs in Shadow Cloud and can keep responding when your computer is closed.`)

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
      createdFrom: 'shadow-web-create-buddy',
      buddyUsername: input.username,
      runtimeId: input.runtimeId,
    },
  } satisfies CloudTemplate
}

function BuddyModeControl({
  buddyMode,
  onModeChange,
  t,
  style = 'cards',
}: {
  buddyMode: BuddyMode
  onModeChange: (mode: BuddyMode) => void
  t: (key: string, options?: unknown) => string
  style?: BuddyModeControlStyle
}) {
  if (style === 'switch') {
    const shareable = buddyMode === 'shareable'
    return (
      <div className="rounded-[14px] border border-border-subtle bg-bg-tertiary/40 px-4 py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-black text-text-primary">
              {shareable ? t('agentMgmt.modeShareable') : t('agentMgmt.modePrivate')}
            </div>
            <div className="mt-1 text-xs leading-5 text-text-muted">
              {shareable ? t('agentMgmt.modeShareableDesc') : t('agentMgmt.modePrivateDesc')}
            </div>
          </div>
          <Switch
            checked={shareable}
            onCheckedChange={(checked) => onModeChange(checked ? 'shareable' : 'private')}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <button
        type="button"
        onClick={() => onModeChange('private')}
        className={`text-left rounded-[14px] border-2 px-4 py-3 transition ${
          buddyMode === 'private'
            ? 'border-primary bg-primary/10'
            : 'border-border-subtle bg-bg-tertiary/50'
        }`}
      >
        <div className="text-sm font-black text-text-primary">{t('agentMgmt.modePrivate')}</div>
        <div className="text-xs leading-5 text-text-muted">{t('agentMgmt.modePrivateDesc')}</div>
      </button>
      <button
        type="button"
        onClick={() => onModeChange('shareable')}
        className={`text-left rounded-[14px] border-2 px-4 py-3 transition ${
          buddyMode === 'shareable'
            ? 'border-primary bg-primary/10'
            : 'border-border-subtle bg-bg-tertiary/50'
        }`}
      >
        <div className="text-sm font-black text-text-primary">{t('agentMgmt.modeShareable')}</div>
        <div className="text-xs leading-5 text-text-muted">{t('agentMgmt.modeShareableDesc')}</div>
      </button>
    </div>
  )
}

function BuddyAccessControls({
  buddyMode,
  allowedServerIds,
  servers,
  onModeChange,
  onAllowedServerIdsChange,
  t,
  modeControlStyle = 'cards',
  showModeControl = true,
  showServerAllowlist = true,
  showPolicyNote = true,
}: {
  buddyMode: BuddyMode
  allowedServerIds: string[]
  servers: ServerEntry[]
  onModeChange: (mode: BuddyMode) => void
  onAllowedServerIdsChange: (ids: string[]) => void
  t: (key: string) => string
  modeControlStyle?: BuddyModeControlStyle
  showModeControl?: boolean
  showServerAllowlist?: boolean
  showPolicyNote?: boolean
}) {
  const toggleServer = (serverId: string) => {
    onAllowedServerIdsChange(
      allowedServerIds.includes(serverId)
        ? allowedServerIds.filter((id) => id !== serverId)
        : [...allowedServerIds, serverId],
    )
  }

  return (
    <div className="space-y-3">
      <div className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted">
        {t('agentMgmt.accessSection')}
      </div>
      {showModeControl && (
        <BuddyModeControl
          buddyMode={buddyMode}
          onModeChange={onModeChange}
          style={modeControlStyle}
          t={t}
        />
      )}
      {showPolicyNote && (
        <div className="rounded-[14px] border border-border-subtle bg-bg-tertiary/40 px-4 py-3">
          <div className="text-xs font-black text-text-primary">
            {t('agentMgmt.defaultReplyPolicy')}
          </div>
          <div className="mt-1 text-xs leading-5 text-text-muted">
            {t('agentMgmt.defaultReplyPolicyDesc')}
          </div>
        </div>
      )}
      {showServerAllowlist && buddyMode === 'private' && (
        <div className="space-y-2">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted">
            {t('agentMgmt.allowedServersLabel')}
          </div>
          <p className="text-xs leading-5 text-text-muted">{t('agentMgmt.allowedServersDesc')}</p>
          {servers.length === 0 ? (
            <div className="text-xs text-text-muted">{t('agentMgmt.allowedServersEmpty')}</div>
          ) : (
            <div className="max-h-36 overflow-y-auto rounded-[14px] border border-border-subtle bg-bg-tertiary/30 p-2">
              {servers.map((entry) => (
                <label
                  key={entry.server.id}
                  className="flex items-center gap-2 rounded-[10px] px-2 py-2 text-sm font-bold text-text-primary hover:bg-bg-modifier-hover"
                >
                  <input
                    type="checkbox"
                    checked={allowedServerIds.includes(entry.server.id)}
                    onChange={() => toggleServer(entry.server.id)}
                    className="h-4 w-4 rounded border-border-subtle text-primary"
                  />
                  <span className="truncate">{entry.server.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Create Agent Dialog ──────────────────────────────── */

export function CreateAgentDialog({
  onClose,
  onBack,
  onSuccess,
  onError,
  t,
  initialData,
  embedded = false,
  quick = false,
  hideTitle = false,
  modalSections = false,
  onQuickStepChange,
  connectorComputerId,
  connectorRuntimeId,
  connectorRuntimeLabel,
  serverUrl,
  cloudRuntimeId,
  cloudRuntimeLabel,
}: {
  onClose: () => void
  onBack?: () => void
  onSuccess: (agent: Agent) => void
  onError: (message?: string) => void
  t: (key: string) => string
  initialData?: { name?: string; username?: string; description?: string }
  embedded?: boolean
  quick?: boolean
  hideTitle?: boolean
  modalSections?: boolean
  onQuickStepChange?: (step: QuickCreateStep) => void
  connectorComputerId?: string
  connectorRuntimeId?: string
  connectorRuntimeLabel?: string
  serverUrl?: string
  cloudRuntimeId?: CloudBuddyRuntimeId
  cloudRuntimeLabel?: string
}) {
  const [name, setName] = useState(initialData?.name ?? '')
  const [username, setUsername] = useState(initialData?.username ?? '')
  const [usernameTouched, setUsernameTouched] = useState(Boolean(initialData?.username))
  const [description, setDescription] = useState(initialData?.description ?? '')
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null)
  const [buddyMode, setBuddyMode] = useState<BuddyMode>('private')
  const [allowedServerIds, setAllowedServerIds] = useState<string[]>([])
  const [quickStep, setQuickStep] = useState<QuickCreateStep>('basic')
  const [submitPhase, setSubmitPhase] = useState<'form' | 'deploying'>('form')
  const isQuickAdvanced = quick && quickStep === 'advanced'
  const isCloudCreate = Boolean(cloudRuntimeId)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const submitStartedAtRef = useRef(0)
  const { data: servers = [] } = useQuery({
    queryKey: ['servers', 'buddy-access'],
    queryFn: () => fetchApi<ServerEntry[]>('/api/servers'),
  })

  const createMutation = useMutation({
    mutationFn: async (data: {
      name: string
      username: string
      description?: string
      avatarUrl?: string
      buddyMode: BuddyMode
      allowedServerIds: string[]
    }) => {
      if (connectorComputerId && connectorRuntimeId && serverUrl) {
        return fetchApi<{ agent: Agent; job?: ConnectorJob | null }>(
          `/api/connector/computers/${connectorComputerId}/buddies`,
          {
            method: 'POST',
            body: JSON.stringify({
              name: data.name,
              username: data.username,
              description: data.description,
              avatarUrl: data.avatarUrl,
              runtimeId: connectorRuntimeId,
              serverUrl,
              buddyMode: data.buddyMode,
              allowedServerIds: data.allowedServerIds,
            }),
          },
        ).then(async (result: { agent: Agent; job?: ConnectorJob | null }) => {
          if (result.job?.id) {
            await waitForConnectorJob(result.job.id, {
              failed: t('agentMgmt.connectorDeploymentFailed'),
              timeout: t('agentMgmt.connectorDeploymentTimeout'),
            })
          }
          await waitForAgentOnline(result.agent.id, {
            timeout: t('agentMgmt.agentOnlineTimeout'),
          })
          return fetchApi<Agent>(`/api/agents/${result.agent.id}`)
        })
      }

      if (cloudRuntimeId) {
        let createdAgent: Agent | null = null
        let deploymentReady = false
        try {
          const locale =
            typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en'
          const timezone =
            typeof Intl !== 'undefined'
              ? Intl.DateTimeFormat().resolvedOptions().timeZone
              : undefined
          const runtimeLabel = cloudRuntimeLabel ?? CLOUD_RUNTIME_LABELS[cloudRuntimeId]
          const buddyId = compactCloudName(data.username, 'buddy', 48)

          createdAgent = await fetchApi<Agent>('/api/agents', {
            method: 'POST',
            body: JSON.stringify({
              name: data.name,
              username: data.username,
              description: data.description,
              avatarUrl: data.avatarUrl,
              kernelType: cloudRuntimeId,
              config: {
                shadowob: { buddyId },
                cloud: {
                  provider: 'shadow-cloud',
                  runtimeId: cloudRuntimeId,
                  runtimeLabel,
                  status: 'deploying',
                },
              },
              buddyMode: data.buddyMode,
              allowedServerIds: data.allowedServerIds,
            }),
          })

          const suffix = compactCloudName(createdAgent.id, 'buddy', 8)
          const templateSlug = compactCloudNameWithSuffix('buddy', buddyId, suffix)
          const namespace = compactCloudNameWithSuffix('buddy-cloud', buddyId, suffix)
          const template = buildCloudBuddyTemplate({
            name: data.name,
            username: data.username,
            description: data.description,
            runtimeId: cloudRuntimeId,
            templateSlug,
            namespace,
            buddyId,
            locale,
          })

          await fetchApi<CloudTemplate>('/api/cloud-saas/templates', {
            method: 'POST',
            body: JSON.stringify({
              slug: templateSlug,
              name: `${data.name} Cloud Buddy`,
              description: template.description,
              content: template,
              tags: ['buddy', 'cloud', cloudRuntimeId],
              category: 'buddy',
              baseCost: 0,
              githubSource: null,
            }),
          })

          const deployment = await fetchApi<CloudDeployment>('/api/cloud-saas/deployments', {
            method: 'POST',
            body: JSON.stringify({
              namespace,
              name: `${data.name} Cloud Buddy`,
              templateSlug,
              resourceTier: 'lightweight',
              agentCount: 1,
              configSnapshot: template,
              runtimeContext: {
                locale,
                ...(timezone ? { timezone } : {}),
              },
            }),
          })
          const deployed = await waitForCloudDeployment(deployment.id, {
            failed: t('agentMgmt.cloudDeploymentFailed'),
            timeout: t('agentMgmt.cloudDeploymentTimeout'),
          })
          deploymentReady = true
          await waitForAgentOnline(createdAgent.id, {
            timeout: t('agentMgmt.agentOnlineTimeout'),
          })

          return {
            ...createdAgent,
            kernelType: cloudRuntimeId,
            config: {
              ...createdAgent.config,
              shadowob: { buddyId },
              cloud: {
                provider: 'shadow-cloud',
                runtimeId: cloudRuntimeId,
                runtimeLabel,
                templateSlug,
                deploymentId: deployed.id,
                namespace: deployed.namespace ?? namespace,
                status: deployed.status,
              },
            },
          }
        } catch (err) {
          if (
            createdAgent &&
            !deploymentReady &&
            (!(err instanceof CloudDeploymentWaitError) || err.shouldRollback)
          ) {
            await fetchApi(`/api/agents/${createdAgent.id}`, { method: 'DELETE' }).catch(() => null)
          }
          throw err
        }
      }

      return fetchApi<Agent>('/api/agents', {
        method: 'POST',
        body: JSON.stringify({
          name: data.name,
          username: data.username,
          description: data.description,
          avatarUrl: data.avatarUrl,
          kernelType: 'openclaw',
          config: {},
          buddyMode: data.buddyMode,
          allowedServerIds: data.allowedServerIds,
        }),
      })
    },
    onSuccess: async (agent) => {
      const elapsed = Date.now() - submitStartedAtRef.current
      if (elapsed < 1200) await delay(1200 - elapsed)
      onSuccess(agent)
    },
    onError: (err: Error) => {
      setSubmitPhase('form')
      if (err.message?.toLowerCase().includes('username already taken')) {
        const suffix = Math.random().toString(36).slice(2, 6)
        setUsername((prev) => `${(prev || 'buddy').slice(0, 27)}_${suffix}`)
        setUsernameTouched(true)
        onError(t('agentMgmt.usernameTaken'))
      } else {
        onError(err.message || t('agentMgmt.createFailed'))
      }
    },
  })

  useEffect(() => {
    if (!quick || isQuickAdvanced) return
    const timeoutId = window.setTimeout(() => nameInputRef.current?.focus(), 80)
    return () => window.clearTimeout(timeoutId)
  }, [isQuickAdvanced, quick])

  useEffect(() => {
    if (!quick) return
    onQuickStepChange?.(quickStep)
  }, [onQuickStepChange, quick, quickStep])

  const handleNameChange = (value: string) => {
    setName(value)
    if (!usernameTouched) {
      setUsername(deriveBuddyUsername(value))
    }
  }

  const handleUsernameChange = (value: string) => {
    setUsernameTouched(true)
    setUsername(
      value
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '')
        .slice(0, 32),
    )
  }

  const handleSubmit = () => {
    if (!name.trim() || !username.trim()) return
    submitStartedAtRef.current = Date.now()
    setSubmitPhase('deploying')
    createMutation.mutate({
      name: name.trim(),
      username: username.trim(),
      description: description.trim() || undefined,
      avatarUrl: selectedAvatar ?? undefined,
      buddyMode,
      allowedServerIds: buddyMode === 'private' ? allowedServerIds : [],
    })
  }
  const footerClassName = quick ? '' : embedded ? 'mt-2 pt-2 border-t border-border-subtle' : ''
  const nameField = (
    <div className="space-y-2">
      <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted ml-1">
        {t('agentMgmt.nameLabel')}
      </label>
      <Input
        ref={nameInputRef}
        value={name}
        onChange={(e) => handleNameChange(e.target.value)}
        maxLength={64}
        autoFocus={quick && !isQuickAdvanced}
      />
    </div>
  )
  const usernameField = (
    <div className="space-y-2">
      <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted ml-1">
        {t(quick ? 'agentMgmt.buddyIdLabel' : 'agentMgmt.usernameLabel')}
      </label>
      <Input
        value={username}
        onChange={(e) => handleUsernameChange(e.target.value)}
        maxLength={32}
      />
    </div>
  )
  const profileFields = (
    <div className="grid gap-4 rounded-2xl border border-border-subtle bg-bg-tertiary/30 p-4">
      <div className="space-y-2">
        <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted ml-1">
          {t('agentMgmt.descLabel')}
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full bg-bg-deep/45 border-2 border-border-subtle text-text-primary rounded-[18px] px-4 py-3 text-sm font-bold leading-6 outline-none transition-all placeholder:text-text-muted/30 focus:border-primary focus:shadow-[0_0_0_5px_rgba(0,198,209,0.1)] resize-none"
          rows={quick ? 3 : 4}
          maxLength={500}
        />
      </div>

      <div>
        <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted ml-1 mb-3">
          {t('agentMgmt.avatarLabel')}
        </label>
        <AvatarEditor value={selectedAvatar ?? undefined} onChange={setSelectedAvatar} />
      </div>
    </div>
  )
  const renderAccessControls = (
    showModeControl = true,
    showServerAllowlist = true,
    showPolicyNote = true,
  ) => (
    <BuddyAccessControls
      buddyMode={buddyMode}
      allowedServerIds={allowedServerIds}
      servers={servers}
      onModeChange={setBuddyMode}
      onAllowedServerIdsChange={setAllowedServerIds}
      t={t}
      modeControlStyle="switch"
      showModeControl={showModeControl}
      showServerAllowlist={showServerAllowlist}
      showPolicyNote={showPolicyNote}
    />
  )
  const isDeployingStep = submitPhase === 'deploying'
  const footerButtons = (
    <ModalButtonGroup>
      <Button variant="ghost" size="sm" onClick={onClose}>
        {t('common.cancel')}
      </Button>
      <Button
        variant="primary"
        size="sm"
        onClick={handleSubmit}
        disabled={!name.trim() || !username.trim() || createMutation.isPending}
      >
        {t('common.create')}
      </Button>
    </ModalButtonGroup>
  )

  const deploymentStep = (
    <div className="flex min-h-[420px] flex-col items-center justify-center px-6 py-8 text-center animate-in fade-in duration-200">
      <div className="relative mb-8 h-28 w-28">
        <div className="absolute inset-0 rounded-full border border-primary/25 bg-primary/5" />
        <div className="absolute inset-3 animate-ping rounded-full border border-primary/30" />
        <div className="absolute inset-6 flex items-center justify-center rounded-full border border-primary/40 bg-bg-tertiary/80 shadow-[0_0_32px_rgba(0,198,209,0.22)]">
          {isCloudCreate ? (
            <Cloud size={32} className="text-primary" />
          ) : (
            <Terminal size={32} className="text-primary" />
          )}
        </div>
        <Loader2
          size={18}
          className="absolute right-3 top-4 animate-spin text-primary"
          strokeWidth={2.6}
        />
        <CheckCircle2 size={18} className="absolute bottom-5 left-4 text-success" />
      </div>
      <div className="text-lg font-black text-text-primary">
        {t(isCloudCreate ? 'agentMgmt.cloudDeployingTitle' : 'agentMgmt.connectorConfiguringTitle')}
      </div>
      <div className="mt-3 max-w-sm text-sm leading-6 text-text-muted">
        {t(isCloudCreate ? 'agentMgmt.cloudDeployingDesc' : 'agentMgmt.connectorConfiguringDesc')}
      </div>
      <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-deep/40 px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-text-muted">
        <Bot size={14} />
        {cloudRuntimeLabel ?? connectorRuntimeLabel ?? t('agentMgmt.connectorRuntime')}
      </div>
    </div>
  )

  const content = (
    <>
      {!embedded ? (
        <ModalHeader title={t('agentMgmt.createTitle')} closeLabel={t('common.close')} />
      ) : hideTitle ? null : (
        <h2 className="text-base leading-6 font-bold text-text-primary">
          {t('agentMgmt.createTitle')}
        </h2>
      )}

      {isDeployingStep ? (
        deploymentStep
      ) : (
        <div className={quick ? 'space-y-4' : embedded ? 'space-y-4' : 'space-y-5 py-5'}>
          {onBack && !isQuickAdvanced && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 rounded-xl px-2 py-1 text-xs font-black text-text-muted transition hover:bg-bg-tertiary/60 hover:text-text-primary"
            >
              <ArrowLeft size={15} />
              {t('common.back')}
            </button>
          )}
          {isQuickAdvanced ? (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
              <button
                type="button"
                onClick={() => setQuickStep('basic')}
                className="inline-flex items-center gap-2 rounded-xl px-2 py-1 text-xs font-black text-text-muted transition hover:bg-bg-tertiary/60 hover:text-text-primary"
              >
                <ArrowLeft size={15} />
                {t('common.back')}
              </button>
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted">
                {t('agentMgmt.advancedOptions')}
              </div>
              <div className="space-y-5">
                {usernameField}
                {renderAccessControls(true, false, false)}
              </div>
            </div>
          ) : (
            <>
              <div className={embedded ? 'space-y-2' : 'space-y-3'}>
                {!quick && (
                  <div className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted">
                    {t('agentMgmt.identitySection')}
                  </div>
                )}
                <div className={quick ? 'grid gap-3' : 'grid gap-3 sm:grid-cols-2'}>
                  {nameField}
                  {!quick && usernameField}
                </div>
              </div>

              {profileFields}
              {!quick && renderAccessControls(true, false, false)}

              {quick && (
                <button
                  type="button"
                  onClick={() => setQuickStep('advanced')}
                  className="flex w-full items-center justify-between rounded-2xl border border-border-subtle bg-bg-tertiary/40 px-4 py-3 text-left text-sm font-black text-text-secondary transition hover:bg-bg-tertiary/70 hover:text-text-primary"
                >
                  <span>{t('agentMgmt.advancedOptions')}</span>
                  <ChevronRight size={16} />
                </button>
              )}
            </>
          )}
        </div>
      )}

      {!isDeployingStep && !modalSections && embedded && (
        <div className={footerClassName}>
          <div className="flex justify-end">{footerButtons}</div>
        </div>
      )}
    </>
  )

  if (embedded) {
    if (modalSections) {
      return (
        <>
          <ModalBody className="min-h-0 space-y-4 py-5">{content}</ModalBody>
          {!isDeployingStep && <ModalFooter className="justify-end">{footerButtons}</ModalFooter>}
        </>
      )
    }
    return <div className="animate-in fade-in slide-in-from-right-4 duration-300">{content}</div>
  }

  return (
    <Modal open onClose={onClose}>
      <ModalContent maxWidth="max-w-[560px]" className="shadow-[0_32px_120px_rgba(0,0,0,0.5)]">
        <ModalBody className="space-y-5 py-5">{content}</ModalBody>
        {!isDeployingStep && <ModalFooter className="justify-end">{footerButtons}</ModalFooter>}
      </ModalContent>
    </Modal>
  )
}

/* ── Edit Agent Dialog ────────────────────────────────── */

export function EditAgentDialog({
  agent,
  onClose,
  onSuccess,
  onError,
  t,
}: {
  agent: Agent
  onClose: () => void
  onSuccess: (agent: Agent) => void
  onError: () => void
  t: (key: string) => string
}) {
  const [name, setName] = useState(agent.botUser?.displayName ?? agent.botUser?.username ?? 'Buddy')
  const [description, setDescription] = useState((agent.config?.description as string) ?? '')
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(
    agent.botUser?.avatarUrl ?? null,
  )
  const [buddyMode, setBuddyMode] = useState<BuddyMode>(getAgentBuddyMode(agent))
  const [allowedServerIds, setAllowedServerIds] = useState<string[]>(
    getAgentAllowedServerIds(agent),
  )
  const { data: servers = [] } = useQuery({
    queryKey: ['servers', 'buddy-access'],
    queryFn: () => fetchApi<ServerEntry[]>('/api/servers'),
  })

  const updateMutation = useMutation({
    mutationFn: (data: {
      name: string
      description?: string
      avatarUrl?: string | null
      buddyMode: BuddyMode
      allowedServerIds: string[]
    }) =>
      fetchApi<Agent>(`/api/agents/${agent.id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: (agent) => onSuccess(agent),
    onError: () => onError(),
  })

  return (
    <Modal open onClose={onClose}>
      <ModalContent maxWidth="max-w-[480px]" className="shadow-[0_32px_120px_rgba(0,0,0,0.5)]">
        <ModalHeader title={t('agentMgmt.editTitle')} closeLabel={t('common.close')} />

        <ModalBody className="space-y-4 py-5">
          <div className="space-y-2">
            <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted ml-1">
              {t('agentMgmt.nameLabel')}
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('agentMgmt.namePlaceholder')}
              maxLength={64}
            />
          </div>

          <div className="space-y-2">
            <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted ml-1">
              {t('agentMgmt.descLabel')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('agentMgmt.descPlaceholder')}
              className="w-full bg-bg-tertiary border-2 border-border-subtle text-text-primary rounded-[24px] px-6 py-4 text-base font-bold outline-none transition-all placeholder:text-text-muted/30 focus:border-primary focus:shadow-[0_0_0_5px_rgba(0,198,209,0.1)] resize-none"
              rows={3}
              maxLength={500}
            />
          </div>

          <div>
            <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-text-muted ml-1 mb-3">
              {t('agentMgmt.avatarLabel')}
            </label>
            <AvatarEditor value={selectedAvatar ?? undefined} onChange={setSelectedAvatar} />
          </div>

          <BuddyAccessControls
            buddyMode={buddyMode}
            allowedServerIds={allowedServerIds}
            servers={servers}
            onModeChange={setBuddyMode}
            onAllowedServerIdsChange={setAllowedServerIds}
            t={t}
          />
        </ModalBody>

        <ModalFooter>
          <ModalButtonGroup>
            <Button variant="ghost" size="sm" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() =>
                name.trim() &&
                updateMutation.mutate({
                  name: name.trim(),
                  description: description.trim() || undefined,
                  avatarUrl: selectedAvatar,
                  buddyMode,
                  allowedServerIds: buddyMode === 'private' ? allowedServerIds : [],
                })
              }
              disabled={!name.trim() || updateMutation.isPending}
            >
              {updateMutation.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </ModalButtonGroup>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
