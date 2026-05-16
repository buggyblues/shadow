import { createHash } from 'node:crypto'
import {
  applyRuntimeEnvRefPolicy,
  collectRuntimeEnvRefPolicy,
  collectRuntimeEnvRequirements,
  prepareCloudSaasConfigSnapshot,
  validateCloudSaasConfigSnapshot,
} from '@shadowob/cloud'
import {
  DEFAULT_HOMEPLAY_CATALOG,
  getDefaultHomePlay,
  type ShadowHomePlayCatalogItem,
  type ShadowPlayAction,
} from '@shadowob/shared/play-catalog'
import { and, desc, eq, sql } from 'drizzle-orm'
import type { Server as SocketIOServer } from 'socket.io'
import type { AgentDao } from '../dao/agent.dao'
import type { CloudActivityDao } from '../dao/cloud-activity.dao'
import type { CloudClusterDao } from '../dao/cloud-cluster.dao'
import type { CloudDeploymentDao } from '../dao/cloud-deployment.dao'
import type { CloudTemplateDao } from '../dao/cloud-template.dao'
import type { UserDao } from '../dao/user.dao'
import type { Database } from '../db'
import { cloudTemplates, configSchemas, configValues } from '../db/schema'
import {
  attachPlayLaunchRuntimeMetadata,
  extractPlayLaunchRuntimeMetadata,
  extractShadowProvisionBuddyUserIds,
  extractShadowProvisionTarget,
} from '../lib/cloud-shadow-target'
import {
  assertOfficialModelProxyAvailable,
  officialModelProxyEnvVars,
  shouldCopyServerRuntimeEnvKey,
} from '../lib/model-proxy-config'
import type { AgentPolicyService } from './agent-policy.service'
import type { ChannelService } from './channel.service'
import type { MembershipService } from './membership.service'
import type { MessageService } from './message.service'
import type { ServerService } from './server.service'
import type { WalletService } from './wallet.service'

type PlayActionBase = {
  buddyUserIds?: string[]
  buddyTemplateSlug?: string
  greeting?: string
}

export type PlayAction = ShadowPlayAction
type CloudDeployPlayAction = Extract<PlayAction, { kind: 'cloud_deploy' }> & {
  defaultChannelName?: string
}

export interface PlayLaunchInput {
  playId?: string
  launchSessionId?: string
  inviteCode?: string
  locale?: string
}

type PlayConfig = Partial<ShadowHomePlayCatalogItem> & {
  id?: string
  slug?: string
}

export type PlayLaunchResult = {
  ok: true
  playId: string | null
  status: 'launched' | 'deploying'
  redirectUrl?: string
  serverId?: string
  channelId?: string
  deploymentId?: string
  deploymentStatus?: string
  templateSlug?: string
}

type LaunchRequestContext = {
  authHeader?: string
  origin?: string
}

const CLOUD_DEPLOYMENT_HOURLY_COST = 1
const CLOUD_DEPLOYMENT_BILLING_PRECISION_MINUTES = 15
const PLAY_BUDDY_ONLINE_MS = 90_000

type LaunchUserProfile = {
  friendlyName: string
  channelNameSegment: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getConfiguredPlays(data: unknown): PlayConfig[] {
  if (Array.isArray(data)) return data.filter(isRecord) as PlayConfig[]
  if (isRecord(data) && Array.isArray(data.plays))
    return data.plays.filter(isRecord) as PlayConfig[]
  return []
}

function mergeConfiguredPlay(
  configured: PlayConfig | null,
  fallback: ShadowHomePlayCatalogItem | null,
): ShadowHomePlayCatalogItem | null {
  if (!configured && !fallback) return null
  if (!configured) return fallback ? normalizePlay(fallback) : null
  const id = configured.id ?? configured.slug ?? fallback?.id
  if (!id) return fallback
  const merged = {
    ...(fallback ?? {}),
    ...configured,
    id,
    image: configured.image ?? fallback?.image ?? '',
    title: configured.title ?? fallback?.title ?? id,
    titleEn: configured.titleEn ?? fallback?.titleEn ?? configured.title ?? id,
    desc: configured.desc ?? fallback?.desc ?? '',
    descEn: configured.descEn ?? fallback?.descEn ?? configured.desc ?? '',
    category: configured.category ?? fallback?.category ?? '玩法',
    categoryEn: configured.categoryEn ?? fallback?.categoryEn ?? 'Plays',
    starts: configured.starts ?? fallback?.starts ?? '0',
    accentColor: configured.accentColor ?? fallback?.accentColor ?? 'var(--shadow-accent)',
    status:
      configured.status ?? fallback?.status ?? (configured.action ? 'available' : 'misconfigured'),
    action: configured.action ?? fallback?.action,
    gates: configured.gates ?? fallback?.gates,
    template: configured.template ?? fallback?.template,
    materials: configured.materials ?? fallback?.materials,
  }
  return {
    ...merged,
    status: resolveConfiguredPlayStatus(merged),
  }
}

function hasTargetServer(action: PlayAction) {
  if (action.kind === 'public_channel') {
    return Boolean(action.serverId || action.serverSlug || action.inviteCode)
  }
  if (action.kind === 'private_room') {
    return Boolean(action.serverId || action.serverSlug)
  }
  return true
}

function resolveConfiguredPlayStatus(
  play: ShadowHomePlayCatalogItem,
): ShadowHomePlayCatalogItem['status'] {
  const action = play.action
  if (!action) return 'misconfigured'
  if (play.status === 'coming_soon') return play.status
  if (play.status === 'misconfigured') return play.status
  if (!hasTargetServer(action)) return 'misconfigured'
  if (
    action.kind === 'private_room' &&
    (!Array.isArray(action.buddyUserIds) || action.buddyUserIds.length === 0)
  ) {
    return 'misconfigured'
  }
  return play.status
}

function playError(message: string, status: number, code: string, extra?: Record<string, unknown>) {
  return Object.assign(new Error(message), { status, code, ...extra })
}

function compactSlug(input: string) {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32) || 'play'
  )
}

function compactChannelSegment(input: string) {
  return (
    input
      .trim()
      .normalize('NFKC')
      .replace(/[\s_]+/g, '-')
      .replace(/[^\p{L}\p{N}-]+/gu, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32) || ''
  )
}

function compactChannelName(parts: string[]) {
  return (
    parts
      .map((part) => compactChannelSegment(part) || compactSlug(part))
      .filter(Boolean)
      .join('-')
      .slice(0, 100)
      .replace(/-+$/g, '') || 'play'
  )
}

function personalizeGreeting(greeting: string, userName: string | undefined, locale?: string) {
  const trimmed = greeting.trim()
  if (!userName) return trimmed
  if (
    trimmed.includes('{userName}') ||
    trimmed.includes('{nickname}') ||
    trimmed.includes('{user}')
  ) {
    return trimmed
      .replaceAll('{userName}', userName)
      .replaceAll('{nickname}', userName)
      .replaceAll('{user}', userName)
  }
  if (trimmed.includes(userName)) return trimmed
  if (locale?.startsWith('zh')) return `${userName}，${trimmed}`
  return `Hi ${userName}, ${trimmed.replace(/^Hi,\s*/i, '')}`
}

function compactKubernetesName(input: string, maxLength = 63) {
  const normalized =
    input
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'play'
  return normalized.slice(0, maxLength).replace(/-$/g, '') || 'play'
}

function cloudPlayNamespace(templateSlug: string, userId: string) {
  const userHash = createHash('sha256').update(userId).digest('hex').slice(0, 8)
  const base = compactKubernetesName(`play-${templateSlug}`, 63 - userHash.length - 1)
  return `${base}-${userHash}`
}

function nonEmptyProcessEnv(key: string): string | undefined {
  const value = process.env[key]
  return value && value.trim() !== '' ? value : undefined
}

function isDeployableTemplateContent(content: unknown): content is Record<string, unknown> {
  try {
    validateCloudSaasConfigSnapshot(content)
    return true
  } catch {
    return false
  }
}

function templateAgentCount(content: Record<string, unknown>) {
  const deployments = content.deployments
  if (!deployments || typeof deployments !== 'object' || Array.isArray(deployments)) return 0
  const agents = (deployments as Record<string, unknown>).agents
  return Array.isArray(agents) ? agents.length : 0
}

function resolveTemplateText(
  template: { slug: string; name: string; description?: string | null; content: unknown },
  locale?: string,
) {
  const content =
    template.content && typeof template.content === 'object' && !Array.isArray(template.content)
      ? (template.content as Record<string, unknown>)
      : {}
  const i18n = content.i18n
  const dict =
    i18n && typeof i18n === 'object' && !Array.isArray(i18n)
      ? ((i18n as Record<string, Record<string, string> | undefined>)[locale ?? ''] ??
        (locale?.includes('-')
          ? (i18n as Record<string, Record<string, string> | undefined>)[locale.split('-')[0]!]
          : undefined) ??
        (i18n as Record<string, Record<string, string> | undefined>).en ??
        (i18n as Record<string, Record<string, string> | undefined>)['zh-CN'])
      : undefined
  return {
    name: dict?.title ?? dict?.name ?? template.name.replace(/^\$\{i18n:[^}]+\}$/, template.slug),
    description: dict?.description ?? template.description ?? undefined,
  }
}

function templatePlayLaunchGreeting(content: unknown): string | undefined {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return undefined
  const use = (content as Record<string, unknown>).use
  if (!Array.isArray(use)) return undefined
  for (const entry of use) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const record = entry as Record<string, unknown>
    if (record.plugin !== 'shadowob') continue
    const options = record.options
    if (!options || typeof options !== 'object' || Array.isArray(options)) continue
    const playLaunch = (options as Record<string, unknown>).playLaunch
    if (!playLaunch || typeof playLaunch !== 'object' || Array.isArray(playLaunch)) continue
    const greeting = (playLaunch as Record<string, unknown>).greeting
    if (typeof greeting === 'string' && greeting.trim()) return greeting
  }
  return undefined
}

function localizedPlayTitle(play: ShadowHomePlayCatalogItem, locale?: string) {
  const fallback = play.title || play.titleEn || play.id || 'Buddy'
  return locale?.startsWith('zh') ? play.title || fallback : play.titleEn || fallback
}

function defaultLaunchGreeting(input: {
  title: string
  locale?: string
  kind: 'community' | 'private' | 'cloud'
  userName?: string
}) {
  let greeting: string
  if (input.locale?.startsWith('zh')) {
    if (input.kind === 'cloud') {
      greeting = `你好，我是 ${input.title}。空间已经准备好了，直接告诉我你的目标，我们马上开始。`
      return personalizeGreeting(greeting, input.userName, input.locale)
    }
    if (input.kind === 'private') {
      greeting = `你好，我是 ${input.title}。这个房间已经为你准备好，可以把你的想法直接发给我。`
      return personalizeGreeting(greeting, input.userName, input.locale)
    }
    greeting = `你好，我是 ${input.title}。欢迎来到这里，直接发消息开始体验吧。`
    return personalizeGreeting(greeting, input.userName, input.locale)
  }
  if (input.kind === 'cloud') {
    greeting = `I am ${input.title}. Your space is ready. Tell me your goal and we will begin.`
    return personalizeGreeting(greeting, input.userName, input.locale)
  }
  if (input.kind === 'private') {
    greeting = `I am ${input.title}. This room is ready for you. Send me what you want to explore.`
    return personalizeGreeting(greeting, input.userName, input.locale)
  }
  greeting = `I am ${input.title}. Welcome in. Send a message whenever you are ready.`
  return personalizeGreeting(greeting, input.userName, input.locale)
}

function playLaunchMetadataMatches(metadata: unknown, key: string, value: string) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false
  const playLaunch = (metadata as Record<string, unknown>).playLaunch
  return (
    playLaunch &&
    typeof playLaunch === 'object' &&
    !Array.isArray(playLaunch) &&
    (playLaunch as Record<string, unknown>)[key] === value
  )
}

function isAgentOnline(agent: { status: string; lastHeartbeat?: Date | string | null }) {
  if (agent.status !== 'running' || !agent.lastHeartbeat) return false
  return Date.now() - new Date(agent.lastHeartbeat).getTime() <= PLAY_BUDDY_ONLINE_MS
}

function canUseCloudTemplate(
  template: {
    reviewStatus: string
    authorId?: string | null
    submittedByUserId?: string | null
  },
  userId: string,
) {
  return (
    template.reviewStatus === 'approved' ||
    template.authorId === userId ||
    template.submittedByUserId === userId
  )
}

export class PlayLaunchService {
  private readonly launchResults = new Map<
    string,
    { result: PlayLaunchResult; timeout: ReturnType<typeof setTimeout> }
  >()
  private readonly launchInFlight = new Map<string, Promise<PlayLaunchResult>>()

  constructor(
    private deps: {
      db: Database
      io: SocketIOServer
      userDao: UserDao
      serverService: ServerService
      channelService: ChannelService
      agentDao: AgentDao
      agentPolicyService: AgentPolicyService
      messageService: MessageService
      membershipService: MembershipService
      cloudTemplateDao: CloudTemplateDao
      cloudDeploymentDao: CloudDeploymentDao
      cloudClusterDao: CloudClusterDao
      cloudActivityDao: CloudActivityDao
      walletService: WalletService
    },
  ) {}

  async launch(
    userId: string,
    input: PlayLaunchInput,
    context: LaunchRequestContext = {},
  ): Promise<PlayLaunchResult> {
    const cacheKey = input.launchSessionId
      ? `${userId}:${input.launchSessionId.trim().slice(0, 128)}`
      : null
    if (!cacheKey) return this.executeLaunch(userId, input, context)

    const cached = this.launchResults.get(cacheKey)
    if (cached) return cached.result

    const inFlight = this.launchInFlight.get(cacheKey)
    if (inFlight) return inFlight

    const launchPromise = this.executeLaunch(userId, input, context)
      .then((result) => {
        const existing = this.launchResults.get(cacheKey)
        if (existing) clearTimeout(existing.timeout)
        const timeout = setTimeout(() => {
          this.launchResults.delete(cacheKey)
        }, 5 * 60_000)
        this.launchResults.set(cacheKey, { result, timeout })
        return result
      })
      .finally(() => {
        this.launchInFlight.delete(cacheKey)
      })

    this.launchInFlight.set(cacheKey, launchPromise)
    return launchPromise
  }

  private async executeLaunch(
    userId: string,
    input: PlayLaunchInput,
    context: LaunchRequestContext,
  ): Promise<PlayLaunchResult> {
    const play = input.playId ? await this.findPublishedPlay(input.playId) : null
    if (!play) {
      throw playError('Play is not configured', 404, 'PLAY_NOT_CONFIGURED', {
        playId: input.playId,
      })
    }
    if (play.status === 'coming_soon') {
      throw playError('Play is coming soon', 409, 'PLAY_COMING_SOON', { playId: input.playId })
    }
    if (play.status === 'misconfigured') {
      throw playError('Play is misconfigured', 422, 'PLAY_MISCONFIGURED', { playId: input.playId })
    }

    const action = play.action
    if (!action) {
      throw playError('Play action is missing', 422, 'PLAY_NOT_CONFIGURED', {
        playId: input.playId,
      })
    }

    switch (action.kind) {
      case 'public_channel':
        return this.launchPublicChannel(userId, input, play, action)
      case 'private_room':
        return this.launchPrivateRoom(userId, input, play, action)
      case 'cloud_deploy':
        return this.launchCloudDeploy(userId, input, play, action, context)
      case 'external_oauth_app':
        return this.launchExternalOAuth(input.playId, action)
      case 'landing_page':
        return {
          ok: true as const,
          playId: input.playId ?? null,
          status: 'launched' as const,
          redirectUrl: action.url,
        }
      default:
        throw Object.assign(new Error('Unsupported play action'), { status: 400 })
    }
  }

  async listCatalog(): Promise<ShadowHomePlayCatalogItem[]> {
    const configured = await this.findPublishedPlayConfigs()
    const byId = new Map(DEFAULT_HOMEPLAY_CATALOG.map((play) => [play.id, normalizePlay(play)]))
    for (const play of configured) {
      const id = play.id ?? play.slug
      if (!id) continue
      const merged = mergeConfiguredPlay(play, byId.get(id) ?? null)
      if (merged) byId.set(merged.id, merged)
    }
    return [...byId.values()]
  }

  private async findPublishedPlayConfigs(): Promise<PlayConfig[]> {
    for (const schemaName of ['homepage-plays-v2', 'homepage-plays']) {
      const [schemaRow] = await this.deps.db
        .select()
        .from(configSchemas)
        .where(eq(configSchemas.name, schemaName))
        .limit(1)
      if (!schemaRow) continue

      const [publishedRow] = await this.deps.db
        .select()
        .from(configValues)
        .where(
          and(
            eq(configValues.schemaId, schemaRow.id),
            eq(configValues.environment, 'prod'),
            eq(configValues.isPublished, true),
          ),
        )
        .orderBy(desc(configValues.version))
        .limit(1)
      if (!publishedRow) continue

      return getConfiguredPlays(publishedRow.data)
    }
    return []
  }

  private async findPublishedPlay(playId: string): Promise<ShadowHomePlayCatalogItem | null> {
    const fallback = getDefaultHomePlay(playId)
    const configured = (await this.findPublishedPlayConfigs()).find(
      (candidate) => candidate.id === playId || candidate.slug === playId,
    )
    return mergeConfiguredPlay(configured ?? null, fallback)
  }

  private async launchPublicChannel(
    userId: string,
    input: PlayLaunchInput,
    play: ShadowHomePlayCatalogItem,
    action: Extract<PlayAction, { kind: 'public_channel' }>,
  ) {
    const server = action.inviteCode
      ? await this.joinByInviteOrReturnExisting(action.inviteCode, userId)
      : action.serverId
        ? await this.deps.serverService.joinPublic(action.serverId, userId)
        : action.serverSlug
          ? await this.joinPublicBySlug(action.serverSlug, userId)
          : null
    if (!server) {
      throw playError('No public server available for this play', 404, 'PLAY_TARGET_UNAVAILABLE', {
        playId: input.playId,
      })
    }

    const channels = await this.deps.channelService.getByServerId(server.id)
    const channel =
      (action.channelId
        ? channels.find((candidate) => candidate.id === action.channelId)
        : action.channelName
          ? channels.find((candidate) => candidate.name === action.channelName)
          : channels.find((candidate) => !candidate.isPrivate)) ?? channels[0]
    if (!channel) {
      throw playError('No channel available for this play', 404, 'PLAY_TARGET_UNAVAILABLE', {
        playId: input.playId,
      })
    }

    const buddies = await this.resolveConfiguredBuddyAgents(action, {
      requireBuddies: false,
      requireRunning: false,
      playId: input.playId,
    })
    await this.deps.channelService.addMember(channel.id, userId)
    if (buddies.length > 0) {
      const launchUser = await this.getLaunchUserProfile(userId)
      await this.addBuddiesAndGreet(server.id, channel.id, buddies, action, {
        greeting:
          action.greeting !== undefined
            ? personalizeGreeting(action.greeting, launchUser.friendlyName, input.locale)
            : defaultLaunchGreeting({
                title: localizedPlayTitle(play, input.locale),
                locale: input.locale,
                kind: 'community',
                userName: launchUser.friendlyName,
              }),
        metadata: {
          playLaunch: {
            kind: 'public_channel',
            playId: input.playId,
            templateSlug: action.buddyTemplateSlug ?? play.template?.slug ?? play.id,
          },
        },
      })
    }

    return {
      ok: true as const,
      playId: input.playId ?? null,
      status: 'launched' as const,
      serverId: server.id,
      channelId: channel.id,
      redirectUrl: this.channelUrl(server, channel.id),
    }
  }

  private async launchPrivateRoom(
    userId: string,
    input: PlayLaunchInput,
    play: ShadowHomePlayCatalogItem,
    action: Extract<PlayAction, { kind: 'private_room' }>,
  ) {
    const targetServerId = action.serverId
      ? action.serverId
      : action.serverSlug
        ? (await this.deps.serverService.getBySlug(action.serverSlug)).id
        : null
    if (!targetServerId) {
      throw playError('Private room play has no target server', 422, 'PLAY_MISCONFIGURED', {
        playId: input.playId,
      })
    }
    const buddies = await this.resolveConfiguredBuddyAgents(action, {
      requireBuddies: true,
      requireRunning: true,
      playId: input.playId,
    })
    const launchUser = await this.getLaunchUserProfile(userId)
    const server = await this.deps.serverService.ensureMember(targetServerId, userId, {
      allowPrivatePlay: true,
    })
    const suffix = Math.random().toString(36).slice(2, 7)
    const channel = await this.deps.channelService.create(
      server.id,
      {
        name: compactChannelName([
          action.namePrefix ?? input.playId ?? 'play',
          launchUser.channelNameSegment,
          suffix,
        ]),
        type: 'text',
        isPrivate: true,
        topic: input.playId ? `Play session: ${input.playId}` : 'Play session',
      },
      userId,
    )
    if (!channel) {
      throw Object.assign(new Error('Failed to create play room'), { status: 500 })
    }

    await this.addBuddiesAndGreet(server.id, channel.id, buddies, action, {
      greeting:
        action.greeting !== undefined
          ? personalizeGreeting(action.greeting, launchUser.friendlyName, input.locale)
          : defaultLaunchGreeting({
              title: localizedPlayTitle(play, input.locale),
              locale: input.locale,
              kind: 'private',
              userName: launchUser.friendlyName,
            }),
      metadata: {
        playLaunch: {
          kind: 'private_room',
          playId: input.playId,
          templateSlug: action.buddyTemplateSlug ?? play.template?.slug ?? play.id,
        },
      },
    })

    return {
      ok: true as const,
      playId: input.playId ?? null,
      status: 'launched' as const,
      serverId: server.id,
      channelId: channel.id,
      redirectUrl: this.channelUrl(server, channel.id),
    }
  }

  private async requireCloudDeployMember(userId: string, inviteCode?: string) {
    try {
      return await this.deps.membershipService.requireMember(userId, 'cloud:deploy')
    } catch (err) {
      const appError = err as { code?: string }
      const normalizedInviteCode = inviteCode?.trim()
      if (appError.code !== 'INVITE_REQUIRED' || !normalizedInviteCode) {
        throw err
      }

      const membership = await this.deps.membershipService.redeemInviteCode(
        userId,
        normalizedInviteCode,
      )
      if (membership.capabilities.includes('cloud:deploy')) {
        return membership
      }
      return this.deps.membershipService.requireMember(userId, 'cloud:deploy')
    }
  }

  private async launchCloudDeploy(
    userId: string,
    input: PlayLaunchInput,
    play: ShadowHomePlayCatalogItem,
    action: CloudDeployPlayAction,
    context: LaunchRequestContext,
  ) {
    await this.requireCloudDeployMember(userId, input.inviteCode)
    const launchUser = await this.getLaunchUserProfile(userId)
    const template = await this.deps.cloudTemplateDao.findBySlug(action.templateSlug)
    if (!template || !canUseCloudTemplate(template, userId)) {
      throw playError('Template not found or not approved', 404, 'PLAY_TARGET_UNAVAILABLE', {
        playId: input.playId,
        templateSlug: action.templateSlug,
      })
    }
    if (!isDeployableTemplateContent(template.content)) {
      throw playError('Template is not deployable', 422, 'PLAY_MISCONFIGURED', {
        playId: input.playId,
        templateSlug: action.templateSlug,
      })
    }

    const cluster = (await this.deps.cloudClusterDao.listByUser(userId)).find(
      (candidate) => candidate.isPlatform,
    )
    const namespace = cloudPlayNamespace(action.templateSlug, userId)
    const clusterId = cluster?.id ?? null
    const existing = await this.deps.cloudDeploymentDao.findLatestCurrentInNamespace({
      userId,
      clusterId,
      namespace,
    })
    if (existing) {
      return this.cloudDeploymentLaunchResult(userId, input.playId, existing)
    }

    const operationScope = { userId, clusterId, namespace }
    const lockAcquired = await this.deps.cloudDeploymentDao.tryAcquireOperationLock(operationScope)
    if (!lockAcquired) {
      throw playError('Deployment namespace is currently busy', 409, 'PLAY_LAUNCH_BUSY', {
        playId: input.playId,
        templateSlug: action.templateSlug,
      })
    }

    const resourceTier = action.resourceTier ?? 'lightweight'
    const hourlyCost = CLOUD_DEPLOYMENT_HOURLY_COST
    const monthlyCost = 0
    await this.enforceCloudDeployStarterBalance(userId, hourlyCost)
    let deploymentId: string | null = null

    try {
      const envVars = await this.resolveOneClickRuntimeEnvVars(
        template.content,
        context.authHeader,
        context.origin,
        {
          userId,
          playId: input.playId,
          templateSlug: action.templateSlug,
          namespace,
        },
      )
      const templateGreeting = templatePlayLaunchGreeting(template.content)
      const configSnapshot = attachPlayLaunchRuntimeMetadata(
        prepareCloudSaasConfigSnapshot(template.content, envVars, {
          locale: input.locale,
        }),
        {
          defaultChannelName: action.defaultChannelName,
          greeting:
            action.greeting !== undefined
              ? personalizeGreeting(action.greeting, launchUser.friendlyName, input.locale)
              : templateGreeting !== undefined
                ? personalizeGreeting(templateGreeting, launchUser.friendlyName, input.locale)
                : defaultLaunchGreeting({
                    title: localizedPlayTitle(play, input.locale),
                    locale: input.locale,
                    kind: 'cloud',
                    userName: launchUser.friendlyName,
                  }),
        },
      )
      const { name } = resolveTemplateText(template, input.locale)

      const deployment = await this.deps.cloudDeploymentDao.create({
        userId,
        clusterId,
        namespace,
        name,
        status: 'pending',
        agentCount: templateAgentCount(template.content),
        configSnapshot,
        templateSlug: action.templateSlug,
        resourceTier,
        monthlyCost,
        hourlyCost,
        saasMode: true,
      })
      if (!deployment) {
        throw Object.assign(new Error('Failed to create deployment'), { status: 500 })
      }
      deploymentId = deployment.id

      await this.deps.cloudDeploymentDao.appendLog(
        deployment.id,
        `[queue] One-click play queued for template "${action.templateSlug}"`,
        'info',
      )
      await this.deps.db
        .update(cloudTemplates)
        .set({ deployCount: sql`${cloudTemplates.deployCount} + 1` })
        .where(eq(cloudTemplates.slug, action.templateSlug))
      await this.deps.cloudActivityDao.log({
        userId,
        type: 'deploy',
        namespace,
        meta: {
          playId: input.playId,
          templateSlug: action.templateSlug,
          resourceTier,
          monthlyCost,
          hourlyCost,
          billingPrecisionMinutes: CLOUD_DEPLOYMENT_BILLING_PRECISION_MINUTES,
          oneClick: true,
        },
      })

      return this.cloudDeploymentLaunchResult(userId, input.playId, deployment)
    } catch (err) {
      if (deploymentId) {
        await this.deps.cloudDeploymentDao
          .updateStatus(
            deploymentId,
            'failed',
            err instanceof Error ? err.message : 'Failed to create deployment',
          )
          .catch(() => null)
        await this.deps.cloudDeploymentDao
          .appendLog(
            deploymentId,
            `[error] ${err instanceof Error ? err.message : String(err)}`,
            'error',
          )
          .catch(() => null)
      }
      throw err
    } finally {
      await this.deps.cloudDeploymentDao.releaseOperationLock(operationScope).catch(() => null)
    }
  }

  private async enforceCloudDeployStarterBalance(userId: string, hourlyCost: number) {
    if (hourlyCost <= 0) return
    const requiredAmount = hourlyCost
    const wallet = await this.deps.walletService.getWallet(userId)
    const balance = wallet?.balance ?? 0
    if (balance >= requiredAmount) return

    throw Object.assign(new Error('Insufficient balance'), {
      status: 402,
      code: 'WALLET_INSUFFICIENT_BALANCE',
      requiredAmount,
      balance,
      shortfall: Math.max(requiredAmount - balance, 0),
      nextAction: 'earn_or_recharge',
    })
  }

  private async resolveOneClickRuntimeEnvVars(
    configSnapshot: unknown,
    authHeader?: string,
    origin?: string,
    launchContext?: {
      userId: string
      playId?: string
      templateSlug?: string
      namespace?: string
    },
  ) {
    const envVars: Record<string, string> = {}
    const shadowServerUrl = process.env.SHADOW_SERVER_URL ?? origin
    const shadowAgentServerUrl = process.env.SHADOW_AGENT_SERVER_URL
    const shadowProvisionUrl = process.env.SHADOW_PROVISION_URL

    if (shadowServerUrl) envVars.SHADOW_SERVER_URL = shadowServerUrl
    if (shadowAgentServerUrl) envVars.SHADOW_AGENT_SERVER_URL = shadowAgentServerUrl
    if (shadowProvisionUrl) envVars.SHADOW_PROVISION_URL = shadowProvisionUrl
    if (launchContext) {
      const runtimeServerUrl = shadowAgentServerUrl ?? shadowServerUrl
      assertOfficialModelProxyAvailable(runtimeServerUrl)
      Object.assign(
        envVars,
        officialModelProxyEnvVars({
          runtimeServerUrl,
          ...launchContext,
        }),
      )
    }

    const [runtimeEnvKeys, envRefPolicy] = await Promise.all([
      collectRuntimeEnvRequirements(configSnapshot),
      collectRuntimeEnvRefPolicy(configSnapshot),
    ])
    for (const key of runtimeEnvKeys) {
      if (envVars[key]) continue
      if (!shouldCopyServerRuntimeEnvKey(key)) continue
      const value = nonEmptyProcessEnv(key)
      if (value !== undefined) envVars[key] = value
    }

    return applyRuntimeEnvRefPolicy(envVars, envRefPolicy)
  }

  private async getLaunchUserProfile(userId: string): Promise<LaunchUserProfile> {
    const user = await this.deps.userDao.findById(userId).catch(() => null)
    const friendlyName =
      (user?.displayName?.trim() || user?.username?.trim() || userId.slice(0, 8)).slice(0, 64) ||
      '朋友'
    const channelNameSegment =
      compactChannelSegment(user?.displayName ?? '') ||
      compactChannelSegment(user?.username ?? '') ||
      compactSlug(userId)
    return { friendlyName, channelNameSegment }
  }

  private async cloudDeploymentLaunchResult(
    userId: string,
    playId: string | undefined,
    deployment: {
      id: string
      status: string
      name?: string | null
      templateSlug?: string | null
      configSnapshot?: unknown
    },
  ): Promise<PlayLaunchResult> {
    await this.ensureCloudDeploymentGreeting(userId, deployment).catch(() => null)
    const target = extractShadowProvisionTarget(deployment.configSnapshot)
    if (deployment.status === 'deployed' && target.serverId) {
      const server = await this.deps.serverService.getById(target.serverId).catch(() => null)
      if (server) {
        await this.deps.serverService.ensureMember(server.id, userId, { allowPrivatePlay: true })
        return {
          ok: true,
          playId: playId ?? null,
          status: 'launched',
          serverId: server.id,
          channelId: target.channelId ?? undefined,
          deploymentId: deployment.id,
          deploymentStatus: deployment.status,
          templateSlug: deployment.templateSlug ?? undefined,
          redirectUrl: target.channelId
            ? this.channelUrl(server, target.channelId)
            : this.serverUrl(server),
        }
      }
    }

    return {
      ok: true,
      playId: playId ?? null,
      status: 'deploying',
      deploymentId: deployment.id,
      deploymentStatus: deployment.status,
      templateSlug: deployment.templateSlug ?? undefined,
    }
  }

  async ensureCloudDeploymentGreeting(
    userId: string,
    deployment: {
      id: string
      status: string
      name?: string | null
      templateSlug?: string | null
      configSnapshot?: unknown
    },
  ) {
    if (deployment.status !== 'deployed') return
    const target = extractShadowProvisionTarget(deployment.configSnapshot)
    if (!target.serverId || !target.channelId) return

    const buddyUserIds = extractShadowProvisionBuddyUserIds(deployment.configSnapshot)
    const buddyUserId = buddyUserIds[0]
    if (!buddyUserId) return

    const recent = await this.deps.messageService.getByChannelId(target.channelId, 100)
    if (
      recent.messages.some((message) =>
        playLaunchMetadataMatches(message.metadata, 'deploymentId', deployment.id),
      )
    ) {
      return
    }

    await this.deps.serverService.ensureMember(target.serverId, userId, { allowPrivatePlay: true })
    await this.deps.serverService.addBotMember(target.serverId, buddyUserId)
    await this.deps.channelService.addMember(target.channelId, buddyUserId).catch(() => null)
    const agent = await this.deps.agentDao.findByUserId(buddyUserId)
    if (agent) {
      await this.deps.agentPolicyService.ensureServerDefault(agent.id, target.serverId)
      this.notifyBuddyChannelAdded({
        serverId: target.serverId,
        channelId: target.channelId,
        buddyUserId,
        agentId: agent.id,
      })
    }

    const runtime = extractPlayLaunchRuntimeMetadata(deployment.configSnapshot)
    const launchUser = await this.getLaunchUserProfile(userId)
    const greeting =
      runtime.greeting !== undefined
        ? personalizeGreeting(runtime.greeting, launchUser.friendlyName, runtime.locale)
        : defaultLaunchGreeting({
            title: deployment.name ?? deployment.templateSlug ?? 'Buddy',
            locale: runtime.locale,
            kind: 'cloud',
            userName: launchUser.friendlyName,
          })
    await this.deps.messageService.send(target.channelId, buddyUserId, {
      content: greeting,
      metadata: {
        playLaunch: {
          kind: 'cloud_deploy',
          deploymentId: deployment.id,
          templateSlug: deployment.templateSlug ?? undefined,
        },
      },
    })
  }

  private launchExternalOAuth(
    playId: string | undefined,
    action: Extract<PlayAction, { kind: 'external_oauth_app' }>,
  ) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: action.clientId,
      redirect_uri: action.redirectUri,
      scope: (action.scopes ?? ['user:read', 'user:email']).join(' '),
      ...(action.state ? { state: action.state } : {}),
      ...(playId && !action.state ? { state: `play:${playId}` } : {}),
    })
    return {
      ok: true as const,
      playId: playId ?? null,
      status: 'launched' as const,
      redirectUrl: `/app/oauth/authorize?${params.toString()}`,
    }
  }

  private async joinByInviteOrReturnExisting(inviteCode: string, userId: string) {
    try {
      return await this.deps.serverService.join(inviteCode, userId)
    } catch (error) {
      if ((error as { status?: number }).status === 409) {
        return this.deps.serverService.getByInviteCode(inviteCode)
      }
      throw error
    }
  }

  private async joinPublicBySlug(serverSlug: string, userId: string) {
    const server = await this.deps.serverService.getBySlug(serverSlug)
    return this.deps.serverService.joinPublic(server.id, userId)
  }

  private async resolveConfiguredBuddyAgents(
    action: PlayActionBase,
    options: {
      requireBuddies: boolean
      requireRunning: boolean
      playId?: string
    },
  ) {
    const buddyUserIds = action.buddyUserIds ?? []
    if (buddyUserIds.length === 0) {
      if (!options.requireBuddies) return []
      throw playError(
        'Private room play must configure at least one deployed Buddy',
        422,
        'PLAY_BUDDY_NOT_CONFIGURED',
        { playId: options.playId },
      )
    }

    const buddies: Array<{ userId: string; agentId: string }> = []
    for (const buddyUserId of buddyUserIds) {
      const agent = await this.deps.agentDao.findByUserId(buddyUserId)
      if (!agent) {
        throw playError('Configured Buddy is not available', 422, 'PLAY_BUDDY_UNAVAILABLE', {
          playId: options.playId,
          buddyUserId,
        })
      }
      if (options.requireRunning && !isAgentOnline(agent)) {
        throw playError('Configured Buddy is not running', 409, 'PLAY_BUDDY_NOT_RUNNING', {
          playId: options.playId,
          buddyUserId,
          agentId: agent.id,
        })
      }
      buddies.push({ userId: buddyUserId, agentId: agent.id })
    }
    return buddies
  }

  private async addBuddiesAndGreet(
    serverId: string,
    channelId: string,
    buddies: Array<{ userId: string; agentId: string }>,
    action: PlayActionBase,
    options: {
      greeting?: string
      metadata?: Record<string, unknown>
    } = {},
  ) {
    for (const buddy of buddies) {
      await this.deps.serverService.addBotMember(serverId, buddy.userId)
      await this.deps.agentPolicyService.ensureServerDefault(buddy.agentId, serverId)
      await this.deps.channelService.addMember(channelId, buddy.userId)
      this.notifyBuddyChannelAdded({
        serverId,
        channelId,
        buddyUserId: buddy.userId,
        agentId: buddy.agentId,
      })
      const greeting = options.greeting ?? action.greeting
      if (greeting) {
        await this.deps.messageService.send(channelId, buddy.userId, {
          content: greeting,
          metadata: options.metadata ?? { playLaunch: true },
        })
      }
    }
  }

  private notifyBuddyChannelAdded(input: {
    serverId: string
    channelId: string
    buddyUserId: string
    agentId: string
  }) {
    this.deps.io.to(`user:${input.buddyUserId}`).emit('channel:member-added', {
      channelId: input.channelId,
      serverId: input.serverId,
    })
    this.deps.io.to(`user:${input.buddyUserId}`).emit('agent:policy-changed', {
      agentId: input.agentId,
      serverId: input.serverId,
      channelId: input.channelId,
      mentionOnly: false,
      reply: true,
      config: {},
    })
    this.deps.io.to(`channel:${input.channelId}`).emit('channel:slash-commands-updated', {
      channelId: input.channelId,
      serverId: input.serverId,
      botUserId: input.buddyUserId,
    })
  }

  private channelUrl(server: { id: string; slug: string | null }, channelId: string) {
    return `/servers/${encodeURIComponent(server.slug ?? server.id)}/channels/${encodeURIComponent(channelId)}`
  }

  private serverUrl(server: { id: string; slug: string | null }) {
    return `/servers/${encodeURIComponent(server.slug ?? server.id)}`
  }
}

function normalizePlay(play: ShadowHomePlayCatalogItem): ShadowHomePlayCatalogItem {
  return {
    ...play,
    status: resolveConfiguredPlayStatus(play),
  }
}
