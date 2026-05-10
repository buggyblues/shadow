import { randomBytes } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { WorkspaceNodeDao } from '../dao/workspace-node.dao'
import type { Database } from '../db'
import { paidFileGrants } from '../db/schema'
import { apiError } from '../lib/api-error'
import type { EntitlementAccessService } from './entitlement-access.service'
import type { MediaService } from './media.service'

const DEFAULT_GRANT_SECONDS = 5 * 60

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export class PaidFileService {
  constructor(
    private deps: {
      db: Database
      workspaceNodeDao: WorkspaceNodeDao
      entitlementAccessService: EntitlementAccessService
      mediaService: MediaService
    },
  ) {}

  private get db() {
    return this.deps.db
  }

  private async getFileOrThrow(fileId: string) {
    const node = await this.deps.workspaceNodeDao.findById(fileId)
    if (!node || node.kind !== 'file') throw apiError('PAID_FILE_NOT_FOUND', 404)
    return node
  }

  private async findViewerEntitlement(userId: string, fileId: string) {
    const access = await this.deps.entitlementAccessService.checkResourceAccess({
      userId,
      resourceType: 'workspace_file',
      resourceId: fileId,
      capabilities: ['view', 'use'],
    })
    return access.entitlement
  }

  async getFileState(userId: string, fileId: string) {
    const node = await this.getFileOrThrow(fileId)
    const entitlement = await this.findViewerEntitlement(userId, fileId)
    const flags = asRecord(node.flags)
    return {
      file: {
        id: node.id,
        name: node.name,
        mime: node.mime,
        sizeBytes: node.sizeBytes,
        previewUrl: node.previewUrl,
        paywalled: flags.paywall === true || flags.paidFile === true,
      },
      entitlement: entitlement
        ? {
            id: entitlement.id,
            status: entitlement.status,
            expiresAt: entitlement.expiresAt,
            capability: entitlement.capability,
          }
        : null,
      hasAccess: Boolean(entitlement),
    }
  }

  async openPaidFile(userId: string, fileId: string) {
    await this.getFileOrThrow(fileId)
    const entitlement = await this.findViewerEntitlement(userId, fileId)
    if (!entitlement) throw apiError('PAID_FILE_ENTITLEMENT_REQUIRED', 403)

    const token = randomBytes(24).toString('base64url')
    const expiresAt = new Date(Date.now() + DEFAULT_GRANT_SECONDS * 1000)
    const [grant] = await this.db
      .insert(paidFileGrants)
      .values({
        fileId,
        userId,
        entitlementId: entitlement.id,
        expiresAt,
        metadata: { token },
      })
      .returning()
    if (!grant) throw apiError('PAID_FILE_GRANT_CREATE_FAILED', 500)
    return {
      grant: {
        id: grant.id,
        fileId: grant.fileId,
        status: grant.status,
        expiresAt: grant.expiresAt,
      },
      grantToken: token,
      viewerUrl: `/api/paid-files/${fileId}/view/${grant.id}`,
    }
  }

  async readGrantFile(input: { fileId: string; grantId: string; token?: string | null }) {
    const [grant] = await this.db
      .select()
      .from(paidFileGrants)
      .where(and(eq(paidFileGrants.id, input.grantId), eq(paidFileGrants.fileId, input.fileId)))
      .limit(1)
    if (!grant) throw apiError('PAID_FILE_GRANT_NOT_FOUND', 404)

    const metadata = asRecord(grant.metadata)
    if (typeof metadata.token !== 'string' || metadata.token !== input.token) {
      throw apiError('PAID_FILE_GRANT_INVALID', 403)
    }
    if (grant.status !== 'active' || grant.expiresAt.getTime() <= Date.now()) {
      if (grant.status === 'active') {
        await this.db
          .update(paidFileGrants)
          .set({ status: 'expired', updatedAt: new Date() })
          .where(eq(paidFileGrants.id, grant.id))
      }
      throw apiError('PAID_FILE_GRANT_EXPIRED', 403)
    }

    const access = await this.deps.entitlementAccessService.checkResourceAccess({
      userId: grant.userId,
      resourceType: 'workspace_file',
      resourceId: input.fileId,
      capabilities: ['view', 'use'],
    })
    if (!access.allowed || access.entitlement?.id !== grant.entitlementId) {
      throw apiError('PAID_FILE_ENTITLEMENT_REQUIRED', 403)
    }

    const node = await this.getFileOrThrow(input.fileId)
    if (!node.contentRef) throw apiError('PAID_FILE_CONTENT_MISSING', 404)
    const buffer = await this.deps.mediaService.getFileBuffer(node.contentRef)
    if (!buffer) throw apiError('PAID_FILE_CONTENT_MISSING', 404)
    return {
      file: node,
      buffer,
    }
  }
}
