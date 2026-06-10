import type { BoardPerson } from '../types.js'
import type { KanbanOAuthSession, listBuddyInboxes } from './api.js'
import { t } from './i18n.js'
import type { ReactSelectOption } from './react-select.js'

export type BuddyInbox = Awaited<ReturnType<typeof listBuddyInboxes>>['inboxes'][number]

export type BuddySelectOption = ReactSelectOption & {
  id: string
  avatarUrl?: string | null
  status?: string | null
  userId?: string | null
  agentId?: string | null
}

export type BuddyIdentity = {
  id: string
  label: string
  avatarUrl?: string | null
  status?: string | null
  userId?: string | null
  agentId?: string | null
}

export type BuddyDirectory = {
  byAgentId: Map<string, BuddyIdentity>
  byPersonId: Map<string, BuddyIdentity>
  byUserId: Map<string, BuddyIdentity>
}

export type UserIdentityInput = NonNullable<KanbanOAuthSession['profile']>

export function buddyLabel(inbox: BuddyInbox) {
  return inbox.agent.user?.displayName?.trim() || inbox.agent.user?.username || inbox.agent.id
}

export function requestTitle(body: string) {
  const firstLine = body
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)
  return (firstLine ?? t('card.defaultTitle')).slice(0, 96)
}

export function shortId(value: string | undefined | null) {
  if (!value) return 'local'
  if (value.length <= 18) return value
  return `${value.slice(0, 8)}...${value.slice(-6)}`
}

export function oauthProfileLabel(profile: NonNullable<KanbanOAuthSession['profile']>) {
  return profile.displayName?.trim() || profile.username || profile.id
}

export function launchActorLabel(actor: NonNullable<KanbanOAuthSession['launch']>['actor']) {
  if (actor.displayName?.trim()) return actor.displayName
  if (actor.buddyAgentId) return t('session.buddyActor', { id: shortId(actor.buddyAgentId) })
  if (actor.userId) return shortId(actor.userId)
  return actor.kind
}

export function buddyOption(inbox: BuddyInbox): BuddySelectOption {
  return {
    id: inbox.agent.id,
    value: inbox.agent.id,
    label: buddyLabel(inbox),
    avatarUrl: inbox.agent.user?.avatarUrl ?? null,
    userId: inbox.agent.user?.id ?? inbox.agent.id,
    status: inbox.agent.status ?? null,
    agentId: inbox.agent.id,
  }
}

export function avatarColor(seed: string) {
  const colors = ['#172b4d', '#0f766e', '#7c3aed', '#b45309', '#be123c', '#1d4ed8', '#15803d']
  let hash = 0
  for (const char of seed) hash = (hash * 33 + char.charCodeAt(0)) % 100_003
  return colors[hash % colors.length]!
}

export function normalizeBuddyStatus(status?: string | null) {
  if (status === 'running') return 'online'
  if (
    status === 'online' ||
    status === 'busy' ||
    status === 'idle' ||
    status === 'offline' ||
    status === 'dnd'
  ) {
    return status
  }
  return 'offline'
}

function identityFromInbox(inbox: BuddyInbox): BuddyIdentity {
  return {
    id: inbox.agent.id,
    agentId: inbox.agent.id,
    userId: inbox.agent.user?.id ?? inbox.agent.id,
    label: buddyLabel(inbox),
    avatarUrl: inbox.agent.user?.avatarUrl ?? null,
    status: inbox.agent.status ?? null,
  }
}

function identityFromUser(profile: UserIdentityInput): BuddyIdentity {
  const label = oauthProfileLabel(profile)
  return {
    id: `user:${profile.id}`,
    userId: profile.id,
    label,
    avatarUrl: profile.avatarUrl ?? null,
    status: 'online',
  }
}

function addUserIdentity(directory: BuddyDirectory, profile: UserIdentityInput | null | undefined) {
  if (!profile?.id) return
  const identity = identityFromUser(profile)
  directory.byUserId.set(profile.id, identity)
  directory.byPersonId.set(profile.id, identity)
  directory.byPersonId.set(`user:${profile.id}`, identity)
}

export function buildBuddyDirectory(
  inboxes: BuddyInbox[] | undefined,
  users: Array<UserIdentityInput | null | undefined> = [],
): BuddyDirectory {
  const byAgentId = new Map<string, BuddyIdentity>()
  const byPersonId = new Map<string, BuddyIdentity>()
  const byUserId = new Map<string, BuddyIdentity>()
  const directory = { byAgentId, byPersonId, byUserId }
  for (const inbox of inboxes ?? []) {
    const identity = identityFromInbox(inbox)
    if (identity.agentId) {
      byAgentId.set(identity.agentId, identity)
      byPersonId.set(`buddy:${identity.agentId}`, identity)
    }
    if (identity.userId) byUserId.set(identity.userId, identity)
  }
  for (const user of users) addUserIdentity(directory, user)
  return directory
}

export function resolvePersonIdentity(
  person: BoardPerson,
  directory: BuddyDirectory,
): BuddyIdentity {
  const live =
    (person.buddyAgentId ? directory.byAgentId.get(person.buddyAgentId) : undefined) ??
    (person.userId ? directory.byUserId.get(person.userId) : undefined) ??
    directory.byPersonId.get(person.id)
  return {
    id: person.id,
    agentId: person.buddyAgentId ?? live?.agentId ?? null,
    userId: person.userId ?? live?.userId ?? null,
    label:
      live?.label ??
      (person.displayName && !person.displayName.startsWith('user:')
        ? person.displayName
        : person.userId
          ? shortId(person.userId)
          : person.displayName),
    avatarUrl: live?.avatarUrl ?? person.avatarUrl ?? null,
    status: live?.status ?? (person.buddyAgentId ? 'offline' : null),
  }
}

export function labelInitials(label: string) {
  const result = label
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
  return result || '?'
}

export function labelClass(label: string) {
  return `label-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}
