import {
  type ShadowSpaceAppCommandContext,
  type ShadowSpaceAppLaunchIntrospection,
  shadowSpaceAppIdentitySnapshot,
} from '@shadowob/sdk'
import type { ActorRef, RequestContext } from '../types.js'
import {
  type TravelOAuthSession,
  travelLocalActorAllowed,
  travelOAuthAccessStatus,
  travelOAuthConfig,
  travelOAuthRequired,
} from './oauth.js'

function defaultAuth() {
  const config = travelOAuthConfig()
  const required = travelOAuthRequired()
  const localAllowed = travelLocalActorAllowed()
  return {
    authenticated: !required && localAllowed,
    launchAuthenticated: false,
    oauthAuthenticated: false,
    oauthConfigured: config.configured,
    oauthRequired: required,
    reason: required || !localAllowed ? 'oauth_required' : null,
  }
}

function actorRefFromShadowActor(actor: ShadowSpaceAppCommandContext['actor']): ActorRef {
  const profile = actor.profile
  const id = actor.buddyAgentId ?? actor.userId ?? actor.ownerId ?? profile?.id ?? 'unknown'
  const displayName =
    profile?.displayName ??
    profile?.username ??
    (actor.buddyAgentId ? `Buddy ${actor.buddyAgentId}` : id)
  const identity = shadowSpaceAppIdentitySnapshot({
    kind: actor.buddyAgentId ? 'buddy' : actor.kind,
    id,
    userId: actor.userId ?? null,
    buddyAgentId: actor.buddyAgentId ?? null,
    ownerId: actor.ownerId ?? null,
    displayName,
    avatarUrl: profile?.avatarUrl ?? null,
  })
  return {
    kind: identity.subjectKind === 'buddy' ? 'buddy' : actor.kind,
    id: identity.id,
    userId: identity.userId,
    ownerId: identity.ownerId,
    buddyId: identity.buddyAgentId,
    username: profile?.username ?? null,
    displayName: identity.displayName,
    avatarUrl: identity.avatarUrl,
    subjectKind: identity.subjectKind,
    stableKey: identity.stableKey,
  }
}

function actorRefFromOAuthSession(session: TravelOAuthSession): ActorRef {
  const profile = session.profile
  const identity = shadowSpaceAppIdentitySnapshot({
    kind: 'user',
    id: profile.id,
    userId: profile.id,
    buddyAgentId: null,
    ownerId: profile.id,
    displayName: profile.displayName ?? profile.username ?? profile.id,
    avatarUrl: profile.avatarUrl ?? null,
  })
  return {
    kind: 'user',
    id: identity.id,
    userId: identity.userId,
    ownerId: identity.ownerId,
    username: profile.username ?? null,
    displayName: identity.displayName,
    avatarUrl: identity.avatarUrl,
    subjectKind: identity.subjectKind,
    stableKey: identity.stableKey,
  }
}

export function localActor(): ActorRef {
  return {
    kind: 'local',
    id: 'local-user',
    userId: 'local-user',
    ownerId: 'local-user',
    displayName: 'Local user',
    subjectKind: 'local',
    stableKey: 'local:local-user',
  }
}

export function requestContextFromHeaders(input: {
  headers: Headers
  requestId: string
  startedAt: string
}): RequestContext {
  const actor = localActor()
  return {
    requestId: input.requestId,
    serverId: 'local-server',
    actor,
    startedAt: input.startedAt,
    local: actor.kind === 'local',
    auth: defaultAuth(),
    launch: null,
  }
}

export function requestContextFromOAuthSession(input: {
  session: TravelOAuthSession
  requestId: string
  startedAt: string
  serverId?: string
}): RequestContext {
  const config = travelOAuthConfig()
  const launchActor = input.session.launchActor
  const actor = launchActor
    ? actorRefFromShadowActor({
        kind: launchActor.kind,
        userId: launchActor.userId ?? null,
        buddyAgentId: launchActor.buddyAgentId ?? null,
        ownerId: launchActor.ownerId ?? null,
        profile: input.session.profile,
      })
    : actorRefFromOAuthSession(input.session)
  const bound = Boolean(input.session.serverId)
  const context: RequestContext = {
    requestId: input.requestId,
    serverId: input.serverId ?? input.session.serverId ?? 'unbound',
    actor,
    startedAt: input.startedAt,
    local: false,
    auth: {
      authenticated: bound,
      launchAuthenticated: bound && input.session.authSource === 'launch',
      oauthAuthenticated: bound && input.session.authSource === 'oauth',
      oauthConfigured: config.configured,
      oauthRequired: travelOAuthRequired(),
      reason: bound ? null : 'space_required',
    },
    launch:
      input.session.authSource === 'launch'
        ? {
            spaceAppId: input.session.spaceAppId ?? null,
            appKey: input.session.appKey ?? null,
            channelId: input.session.channelId ?? null,
          }
        : null,
  }
  if (context.launch && input.session.launchToken) {
    Object.defineProperty(context.launch, 'token', {
      value: input.session.launchToken,
      enumerable: false,
      configurable: false,
      writable: false,
    })
  }
  return context
}

export function requestContextFromLaunchIntrospection(input: {
  launch: ShadowSpaceAppLaunchIntrospection
  launchToken?: string | null
  session: TravelOAuthSession | null
  requestId: string
  startedAt: string
}): RequestContext | null {
  const shadow = input.launch.active ? input.launch.shadow : null
  if (!shadow) return null
  const config = travelOAuthConfig()
  const access = travelOAuthAccessStatus({
    configured: config.configured,
    required: travelOAuthRequired(),
    session: input.session,
    launch: input.launch,
  })
  const context: RequestContext = {
    requestId: input.requestId,
    serverId: shadow.serverId,
    actor:
      access.oauthAuthenticated && input.session
        ? actorRefFromOAuthSession(input.session)
        : actorRefFromShadowActor(shadow.actor),
    startedAt: input.startedAt,
    local: false,
    auth: {
      authenticated: access.authenticated,
      launchAuthenticated: access.launchAuthenticated,
      oauthAuthenticated: access.oauthAuthenticated,
      oauthConfigured: access.configured,
      oauthRequired: access.required,
      reason: access.reason,
    },
    launch: {
      spaceAppId: shadow.spaceAppId ?? null,
      appKey: shadow.appKey,
      channelId: shadow.channelId ?? null,
    },
  }
  if (input.launchToken) {
    Object.defineProperty(context.launch, 'token', {
      value: input.launchToken,
      enumerable: false,
      configurable: false,
      writable: false,
    })
  }
  return context
}

export function requestContextFromCommandContext(input: {
  context: ShadowSpaceAppCommandContext
  session: TravelOAuthSession | null
  requestId: string
  startedAt: string
}): RequestContext {
  const launch: ShadowSpaceAppLaunchIntrospection = {
    active: true,
    shadow: {
      ...input.context,
      serverId: input.context.serverId,
      spaceAppId: input.context.spaceAppId,
      appKey: input.context.appKey,
      actor: input.context.actor,
    },
  }
  const resolved = requestContextFromLaunchIntrospection({
    launch,
    session: input.session,
    requestId: input.requestId,
    startedAt: input.startedAt,
  })
  if (!resolved) {
    return requestContextFromHeaders({
      headers: new Headers(),
      requestId: input.requestId,
      startedAt: input.startedAt,
    })
  }
  return resolved
}
