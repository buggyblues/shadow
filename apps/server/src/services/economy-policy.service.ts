import { eq } from 'drizzle-orm'
import type { Database } from '../db'
import { users } from '../db/schema'
import { type Actor, actorHasScope, actorUserId } from '../security/actor'

export type EconomyAction =
  | 'wallet.read'
  | 'recharge.create'
  | 'recharge.webhook'
  | 'order.purchase'
  | 'offer.purchase'
  | 'wallet.refund'
  | 'wallet.adjust'
  | 'fulfillment.process'
  | 'settlement.process'
  | string

export type EconomyDataClass = 'public' | 'commercial' | 'financial' | 'restricted' | 'secret'

export type EconomyPolicyInput = {
  actor: Actor
  action: EconomyAction
  resource: { kind: string; id?: string | null }
  scope?: { kind: string; id?: string | null }
  dataClass: EconomyDataClass
  requiredScope?: string
  targetUserId?: string | null
}

function isWriteAction(action: string) {
  return !action.endsWith('.read') && action !== 'wallet.read'
}

function economyScopeForAction(action: string) {
  if (action === 'wallet.read') return 'economy:wallet:read'
  if (action === 'order.purchase' || action === 'offer.purchase') return 'economy:orders:write'
  if (action === 'recharge.create') return 'economy:recharge:write'
  if (action === 'wallet.refund') return 'economy:refunds:write'
  if (action === 'wallet.adjust') return 'economy:admin:adjust'
  if (action === 'fulfillment.process') return 'economy:fulfillment:write'
  if (action === 'settlement.process') return 'economy:settlements:write'
  if (
    action === 'asset.grant' ||
    action === 'asset.lock' ||
    action === 'asset.unlock' ||
    action === 'asset.transfer' ||
    action === 'asset.consume' ||
    action === 'asset.revoke' ||
    action === 'asset.expire' ||
    action === 'asset.definition.create' ||
    action === 'asset.definition.update'
  ) {
    return 'economy:assets:write'
  }
  if (action === 'tip.send') return 'economy:tips:write'
  if (action === 'gift.send') return 'economy:gifts:write'
  return `economy:${action.replaceAll('.', ':')}`
}

export class EconomyPolicyService {
  constructor(private deps: { db: Database }) {}

  private async getUserEconomyStatus(userId: string) {
    const rows = await this.deps.db
      .select({ economyStatus: users.economyStatus, isAdmin: users.isAdmin })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    return rows[0] ?? null
  }

  async authorize(input: EconomyPolicyInput) {
    const requiredScope = input.requiredScope ?? economyScopeForAction(input.action)

    if (input.actor.kind === 'system') {
      if (!actorHasScope(input.actor, requiredScope)) {
        throw Object.assign(new Error(`Requires capability: ${requiredScope}`), {
          status: 403,
          code: 'ECONOMY_SCOPE_REQUIRED',
          scope: requiredScope,
        })
      }
      return { ok: true as const, requiredScope }
    }

    if (['agent', 'oauth', 'pat'].includes(input.actor.kind) && isWriteAction(input.action)) {
      if (!actorHasScope(input.actor, requiredScope)) {
        throw Object.assign(new Error(`Requires economy scope: ${requiredScope}`), {
          status: 403,
          code: 'ECONOMY_SCOPE_REQUIRED',
          scope: requiredScope,
        })
      }
    }

    const userId = actorUserId(input.actor)
    const user = await this.getUserEconomyStatus(userId)
    if (!user) {
      throw Object.assign(new Error('Economy actor not found'), {
        status: 403,
        code: 'ECONOMY_ACTOR_NOT_FOUND',
      })
    }

    if (isWriteAction(input.action) && user.economyStatus !== 'normal') {
      throw Object.assign(new Error('Economy actions are restricted for this user'), {
        status: 403,
        code: 'ECONOMY_USER_RESTRICTED',
        economyStatus: user.economyStatus,
      })
    }

    if (
      input.action === 'wallet.adjust' &&
      !user.isAdmin &&
      !actorHasScope(input.actor, requiredScope)
    ) {
      throw Object.assign(new Error('Platform admin capability is required'), {
        status: 403,
        code: 'ECONOMY_ADMIN_REQUIRED',
        scope: requiredScope,
      })
    }

    return { ok: true as const, requiredScope }
  }
}
