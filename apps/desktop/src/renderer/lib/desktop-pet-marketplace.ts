import type { DesktopPetAssetPack, DesktopPetAssetSettings } from '../pet-types'

const DESKTOP_PET_PACK_TAGS = new Set(['desktop-pet-pack', 'desktop_pet_pack', '虾豆桌面宠物'])

export type MarketplacePetPackEntitlement = {
  id: string
  status?: string
  isActive?: boolean
  resourceType?: string
  resourceId?: string
  capability?: string
  metadata?: Record<string, unknown> | null
  product?: {
    id?: string
    name?: string
    summary?: string | null
    tags?: string[] | null
  } | null
  paidFile?: {
    id?: string
    name?: string
    mime?: string | null
    sizeBytes?: number | null
  } | null
  shop?: {
    name?: string
  } | null
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

export function normalizeMarketplaceEntitlement(
  value: unknown,
): MarketplacePetPackEntitlement | null {
  const record = asRecord(value)
  const id = asString(record.id)
  if (!id) return null
  const product = asRecord(record.product)
  const paidFile = asRecord(record.paidFile)
  const shop = asRecord(record.shop)
  return {
    id,
    status: asString(record.status),
    isActive: record.isActive === true,
    resourceType: asString(record.resourceType),
    resourceId: asString(record.resourceId),
    capability: asString(record.capability),
    metadata: asRecord(record.metadata),
    product: product.id
      ? {
          id: asString(product.id),
          name: asString(product.name),
          summary: asString(product.summary) || null,
          tags: stringList(product.tags),
        }
      : null,
    paidFile: paidFile.id
      ? {
          id: asString(paidFile.id),
          name: asString(paidFile.name),
          mime: asString(paidFile.mime) || null,
          sizeBytes: typeof paidFile.sizeBytes === 'number' ? paidFile.sizeBytes : null,
        }
      : null,
    shop: shop.name ? { name: asString(shop.name) } : null,
  }
}

export function isDesktopPetPackEntitlement(entitlement: MarketplacePetPackEntitlement) {
  const metadata = asRecord(entitlement.metadata)
  const desktopPetPack = asRecord(metadata.desktopPetPack)
  const metadataTags = stringList(metadata.productTags)
  const tags = [...(entitlement.product?.tags ?? []), ...metadataTags]
  const fileName = entitlement.paidFile?.name?.toLowerCase() ?? ''
  return (
    entitlement.isActive === true &&
    entitlement.status === 'active' &&
    entitlement.resourceType === 'workspace_file' &&
    Boolean(entitlement.paidFile?.id) &&
    (desktopPetPack.kind === 'desktop_pet_pack' ||
      metadata.productAssetType === 'desktop_pet_pack' ||
      tags.some((tag) => DESKTOP_PET_PACK_TAGS.has(tag)) ||
      fileName.endsWith('.shadowpet.zip') ||
      fileName.endsWith('.shadowpet'))
  )
}

export function filterMarketplacePetPackEntitlements(payload: unknown) {
  return Array.isArray(payload)
    ? payload
        .map(normalizeMarketplaceEntitlement)
        .filter((item): item is MarketplacePetPackEntitlement => Boolean(item))
        .filter(isDesktopPetPackEntitlement)
    : []
}

export function installedMarketplacePack(
  settings: DesktopPetAssetSettings,
  entitlement: MarketplacePetPackEntitlement,
) {
  return settings.desktopPetPacks.find(
    (pack) =>
      pack.marketplaceEntitlementId === entitlement.id ||
      (entitlement.product?.id && pack.marketplaceProductId === entitlement.product.id) ||
      (entitlement.paidFile?.id && pack.marketplacePaidFileId === entitlement.paidFile.id),
  )
}

export function localizedText(
  value: Record<string, string> | string | undefined,
  language: string,
  fallback = '',
) {
  if (!value) return fallback
  if (typeof value === 'string') return value
  return (
    value[language] ??
    value[language.split('-')[0] ?? ''] ??
    value.en ??
    Object.values(value)[0] ??
    fallback
  )
}
