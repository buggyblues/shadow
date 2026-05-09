import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  GlassHeader,
  GlassPanel,
  Progress,
  Textarea,
} from '@shadowob/ui'
import { useSearch } from '@tanstack/react-router'
import {
  ArrowRight,
  BookOpenCheck,
  Bot,
  ClipboardCheck,
  Compass,
  FileCode2,
  Layers3,
  type LucideIcon,
  MessageSquare,
  RefreshCcw,
  Rocket,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  Sparkles,
  WandSparkles,
  XCircle,
} from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError, fetchApi, fetchApiResponse } from '../lib/api'
import { getApiErrorMessage } from '../lib/api-errors'
import {
  DiyDeployWizardModal,
  DiyFeedbackModal,
  DiyStepDirectory,
  StepHeading,
} from './diy-cloud-components'
import {
  type CloudDeploymentStatus,
  type CloudTemplateRecord,
  type DeployPhase,
  type DiyCloudAgentStepOutput,
  type DiyCloudDraft,
  type DiyCloudProgressEvent,
  type DiyCloudSession,
  type ServerMeta,
  STEP_ORDER,
  type StepId,
} from './diy-cloud-model'

const ALWAYS_KEEP_PLUGIN_IDS = new Set(['model-provider', 'shadowob'])

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function isInfrastructureError(message: string) {
  return /pulumi|kubernetes|kubectl|duplicate entries|command failed|stdout:|stderr:/i.test(message)
}

function compactSlug(input: string, fallback = 'diy-cloud') {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
  return (slug || fallback).slice(0, 48).replace(/-+$/g, '') || fallback
}

function uniqueSlug(base: string, maxLength = 63) {
  const suffix = Date.now().toString(36)
  const prefix = compactSlug(base).slice(0, Math.max(8, maxLength - suffix.length - 1))
  return `${prefix}-${suffix}`.replace(/-+$/g, '')
}

function agentCountFromTemplate(template: Record<string, unknown>) {
  const deployments = template.deployments
  if (!deployments || typeof deployments !== 'object' || Array.isArray(deployments)) return 1
  const agents = (deployments as Record<string, unknown>).agents
  return Array.isArray(agents) ? Math.max(1, agents.length) : 1
}

function getTemplateChannels(template: Record<string, unknown>) {
  const use = Array.isArray(template.use) ? template.use : []
  const channels: string[] = []
  for (const entry of use) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const record = entry as Record<string, unknown>
    if (record.plugin !== 'shadowob') continue
    const servers = ((record.options as Record<string, unknown> | undefined)?.servers ??
      []) as unknown
    if (!Array.isArray(servers)) continue
    for (const server of servers) {
      if (!server || typeof server !== 'object' || Array.isArray(server)) continue
      const serverChannels = (server as Record<string, unknown>).channels
      if (!Array.isArray(serverChannels)) continue
      for (const channel of serverChannels) {
        if (!channel || typeof channel !== 'object' || Array.isArray(channel)) continue
        const title = (channel as Record<string, unknown>).title
        const id = (channel as Record<string, unknown>).id
        if (typeof title === 'string') channels.push(title)
        else if (typeof id === 'string') channels.push(id)
      }
    }
  }
  return [...new Set(channels)]
}

function getTemplateBuddyNames(template: Record<string, unknown>) {
  const use = Array.isArray(template.use) ? template.use : []
  const names: string[] = []
  for (const entry of use) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const record = entry as Record<string, unknown>
    if (record.plugin !== 'shadowob') continue
    const buddies = ((record.options as Record<string, unknown> | undefined)?.buddies ??
      []) as unknown
    if (!Array.isArray(buddies)) continue
    for (const buddy of buddies) {
      if (!buddy || typeof buddy !== 'object' || Array.isArray(buddy)) continue
      const name = (buddy as Record<string, unknown>).name
      if (typeof name === 'string') names.push(name)
    }
  }
  return [...new Set(names)]
}

function getTemplatePlugins(template: Record<string, unknown>) {
  const plugins = new Set<string>()
  const collect = (items: unknown) => {
    if (!Array.isArray(items)) return
    for (const item of items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue
      const plugin = (item as Record<string, unknown>).plugin
      if (typeof plugin === 'string') plugins.add(plugin)
    }
  }
  collect(template.use)
  const agents = (template.deployments as Record<string, unknown> | undefined)?.agents
  if (Array.isArray(agents)) {
    for (const agent of agents) {
      if (!agent || typeof agent !== 'object' || Array.isArray(agent)) continue
      collect((agent as Record<string, unknown>).use)
    }
  }
  return [...plugins]
}

function templateForDeployment(template: Record<string, unknown>, namespace: string) {
  const snapshot = JSON.parse(JSON.stringify(template)) as Record<string, unknown>
  const deployments =
    snapshot.deployments &&
    typeof snapshot.deployments === 'object' &&
    !Array.isArray(snapshot.deployments)
      ? (snapshot.deployments as Record<string, unknown>)
      : {}

  snapshot.deployments = {
    ...deployments,
    namespace,
  }

  return snapshot
}

function templateWithoutSkippedPlugins(
  template: Record<string, unknown>,
  skippedPluginIds: Set<string>,
) {
  if (skippedPluginIds.size === 0) return template
  const snapshot = JSON.parse(JSON.stringify(template)) as Record<string, unknown>
  const keepUse = (items: unknown) =>
    Array.isArray(items)
      ? items.filter((item) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) return true
          const plugin = (item as Record<string, unknown>).plugin
          return typeof plugin !== 'string' || !skippedPluginIds.has(plugin)
        })
      : items

  snapshot.use = keepUse(snapshot.use)
  const deployments = snapshot.deployments
  const agents =
    deployments && typeof deployments === 'object' && !Array.isArray(deployments)
      ? (deployments as Record<string, unknown>).agents
      : null
  if (Array.isArray(agents)) {
    for (const agent of agents) {
      if (!agent || typeof agent !== 'object' || Array.isArray(agent)) continue
      const record = agent as Record<string, unknown>
      record.use = keepUse(record.use)
    }
  }

  return snapshot
}

async function resolveServerRedirectUrl(serverId: string, channelId?: string | null) {
  const server = await fetchApi<ServerMeta>(`/api/servers/${encodeURIComponent(serverId)}`)
  const serverPath = `/servers/${encodeURIComponent(server.slug ?? server.id)}`
  return channelId ? `${serverPath}/channels/${encodeURIComponent(channelId)}` : serverPath
}

function scoreVariant(score: number) {
  if (score >= 85) return 'success' as const
  if (score >= 70) return 'primary' as const
  return 'warning' as const
}

function parseSseBlock(block: string) {
  let event = 'message'
  const data: string[] = []
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
  }
  return { event, data: data.join('\n') }
}

function isProgressEvent(value: unknown): value is DiyCloudProgressEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    record.type === 'progress' &&
    typeof record.id === 'string' &&
    STEP_ORDER.includes(record.step as StepId) &&
    typeof record.title === 'string' &&
    typeof record.detail === 'string'
  )
}

function isSessionPayload(value: unknown): value is DiyCloudSession {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return typeof record.sessionId === 'string' && typeof record.expiresAt === 'string'
}

function isDraftPayload(value: unknown): value is { draft: DiyCloudDraft } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const draft = (value as Record<string, unknown>).draft
  return Boolean(draft && typeof draft === 'object' && !Array.isArray(draft))
}

function progressValue(completed: number, total: number, generating: boolean) {
  if (total <= 0) return generating ? 12 : 0
  const value = Math.round((completed / total) * 100)
  return generating ? Math.max(12, Math.min(96, value)) : value
}

function formatJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function DiyCloudPage() {
  const { t, i18n } = useTranslation()
  const search = useSearch({ strict: false }) as {
    prompt?: string
    session?: string
    debug?: string
  }
  const searchParams = new URLSearchParams(window.location.search)
  const initialPrompt =
    typeof search.prompt === 'string' ? search.prompt : searchParams.get('prompt') || ''
  const initialSessionId =
    typeof search.session === 'string' ? search.session : searchParams.get('session') || ''
  const debugMode =
    (typeof search.debug === 'string' ? search.debug : searchParams.get('debug')) === 'true'
  const autoStartedRef = useRef(false)
  const generationAbortRef = useRef<AbortController | null>(null)
  const sectionRefs = useRef<Partial<Record<StepId, HTMLElement | null>>>({})
  const [prompt, setPrompt] = useState(initialPrompt)
  const [sessionId, setSessionId] = useState(initialSessionId)
  const [feedback, setFeedback] = useState('')
  const [draft, setDraft] = useState<DiyCloudDraft | null>(null)
  const [activeStep, setActiveStep] = useState<StepId | null>(null)
  const [selectedStep, setSelectedStep] = useState<StepId>('think')
  const [completedSteps, setCompletedSteps] = useState<Set<StepId>>(new Set())
  const [generationEvents, setGenerationEvents] = useState<DiyCloudProgressEvent[]>([])
  const [generating, setGenerating] = useState(false)
  const [generationError, setGenerationError] = useState('')
  const [saveTemplate, setSaveTemplate] = useState(true)
  const [deployPhase, setDeployPhase] = useState<DeployPhase>('idle')
  const [deployError, setDeployError] = useState('')
  const [keyValues, setKeyValues] = useState<Record<string, string>>({})
  const [skippedKeys, setSkippedKeys] = useState<Set<string>>(new Set())
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [deployGuideOpen, setDeployGuideOpen] = useState(false)
  const [deployGuideIndex, setDeployGuideIndex] = useState(0)
  const [gate, setGate] = useState<{
    kind: 'membership' | 'wallet' | 'generic'
    title: string
    body: string
    primaryHref?: string
    primaryLabel?: string
    secondaryHref?: string
    secondaryLabel?: string
  } | null>(null)

  const stepLabels = useMemo(
    () =>
      Object.fromEntries(
        STEP_ORDER.map((id) => [
          id,
          {
            title: t(`diyCloud.steps.${id}.title`),
            detail: t(`diyCloud.steps.${id}.detail`),
          },
        ]),
      ) as Record<StepId, { title: string; detail: string }>,
    [t],
  )

  const completeStep = (id: StepId) => {
    setCompletedSteps((current) => new Set([...current, id]))
  }

  const scrollToStep = (id: StepId) => {
    setSelectedStep(id)
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const applyProgressEvent = (event: DiyCloudProgressEvent) => {
    setGenerationEvents((current) =>
      current.some((item) => item.id === event.id) ? current : [...current, event].slice(-80),
    )
    setActiveStep(event.step)
    setSelectedStep(event.step)
    if (event.status === 'completed' || event.status === 'warning') {
      completeStep(event.step)
    }
  }

  const applySessionPayload = (session: DiyCloudSession) => {
    setSessionId(session.sessionId)
    if (session.input?.prompt) setPrompt(session.input.prompt)

    const url = new URL(window.location.href)
    url.searchParams.set('session', session.sessionId)
    url.searchParams.delete('prompt')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }

  const applyDraft = (nextDraft: DiyCloudDraft) => {
    setDraft(nextDraft)
    setKeyValues({})
    setSkippedKeys(new Set())
    setActiveStep('review')
    setSelectedStep('review')
    setFeedback('')
    setFeedbackOpen(false)
  }

  const consumeGenerationStream = async (response: Response) => {
    if (!response.body) throw new Error(t('diyCloud.errors.generateFailed'))

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let receivedDraft = false
    const processBlock = (block: string) => {
      const message = parseSseBlock(block)
      if (!message.data) return
      const data = JSON.parse(message.data) as unknown
      if (message.event === 'session' && isSessionPayload(data)) {
        applySessionPayload(data)
        return
      }
      if (message.event === 'progress' && isProgressEvent(data)) {
        applyProgressEvent(data)
        return
      }
      if (message.event === 'draft' && isDraftPayload(data)) {
        receivedDraft = true
        applyDraft(data.draft)
        return
      }
      if (message.event === 'error') {
        const errorPayload = data as { error?: string }
        throw new Error(errorPayload.error || t('diyCloud.errors.generateFailed'))
      }
    }

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let boundary = buffer.indexOf('\n\n')
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary).trim()
        buffer = buffer.slice(boundary + 2)
        if (block) processBlock(block)
        boundary = buffer.indexOf('\n\n')
      }
    }
    const tail = buffer.trim()
    if (tail) processBlock(tail)
    return receivedDraft
  }

  const runGeneration = async (nextPrompt = prompt, nextFeedback = '') => {
    const trimmed = nextPrompt.trim()
    if (!trimmed || generating) return

    generationAbortRef.current?.abort()
    const controller = new AbortController()
    generationAbortRef.current = controller
    const previousConfig = draft?.template
    setGenerating(true)
    setGenerationError('')
    setDeployError('')
    setGate(null)
    setDraft(null)
    setSessionId('')
    setGenerationEvents([])
    setCompletedSteps(new Set())
    setDeployGuideIndex(0)
    try {
      setActiveStep('think')
      setSelectedStep('think')

      const response = await fetchApiResponse('/api/cloud-saas/diy/generate/stream', {
        method: 'POST',
        signal: controller.signal,
        body: JSON.stringify({
          prompt: trimmed,
          feedback: nextFeedback || undefined,
          previousConfig,
          locale: i18n.language,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      })
      const receivedDraft = await consumeGenerationStream(response)
      if (!receivedDraft) throw new Error(t('diyCloud.errors.generateFailed'))
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setGenerationError(getApiErrorMessage(err, t, 'diyCloud.errors.generateFailed'))
        setActiveStep(null)
      }
    } finally {
      setGenerating(false)
      if (generationAbortRef.current === controller) {
        generationAbortRef.current = null
      }
    }
  }

  const resumeGeneration = async (nextSessionId = sessionId) => {
    const trimmed = nextSessionId.trim()
    if (!trimmed || generating) return

    generationAbortRef.current?.abort()
    const controller = new AbortController()
    generationAbortRef.current = controller
    setGenerating(true)
    setGenerationError('')
    setDeployError('')
    setGate(null)
    setDraft(null)
    setSessionId(trimmed)
    setGenerationEvents([])
    setCompletedSteps(new Set())
    setDeployGuideIndex(0)

    try {
      setActiveStep('think')
      setSelectedStep('think')
      const response = await fetchApiResponse(
        `/api/cloud-saas/diy/sessions/${encodeURIComponent(trimmed)}/stream`,
        { signal: controller.signal },
      )
      const receivedDraft = await consumeGenerationStream(response)
      if (!receivedDraft) throw new Error(t('diyCloud.errors.generateFailed'))
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setGenerationError(getApiErrorMessage(err, t, 'diyCloud.errors.generateFailed'))
        setActiveStep(null)
      }
    } finally {
      setGenerating(false)
      if (generationAbortRef.current === controller) {
        generationAbortRef.current = null
      }
    }
  }

  useEffect(() => () => generationAbortRef.current?.abort(), [])

  useEffect(() => {
    if (autoStartedRef.current || !initialSessionId.trim()) return
    autoStartedRef.current = true
    void resumeGeneration(initialSessionId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSessionId])

  useEffect(() => {
    if (autoStartedRef.current || initialSessionId.trim() || !initialPrompt.trim()) return
    autoStartedRef.current = true
    void runGeneration(initialPrompt)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt, initialSessionId])

  const saveDraftTemplate = async (
    currentDraft: DiyCloudDraft,
    content: Record<string, unknown> = currentDraft.template,
  ) => {
    const slug = uniqueSlug(currentDraft.slug)
    return fetchApi<CloudTemplateRecord>('/api/cloud-saas/templates', {
      method: 'POST',
      body: JSON.stringify({
        slug,
        name: currentDraft.title,
        description: currentDraft.description,
        content,
        tags: ['diy', 'generated'],
        category: 'business',
        baseCost: 0,
      }),
    })
  }

  const deleteDraftTemplate = async (slug: string) => {
    await fetchApi<{ ok: boolean }>(`/api/cloud-saas/templates/${encodeURIComponent(slug)}`, {
      method: 'DELETE',
    }).catch(() => null)
  }

  const waitForDeployment = async (deploymentId: string) => {
    const startedAt = Date.now()
    while (Date.now() - startedAt < 240_000) {
      const deployment = await fetchApi<CloudDeploymentStatus>(
        `/api/cloud-saas/deployments/${encodeURIComponent(deploymentId)}`,
      )
      if (deployment.status === 'deployed' && deployment.shadowServerId) {
        setDeployPhase('redirecting')
        const path = await resolveServerRedirectUrl(
          deployment.shadowServerId,
          deployment.shadowChannelId,
        )
        window.location.assign(`/app${path}`)
        return
      }
      if (deployment.status === 'failed') {
        throw new Error(deployment.errorMessage || t('diyCloud.errors.deployFailed'))
      }
      await wait(2400)
    }
    throw new Error(t('diyCloud.errors.deployTimeout'))
  }

  const deployDraft = async () => {
    if (!draft || (deployPhase !== 'idle' && deployPhase !== 'error')) return
    setDeployPhase('saving')
    setDeployError('')
    setGate(null)
    try {
      const prunedTemplate = templateWithoutSkippedPlugins(draft.template, skippedPluginIds)
      const savedTemplate = await saveDraftTemplate(draft, prunedTemplate)
      completeStep('review')

      setDeployPhase('deploying')
      const namespace = uniqueSlug(savedTemplate.slug, 58)
      const configSnapshot = templateForDeployment(prunedTemplate, namespace)
      const envVars = Object.fromEntries(
        draft.requiredKeys
          .filter((key) => !skippedKeys.has(key.key))
          .map((key) => [key.key, keyValues[key.key]?.trim() ?? ''])
          .filter(([, value]) => value),
      )
      const deployment = await fetchApi<CloudDeploymentStatus>('/api/cloud-saas/deployments', {
        method: 'POST',
        body: JSON.stringify({
          namespace,
          name: draft.title,
          templateSlug: savedTemplate.slug,
          resourceTier: 'lightweight',
          agentCount: agentCountFromTemplate(configSnapshot),
          configSnapshot,
          envVars,
          runtimeContext: {
            locale: i18n.language,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
        }),
      })

      if (!saveTemplate) await deleteDraftTemplate(savedTemplate.slug)
      setDeployPhase('polling')
      await waitForDeployment(deployment.id)
    } catch (err) {
      setDeployPhase('error')
      if (err instanceof ApiError && err.code === 'INVITE_REQUIRED') {
        setGate({
          kind: 'membership',
          title: t('diyCloud.gates.membershipTitle'),
          body: t('diyCloud.gates.membershipBody'),
          primaryHref: '/app/settings?tab=tasks&section=invite',
          primaryLabel: t('diyCloud.gates.goInvite'),
        })
        return
      }
      if (
        err instanceof ApiError &&
        (err.status === 402 || err.code === 'WALLET_INSUFFICIENT_BALANCE')
      ) {
        setGate({
          kind: 'wallet',
          title: t('diyCloud.gates.walletTitle'),
          body: t('diyCloud.gates.walletBody', {
            balance: err.balance ?? 0,
            shortfall: err.shortfall ?? 0,
          }),
          primaryHref: '/app/settings/tasks',
          primaryLabel: t('diyCloud.gates.goTasks'),
          secondaryHref: '/app/settings/wallet',
          secondaryLabel: t('diyCloud.gates.goWallet'),
        })
        return
      }
      const message = getApiErrorMessage(err, t, 'diyCloud.errors.deployFailed')
      setDeployError(
        isInfrastructureError(message) ? t('diyCloud.errors.deployInfrastructureFailed') : message,
      )
    }
  }

  const deployBusy = deployPhase !== 'idle' && deployPhase !== 'error'
  const deployPhaseText = deployPhase === 'idle' ? '' : t(`diyCloud.deployPhases.${deployPhase}`)
  const draftChannels = draft ? getTemplateChannels(draft.template) : []
  const draftBuddies = draft ? getTemplateBuddyNames(draft.template) : []
  const draftPlugins = draft ? getTemplatePlugins(draft.template) : []
  const preparedKeyCount = draft
    ? draft.requiredKeys.filter((key) => keyValues[key.key]?.trim() || skippedKeys.has(key.key))
        .length
    : 0
  const requiredKeysReady = draft ? preparedKeyCount === draft.requiredKeys.length : false
  const skippedPluginIds = useMemo(() => {
    const ids = new Set<string>()
    if (!draft) return ids
    for (const key of draft.requiredKeys) {
      if (skippedKeys.has(key.key) && !ALWAYS_KEEP_PLUGIN_IDS.has(key.sourcePluginId)) {
        ids.add(key.sourcePluginId)
      }
    }
    return ids
  }, [draft, skippedKeys])
  const outlineCards: Array<{ title: string; items: string[]; Icon: LucideIcon }> = [
    { title: t('diyCloud.stage.channelsTitle'), items: draftChannels, Icon: Server },
    { title: t('diyCloud.stage.buddiesTitle'), items: draftBuddies, Icon: MessageSquare },
    { title: t('diyCloud.stage.pluginsTitle'), items: draftPlugins, Icon: FileCode2 },
  ]
  const progressByStep = useMemo(() => {
    const map = new Map<StepId, DiyCloudProgressEvent>()
    for (const event of generationEvents) map.set(event.step, event)
    return map
  }, [generationEvents])
  const stepOutputsByStep = useMemo(() => {
    const map = new Map<StepId, DiyCloudAgentStepOutput>()
    for (const output of draft?.agentOutputs ?? []) map.set(output.step, output)
    for (const event of generationEvents) {
      if (event.output) map.set(event.step, event.output)
    }
    return map
  }, [draft, generationEvents])
  const latestProgress = generationEvents[generationEvents.length - 1] ?? null
  const generationPercent = progressValue(completedSteps.size, STEP_ORDER.length, generating)
  const reasoningByStep = useMemo(() => {
    const map = new Map<StepId, DiyCloudDraft['agentReport']['reasoning'][number]>()
    for (const item of draft?.agentReport.reasoning ?? []) map.set(item.step, item)
    return map
  }, [draft])

  const renderLiveStepState = (id: StepId) => {
    const event = progressByStep.get(id)
    if (!event) return null
    return (
      <div className="mt-4 rounded-[18px] border border-white/10 bg-black/5 p-4">
        <div className="text-xs font-black uppercase tracking-[0.16em] text-primary">
          {t('diyCloud.realProgress')}
        </div>
        <p className="mt-2 text-base font-black leading-relaxed text-text-primary">{event.title}</p>
        <p className="mt-2 text-sm font-bold leading-relaxed text-text-muted">{event.detail}</p>
      </div>
    )
  }

  const renderReasoningEvidence = (items: string[]) => {
    if (items.length === 0) return null
    return (
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {items.slice(0, 8).map((item, index) => (
          <div
            key={`${item}-${index}`}
            className="rounded-[18px] border border-white/10 bg-black/10 px-4 py-3 text-xs font-bold leading-relaxed text-text-secondary"
          >
            {item}
          </div>
        ))}
      </div>
    )
  }

  const renderStepJsonOutput = (id: StepId) => {
    const output = stepOutputsByStep.get(id)
    if (!output) return null

    return (
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="rounded-[18px] border border-white/10 bg-black/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-primary">
              {t('diyCloud.agentJsonOutput')}
            </div>
            <Badge variant={output.status === 'completed' ? 'success' : 'primary'}>
              {output.confidence !== undefined
                ? `${Math.round(output.confidence * 100)}%`
                : output.status}
            </Badge>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[18px] border border-white/10 bg-black/10 px-4 py-3">
              <div className="text-[11px] font-black uppercase tracking-[0.14em] text-text-muted">
                {t('diyCloud.agentLocale')}
              </div>
              <div className="mt-1 text-sm font-black text-text-primary">{output.locale}</div>
            </div>
            <div className="rounded-[18px] border border-white/10 bg-black/10 px-4 py-3">
              <div className="text-[11px] font-black uppercase tracking-[0.14em] text-text-muted">
                {t('diyCloud.agentTimezone')}
              </div>
              <div className="mt-1 text-sm font-black text-text-primary">{output.timezone}</div>
            </div>
          </div>
          <div className="mt-4">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-text-muted">
              {t('diyCloud.agentResult')}
            </div>
            <pre className="mt-3 max-h-[360px] overflow-auto rounded-[18px] border border-white/10 bg-black/25 p-4 text-xs font-bold leading-relaxed text-text-secondary">
              {formatJson(output.result)}
            </pre>
          </div>
          <div className="mt-4">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-text-muted">
              {t('diyCloud.agentReasons')}
            </div>
            <div className="mt-3 space-y-2">
              {output.reasons.map((reason, index) => (
                <div
                  key={`${output.step}-${reason}-${index}`}
                  className="rounded-[16px] border border-white/10 bg-white/[0.04] px-4 py-3 text-xs font-bold leading-relaxed text-text-secondary"
                >
                  {reason}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="rounded-[18px] border border-white/10 bg-black/5 p-4">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-primary">
            {t('diyCloud.agentRawOutput')}
          </div>
          <pre className="mt-4 max-h-[620px] overflow-auto rounded-[18px] border border-white/10 bg-black/25 p-4 text-xs font-bold leading-relaxed text-text-secondary">
            {formatJson(output.raw)}
          </pre>
        </div>
      </div>
    )
  }

  const renderStepPanel = ({
    id,
    index,
    children,
  }: {
    id: StepId
    index: number
    children?: ReactNode
  }) => {
    const hasStepData =
      completedSteps.has(id) ||
      progressByStep.has(id) ||
      stepOutputsByStep.has(id) ||
      reasoningByStep.has(id)
    const hasRunningContext = generating || Boolean(draft)
    const shouldRenderStep = hasStepData || (hasRunningContext && activeStep === id)

    if (!shouldRenderStep) return null

    const reasoning = reasoningByStep.get(id)
    return (
      <section
        id={`diy-step-${id}`}
        ref={(node) => {
          sectionRefs.current[id] = node
        }}
        className="scroll-mt-5 border-b border-white/10 pb-8 pt-2 last:border-b-0"
      >
        <StepHeading
          index={index}
          title={reasoning?.title ?? stepLabels[id].title}
          detail={progressByStep.get(id)?.detail ?? reasoning?.detail ?? stepLabels[id].detail}
        />
        {children ?? renderLiveStepState(id)}
        {debugMode && renderStepJsonOutput(id)}
      </section>
    )
  }

  return (
    <main className="flex h-full min-h-0 gap-4 overflow-hidden">
      <GlassPanel as="aside" className="hidden w-[300px] shrink-0 flex-col overflow-hidden md:flex">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <DiyStepDirectory
            activeStep={activeStep}
            completedSteps={completedSteps}
            embedded
            generating={generating}
            progressByStep={progressByStep}
            selectedStep={selectedStep}
            stepLabels={stepLabels}
            onSelectStep={scrollToStep}
          />
        </div>
      </GlassPanel>

      <GlassPanel className="flex min-w-0 flex-1 flex-col overflow-hidden p-0">
        <GlassHeader className="gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="m-0 truncate text-[15px] font-black uppercase tracking-tight text-text-primary">
              {t('diyCloud.title')}
            </h1>
          </div>
          <Badge
            variant={draft?.validation.valid ? 'success' : 'primary'}
            className="hidden sm:flex"
          >
            {draft ? t('diyCloud.score', { score: draft.score }) : t('diyCloud.eyebrow')}
          </Badge>
        </GlassHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto grid max-w-6xl gap-5">
            <div className="rounded-[28px] border border-white/10 bg-black/15 p-5 md:p-6">
              <form
                className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]"
                onSubmit={(event) => {
                  event.preventDefault()
                  void runGeneration(prompt)
                }}
              >
                <label className="min-w-0">
                  <span className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-text-muted">
                    <WandSparkles size={14} className="text-primary" />
                    {t('diyCloud.promptLabel')}
                  </span>
                  <Textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.currentTarget.value)}
                    placeholder={t('diyCloud.promptPlaceholder')}
                    readOnly={Boolean(draft) || generating || deployBusy}
                    className="min-h-[168px] resize-none rounded-[26px] border-white/10 bg-black/15 text-base font-bold leading-relaxed md:text-xl"
                    aria-label={t('diyCloud.promptLabel')}
                  />
                </label>
                <div className="flex min-w-0 flex-col justify-between gap-5 rounded-[26px] border border-white/10 bg-white/[0.035] p-5">
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge variant="primary" className="w-fit">
                        <Sparkles size={13} />
                        {t('diyCloud.eyebrow')}
                      </Badge>
                    </div>
                    <div className="mt-5">
                      <div className="flex items-center justify-between gap-3 text-xs font-black uppercase tracking-[0.16em] text-text-muted">
                        <span>{t('diyCloud.progressTitle')}</span>
                        <span>{generationPercent}%</span>
                      </div>
                      <Progress value={generationPercent} className="mt-3" />
                      <p className="mt-4 text-sm font-black leading-relaxed text-text-primary">
                        {latestProgress?.title ?? t('diyCloud.progressIdle')}
                      </p>
                      {latestProgress?.detail && (
                        <p className="mt-2 text-xs font-bold leading-relaxed text-text-muted">
                          {latestProgress.detail}
                        </p>
                      )}
                    </div>
                  </div>
                  {!draft && (
                    <Button
                      type="submit"
                      size="md"
                      loading={generating}
                      icon={Sparkles}
                      className="w-full"
                      disabled={!prompt.trim() || generating || deployBusy}
                    >
                      {t('diyCloud.generate')}
                    </Button>
                  )}
                </div>
              </form>
            </div>

            {generationError && (
              <Alert variant="destructive">
                <XCircle size={18} />
                <AlertDescription>{generationError}</AlertDescription>
              </Alert>
            )}

            {draft && (
              <div className="overflow-hidden rounded-[28px] border border-white/10 bg-black/15">
                <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="p-6">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={scoreVariant(draft.score)}>
                        <ShieldCheck size={13} />
                        {t('diyCloud.score', { score: draft.score })}
                      </Badge>
                      <Badge variant={draft.validation.valid ? 'success' : 'warning'}>
                        {draft.validation.valid
                          ? t('diyCloud.validationPassed')
                          : t('diyCloud.validationNeedsReview')}
                      </Badge>
                      <Badge variant={requiredKeysReady ? 'success' : 'neutral'}>
                        {t('diyCloud.keyProgress', {
                          done: preparedKeyCount,
                          total: draft.requiredKeys.length,
                        })}
                      </Badge>
                    </div>
                    <h2 className="mt-5 mb-0 text-2xl font-black leading-tight text-text-primary md:text-3xl">
                      {draft.title}
                    </h2>
                    <p className="mt-3 max-w-3xl text-sm font-bold leading-relaxed text-text-muted md:text-base">
                      {draft.description}
                    </p>
                  </div>
                  <div className="border-t border-white/10 bg-white/[0.03] p-6 xl:border-t-0 xl:border-l">
                    <div className="text-xs font-black uppercase tracking-[0.18em] text-text-muted">
                      {t('diyCloud.stage.spaceShapeTitle')}
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <div className="rounded-[18px] border border-white/10 bg-black/8 p-3 text-center">
                        <Server size={16} className="mx-auto text-primary" />
                        <div className="mt-2 text-lg font-black text-text-primary">
                          {draftChannels.length}
                        </div>
                      </div>
                      <div className="rounded-[18px] border border-white/10 bg-black/8 p-3 text-center">
                        <Bot size={16} className="mx-auto text-primary" />
                        <div className="mt-2 text-lg font-black text-text-primary">
                          {draftBuddies.length}
                        </div>
                      </div>
                      <div className="rounded-[18px] border border-white/10 bg-black/8 p-3 text-center">
                        <Layers3 size={16} className="mx-auto text-primary" />
                        <div className="mt-2 text-lg font-black text-text-primary">
                          {draftPlugins.length}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {renderStepPanel({
              id: 'think',
              index: 1,
              children: draft ? (
                <>
                  <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="rounded-3xl bg-white/[0.04] p-5">
                      <div className="flex items-center gap-2 text-sm font-black text-text-primary">
                        <Compass size={17} className="text-primary" />
                        {t('diyCloud.stage.goalTitle')}
                      </div>
                      <p className="mt-3 text-lg font-black leading-relaxed text-text-primary">
                        {draft.description}
                      </p>
                      <div className="mt-5 flex flex-wrap gap-2">
                        {draft.suggestedSkills.slice(0, 5).map((skill, index) => (
                          <Badge key={`${skill}-${index}`} variant="neutral">
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-3xl bg-white/[0.04] p-5">
                      <div className="text-sm font-black text-text-primary">
                        {t('diyCloud.stage.spaceShapeTitle')}
                      </div>
                      <div className="mt-4 space-y-2">
                        {[...draftChannels, ...draftBuddies].slice(0, 6).map((item, index) => (
                          <div
                            key={`${item}-${index}`}
                            className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm font-bold text-text-secondary"
                          >
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 rounded-[24px] border border-white/10 bg-black/10 p-5">
                    <div className="text-sm font-black text-text-primary">
                      {t('diyCloud.assumptionsTitle')}
                    </div>
                    {renderReasoningEvidence(draft.agentReport.assumptions)}
                  </div>
                </>
              ) : undefined,
            })}

            {renderStepPanel({
              id: 'search',
              index: 2,
              children: draft ? (
                <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                  <div className="space-y-3">
                    {draft.agentReport.pluginDecisions.slice(0, 6).map((plugin) => (
                      <div
                        key={plugin.id}
                        className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <strong className="text-sm text-text-primary">{plugin.name}</strong>
                          <Badge variant="neutral">{plugin.id}</Badge>
                        </div>
                        <p className="mt-2 text-xs font-bold leading-relaxed text-text-muted">
                          {plugin.reason}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {plugin.capabilities.slice(0, 4).map((capability) => (
                            <Badge key={`${plugin.id}-${capability}`} variant="neutral">
                              {capability}
                            </Badge>
                          ))}
                          {plugin.requiredKeys.map((key) => (
                            <Badge key={`${plugin.id}-${key}`} variant="warning">
                              {key}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="min-w-0 rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                    <div className="flex items-center gap-2 text-sm font-black text-text-primary">
                      <BookOpenCheck size={17} className="text-primary" />
                      <span>{t('diyCloud.referenceTemplatesTitle')}</span>
                    </div>
                    <div className="mt-4 space-y-3">
                      {draft.agentReport.templateDecisions.slice(0, 4).map((template) => (
                        <div key={template.slug} className="rounded-[18px] bg-black/10 p-3">
                          <strong className="text-sm text-text-primary">{template.title}</strong>
                          <p className="mt-1 text-xs font-bold leading-relaxed text-text-muted">
                            {template.reason}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : undefined,
            })}

            {renderStepPanel({
              id: 'generate',
              index: 3,
              children: draft ? (
                <>
                  <div className="mt-5 grid gap-4 md:grid-cols-3">
                    {outlineCards.map(({ title, items, Icon }) => (
                      <div key={title} className="rounded-3xl bg-white/[0.04] p-5">
                        <div className="flex items-center gap-2 text-sm font-black text-text-primary">
                          <Icon size={17} className="text-primary" />
                          {title}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {items.slice(0, 8).map((item, index) => (
                            <Badge key={`${title}-${item}-${index}`} variant="neutral">
                              {item}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 rounded-3xl bg-black/10 p-5">
                    <div className="flex items-center gap-2 text-sm font-black text-text-primary">
                      <FileCode2 size={17} className="text-primary" />
                      {t('diyCloud.stage.runtimeTitle')}
                    </div>
                    <p className="mt-3 text-sm font-bold leading-relaxed text-text-muted">
                      {t('diyCloud.stage.runtimeBody')}
                    </p>
                  </div>
                </>
              ) : undefined,
            })}

            {renderStepPanel({
              id: 'validate',
              index: 4,
              children: draft ? (
                <>
                  <div className="mt-5 grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
                    <div className="rounded-3xl bg-white/[0.04] p-5">
                      <Badge variant={scoreVariant(draft.score)}>
                        <ShieldCheck size={13} />
                        {t('diyCloud.score', { score: draft.score })}
                      </Badge>
                      <p className="mt-4 text-sm font-bold leading-relaxed text-text-muted">
                        {draft.validation.valid
                          ? t('diyCloud.validationPassed')
                          : t('diyCloud.validationNeedsReview')}
                      </p>
                      <p className="mt-3 text-xs font-black uppercase tracking-[0.16em] text-text-muted">
                        {t('diyCloud.keyProgress', {
                          done: preparedKeyCount,
                          total: draft.requiredKeys.length,
                        })}
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {[
                        [t('diyCloud.validationAgents'), draft.validation.agents],
                        [t('diyCloud.validationConfigurations'), draft.validation.configurations],
                        [t('diyCloud.validationSecrets'), draft.validation.templateRefs.secret],
                        [
                          t('diyCloud.validationIssues'),
                          draft.validation.violations.length +
                            draft.validation.extendsErrors.length,
                        ],
                      ].map(([label, value]) => (
                        <div key={String(label)} className="rounded-2xl bg-white/[0.04] p-4">
                          <div className="text-xs font-black uppercase tracking-[0.16em] text-text-muted">
                            {label}
                          </div>
                          <div className="mt-2 text-2xl font-black text-text-primary">{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {draft.agentReport.validationChecks.map((check) => (
                      <div
                        key={check.name}
                        className="rounded-[20px] border border-white/10 bg-black/10 p-4"
                      >
                        <Badge variant={check.status === 'passed' ? 'success' : 'warning'}>
                          {check.name}
                        </Badge>
                        <p className="mt-3 text-xs font-bold leading-relaxed text-text-muted">
                          {check.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              ) : undefined,
            })}

            {renderStepPanel({
              id: 'review',
              index: 5,
              children: draft ? (
                <div className="mt-5 grid gap-4">
                  <div className="rounded-3xl bg-white/[0.04] p-5">
                    <div className="mb-4 flex items-center gap-2">
                      <ClipboardCheck size={18} className="text-primary" />
                      <h3 className="m-0 text-lg font-black text-text-primary">
                        {t('diyCloud.guidebookTitle')}
                      </h3>
                    </div>
                    <p className="text-base font-bold leading-relaxed text-text-secondary">
                      {draft.guidebook.summary}
                    </p>
                    <div className="mt-5 grid gap-3 md:grid-cols-2">
                      {draft.guidebook.howToUse.slice(0, 4).map((item, index) => (
                        <div
                          key={`${item}-${index}`}
                          className="rounded-2xl bg-black/10 p-4 text-sm font-bold leading-relaxed text-text-muted"
                        >
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {[...draft.guidebook.beforeDeploy, ...draft.guidebook.reviewNotes]
                      .slice(0, 6)
                      .map((item, index) => (
                        <div
                          key={`${item}-${index}`}
                          className="rounded-[20px] border border-white/10 bg-white/[0.04] p-4 text-sm font-bold leading-relaxed text-text-muted"
                        >
                          {item}
                        </div>
                      ))}
                  </div>
                </div>
              ) : undefined,
            })}
          </div>
        </div>
        {draft && (
          <div className="shrink-0 border-t border-white/10 bg-bg-deep/35 p-4 backdrop-blur-xl">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={scoreVariant(draft.score)}>
                    <ShieldCheck size={13} />
                    {t('diyCloud.score', { score: draft.score })}
                  </Badge>
                  <Badge variant={requiredKeysReady ? 'success' : 'neutral'}>
                    {t('diyCloud.keyProgress', {
                      done: preparedKeyCount,
                      total: draft.requiredKeys.length,
                    })}
                  </Badge>
                  {deployPhaseText && <Badge variant="primary">{deployPhaseText}</Badge>}
                </div>
                <p className="mt-2 text-xs font-bold leading-relaxed text-text-muted">
                  {requiredKeysReady
                    ? t('diyCloud.deployReady')
                    : t('diyCloud.keysRequiredBeforeDeploy')}
                </p>
              </div>
              <div className="grid shrink-0 gap-3 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="glass"
                  icon={RefreshCcw}
                  disabled={generating || deployBusy}
                  onClick={() => setFeedbackOpen(true)}
                >
                  {t('diyCloud.adjust')}
                </Button>
                <Button
                  type="button"
                  icon={Rocket}
                  iconRight={ArrowRight}
                  disabled={!draft.validation.valid || generating || deployBusy}
                  onClick={() => {
                    setDeployGuideIndex(0)
                    setDeployGuideOpen(true)
                  }}
                >
                  {t('diyCloud.deploy')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </GlassPanel>

      <DiyFeedbackModal
        deployBusy={deployBusy}
        feedback={feedback}
        generating={generating}
        open={feedbackOpen}
        setFeedback={setFeedback}
        onApply={() => void runGeneration(prompt, feedback)}
        onClose={() => setFeedbackOpen(false)}
      />

      <DiyDeployWizardModal
        deployBusy={deployBusy}
        deployError={deployError}
        deployGuideIndex={deployGuideIndex}
        deployGuideOpen={deployGuideOpen}
        deployPhase={deployPhase}
        deployPhaseText={deployPhaseText}
        draft={draft}
        gate={gate}
        generating={generating}
        keyValues={keyValues}
        preparedKeyCount={preparedKeyCount}
        requiredKeysReady={requiredKeysReady}
        saveTemplate={saveTemplate}
        setDeployGuideIndex={setDeployGuideIndex}
        setKeyValues={setKeyValues}
        setSaveTemplate={setSaveTemplate}
        setSkippedKeys={setSkippedKeys}
        skippedKeys={skippedKeys}
        onClose={() => (deployBusy ? undefined : setDeployGuideOpen(false))}
        onDeploy={() => void deployDraft()}
      />
    </main>
  )
}
