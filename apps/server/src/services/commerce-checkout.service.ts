import type { WorkspaceNodeDao } from '../dao/workspace-node.dao'
import { apiError } from '../lib/api-error'
import type { CommerceOfferService } from './commerce-offer.service'
import type { EntitlementAccessService } from './entitlement-access.service'
import { resolveProductEntitlementResource } from './entitlement-resource'
import type { WalletService } from './wallet.service'

const PAID_FILE_ACCESS_CAPABILITIES = ['view', 'use', 'download']

function addDaysLabelSeconds(seconds?: number | null) {
  return seconds ?? null
}

function primaryAction(input: { viewerState: string; paidFileId: string | null }) {
  if (input.viewerState === 'unavailable') return 'unavailable'
  if (input.viewerState === 'active') return input.paidFileId ? 'open_content' : 'view_detail'
  if (input.viewerState === 'expired') return 'renew'
  if (input.viewerState === 'not_purchased') return 'purchase'
  return 'view_detail'
}

function legacyNextAction(input: { action: string; paidFileId: string | null }) {
  if (input.action === 'open_content' && input.paidFileId) return 'open_paid_file'
  if (input.action === 'purchase' || input.action === 'renew') return 'purchase'
  return 'view_entitlement'
}

export class CommerceCheckoutService {
  constructor(
    private deps: {
      commerceOfferService: CommerceOfferService
      entitlementAccessService: EntitlementAccessService
      workspaceNodeDao: WorkspaceNodeDao
      walletService: WalletService
    },
  ) {}

  async previewOffer(input: {
    userId: string
    offerId: string
    skuId?: string
    includeWallet?: boolean
  }) {
    const { offer, product, shop } = await this.deps.commerceOfferService.getOfferBundle(
      input.offerId,
    )
    const offerAvailable =
      offer.status === 'active' && product.status === 'active' && shop.status === 'active'
    const sku = input.skuId ? product.skus.find((item) => item.id === input.skuId) : undefined
    if (input.skuId && (!sku || !sku.isActive)) throw apiError('SKU_NOT_AVAILABLE', 400)

    const resource = resolveProductEntitlementResource(product)
    const config = Array.isArray(product.entitlementConfig)
      ? product.entitlementConfig[0]
      : product.entitlementConfig
    const deliverables = await this.deps.commerceOfferService.listDeliverablesForOffer(offer.id)
    const paidFileDeliverable = deliverables.find(
      (deliverable) =>
        deliverable.status === 'active' &&
        deliverable.kind === 'paid_file' &&
        deliverable.resourceType === 'workspace_file',
    )
    const paidFileId =
      paidFileDeliverable?.resourceId ??
      (resource?.resourceType === 'workspace_file' ? resource.resourceId : null)
    const paidFile = paidFileId ? await this.deps.workspaceNodeDao.findById(paidFileId) : null
    const access =
      resource?.resourceType && resource.resourceId
        ? await this.deps.entitlementAccessService.checkResourceAccess({
            userId: input.userId,
            resourceType: resource.resourceType,
            resourceId: resource.resourceId,
            capabilities:
              resource.resourceType === 'workspace_file'
                ? Array.from(new Set([resource.capability, ...PAID_FILE_ACCESS_CAPABILITIES]))
                : [resource.capability],
          })
        : null
    const viewerState = !offerAvailable
      ? 'unavailable'
      : access?.allowed
        ? 'active'
        : access?.status === 'expired'
          ? 'expired'
          : access?.status === 'revoked' || access?.status === 'cancelled'
            ? access.status
            : 'not_purchased'
    const price = offer.priceOverride ?? sku?.price ?? product.basePrice
    const wallet = input.includeWallet
      ? await this.deps.walletService.getWallet(input.userId)
      : null
    const action = primaryAction({ viewerState, paidFileId })
    const displayState = {
      viewerState,
      primaryAction: action,
      price: {
        amount: price,
        currency: offer.currency ?? product.currency,
      },
      balance: wallet
        ? {
            current: wallet.balance,
            afterPurchase: wallet.balance - price,
            shortfall: Math.max(0, price - wallet.balance),
          }
        : null,
      seller: {
        shopId: shop.id,
        shopName: shop.name,
        buddyUserId: offer.sellerBuddyUserId,
      },
      entitlement: resource
        ? {
            id: access?.entitlement?.id,
            status: access?.entitlement?.status,
            resourceType: resource.resourceType,
            resourceId: resource.resourceId,
            capability: resource.capability,
            expiresAt: access?.entitlement?.expiresAt ?? null,
          }
        : null,
      delivery: {
        state: paidFileDeliverable
          ? viewerState === 'active'
            ? 'sent'
            : 'not_started'
          : 'not_started',
        deliverableKind: paidFileDeliverable?.kind ?? null,
      },
      content: paidFile
        ? {
            kind: 'paid_file',
            fileId: paidFile.id,
            name: paidFile.name,
            mime: paidFile.mime,
            sizeBytes: paidFile.sizeBytes,
          }
        : null,
    }

    return {
      offer: {
        id: offer.id,
        status: offer.status,
        available: offerAvailable,
        allowedSurfaces: offer.allowedSurfaces,
      },
      shop: {
        id: shop.id,
        name: shop.name,
        scopeKind: shop.scopeKind,
        logoUrl: shop.logoUrl,
      },
      product: {
        id: product.id,
        name: product.name,
        summary: product.summary,
        imageUrl: sku?.imageUrl ?? product.media?.[0]?.url ?? null,
        type: product.type,
        billingMode: product.billingMode,
        price,
        currency: offer.currency ?? product.currency,
        durationSeconds: addDaysLabelSeconds(config?.durationSeconds ?? null),
      },
      entitlement: resource
        ? {
            resourceType: resource.resourceType,
            resourceId: resource.resourceId,
            capability: resource.capability,
            access,
          }
        : null,
      paidFile:
        paidFile && paidFile.kind === 'file'
          ? {
              id: paidFile.id,
              name: paidFile.name,
              mime: paidFile.mime,
              sizeBytes: paidFile.sizeBytes,
              previewUrl: paidFile.previewUrl,
            }
          : null,
      deliverables: deliverables.map((deliverable) => ({
        id: deliverable.id,
        kind: deliverable.kind,
        resourceType: deliverable.resourceType,
        resourceId: deliverable.resourceId,
        status: deliverable.status,
      })),
      viewerState,
      primaryAction: action,
      displayState,
      nextAction: legacyNextAction({ action, paidFileId }),
    }
  }
}
