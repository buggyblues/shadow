import type { TravelDataStore } from '../db/database.js'
import type { DecisionRef, DiscussionRef, ShareLink } from '../types.js'

export class CollaborationDao {
  constructor(private readonly db: TravelDataStore) {}

  listShareLinks(tripId: string) {
    return this.db.read((state) =>
      state.shareLinks
        .filter((link) => link.tripId === tripId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    )
  }

  createShareLink(link: ShareLink) {
    return this.db.write((state) => {
      state.shareLinks.push(link)
      return link
    })
  }

  revokeShareLink(linkId: string, revokedAt: string) {
    return this.db.write((state) => {
      const link = state.shareLinks.find((item) => item.id === linkId)
      if (!link) return null
      link.revokedAt = revokedAt
      return link
    })
  }

  findShareLinkByHash(tokenHash: string) {
    return this.db.read(
      (state) => state.shareLinks.find((link) => link.tokenHash === tokenHash) ?? null,
    )
  }

  listDiscussionRefs(tripId: string) {
    return this.db.read((state) =>
      state.discussionRefs
        .filter((ref) => ref.tripId === tripId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    )
  }

  createDiscussionRef(ref: DiscussionRef) {
    return this.db.write((state) => {
      const matchesSubject = (item: DiscussionRef) =>
        item.tripId === ref.tripId &&
        item.subjectType === ref.subjectType &&
        item.subjectId === ref.subjectId
      const current = state.discussionRefs.find(matchesSubject)
      if (!current) {
        state.discussionRefs.push(ref)
        return ref
      }
      Object.assign(current, { ...ref, id: current.id })
      state.discussionRefs = state.discussionRefs.filter(
        (item) => item === current || !matchesSubject(item),
      )
      return current
    })
  }

  listDecisionRefs(tripId: string) {
    return this.db.read((state) =>
      state.decisionRefs
        .filter((ref) => ref.tripId === tripId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    )
  }

  createDecisionRef(ref: DecisionRef) {
    return this.db.write((state) => {
      state.decisionRefs.push(ref)
      return ref
    })
  }
}
