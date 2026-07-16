import type { TravelDataStore } from '../db/database.js'
import type { BuddyPlanDraft, CommunityShareRef, TripBuddyBinding } from '../types.js'

export class CommunityDao {
  constructor(private readonly db: TravelDataStore) {}

  listBuddyBindings(tripId: string) {
    return this.db.read((state) =>
      state.tripBuddyBindings.filter((item) => item.tripId === tripId && item.status === 'active'),
    )
  }

  upsertBuddyBinding(binding: TripBuddyBinding) {
    return this.db.write((state) => {
      const existing = state.tripBuddyBindings.findIndex(
        (item) => item.tripId === binding.tripId && item.agentId === binding.agentId,
      )
      if (existing >= 0) state.tripBuddyBindings[existing] = binding
      else state.tripBuddyBindings.push(binding)
      return binding
    })
  }

  revokeBuddyBinding(tripId: string, bindingId: string, updatedAt: string) {
    return this.db.write((state) => {
      const binding = state.tripBuddyBindings.find(
        (item) => item.tripId === tripId && item.id === bindingId,
      )
      if (!binding) return null
      binding.status = 'revoked'
      binding.updatedAt = updatedAt
      return binding
    })
  }

  listPlanDrafts(tripId: string) {
    return this.db.read((state) =>
      state.buddyPlanDrafts
        .filter((item) => item.tripId === tripId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    )
  }

  findPlanDraft(tripId: string, draftId: string) {
    return this.db.read(
      (state) =>
        state.buddyPlanDrafts.find((item) => item.tripId === tripId && item.id === draftId) ?? null,
    )
  }

  createPlanDraft(draft: BuddyPlanDraft) {
    return this.db.write((state) => {
      state.buddyPlanDrafts.push(draft)
      return draft
    })
  }

  updatePlanDraft(draft: BuddyPlanDraft) {
    return this.db.write((state) => {
      const index = state.buddyPlanDrafts.findIndex((item) => item.id === draft.id)
      if (index < 0) return null
      state.buddyPlanDrafts[index] = draft
      return draft
    })
  }

  createCommunityShare(ref: CommunityShareRef) {
    return this.db.write((state) => {
      state.communityShareRefs.push(ref)
      return ref
    })
  }

  updateCommunityShare(id: string, updater: (ref: CommunityShareRef) => CommunityShareRef) {
    return this.db.write((state) => {
      const index = state.communityShareRefs.findIndex((item) => item.id === id)
      if (index < 0) return null
      const next = updater(state.communityShareRefs[index]!)
      state.communityShareRefs[index] = next
      return next
    })
  }

  listCommunityShares(tripId: string) {
    return this.db.read((state) =>
      state.communityShareRefs.filter((item) => item.tripId === tripId),
    )
  }
}
