export type ProductEntitlementResourceConfig = {
  resourceType?: string | null
  resourceId?: string | null
  capability?: string | null
  durationSeconds?: number | null
  renewalPeriodSeconds?: number | null
  repeatable?: boolean
  privilegeDescription?: string
}

export type ProductWithEntitlementConfig = {
  id: string
  entitlementConfig?: unknown
}

function asNonEmptyString(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

export function firstProductEntitlementConfig(product: ProductWithEntitlementConfig) {
  const config = Array.isArray(product.entitlementConfig)
    ? product.entitlementConfig[0]
    : product.entitlementConfig
  if (!config || typeof config !== 'object') return null
  return config as ProductEntitlementResourceConfig
}

export function resolveProductEntitlementResource(
  product: ProductWithEntitlementConfig,
  config = firstProductEntitlementConfig(product),
) {
  if (!config) return null
  return {
    config,
    resourceType: asNonEmptyString(config.resourceType, 'service'),
    resourceId: asNonEmptyString(config.resourceId, product.id),
    capability: asNonEmptyString(config.capability, 'use'),
  }
}
