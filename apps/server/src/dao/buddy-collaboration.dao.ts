import { and, eq, lt, sql } from 'drizzle-orm'
import type { Database } from '../db'
import { buddyCollaborations } from '../db/schema'

export type BuddyCollaborationClaimReason =
  | 'busy'
  | 'duplicate'
  | 'policy_denied'
  | 'limit_reached'
  | 'stopped'

type BuddyCollaborationRecord = typeof buddyCollaborations.$inferSelect

export type BuddyCollaborationClaimResult =
  | {
      ok: true
      collaboration: BuddyCollaborationRecord
    }
  | {
      ok: false
      reason: BuddyCollaborationClaimReason
      collaboration?: BuddyCollaborationRecord | null
    }

export class BuddyCollaborationDao {
  constructor(private deps: { db: Database }) {}

  private get db() {
    return this.deps.db
  }

  async findByRoot(channelId: string, rootMessageId: string) {
    const result = await this.db
      .select()
      .from(buddyCollaborations)
      .where(
        and(
          eq(buddyCollaborations.channelId, channelId),
          eq(buddyCollaborations.rootMessageId, rootMessageId),
        ),
      )
      .limit(1)
    return result[0] ?? null
  }

  async findById(id: string) {
    const result = await this.db
      .select()
      .from(buddyCollaborations)
      .where(eq(buddyCollaborations.id, id))
      .limit(1)
    return result[0] ?? null
  }

  async claim(input: {
    channelId: string
    rootMessageId: string
    buddyId: string
    replyToMessageId: string
    maxTurns: number
    ttlMs: number
    mode?: 'initial' | 'conversation'
    mentionedBuddyIds?: string[]
  }): Promise<BuddyCollaborationClaimResult> {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + input.ttlMs)
    const mode = input.mode ?? 'conversation'
    const mentionedBuddyIds = uniqueStrings(input.mentionedBuddyIds ?? [])
    const initialTurnLimit = Math.min(input.maxTurns, Math.max(mentionedBuddyIds.length, 1))

    await this.db
      .insert(buddyCollaborations)
      .values({
        channelId: input.channelId,
        rootMessageId: input.rootMessageId,
        mode,
        state: 'open',
        participants: [],
        mentionedBuddyIds,
        turn: 0,
        maxTurns: input.maxTurns,
        expiresAt,
      })
      .onConflictDoNothing()

    const updated = await this.db
      .update(buddyCollaborations)
      .set({
        activeBuddyId: input.buddyId,
        participants: sql`CASE
          WHEN ${buddyCollaborations.participants} ? ${input.buddyId}::text
          THEN ${buddyCollaborations.participants}
          ELSE ${buddyCollaborations.participants} || jsonb_build_array(${input.buddyId}::text)
        END`,
        turn: sql`${buddyCollaborations.turn} + 1`,
        maxTurns: input.maxTurns,
        lastMessageId: input.replyToMessageId,
        expiresAt,
        updatedAt: now,
      })
      .where(
        and(
          eq(buddyCollaborations.channelId, input.channelId),
          eq(buddyCollaborations.rootMessageId, input.rootMessageId),
          eq(buddyCollaborations.state, 'open'),
          mode === 'initial'
            ? lt(buddyCollaborations.turn, initialTurnLimit)
            : lt(buddyCollaborations.turn, input.maxTurns),
          sql`(${buddyCollaborations.expiresAt} IS NULL OR ${buddyCollaborations.expiresAt} > NOW())`,
          mode === 'initial'
            ? sql`NOT (${buddyCollaborations.participants} ? ${input.buddyId}::text)`
            : sql`(${buddyCollaborations.activeBuddyId} IS NULL OR ${buddyCollaborations.activeBuddyId} <> ${input.buddyId}::uuid)`,
          mode === 'initial' && mentionedBuddyIds.length > 0
            ? sql`${buddyCollaborations.mentionedBuddyIds} ? ${input.buddyId}::text`
            : sql`TRUE`,
          mode === 'conversation'
            ? sql`${buddyCollaborations.participants} ? ${input.buddyId}::text`
            : sql`TRUE`,
        ),
      )
      .returning()

    if (updated[0]) {
      return { ok: true, collaboration: updated[0] }
    }

    const existing = await this.findByRoot(input.channelId, input.rootMessageId)
    if (!existing) return { ok: false, reason: 'busy', collaboration: null }
    if (existing.state !== 'open') {
      return { ok: false, reason: 'stopped', collaboration: existing }
    }
    if (existing.expiresAt && existing.expiresAt <= now) {
      return { ok: false, reason: 'stopped', collaboration: existing }
    }
    const existingParticipants = Array.isArray(existing.participants) ? existing.participants : []
    const existingMentionedBuddyIds = Array.isArray(existing.mentionedBuddyIds)
      ? existing.mentionedBuddyIds
      : []
    if (
      mode === 'initial' &&
      existingMentionedBuddyIds.length > 0 &&
      !existingMentionedBuddyIds.includes(input.buddyId)
    ) {
      return { ok: false, reason: 'policy_denied', collaboration: existing }
    }
    if (mode === 'initial' && existingParticipants.includes(input.buddyId)) {
      return { ok: false, reason: 'duplicate', collaboration: existing }
    }
    if (
      mode === 'initial' &&
      existing.turn >=
        Math.min(existing.maxTurns, input.maxTurns, Math.max(existingMentionedBuddyIds.length, 1))
    ) {
      return { ok: false, reason: 'limit_reached', collaboration: existing }
    }
    if (existing.turn >= Math.min(existing.maxTurns, input.maxTurns)) {
      return { ok: false, reason: 'limit_reached', collaboration: existing }
    }
    if (existing.activeBuddyId === input.buddyId) {
      return { ok: false, reason: 'duplicate', collaboration: existing }
    }
    if (mode === 'conversation' && !existingParticipants.includes(input.buddyId)) {
      return { ok: false, reason: 'policy_denied', collaboration: existing }
    }
    return { ok: false, reason: 'busy', collaboration: existing }
  }

  async setThreadId(input: {
    channelId: string
    rootMessageId: string
    threadId: string
  }): Promise<BuddyCollaborationRecord | null> {
    const result = await this.db
      .update(buddyCollaborations)
      .set({
        threadId: input.threadId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(buddyCollaborations.channelId, input.channelId),
          eq(buddyCollaborations.rootMessageId, input.rootMessageId),
        ),
      )
      .returning()
    return result[0] ?? null
  }
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.length > 0))]
}
