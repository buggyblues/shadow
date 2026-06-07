import type { Server as SocketIOServer } from 'socket.io'
import type { AgentDao } from '../dao/agent.dao'
import type { UserDao } from '../dao/user.dao'
import {
  extractGreetingRuntimeMetadata,
  extractShadowGreetingMessages,
  extractShadowProvisionTarget,
} from '../lib/cloud-shadow-target'
import type { AgentPolicyService } from './agent-policy.service'
import type { ChannelService } from './channel.service'
import type { MessageService } from './message.service'
import type { ServerService } from './server.service'

export type GreetingUserProfile = {
  friendlyName: string
  channelNameSegment: string
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

export function compactChannelName(parts: string[]) {
  return (
    parts
      .map((part) => compactChannelSegment(part) || compactSlug(part))
      .filter(Boolean)
      .join('-')
      .slice(0, 100)
      .replace(/-+$/g, '') || 'play'
  )
}

export function personalizeGreeting(
  greeting: string,
  userName: string | undefined,
  locale?: string,
) {
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

export function buildDefaultGreeting(input: {
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

function greetingMetadataMatches(metadata: unknown, deploymentId: string, messageId: string) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false
  const greeting = (metadata as Record<string, unknown>).greeting
  return (
    greeting &&
    typeof greeting === 'object' &&
    !Array.isArray(greeting) &&
    (greeting as Record<string, unknown>).deploymentId === deploymentId &&
    (greeting as Record<string, unknown>).messageId === messageId
  )
}

export class GreetingService {
  constructor(
    private deps: {
      io: SocketIOServer
      userDao: UserDao
      serverService: ServerService
      channelService: ChannelService
      agentDao: AgentDao
      agentPolicyService: AgentPolicyService
      messageService: MessageService
    },
  ) {}

  async getUserProfile(userId: string): Promise<GreetingUserProfile> {
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

  async addBuddiesAndGreet(
    serverId: string,
    channelId: string,
    buddies: Array<{ userId: string; agentId: string }>,
    options: {
      greeting?: string
      metadata?: Record<string, unknown>
    } = {},
  ) {
    for (const buddy of buddies) {
      await this.deps.serverService.addBotMember(serverId, buddy.userId)
      await this.deps.channelService.addMember(channelId, buddy.userId)
      await this.deps.agentPolicyService.upsertPolicies(buddy.agentId, [
        {
          serverId,
          channelId,
          listen: true,
          reply: true,
          mentionOnly: false,
          config: {},
        },
      ])
      this.notifyBuddyChannelAdded({
        serverId,
        channelId,
        buddyUserId: buddy.userId,
        agentId: buddy.agentId,
      })
      const greeting = options.greeting
      if (greeting) {
        await this.deps.messageService.send(channelId, buddy.userId, {
          content: greeting,
          metadata: options.metadata ?? { greeting: true },
        })
      }
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
    if (!target.serverId) return

    await this.deps.serverService.ensureMember(target.serverId, userId, { allowPrivatePlay: true })
    const greetingMessages = extractShadowGreetingMessages(deployment.configSnapshot)
    if (greetingMessages.length === 0) return

    const runtime = extractGreetingRuntimeMetadata(deployment.configSnapshot)
    const launchUser = await this.getUserProfile(userId)
    const recentByChannel = new Map<string, Awaited<ReturnType<MessageService['getByChannelId']>>>()
    const addedBots = new Set<string>()

    for (const greeting of greetingMessages) {
      const recent =
        recentByChannel.get(greeting.channelId) ??
        (await this.deps.messageService.getByChannelId(greeting.channelId, 100))
      recentByChannel.set(greeting.channelId, recent)
      if (
        recent.messages.some((message) =>
          greetingMetadataMatches(message.metadata, deployment.id, greeting.id),
        )
      ) {
        continue
      }

      if (!addedBots.has(greeting.buddyUserId)) {
        await this.deps.serverService.addBotMember(target.serverId, greeting.buddyUserId)
        addedBots.add(greeting.buddyUserId)
      }
      await this.deps.channelService
        .addMember(greeting.channelId, greeting.buddyUserId)
        .catch(() => null)
      const agent = await this.deps.agentDao.findByUserId(greeting.buddyUserId)
      if (agent) {
        this.notifyBuddyChannelAdded({
          serverId: target.serverId,
          channelId: greeting.channelId,
          buddyUserId: greeting.buddyUserId,
          agentId: agent.id,
        })
      }

      await this.deps.messageService.send(greeting.channelId, greeting.buddyUserId, {
        content: personalizeGreeting(greeting.content, launchUser.friendlyName, runtime.locale),
        metadata: {
          greeting: {
            kind: 'cloud_deploy',
            deploymentId: deployment.id,
            templateSlug: deployment.templateSlug ?? undefined,
            messageId: greeting.id,
            channelId: greeting.channelConfigId,
            buddyId: greeting.buddyConfigId ?? undefined,
          },
        },
      })
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
    })
    this.deps.io.to(`channel:${input.channelId}`).emit('channel:slash-commands-updated', {
      channelId: input.channelId,
      serverId: input.serverId,
      buddyUserId: input.buddyUserId,
    })
  }
}
