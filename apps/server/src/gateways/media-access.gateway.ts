import type { ActorInput } from '../security/actor'
import type { MediaService } from '../services/media.service'

export class MediaAccessGateway {
  constructor(private deps: { mediaService: MediaService }) {}

  async createAttachmentReadUrl(input: {
    actor: ActorInput
    attachmentId: string
    disposition?: 'inline' | 'attachment'
  }) {
    return this.deps.mediaService.resolveAttachmentMediaUrl({
      actor: input.actor,
      attachmentId: input.attachmentId,
      disposition: input.disposition ?? 'attachment',
    })
  }

  verifySignedToken(token: string) {
    return this.deps.mediaService.verifySignedToken(token)
  }

  async getSignedObjectResponse(token: string, rangeHeader?: string) {
    const payload = this.verifySignedToken(token)
    return this.deps.mediaService.getSignedObjectResponse(payload, rangeHeader)
  }
}
