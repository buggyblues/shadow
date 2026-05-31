import { randomUUID } from 'node:crypto'
import type { Server as SocketIOServer } from 'socket.io'
import type { AgentDao } from '../dao/agent.dao'
import type { AgentPolicyDao } from '../dao/agent-policy.dao'
import type { ChannelDao } from '../dao/channel.dao'
import type { ChannelMemberDao } from '../dao/channel-member.dao'
import type { MessageDao } from '../dao/message.dao'
import type { ServerDao } from '../dao/server.dao'
import type { UserDao } from '../dao/user.dao'
import type { MessageMetadata, TaskMessageCardMetadata } from '../db/schema/messages'
import { type Actor, type ActorInput, actorUserId } from '../security/actor'
import type { MessageCardInput, MessageCardStatusInput } from '../validators/message.schema'
import {
  type BuddyInboxAdmissionMode,
  type BuddyInboxAdmissionPendingDelivery,
  type BuddyInboxAdmissionPolicy,
  type BuddyInboxAdmissionRule,
  type BuddyInboxAdmissionSubjectKind,
  buddyInboxTopic,
  canTransitionTaskMessageCardStatus,
  DEFAULT_BUDDY_INBOX_ADMISSION_POLICY,
  isTerminalTaskMessageCardStatus,
  normalizeBuddyInboxAdmissionPendingDeliveries,
  normalizeBuddyInboxAdmissionPolicy,
  parseBuddyInboxAgentId,
} from './buddy-inbox-protocol'
import type { MessageService } from './message.service'
import type { PolicyService } from './policy.service'
import type { ServerService } from './server.service'

type ServerMemberRole = 'owner' | 'admin' | 'member'
type TaskPriority = 'low' | 'normal' | 'high' | 'urgent'

type EnqueueTaskInput = {
  title: string
  body?: string
  priority?: TaskPriority
  idempotencyKey?: string
  source?: TaskMessageCardMetadata['source']
  data?: Record<string, unknown>
}

type AdmissionSubject = {
  kind: BuddyInboxAdmissionSubjectKind
  id?: string
  appKey?: string
  label?: string
}

type InboxAccess = Awaited<ReturnType<PolicyService['requireChannelRead']>>
type BuddyInboxServerMember =
  | Awaited<ReturnType<ServerDao['getMembers']>>[number]
  | Awaited<ReturnType<ServerService['getMembers']>>[number]

type UserSummary = {
  id: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  isBot?: boolean | null
}

function canManageServer(role: string | null | undefined) {
  return role === 'owner' || role === 'admin'
}

function actorSource(actor: Actor, label?: string) {
  return {
    kind: actor.kind,
    ...(actor.kind !== 'system' ? { userId: actor.userId } : {}),
    ...(actor.kind === 'agent' && actor.agentId ? { agentId: actor.agentId } : {}),
    ...(actor.kind === 'oauth' ? { appId: actor.appId } : {}),
    ...(label ? { label } : {}),
  } satisfies TaskMessageCardMetadata['source']
}

function displayName(user: UserSummary | null | undefined, fallback: string) {
  return user?.displayName ?? user?.username ?? fallback
}

function inboxChannelName(user: UserSummary | null | undefined, agentId: string) {
  const raw = user?.username ?? user?.displayName ?? ''
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 52)
  return `inbox-${slug || `buddy-${agentId.slice(0, 8)}`}`
}

function taskContent(input: { title: string; body?: string }) {
  const title = input.title.trim()
  const body = input.body?.trim()
  return body ? `${title}\n\n${body}` : title
}

function isTaskCard(card: unknown): card is TaskMessageCardMetadata {
  if (!card || typeof card !== 'object' || Array.isArray(card)) return false
  const record = card as Record<string, unknown>
  return record.kind === 'task' && typeof record.id === 'string'
}

function claimExpired(card: TaskMessageCardMetadata) {
  if (!card.claim?.expiresAt) return true
  return new Date(card.claim.expiresAt).getTime() <= Date.now()
}

function taskIdempotencyKey(card: TaskMessageCardMetadata) {
  const data = card.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const value = data.idempotencyKey
  return typeof value === 'string' && value.length > 0 ? value : null
}

function recordValue(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function recordString(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function normalizedToken(value: string | null | undefined) {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function taskWorkspaceId(card: TaskMessageCardMetadata) {
  const value = card.data?.task?.workspaceId
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function assertTaskStatusTransition(from: MessageCardStatusInput, to: MessageCardStatusInput) {
  if (canTransitionTaskMessageCardStatus(from, to)) return
  throw Object.assign(new Error(`Task card cannot move from ${from} to ${to}`), { status: 409 })
}

function sourceString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function admissionSubjectFromSource(
  source: TaskMessageCardMetadata['source'] | undefined,
): AdmissionSubject | null {
  if (!source) return null
  if (source.kind === 'server_app') {
    return {
      kind: 'server_app',
      id: sourceString(source.appId ?? source.id),
      appKey: sourceString(source.appKey),
      label: sourceString(source.label ?? source.appKey ?? source.appId ?? source.id),
    }
  }
  if (source.kind === 'agent' || source.kind === 'buddy') {
    return {
      kind: 'agent',
      id: sourceString(source.agentId ?? source.id),
      label: sourceString(source.label ?? source.agentId ?? source.id),
    }
  }
  if (source.kind === 'system') {
    return { kind: 'system' }
  }
  return {
    kind: 'user',
    id: sourceString(source.userId ?? source.id),
    label: sourceString(source.label ?? source.userId ?? source.id),
  }
}

function admissionSubjectFromActor(actor: ActorInput): AdmissionSubject {
  if (typeof actor === 'string') return { kind: 'user', id: actor }
  if (actor.kind === 'agent') return { kind: 'agent', id: actor.agentId ?? actor.userId }
  if (actor.kind === 'oauth') return { kind: 'server_app', id: actor.appId, appKey: actor.appId }
  if (actor.kind === 'system') return { kind: 'system' }
  return { kind: 'user', id: actor.userId }
}

function ruleMatchesSubject(rule: BuddyInboxAdmissionRule, subject: AdmissionSubject) {
  if (rule.subjectKind !== subject.kind) return false
  if (rule.subjectKind === 'server_app') {
    if (rule.appKey && rule.appKey !== subject.appKey) return false
    if (rule.subjectId && rule.subjectId !== subject.id) return false
    return Boolean(rule.appKey || rule.subjectId)
  }
  if (rule.subjectKind === 'system') return true
  return Boolean(rule.subjectId && rule.subjectId === subject.id)
}

function admissionRuleKeyFromSubject(subject: AdmissionSubject) {
  return [subject.kind, subject.id ?? '', subject.appKey ?? ''].join(':')
}

function pendingMatchesTask(
  pending: BuddyInboxAdmissionPendingDelivery,
  subject: AdmissionSubject,
  task: EnqueueTaskInput,
) {
  if (admissionRuleKeyFromSubject(pending.subject) !== admissionRuleKeyFromSubject(subject)) {
    return false
  }
  if (pending.task.idempotencyKey && task.idempotencyKey) {
    return pending.task.idempotencyKey === task.idempotencyKey
  }
  return pending.task.title === task.title && (pending.task.body ?? '') === (task.body ?? '')
}

export class BuddyInboxService {
  constructor(
    private deps: {
      agentDao: AgentDao
      agentPolicyDao: AgentPolicyDao
      channelDao: ChannelDao
      channelMemberDao: ChannelMemberDao
      messageDao: MessageDao
      messageService: MessageService
      io?: SocketIOServer
      policyService: PolicyService
      serverDao: ServerDao
      userDao: UserDao
    },
  ) {}

  private async requireInboxManager(serverId: string, agentId: string, actor: ActorInput) {
    const userId = actorUserId(actor)
    const [serverMember, agent] = await Promise.all([
      this.deps.policyService.requireServerMember(actor, serverId),
      this.deps.agentDao.findById(agentId),
    ])
    if (!agent) {
      throw Object.assign(new Error('Buddy not found'), { status: 404 })
    }
    if (agent.ownerId !== userId && !canManageServer(serverMember.role)) {
      throw Object.assign(new Error('Only the Buddy owner or server admin can manage this Inbox'), {
        status: 403,
      })
    }
    return { serverMember, agent }
  }

  private async readAdmissionPolicy(
    serverId: string,
    agentId: string,
    channelId: string | null | undefined,
  ): Promise<BuddyInboxAdmissionPolicy> {
    if (!channelId) return { ...DEFAULT_BUDDY_INBOX_ADMISSION_POLICY }
    const policy = await this.deps.agentPolicyDao.findByChannel(agentId, serverId, channelId)
    const config = policy?.config
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return { ...DEFAULT_BUDDY_INBOX_ADMISSION_POLICY }
    }
    return normalizeBuddyInboxAdmissionPolicy((config as Record<string, unknown>).inboxAdmission)
  }

  private async writeAdmissionPolicy(input: {
    serverId: string
    agentId: string
    channelId: string
    policy: BuddyInboxAdmissionPolicy
  }) {
    return this.writeAdmissionState(input)
  }

  private async readAdmissionPendingDeliveries(
    serverId: string,
    agentId: string,
    channelId: string | null | undefined,
  ): Promise<BuddyInboxAdmissionPendingDelivery[]> {
    if (!channelId) return []
    const policy = await this.deps.agentPolicyDao.findByChannel(agentId, serverId, channelId)
    const config = policy?.config
    if (!config || typeof config !== 'object' || Array.isArray(config)) return []
    return normalizeBuddyInboxAdmissionPendingDeliveries(
      (config as Record<string, unknown>).inboxAdmissionPending,
    )
  }

  private async writeAdmissionPendingDeliveries(input: {
    serverId: string
    agentId: string
    channelId: string
    pending: BuddyInboxAdmissionPendingDelivery[]
  }) {
    return this.writeAdmissionState(input)
  }

  private async writeAdmissionState(input: {
    serverId: string
    agentId: string
    channelId: string
    policy?: BuddyInboxAdmissionPolicy
    pending?: BuddyInboxAdmissionPendingDelivery[]
  }) {
    const existing = await this.deps.agentPolicyDao.findByChannel(
      input.agentId,
      input.serverId,
      input.channelId,
    )
    const config = {
      ...((existing?.config as Record<string, unknown> | undefined) ?? {}),
      ...(input.policy !== undefined
        ? { inboxAdmission: normalizeBuddyInboxAdmissionPolicy(input.policy) }
        : {}),
      ...(input.pending !== undefined
        ? {
            inboxAdmissionPending: normalizeBuddyInboxAdmissionPendingDeliveries(input.pending),
          }
        : {}),
    }
    return this.deps.agentPolicyDao.upsert({
      agentId: input.agentId,
      serverId: input.serverId,
      channelId: input.channelId,
      listen: true,
      reply: true,
      mentionOnly: false,
      config,
    })
  }

  private async ensureInboxRuntimePolicy(input: {
    serverId: string
    agentId: string
    channelId: string
  }) {
    const existing = await this.deps.agentPolicyDao.findByChannel(
      input.agentId,
      input.serverId,
      input.channelId,
    )
    const config = ((existing?.config as Record<string, unknown> | undefined) ?? {}) as Record<
      string,
      unknown
    >
    return this.deps.agentPolicyDao.upsert({
      agentId: input.agentId,
      serverId: input.serverId,
      channelId: input.channelId,
      listen: true,
      reply: true,
      mentionOnly: false,
      config,
    })
  }

  private emitInboxReady(input: {
    serverId: string
    agent: { id: string; userId: string }
    channelId: string
    config?: Record<string, unknown>
  }) {
    const io = this.deps.io
    if (!io) return
    try {
      io.to(`user:${input.agent.userId}`).emit('channel:member-added', {
        channelId: input.channelId,
        serverId: input.serverId,
      })
      io.to(`user:${input.agent.userId}`).emit('agent:policy-changed', {
        agentId: input.agent.id,
        serverId: input.serverId,
        channelId: input.channelId,
        reply: true,
        mentionOnly: false,
        config: input.config ?? {},
      })
    } catch {
      /* socket fanout is best-effort */
    }
  }

  private resolveAdmissionMode(
    policy: BuddyInboxAdmissionPolicy,
    subjects: Array<{ kind: BuddyInboxAdmissionSubjectKind; id?: string; appKey?: string } | null>,
  ): { mode: BuddyInboxAdmissionMode; rule?: BuddyInboxAdmissionRule } {
    for (const subject of subjects) {
      if (!subject) continue
      const rule = policy.rules.find((candidate) => ruleMatchesSubject(candidate, subject))
      if (rule) return { mode: rule.mode, rule }
    }
    return { mode: policy.defaultMode }
  }

  private async assertCanEnqueueTask(input: {
    serverId: string
    channelId: string
    agentId: string
    task: EnqueueTaskInput
    actor: Actor
  }) {
    if (input.actor.kind === 'system') return
    const policy = await this.readAdmissionPolicy(input.serverId, input.agentId, input.channelId)
    const decision = this.resolveAdmissionMode(policy, [
      admissionSubjectFromSource(input.task.source),
      admissionSubjectFromActor(input.actor),
    ])
    if (decision.mode === 'allow') return
    if (decision.mode === 'first_time' && decision.rule?.approved) return
    if (decision.mode === 'deny') {
      throw Object.assign(new Error('Buddy Inbox does not allow this source to enqueue tasks'), {
        status: 403,
      })
    }
    const subject =
      admissionSubjectFromSource(input.task.source) ?? admissionSubjectFromActor(input.actor)
    const pending = await this.recordPendingAdmission({
      ...input,
      mode: decision.mode,
      subject,
    })
    throw Object.assign(new Error('Buddy Inbox task delivery requires approval'), {
      status: 403,
      pendingId: pending.id,
      channelId: input.channelId,
    })
  }

  private async recordPendingAdmission(input: {
    serverId: string
    channelId: string
    agentId: string
    task: EnqueueTaskInput
    actor: Actor
    mode: BuddyInboxAdmissionMode
    subject: AdmissionSubject
  }) {
    if (input.mode !== 'first_time' && input.mode !== 'every_time') {
      throw Object.assign(new Error('Invalid pending admission mode'), { status: 500 })
    }
    const current = await this.readAdmissionPendingDeliveries(
      input.serverId,
      input.agentId,
      input.channelId,
    )
    const existing = current.find((item) => pendingMatchesTask(item, input.subject, input.task))
    if (existing) return existing

    const actorUser = await this.deps.userDao.findById(actorUserId(input.actor))
    const now = new Date().toISOString()
    const pending: BuddyInboxAdmissionPendingDelivery = {
      id: randomUUID(),
      serverId: input.serverId,
      channelId: input.channelId,
      agentId: input.agentId,
      mode: input.mode,
      subject: input.subject,
      task: {
        title: input.task.title,
        ...(input.task.body ? { body: input.task.body } : {}),
        ...(input.task.priority ? { priority: input.task.priority } : {}),
        ...(input.task.idempotencyKey ? { idempotencyKey: input.task.idempotencyKey } : {}),
        ...(input.task.source ? { source: input.task.source } : {}),
        ...(input.task.data ? { data: input.task.data } : {}),
      },
      requestedBy: actorSource(input.actor, displayName(actorUser, actorUserId(input.actor))),
      requestedAt: now,
      updatedAt: now,
    }
    await this.writeAdmissionPendingDeliveries({
      serverId: input.serverId,
      agentId: input.agentId,
      channelId: input.channelId,
      pending: [pending, ...current].slice(0, 100),
    })
    return pending
  }

  private async assertCanUseTaskCard(
    access: InboxAccess,
    card: TaskMessageCardMetadata,
    actor: Actor,
    action: 'claim' | 'update' | 'retry',
  ) {
    if (actor.kind === 'system') return
    const targetAgentId = card.assignee?.agentId ?? parseBuddyInboxAgentId(access.channel.topic)
    const targetAgent = targetAgentId ? await this.deps.agentDao.findById(targetAgentId) : null
    const userId = actorUserId(actor)
    const isManager =
      canManageServer(access.serverMember?.role) || Boolean(targetAgent?.ownerId === userId)
    if (isManager) return

    const actorAgentMatches =
      actor.kind === 'agent' &&
      Boolean(
        (targetAgentId && actor.agentId === targetAgentId) ||
          card.assignee?.userId === actor.userId ||
          card.claim?.actor.userId === actor.userId,
      )
    if (!actorAgentMatches) {
      throw Object.assign(new Error(`Actor cannot ${action} this task card`), { status: 403 })
    }

    if (action !== 'update') return
    if (card.claim && !claimExpired(card) && card.claim.actor.userId !== actor.userId) {
      throw Object.assign(new Error('Only the active claim holder can update this task card'), {
        status: 403,
      })
    }
  }

  private async findInboxChannel(serverId: string, agentId: string) {
    const topic = buddyInboxTopic(agentId)
    const channels = await this.deps.channelDao.findByServerId(serverId)
    return channels.find((channel) => channel.topic === topic) ?? null
  }

  private async findInboxChannels(serverId: string) {
    const channels = await this.deps.channelDao.findByServerId(serverId)
    const byAgentId = new Map<string, (typeof channels)[number]>()
    for (const channel of channels) {
      const agentId = parseBuddyInboxAgentId(channel.topic)
      if (agentId) byAgentId.set(agentId, channel)
    }
    return byAgentId
  }

  private async resolveImmediateFeedbackChannel(input: {
    serverId: string
    agentId: string
    inboxChannelId: string
    feedback: Record<string, unknown>
  }) {
    const channels = await this.deps.channelDao.findByServerId(input.serverId)
    const visibleChannels = channels.filter(
      (channel) =>
        channel.id !== input.inboxChannelId &&
        !channel.isPrivate &&
        !parseBuddyInboxAgentId(channel.topic),
    )
    if (visibleChannels.length === 0) return null

    const requested = [
      recordString(input.feedback, 'statusChannelId'),
      recordString(input.feedback, 'finalChannelId'),
      recordString(input.feedback, 'channelId'),
      recordString(input.feedback, 'statusChannelName'),
      recordString(input.feedback, 'finalChannelName'),
      recordString(input.feedback, 'channelName'),
      recordString(input.feedback, 'statusChannel'),
      recordString(input.feedback, 'finalChannel'),
      recordString(input.feedback, 'channel'),
    ].filter((value): value is string => Boolean(value))

    for (const value of requested) {
      const byId = visibleChannels.find((channel) => channel.id === value)
      if (byId) return byId
    }

    for (const value of requested) {
      const exact = value.trim().toLowerCase()
      const byExactName = visibleChannels.find((channel) => {
        return (
          channel.name.trim().toLowerCase() === exact ||
          (channel.topic ?? '').trim().toLowerCase() === exact
        )
      })
      if (byExactName) return byExactName
    }

    for (const value of requested) {
      const token = normalizedToken(value)
      if (!token) continue
      const byName = visibleChannels.find((channel) => {
        return (
          normalizedToken(channel.name) === token ||
          normalizedToken(channel.topic ?? undefined) === token
        )
      })
      if (byName) return byName
    }

    const policies = await this.deps.agentPolicyDao.findByAgentAndServer(
      input.agentId,
      input.serverId,
    )
    for (const value of requested) {
      const token = normalizedToken(value)
      if (!token) continue
      const policy = policies.find((candidate) => {
        const config = recordValue(candidate.config)
        return (
          candidate.channelId &&
          candidate.listen &&
          candidate.reply &&
          normalizedToken(recordString(config, 'channelConfigId')) === token
        )
      })
      const channel = policy
        ? visibleChannels.find((candidate) => candidate.id === policy.channelId)
        : null
      if (channel) return channel
    }

    const policyChannelIds = new Set(
      policies
        .filter((policy) => policy.channelId && policy.listen && policy.reply)
        .map((policy) => policy.channelId),
    )
    return visibleChannels.find((channel) => policyChannelIds.has(channel.id)) ?? null
  }

  private async hasImmediateFeedbackMessage(input: {
    channelId: string
    taskMessageId: string
    taskCardId: string
  }) {
    const recent = await this.deps.messageDao.findByChannelId(input.channelId, 30)
    return recent.messages.some((message) => {
      const metadata = recordValue(message.metadata)
      const custom = recordValue(metadata?.custom)
      const ack = recordValue(custom?.buddyInboxAck)
      return (
        recordString(ack, 'taskMessageId') === input.taskMessageId &&
        recordString(ack, 'taskCardId') === input.taskCardId
      )
    })
  }

  private async sendImmediateClaimFeedback(input: {
    access: InboxAccess
    agent: { id: string; userId: string }
    messageId: string
    card: TaskMessageCardMetadata
  }) {
    const serverId = input.access.channel.serverId
    if (!serverId) return

    const feedback = recordValue(input.card.data?.immediateFeedback)
    const expectedAck = recordString(feedback, 'expectedAck')
    const ackMessage = recordString(feedback, 'ackMessage')
    if (expectedAck !== 'claim_and_acknowledge' && !ackMessage) return

    const targetChannel = await this.resolveImmediateFeedbackChannel({
      serverId,
      agentId: input.agent.id,
      inboxChannelId: input.access.channel.id,
      feedback: feedback ?? {},
    })
    if (!targetChannel) return

    const alreadySent = await this.hasImmediateFeedbackMessage({
      channelId: targetChannel.id,
      taskMessageId: input.messageId,
      taskCardId: input.card.id,
    })
    if (alreadySent) return

    const content =
      ackMessage ??
      `Got it: ${input.card.title}. ${input.card.assignee?.label ?? 'Buddy'} has picked it up and is working on it.`
    const message = await this.deps.messageService.send(targetChannel.id, input.agent.userId, {
      content,
      metadata: {
        custom: {
          buddyInboxAck: {
            kind: 'task_claim_ack',
            taskMessageId: input.messageId,
            taskCardId: input.card.id,
            sourceChannelId: input.access.channel.id,
            claimId: input.card.claim?.id,
          },
        },
      },
    })
    this.deps.io?.to(`channel:${targetChannel.id}`).emit('message:new', message)
  }

  private async findMessageByTaskIdempotencyKey(channelId: string, idempotencyKey?: string) {
    const key = idempotencyKey?.trim()
    if (!key) return null
    const recent = await this.deps.messageDao.findByChannelId(channelId, 100)
    for (const message of recent.messages) {
      const metadata = (message.metadata ?? {}) as MessageMetadata
      const cards = Array.isArray(metadata.cards) ? metadata.cards : []
      if (cards.some((card) => isTaskCard(card) && taskIdempotencyKey(card) === key)) {
        return message
      }
    }
    return null
  }

  async listForServer(
    serverId: string,
    actor: ActorInput,
    options?: {
      serverMember?: Awaited<ReturnType<PolicyService['requireServerMember']>> | null
      serverMembers?: BuddyInboxServerMember[]
    },
  ) {
    const userId = actorUserId(actor)
    const serverMember =
      options?.serverMember && options.serverMember.serverId === serverId
        ? options.serverMember
        : await this.deps.policyService.requireServerMember(actor, serverId)
    const canSeeAll = canManageServer(serverMember.role)
    const [members, inboxChannels] = await Promise.all([
      options?.serverMembers ?? this.deps.serverDao.getMembers(serverId),
      this.findInboxChannels(serverId),
    ])

    const rows = []
    for (const member of members) {
      if (!member.agent?.id || !member.user) continue
      const channel = inboxChannels.get(member.agent.id) ?? null
      const isOwner = member.agent.ownerId === userId
      const isInboxMember = channel
        ? await this.deps.channelMemberDao.get(channel.id, userId)
        : null
      if (!canSeeAll && !isOwner && !isInboxMember) continue
      rows.push({
        agent: {
          id: member.agent.id,
          ownerId: member.agent.ownerId,
          status: member.agent.status,
          user: member.user,
        },
        channel,
        canManage: canSeeAll || isOwner,
      })
    }

    return rows.sort((a, b) => {
      const left = displayName(a.agent.user, a.agent.id).toLowerCase()
      const right = displayName(b.agent.user, b.agent.id).toLowerCase()
      return left.localeCompare(right)
    })
  }

  async listForUser(actor: ActorInput) {
    const userId = actorUserId(actor)
    const servers = await this.deps.serverDao.findByUserId(userId)
    const result = []
    for (const entry of servers) {
      const inboxes = await this.listForServer(entry.server.id, actor)
      for (const inbox of inboxes) {
        result.push({
          ...inbox,
          server: {
            id: entry.server.id,
            name: entry.server.name,
            slug: entry.server.slug,
          },
        })
      }
    }
    return result
  }

  async ensure(serverId: string, agentId: string, actor: ActorInput) {
    const userId = actorUserId(actor)
    const [serverMember, agent] = await Promise.all([
      this.deps.policyService.requireServerMember(actor, serverId),
      this.deps.agentDao.findById(agentId),
    ])
    if (!agent) {
      throw Object.assign(new Error('Buddy not found'), { status: 404 })
    }

    const isOwner = agent.ownerId === userId
    if (!isOwner && !canManageServer(serverMember.role)) {
      throw Object.assign(new Error('Only the Buddy owner or server admin can manage this Inbox'), {
        status: 403,
      })
    }

    const botUser = await this.deps.userDao.findById(agent.userId)
    const existing = await this.findInboxChannel(serverId, agentId)
    if (existing) {
      await this.ensureInboxMembers(existing.id, serverId, agent, userId)
      const policy = await this.ensureInboxRuntimePolicy({
        serverId,
        agentId,
        channelId: existing.id,
      })
      this.emitInboxReady({
        serverId,
        agent,
        channelId: existing.id,
        config: policy?.config,
      })
      return { channel: existing, agent, created: false }
    }

    const botServerMember = await this.deps.serverDao.getMember(serverId, agent.userId)
    if (!botServerMember) {
      await this.deps.serverDao.addMember(serverId, agent.userId, 'member')
    }

    const channel = await this.deps.channelDao.create({
      name: inboxChannelName(botUser, agentId),
      serverId,
      type: 'text',
      topic: buddyInboxTopic(agentId),
      isPrivate: true,
      lastMessageAt: new Date(),
    })
    if (!channel) {
      throw Object.assign(new Error('Failed to create Buddy Inbox'), { status: 500 })
    }
    await this.ensureInboxMembers(channel.id, serverId, agent, userId)
    const policy = await this.ensureInboxRuntimePolicy({
      serverId,
      agentId,
      channelId: channel.id,
    })
    this.emitInboxReady({
      serverId,
      agent,
      channelId: channel.id,
      config: policy?.config,
    })
    return { channel, agent, created: true }
  }

  async getAdmissionPolicy(serverId: string, agentId: string, actor: ActorInput) {
    await this.requireInboxManager(serverId, agentId, actor)
    const channel = await this.findInboxChannel(serverId, agentId)
    const policy = await this.readAdmissionPolicy(serverId, agentId, channel?.id)
    return { channel, policy }
  }

  async updateAdmissionPolicy(
    serverId: string,
    agentId: string,
    policy: BuddyInboxAdmissionPolicy,
    actor: ActorInput,
  ) {
    await this.requireInboxManager(serverId, agentId, actor)
    const ensured = await this.ensure(serverId, agentId, actor)
    const normalized = normalizeBuddyInboxAdmissionPolicy(policy)
    await this.writeAdmissionPolicy({
      serverId,
      agentId,
      channelId: ensured.channel.id,
      policy: normalized,
    })
    return { channel: ensured.channel, policy: normalized }
  }

  async listAdmissionPending(serverId: string, agentId: string, actor: ActorInput) {
    await this.requireInboxManager(serverId, agentId, actor)
    const channel = await this.findInboxChannel(serverId, agentId)
    const pending = await this.readAdmissionPendingDeliveries(serverId, agentId, channel?.id)
    return { channel, pending }
  }

  async approveAdmissionPending(
    serverId: string,
    agentId: string,
    pendingId: string,
    actor: Actor,
  ) {
    await this.requireInboxManager(serverId, agentId, actor)
    const channel = await this.findInboxChannel(serverId, agentId)
    if (!channel) throw Object.assign(new Error('Buddy Inbox not found'), { status: 404 })
    const agent = await this.deps.agentDao.findById(agentId)
    if (!agent) throw Object.assign(new Error('Buddy not found'), { status: 404 })

    const pending = await this.readAdmissionPendingDeliveries(serverId, agentId, channel.id)
    const target = pending.find((item) => item.id === pendingId)
    if (!target) throw Object.assign(new Error('Pending Inbox delivery not found'), { status: 404 })
    const remaining = pending.filter((item) => item.id !== pendingId)
    let policy = await this.readAdmissionPolicy(serverId, agentId, channel.id)
    if (target.mode === 'first_time') {
      const key = admissionRuleKeyFromSubject(target.subject)
      const now = new Date().toISOString()
      const nextRule: BuddyInboxAdmissionRule = {
        subjectKind: target.subject.kind,
        ...(target.subject.id ? { subjectId: target.subject.id } : {}),
        ...(target.subject.appKey ? { appKey: target.subject.appKey } : {}),
        mode: 'first_time',
        approved: true,
        updatedAt: now,
      }
      policy = {
        ...policy,
        rules: [
          nextRule,
          ...policy.rules.filter((rule) => {
            const subject: AdmissionSubject = {
              kind: rule.subjectKind,
              id: rule.subjectId,
              appKey: rule.appKey,
            }
            return admissionRuleKeyFromSubject(subject) !== key
          }),
        ].slice(0, 100),
      }
      await this.writeAdmissionState({
        serverId,
        agentId,
        channelId: channel.id,
        policy,
        pending: remaining,
      })
    } else {
      await this.writeAdmissionPendingDeliveries({
        serverId,
        agentId,
        channelId: channel.id,
        pending: remaining,
      })
    }

    const message = await this.createTaskMessage(channel.id, agent, target.task, actor)
    return { channel, pending: target, message, policy }
  }

  async rejectAdmissionPending(
    serverId: string,
    agentId: string,
    pendingId: string,
    actor: ActorInput,
  ) {
    await this.requireInboxManager(serverId, agentId, actor)
    const channel = await this.findInboxChannel(serverId, agentId)
    if (!channel) throw Object.assign(new Error('Buddy Inbox not found'), { status: 404 })
    const pending = await this.readAdmissionPendingDeliveries(serverId, agentId, channel.id)
    const target = pending.find((item) => item.id === pendingId)
    if (!target) throw Object.assign(new Error('Pending Inbox delivery not found'), { status: 404 })
    const remaining = pending.filter((item) => item.id !== pendingId)
    await this.writeAdmissionPendingDeliveries({
      serverId,
      agentId,
      channelId: channel.id,
      pending: remaining,
    })
    return { channel, pending: target }
  }

  private async ensureInboxMembers(
    channelId: string,
    serverId: string,
    agent: { ownerId: string; userId: string },
    requesterUserId: string,
  ) {
    await this.deps.channelMemberDao.add(channelId, agent.userId)
    await this.deps.channelMemberDao.add(channelId, requesterUserId)
    const ownerServerMember = await this.deps.serverDao.getMember(serverId, agent.ownerId)
    if (ownerServerMember) {
      await this.deps.channelMemberDao.add(channelId, agent.ownerId)
    }
  }

  private async createTaskMessage(
    channelId: string,
    agent: { id: string; userId: string },
    input: EnqueueTaskInput,
    actor: Actor,
  ) {
    const existing = await this.findMessageByTaskIdempotencyKey(channelId, input.idempotencyKey)
    if (existing) return existing

    const [botUser, author] = await Promise.all([
      this.deps.userDao.findById(agent.userId),
      this.deps.userDao.findById(actorUserId(actor)),
    ])
    const now = new Date().toISOString()
    const data: Record<string, unknown> = {
      ...(input.data ?? {}),
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    }
    const cardId = randomUUID()
    const workspaceId = `task_${cardId.replace(/-/g, '')}`
    const card: TaskMessageCardMetadata = {
      id: cardId,
      kind: 'task',
      version: 1,
      title: input.title.trim(),
      ...(input.body?.trim() ? { body: input.body.trim() } : {}),
      status: 'queued',
      ...(input.priority ? { priority: input.priority } : {}),
      assignee: {
        agentId: agent.id,
        userId: agent.userId,
        label: displayName(botUser, agent.id),
      },
      source: input.source ?? actorSource(actor, displayName(author, actorUserId(actor))),
      progress: [
        {
          at: now,
          status: 'queued',
          actor: actorSource(actor, displayName(author, actorUserId(actor))),
        },
      ],
      createdAt: now,
      updatedAt: now,
      data: {
        ...data,
        task: {
          ...(data.task && typeof data.task === 'object' && !Array.isArray(data.task)
            ? data.task
            : {}),
          workspaceId,
        },
      },
    }

    return this.deps.messageService.send(channelId, actorUserId(actor), {
      content: taskContent(input),
      metadata: { cards: [card as unknown as MessageCardInput] },
    })
  }

  async enqueueTask(channelId: string, input: EnqueueTaskInput, actor: Actor) {
    const access = await this.deps.policyService.requireChannelRead(actor, channelId)
    const agentId = parseBuddyInboxAgentId(access.channel.topic)
    if (!agentId) {
      throw Object.assign(new Error('Channel is not a Buddy Inbox'), { status: 400 })
    }
    const agent = await this.deps.agentDao.findById(agentId)
    if (!agent) {
      throw Object.assign(new Error('Buddy not found'), { status: 404 })
    }
    if (!access.channel.serverId) {
      throw Object.assign(new Error('Buddy Inbox channel is not attached to a server'), {
        status: 400,
      })
    }
    await this.assertCanEnqueueTask({
      serverId: access.channel.serverId,
      channelId,
      agentId,
      task: input,
      actor,
    })
    const policy = await this.ensureInboxRuntimePolicy({
      serverId: access.channel.serverId,
      agentId,
      channelId,
    })
    this.emitInboxReady({
      serverId: access.channel.serverId,
      agent,
      channelId,
      config: policy?.config,
    })
    return this.createTaskMessage(channelId, agent, input, actor)
  }

  async enqueueTaskForAgent(
    serverId: string,
    agentId: string,
    input: EnqueueTaskInput,
    actor: Actor,
  ) {
    const serverMember = await this.deps.policyService.requireServerMember(actor, serverId)
    const agent = await this.deps.agentDao.findById(agentId)
    if (!agent) {
      throw Object.assign(new Error('Buddy not found'), { status: 404 })
    }
    const botServerMember = await this.deps.serverDao.getMember(serverId, agent.userId)
    if (!botServerMember) {
      throw Object.assign(new Error('Buddy is not a member of this server'), { status: 403 })
    }

    const existing = await this.findInboxChannel(serverId, agentId)
    if (!existing) {
      if (agent.ownerId !== actorUserId(actor) && !canManageServer(serverMember.role)) {
        throw Object.assign(new Error('Buddy Inbox has not been created yet'), { status: 404 })
      }
      const created = await this.ensure(serverId, agentId, actor)
      await this.assertCanEnqueueTask({
        serverId,
        channelId: created.channel.id,
        agentId,
        task: input,
        actor,
      })
      return this.createTaskMessage(created.channel.id, agent, input, actor)
    }

    await this.assertCanEnqueueTask({
      serverId,
      channelId: existing.id,
      agentId,
      task: input,
      actor,
    })
    const policy = await this.ensureInboxRuntimePolicy({
      serverId,
      agentId,
      channelId: existing.id,
    })
    this.emitInboxReady({
      serverId,
      agent,
      channelId: existing.id,
      config: policy?.config,
    })
    return this.createTaskMessage(existing.id, agent, input, actor)
  }

  async promoteMessageToTask(
    messageId: string,
    input: {
      serverId: string
      agentId: string
      title?: string
      priority?: TaskPriority
    },
    actor: Actor,
  ) {
    const message = await this.deps.messageDao.findById(messageId)
    if (!message) {
      throw Object.assign(new Error('Message not found'), { status: 404 })
    }
    const access = await this.deps.policyService.requireChannelRead(actor, message.channelId)
    if (access.channel.kind !== 'dm' && access.channel.serverId !== input.serverId) {
      throw Object.assign(new Error('Message does not belong to the target server'), {
        status: 403,
      })
    }

    return this.enqueueTaskForAgent(
      input.serverId,
      input.agentId,
      {
        title: input.title?.trim() || message.content.split('\n')[0]?.slice(0, 180) || 'Follow up',
        body: message.content,
        priority: input.priority,
        idempotencyKey: `message:${message.id}:agent:${input.agentId}`,
        source: {
          kind: 'user',
          userId: actorUserId(actor),
          channelId: message.channelId,
          resource: {
            kind: 'message',
            id: message.id,
          },
        },
        data: {
          promotedFromMessageId: message.id,
          promotedFromChannelId: message.channelId,
        },
      },
      actor,
    )
  }

  async claimNextTask(serverId: string, agentId: string, actor: Actor) {
    const serverMember = await this.deps.policyService.requireServerMember(actor, serverId)
    if (actor.kind === 'agent' && actor.agentId && actor.agentId !== agentId) {
      throw Object.assign(new Error('Buddy actor cannot claim another Buddy Inbox'), {
        status: 403,
      })
    }
    const agent = await this.deps.agentDao.findById(agentId)
    if (!agent) {
      throw Object.assign(new Error('Buddy not found'), { status: 404 })
    }
    if (
      actor.kind !== 'agent' &&
      agent.ownerId !== actorUserId(actor) &&
      !canManageServer(serverMember.role)
    ) {
      throw Object.assign(new Error('Only the Buddy owner or server admin can claim manually'), {
        status: 403,
      })
    }
    const channel = await this.findInboxChannel(serverId, agentId)
    if (!channel) {
      throw Object.assign(new Error('Buddy Inbox not found'), { status: 404 })
    }
    await this.deps.policyService.requireChannelRead(actor, channel.id)
    const recent = await this.deps.messageDao.findByChannelId(channel.id, 100)
    for (const message of recent.messages) {
      const metadata = (message.metadata ?? {}) as MessageMetadata
      const cards = Array.isArray(metadata.cards) ? metadata.cards : []
      for (const card of cards) {
        if (!isTaskCard(card)) continue
        if (card.assignee?.agentId !== agentId && card.assignee?.userId !== agent.userId) continue
        const claimable =
          card.status === 'queued' ||
          ((card.status === 'claimed' || card.status === 'running') && claimExpired(card))
        if (!claimable) continue
        const updated = await this.claimTaskCard(message.id, card.id, actor)
        const updatedMetadata = (updated?.metadata ?? {}) as MessageMetadata
        const updatedCards = Array.isArray(updatedMetadata.cards) ? updatedMetadata.cards : []
        const updatedCard = updatedCards.find((item) => isTaskCard(item) && item.id === card.id)
        return { channel, message: updated, card: updatedCard ?? card }
      }
    }
    return { channel, message: null, card: null }
  }

  async claimTaskCard(
    messageId: string,
    cardId: string,
    actor: Actor,
    input: { ttlSeconds?: number; note?: string } = {},
  ) {
    const message = await this.deps.messageDao.findById(messageId)
    if (!message) {
      throw Object.assign(new Error('Message not found'), { status: 404 })
    }
    const access = await this.deps.policyService.requireChannelRead(actor, message.channelId)
    const metadata = (message.metadata ?? {}) as MessageMetadata
    const cards = Array.isArray(metadata.cards) ? metadata.cards : []
    const targetCard = cards.find(
      (card): card is TaskMessageCardMetadata => isTaskCard(card) && card.id === cardId,
    )
    if (!targetCard) {
      throw Object.assign(new Error('Task card not found'), { status: 404 })
    }
    await this.assertCanUseTaskCard(access, targetCard, actor, 'claim')
    const now = new Date()
    const nowIso = now.toISOString()
    const ttlSeconds = Math.min(Math.max(input.ttlSeconds ?? 3600, 60), 86_400)
    const actorUser = await this.deps.userDao.findById(actorUserId(actor))
    const claimId = randomUUID()
    let found = false
    const nextCards = cards.map((card) => {
      if (!isTaskCard(card) || card.id !== cardId) return card
      found = true
      if (card.claim && !claimExpired(card) && card.claim.actor.userId !== actorUserId(actor)) {
        throw Object.assign(new Error('Task card is already claimed'), { status: 409 })
      }
      const progress = Array.isArray(card.progress) ? card.progress : []
      const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString()
      const nextCard = {
        ...card,
        status: 'claimed' as const,
        claim: {
          id: claimId,
          actor: actorSource(actor, displayName(actorUser, actorUserId(actor))),
          claimedAt: nowIso,
          expiresAt,
        },
        capability: {
          kind: 'task' as const,
          scope: ['task:read', 'task:update', 'server_app:call'],
          issuedAt: nowIso,
          expiresAt,
          claimId,
          binding: {
            messageId,
            cardId,
            ...(taskWorkspaceId(card) ? { workspaceId: taskWorkspaceId(card) } : {}),
          },
        },
        updatedAt: nowIso,
        progress: [
          ...progress,
          {
            at: nowIso,
            status: 'claimed' as const,
            ...(input.note?.trim() ? { note: input.note.trim() } : {}),
            actor: actorSource(actor, displayName(actorUser, actorUserId(actor))),
          },
        ],
      }
      return nextCard
    })
    if (!found) {
      throw Object.assign(new Error('Task card not found'), { status: 404 })
    }
    const claimedCard = nextCards.find(
      (card): card is TaskMessageCardMetadata => isTaskCard(card) && card.id === cardId,
    )

    const updated = await this.deps.messageService.updateMetadata(messageId, {
      ...metadata,
      cards: nextCards,
    })
    if (claimedCard) {
      const targetAgentId =
        claimedCard.assignee?.agentId ?? parseBuddyInboxAgentId(access.channel.topic)
      const targetAgent = targetAgentId ? await this.deps.agentDao.findById(targetAgentId) : null
      if (targetAgent) {
        try {
          await this.sendImmediateClaimFeedback({
            access,
            agent: targetAgent,
            messageId,
            card: claimedCard,
          })
        } catch {
          /* best-effort user feedback */
        }
      }
    }
    return updated
  }

  async updateTaskCard(
    messageId: string,
    cardId: string,
    input: { status: MessageCardStatusInput; note?: string },
    actor: Actor,
  ) {
    const message = await this.deps.messageDao.findById(messageId)
    if (!message) {
      throw Object.assign(new Error('Message not found'), { status: 404 })
    }
    const access = await this.deps.policyService.requireChannelRead(actor, message.channelId)
    const metadata = (message.metadata ?? {}) as MessageMetadata
    const cards = Array.isArray(metadata.cards) ? metadata.cards : []
    const targetCard = cards.find(
      (card): card is TaskMessageCardMetadata => isTaskCard(card) && card.id === cardId,
    )
    if (!targetCard) {
      throw Object.assign(new Error('Task card not found'), { status: 404 })
    }
    await this.assertCanUseTaskCard(access, targetCard, actor, 'update')
    const now = new Date().toISOString()
    let found = false
    const actorUser = await this.deps.userDao.findById(actorUserId(actor))
    const nextCards = cards.map((card) => {
      if (!isTaskCard(card) || card.id !== cardId) return card
      found = true
      assertTaskStatusTransition(card.status, input.status)
      const progress = Array.isArray(card.progress) ? card.progress : []
      const nextCard = {
        ...card,
        status: input.status,
        updatedAt: now,
        progress: [
          ...progress,
          {
            at: now,
            status: input.status,
            ...(input.note?.trim() ? { note: input.note.trim() } : {}),
            actor: actorSource(actor, displayName(actorUser, actorUserId(actor))),
          },
        ],
      }
      if (!isTerminalTaskMessageCardStatus(input.status)) return nextCard
      const { claim: _claim, capability: _capability, ...terminalCard } = nextCard
      return terminalCard
    })
    if (!found) {
      throw Object.assign(new Error('Task card not found'), { status: 404 })
    }

    return this.deps.messageService.updateMetadata(messageId, {
      ...metadata,
      cards: nextCards,
    })
  }

  async assertTaskCommandAccess(
    input: {
      messageId: string
      cardId: string
      claimId?: string
    },
    actor: Actor,
  ) {
    const message = await this.deps.messageDao.findById(input.messageId)
    if (!message) {
      throw Object.assign(new Error('Task message not found'), { status: 404 })
    }
    const access = await this.deps.policyService.requireChannelRead(actor, message.channelId)
    const metadata = (message.metadata ?? {}) as MessageMetadata
    const cards = Array.isArray(metadata.cards) ? metadata.cards : []
    const card = cards.find(
      (item): item is TaskMessageCardMetadata => isTaskCard(item) && item.id === input.cardId,
    )
    if (!card) {
      throw Object.assign(new Error('Task card not found'), { status: 404 })
    }
    await this.assertCanUseTaskCard(access, card, actor, 'update')
    if (!card.claim || claimExpired(card)) {
      throw Object.assign(new Error('Task card must have an active claim before calling apps'), {
        status: 403,
      })
    }
    if (input.claimId && input.claimId !== card.claim.id) {
      throw Object.assign(new Error('Task claim does not match this app call'), { status: 403 })
    }
    if (card.claim.actor.userId !== actorUserId(actor)) {
      throw Object.assign(new Error('Only the task claim holder can call apps for this task'), {
        status: 403,
      })
    }
    return {
      message,
      card,
      task: {
        messageId: message.id,
        cardId: card.id,
        claimId: card.claim.id,
        channelId: message.channelId,
        workspaceId: taskWorkspaceId(card) ?? null,
        scopes: card.capability?.scope ?? [],
      },
    }
  }

  async retryTaskCard(
    messageId: string,
    cardId: string,
    actor: Actor,
    input: { note?: string } = {},
  ) {
    const message = await this.deps.messageDao.findById(messageId)
    if (!message) {
      throw Object.assign(new Error('Message not found'), { status: 404 })
    }
    const access = await this.deps.policyService.requireChannelRead(actor, message.channelId)
    const metadata = (message.metadata ?? {}) as MessageMetadata
    const cards = Array.isArray(metadata.cards) ? metadata.cards : []
    const card = cards.find(
      (item): item is TaskMessageCardMetadata => isTaskCard(item) && item.id === cardId,
    )
    if (!card) {
      throw Object.assign(new Error('Task card not found'), { status: 404 })
    }
    await this.assertCanUseTaskCard(access, card, actor, 'retry')
    if (card.status !== 'failed') {
      throw Object.assign(new Error('Only failed task cards can be retried'), { status: 409 })
    }

    const channel = await this.deps.channelDao.findById(message.channelId)
    const agentId = card.assignee?.agentId ?? parseBuddyInboxAgentId(channel?.topic)
    if (!agentId) {
      throw Object.assign(new Error('Task card has no target Buddy'), { status: 400 })
    }
    const agent = await this.deps.agentDao.findById(agentId)
    if (!agent) {
      throw Object.assign(new Error('Buddy not found'), { status: 404 })
    }

    const actorUser = await this.deps.userDao.findById(actorUserId(actor))
    const now = new Date().toISOString()
    let found = false
    const nextCards = cards.map((item) => {
      if (!isTaskCard(item) || item.id !== cardId) return item
      found = true
      const {
        claim: _claim,
        capability: _capability,
        ...transferred
      } = {
        ...item,
        status: 'transferred' as const,
        updatedAt: now,
        progress: [
          ...(Array.isArray(item.progress) ? item.progress : []),
          {
            at: now,
            status: 'transferred' as const,
            note: input.note?.trim() || 'Retry requested; copied to a new task card.',
            actor: actorSource(actor, displayName(actorUser, actorUserId(actor))),
          },
        ],
      }
      return transferred
    })
    if (!found) {
      throw Object.assign(new Error('Task card not found'), { status: 404 })
    }

    const original = await this.deps.messageService.updateMetadata(messageId, {
      ...metadata,
      cards: nextCards,
    })
    const retry = await this.createTaskMessage(
      message.channelId,
      { id: agent.id, userId: agent.userId },
      {
        title: card.title,
        body: card.body,
        priority: card.priority,
        source: card.source,
        data: {
          ...(card.data ?? {}),
          retryOfMessageId: messageId,
          retryOfCardId: cardId,
          retryCreatedAt: now,
        },
      },
      actor,
    )
    return { original, retry }
  }
}
