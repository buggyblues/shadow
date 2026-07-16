import type { CollaborationDao } from '../dao/collaboration.dao.js'
import { notFound } from '../lib/errors.js'
import { createId, createPublicToken, hashToken } from '../lib/id.js'
import { nowIso } from '../lib/time.js'
import type { DecisionRef, DiscussionRef, ShareLink } from '../types.js'
import type {
  CreateDecisionRefInput,
  CreateDiscussionRefInput,
  CreateShareLinkInput,
} from '../validators/travel.schema.js'

export class CollaborationService {
  constructor(private readonly collaborationDao: CollaborationDao) {}

  listShareLinks(tripId: string) {
    return this.collaborationDao
      .listShareLinks(tripId)
      .then((links) => links.map(({ tokenHash: _tokenHash, ...link }) => link))
  }

  async createShareLink(tripId: string, input: CreateShareLinkInput, createdByMemberId?: string) {
    const token = createPublicToken()
    const link: ShareLink = {
      id: createId('share'),
      tripId,
      tokenHash: hashToken(token),
      mode: input.mode,
      allowedSections: input.allowedSections,
      expiresAt: input.expiresAt,
      createdByMemberId,
      createdAt: nowIso(),
    }
    const saved = await this.collaborationDao.createShareLink(link)
    const { tokenHash: _tokenHash, ...safeLink } = saved
    return { link: safeLink, token }
  }

  async revokeShareLink(linkId: string) {
    const link = await this.collaborationDao.revokeShareLink(linkId, nowIso())
    if (!link) throw notFound('Share link')
    const { tokenHash: _tokenHash, ...safeLink } = link
    return safeLink
  }

  findShareLinkByToken(token: string) {
    return this.collaborationDao.findShareLinkByHash(hashToken(token))
  }

  listDiscussionRefs(tripId: string) {
    return this.collaborationDao.listDiscussionRefs(tripId)
  }

  createDiscussionRef(tripId: string, input: CreateDiscussionRefInput) {
    const ref: DiscussionRef = {
      id: createId('discussion'),
      tripId,
      channelId: input.channelId,
      messageId: input.messageId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      title: input.title,
      createdAt: nowIso(),
    }
    return this.collaborationDao.createDiscussionRef(ref)
  }

  listDecisionRefs(tripId: string) {
    return this.collaborationDao.listDecisionRefs(tripId)
  }

  createDecisionRef(tripId: string, input: CreateDecisionRefInput) {
    const ref: DecisionRef = {
      id: createId('decision'),
      tripId,
      decision: input.decision,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      messageId: input.messageId,
      status: input.status,
      decidedByMemberId: input.decidedByMemberId,
      createdAt: nowIso(),
    }
    return this.collaborationDao.createDecisionRef(ref)
  }
}
