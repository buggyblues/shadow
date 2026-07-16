import type { TravelDataStore } from '../db/database.js'
import type { AttachmentRef } from '../types.js'

export class AttachmentDao {
  constructor(private readonly db: TravelDataStore) {}

  listAttachments(tripId: string, subjectType?: string, subjectId?: string) {
    return this.db.read((state) =>
      state.attachments
        .filter((attachment) => attachment.tripId === tripId)
        .filter((attachment) => !subjectType || attachment.subjectType === subjectType)
        .filter((attachment) => !subjectId || attachment.subjectId === subjectId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    )
  }

  findAttachment(attachmentId: string) {
    return this.db.read(
      (state) => state.attachments.find((attachment) => attachment.id === attachmentId) ?? null,
    )
  }

  createAttachment(attachment: AttachmentRef) {
    return this.db.write((state) => {
      state.attachments.push(attachment)
      return attachment
    })
  }

  deleteAttachment(attachmentId: string) {
    return this.db.write((state) => {
      const attachment = state.attachments.find((item) => item.id === attachmentId) ?? null
      state.attachments = state.attachments.filter((item) => item.id !== attachmentId)
      return attachment
    })
  }
}
