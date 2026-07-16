import type { AttachmentDao } from '../dao/attachment.dao.js'
import type { ShadowGateway } from '../gateways/shadow.gateway.js'
import { notFound } from '../lib/errors.js'
import { createId } from '../lib/id.js'
import { nowIso } from '../lib/time.js'
import type { AttachmentRef, RequestContext } from '../types.js'
import type { CreateAttachmentInput } from '../validators/travel.schema.js'

function withoutContent({ contentBase64: _contentBase64, ...attachment }: AttachmentRef) {
  return attachment
}

export class AttachmentService {
  constructor(
    private readonly attachmentDao: AttachmentDao,
    private readonly shadowGateway: ShadowGateway,
  ) {}

  async listAttachments(tripId: string, subjectType?: string, subjectId?: string) {
    const attachments = await this.attachmentDao.listAttachments(tripId, subjectType, subjectId)
    return attachments.map(withoutContent)
  }

  async createAttachment(
    ctx: RequestContext,
    tripId: string,
    input: CreateAttachmentInput,
    createdByMemberId?: string,
  ) {
    const workspaceRef = await this.shadowGateway.createWorkspaceFileRef(ctx, input)
    const attachment: AttachmentRef = {
      id: createId('file'),
      tripId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      workspaceNodeId: workspaceRef.workspaceNodeId,
      fileName: workspaceRef.fileName,
      mimeType: workspaceRef.mimeType,
      sizeBytes: workspaceRef.sizeBytes,
      label: input.label,
      createdByMemberId,
      createdAt: nowIso(),
      contentBase64: input.fileBase64,
    }
    return withoutContent(await this.attachmentDao.createAttachment(attachment))
  }

  async getAttachmentContent(tripId: string, attachmentId: string) {
    const attachment = await this.attachmentDao.findAttachment(attachmentId)
    if (!attachment || attachment.tripId !== tripId || !attachment.contentBase64) {
      throw notFound('Attachment content')
    }
    return {
      attachment,
      bytes: Buffer.from(attachment.contentBase64, 'base64'),
    }
  }

  async deleteAttachment(tripId: string, attachmentId: string) {
    const current = (await this.attachmentDao.listAttachments(tripId)).find(
      (item) => item.id === attachmentId,
    )
    if (!current) throw notFound('Attachment')
    const deleted = await this.attachmentDao.deleteAttachment(attachmentId)
    return deleted ? withoutContent(deleted) : deleted
  }
}
