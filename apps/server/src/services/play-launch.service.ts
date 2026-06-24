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
import type { AgentDao } from '../dao/agent.dao'
import type { CloudActivityDao } from '../dao/cloud-activity.dao'
import type { CloudClusterDao } from '../dao/cloud-cluster.dao'
import type { CloudDeploymentDao } from '../dao/cloud-deployment.dao'
import type { CloudTemplateDao } from '../dao/cloud-template.dao'
import type { Database } from '../db'
import { cloudTemplates, configSchemas, configValues } from '../db/schema'
import { applySafeDeploymentPreferences } from '../lib/cloud-saas-deployment-preferences'
import {
  attachGreetingRuntimeMetadata,
  extractGreetingRuntimeMetadata,
  extractShadowProvisionTarget,
} from '../lib/cloud-shadow-target'
import {
  assertOfficialModelProxyAvailable,
  officialModelProxyEnvVars,
  resolveOfficialModelProxyRuntimeServerUrl,
  shouldCopyServerRuntimeEnvKey,
} from '../lib/model-proxy-config'
import type { ChannelService } from './channel.service'
import { assertCloudTemplatePolicy } from './cloud-template-policy.service'
import { buildDefaultGreeting, compactChannelName, type GreetingService } from './greeting.service'
import type { MembershipService } from './membership.service'
import type { ServerService } from './server.service'
import type { WalletService } from './wallet.service'

type PlayActionBase = {
  buddyUserIds?: string[]
  buddyTemplateSlug?: string
}

export type PlayAction = ShadowPlayAction
type CloudDeployPlayAction = Extract<PlayAction, { kind: 'cloud_deploy' }>

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

function localizedPlayTitle(play: ShadowHomePlayCatalogItem, locale?: string) {
  const fallback = play.title || play.titleEn || play.id || 'Buddy'
  return locale?.startsWith('zh') ? play.title || fallback : play.titleEn || fallback
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
      serverService: ServerService
      channelService: ChannelService
      agentDao: AgentDao
      greetingService: GreetingService
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
      const launchUser = await this.deps.greetingService.getUserProfile(userId)
      await this.deps.greetingService.addBuddiesAndGreet(server.id, channel.id, buddies, {
        greeting: buildDefaultGreeting({
          title: localizedPlayTitle(play, input.locale),
          locale: input.locale,
          kind: 'community',
          userName: launchUser.friendlyName,
        }),
        metadata: {
          greeting: {
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
    const launchUser = await this.deps.greetingService.getUserProfile(userId)
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

    await this.deps.greetingService.addBuddiesAndGreet(server.id, channel.id, buddies, {
      greeting: buildDefaultGreeting({
        title: localizedPlayTitle(play, input.locale),
        locale: input.locale,
        kind: 'private',
        userName: launchUser.friendlyName,
      }),
      metadata: {
        greeting: {
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
    const launchUser = await this.deps.greetingService.getUserProfile(userId)
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
      const serverTemplateSnapshot = applySafeDeploymentPreferences(
        validateCloudSaasConfigSnapshot(template.content),
        undefined,
      )
      assertCloudTemplatePolicy(serverTemplateSnapshot)
      const envVars = await this.resolveOneClickRuntimeEnvVars(
        serverTemplateSnapshot,
        context.authHeader,
        context.origin,
        {
          userId,
          playId: input.playId,
          templateSlug: action.templateSlug,
          namespace,
        },
      )
      const templateGreeting = extractGreetingRuntimeMetadata(serverTemplateSnapshot)
      const preparedConfigSnapshot = prepareCloudSaasConfigSnapshot(
        serverTemplateSnapshot,
        envVars,
        {
          locale: input.locale,
        },
      )
      const configSnapshot = attachGreetingRuntimeMetadata(
        preparedConfigSnapshot,
        templateGreeting.messages.length
          ? {}
          : {
              ...(templateGreeting.entryChannelId
                ? { entryChannelId: templateGreeting.entryChannelId }
                : {}),
              messages: [
                {
                  id: 'default',
                  ...(templateGreeting.entryChannelId
                    ? { channelId: templateGreeting.entryChannelId }
                    : {}),
                  content: buildDefaultGreeting({
                    title: localizedPlayTitle(play, input.locale),
                    locale: input.locale,
                    kind: 'cloud',
                    userName: launchUser.friendlyName,
                  }),
                },
              ],
            },
      )
      const { name } = resolveTemplateText(template, input.locale)

      const deployment = await this.deps.cloudDeploymentDao.create({
        userId,
        clusterId,
        namespace,
        name,
        status: 'pending',
        agentCount: templateAgentCount(serverTemplateSnapshot),
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
    const shadowServerUrl = process.env.SHADOWOB_SERVER_URL ?? origin

    if (shadowServerUrl) envVars.SHADOWOB_SERVER_URL = shadowServerUrl
    if (launchContext) {
      const officialRuntimeServerUrl = resolveOfficialModelProxyRuntimeServerUrl({
        shadowServerUrl,
      })
      assertOfficialModelProxyAvailable(
        officialRuntimeServerUrl.runtimeServerUrl,
        officialRuntimeServerUrl.runtimeServerUrlRequirement,
      )
      Object.assign(
        envVars,
        officialModelProxyEnvVars({
          runtimeServerUrl: officialRuntimeServerUrl.runtimeServerUrl,
          runtimeServerUrlRequirement: officialRuntimeServerUrl.runtimeServerUrlRequirement,
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
    await this.deps.greetingService
      .ensureCloudDeploymentGreeting(userId, deployment)
      .catch(() => null)
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
