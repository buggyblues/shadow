import { fetchApi } from './api'

export interface CommerceDeliveryEntitlement {
  id: string
  orderId?: string | null
  productId?: string | null
  status: string
  isActive: boolean
  resourceType?: string | null
  resourceId?: string | null
  paidFile?: {
    id: string
    name?: string | null
    mime?: string | null
    sizeBytes?: number | null
  } | null
  product?: {
    id: string
    name: string
    summary?: string | null
  } | null
}

export interface CommercePurchaseOrder {
  id: string
  orderNo?: string | null
  status?: string | null
  totalAmount?: number | null
}

const wait = (delayMs: number) => new Promise((resolve) => window.setTimeout(resolve, delayMs))

export function entitlementHasOpenablePaidFile(entitlement?: CommerceDeliveryEntitlement | null) {
  return Boolean(
    entitlement?.paidFile?.id ||
      (entitlement?.resourceType === 'workspace_file' && entitlement.resourceId),
  )
}

export async function findPurchaseEntitlement({
  orderId,
  productId,
  attempts = 4,
  delayMs = 250,
}: {
  orderId: string
  productId?: string | null
  attempts?: number
  delayMs?: number
}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const entitlements = await fetchApi<CommerceDeliveryEntitlement[]>('/api/entitlements')
    const match = entitlements.find(
      (entitlement) =>
        entitlement.orderId === orderId && (!productId || entitlement.productId === productId),
    )
    if (match || attempt === attempts - 1) return match ?? null
    await wait(delayMs)
  }

  return null
}

export function deliveryDetailHref(
  entitlementId?: string | null,
  options?: { openContent?: boolean },
) {
  if (!entitlementId) return '/app/settings/wallet/entitlements'
  const params = options?.openContent ? '?open=1' : ''
  return `/app/settings/wallet/orders/${entitlementId}${params}`
}
