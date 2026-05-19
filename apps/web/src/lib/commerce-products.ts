type ProductEntitlementConfig = {
  repeatable?: boolean | null
}

type ProductWithEntitlementConfig = {
  id: string
  type?: string | null
  entitlementConfig?: ProductEntitlementConfig | ProductEntitlementConfig[] | null
}

export type EntitlementOwnership = {
  productId?: string | null
  status?: string | null
  isActive?: boolean | null
  expiresAt?: string | null
}

export function productEntitlementConfigs(product?: ProductWithEntitlementConfig | null) {
  if (!product?.entitlementConfig) return []
  return Array.isArray(product.entitlementConfig)
    ? product.entitlementConfig
    : [product.entitlementConfig]
}

export function productAllowsRepeatPurchase(product?: ProductWithEntitlementConfig | null) {
  if (!product || product.type !== 'entitlement') return true
  const configs = productEntitlementConfigs(product)
  return configs.length === 0 || configs.every((config) => config?.repeatable !== false)
}

export function hasActivePurchasedEntitlement(
  product: ProductWithEntitlementConfig | null | undefined,
  entitlements: EntitlementOwnership[] | null | undefined,
) {
  if (!product || productAllowsRepeatPurchase(product)) return false
  return (entitlements ?? []).some((entitlement) => {
    if (entitlement.productId !== product.id) return false
    if (!entitlement.isActive || entitlement.status !== 'active') return false
    if (!entitlement.expiresAt) return true
    return new Date(entitlement.expiresAt).getTime() > Date.now()
  })
}
