import { Button, cn, Input } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import {
  ArrowLeft,
  Award,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  Gem,
  Gift,
  ImagePlus,
  Loader2,
  MessageSquare,
  Package,
  ReceiptText,
  RefreshCcw,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Star,
  Store,
  Ticket,
  Trash2,
  WalletCards,
  XCircle,
} from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FilePreviewPanel } from '../components/chat/file-preview-panel'
import {
  CommerceDrawer,
  CommerceEmptyState,
  CommerceList,
  CommerceListItem,
  CommercePill,
  CommerceSegmentedControl,
  CommerceSurface,
} from '../components/commerce/commerce-atoms'
import { PurchaseConfirmationModal } from '../components/commerce/purchase-confirmation-modal'
import { useConfirmStore } from '../components/common/confirm-dialog'
import type { Product, Shop } from '../components/shop/shop-page'
import { ShrimpCoinIcon } from '../components/shop/ui/currency'
import { ProductCard } from '../components/shop/ui/product-card'
import { ProductVisual } from '../components/shop/ui/product-visual'
import { WorkspaceFilePicker } from '../components/workspace/WorkspaceFilePicker'
import type { CommunityAsset } from '../hooks/use-community-economy'
import { fetchApi } from '../lib/api'
import { getApiErrorMessage } from '../lib/api-errors'
import { deliveryDetailHref, entitlementHasOpenablePaidFile } from '../lib/commerce-delivery'
import { hasActivePurchasedEntitlement } from '../lib/commerce-products'
import {
  DESKTOP_PET_PACK_ASSET_TYPE,
  DESKTOP_PET_PACK_MARKETPLACE_TAGS,
  hasDesktopPetPackTag,
  isDesktopPetPackFilename,
  isDesktopPetPackTag,
  withDesktopPetPackTags,
} from '../lib/desktop-pet-marketplace'
import { compressImageForUpload } from '../lib/image-upload'
import { showToast } from '../lib/toast'
import { useAuthStore } from '../stores/auth.store'
import type { WorkspaceNode } from '../stores/workspace.store'

type BillingMode = 'one_time' | 'fixed_duration' | 'subscription'
type ResourceCapability = 'view' | 'download' | 'use' | 'redeem' | 'manage'

type Entitlement = {
  id: string
  userId: string
  serverId?: string | null
  shopId?: string | null
  orderId?: string | null
  productId?: string | null
  offerId?: string | null
  scopeKind?: 'server' | 'user' | null
  status: string
  isActive: boolean
  resourceType?: string | null
  resourceId?: string | null
  capability?: string | null
  expiresAt?: string | null
  nextRenewalAt?: string | null
  metadata?: Record<string, unknown> | null
  createdAt: string
  shop?: {
    id: string
    scopeKind: 'server' | 'user'
    serverId?: string | null
    ownerUserId?: string | null
    name: string
    logoUrl?: string | null
  } | null
  product?: {
    id: string
    shopId: string
    name: string
    summary?: string | null
    type: 'physical' | 'entitlement'
    basePrice: number
    currency: string
    billingMode: BillingMode
    entitlementConfig?: ProductEntitlementConfig | ProductEntitlementConfig[] | null
  } | null
  offer?: {
    id: string
    shopId: string
    productId: string
    priceOverride?: number | null
    currency: string
    status: string
  } | null
  paidFile?: {
    id: string
    name: string
    mime?: string | null
    sizeBytes?: number | null
    previewUrl?: string | null
  } | null
  buyer?: {
    id: string
    username: string
    displayName?: string | null
    avatarUrl?: string | null
  } | null
  order?: {
    id: string
    orderNo?: string | null
    shopId: string
    buyerId: string
    status: string
    totalAmount: number
    buyerNote?: string | null
    sellerNote?: string | null
    paidAt?: string | null
    shippedAt?: string | null
    completedAt?: string | null
    cancelledAt?: string | null
    createdAt?: string | null
    updatedAt?: string | null
  } | null
  fulfillmentJobs?: FulfillmentJob[]
}

type OrderDetailFallback = {
  id: string
  orderNo?: string | null
  shopId: string
  buyerId: string
  status: string
  totalAmount: number
  buyerNote?: string | null
  sellerNote?: string | null
  paidAt?: string | null
  shippedAt?: string | null
  completedAt?: string | null
  cancelledAt?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  items: Array<{
    productId: string
    productName: string
    price: number
    quantity: number
    imageUrl?: string | null
    specValues?: string[] | null
  }>
  shop?: Entitlement['shop']
  product?: Product | null
}

async function loadEntitlementDetail(entitlementId: string): Promise<Entitlement> {
  try {
    return await fetchApi<Entitlement>(`/api/entitlements/${entitlementId}`)
  } catch (err) {
    const entitlements = await fetchApi<Entitlement[]>('/api/entitlements')
    const entitlement = entitlements.find((item) => item.id === entitlementId)
    if (!entitlement) throw err
    return entitlement
  }
}

async function loadEntitlementDetailByOrder(orderId: string): Promise<Entitlement> {
  try {
    return await fetchApi<Entitlement>(`/api/entitlements/by-order/${orderId}`)
  } catch (err) {
    try {
      const entitlements = await fetchApi<Entitlement[]>('/api/entitlements')
      const entitlement = entitlements.find(
        (item) => item.order?.id === orderId || item.orderId === orderId,
      )
      if (entitlement) return entitlement
    } catch {
      // Fall through to the order-only detail below.
    }

    const order = await fetchApi<OrderDetailFallback>(`/api/orders/${orderId}`)
    const firstItem = order.items[0]
    const product: Entitlement['product'] = order.product
      ? {
          id: order.product.id,
          shopId: order.product.shopId,
          name: order.product.name,
          summary: order.product.summary ?? null,
          type: order.product.type,
          basePrice: order.product.basePrice,
          currency: order.product.currency,
          billingMode: order.product.billingMode ?? 'one_time',
          entitlementConfig: order.product.entitlementConfig ?? null,
        }
      : firstItem
        ? {
            id: firstItem.productId,
            shopId: order.shopId,
            name: firstItem.productName,
            summary: firstItem.specValues?.join(' / ') || order.sellerNote || null,
            type: 'physical' as const,
            basePrice: firstItem.price,
            currency: 'SHRIMP',
            billingMode: 'one_time' as const,
            entitlementConfig: null,
          }
        : null

    return {
      id: order.id,
      userId: order.buyerId,
      serverId: order.shop?.serverId ?? null,
      shopId: order.shopId,
      orderId: order.id,
      productId: product?.id ?? firstItem?.productId ?? null,
      offerId: null,
      scopeKind: order.shop?.scopeKind ?? null,
      status: order.status,
      isActive: false,
      resourceType: 'service',
      resourceId: order.id,
      capability: 'use',
      expiresAt: null,
      nextRenewalAt: null,
      createdAt: order.createdAt ?? new Date().toISOString(),
      metadata: {
        orderOnly: true,
        productImageUrl: firstItem?.imageUrl ?? null,
      },
      shop: order.shop ?? null,
      product,
      offer: null,
      paidFile: null,
      buyer: null,
      order: {
        id: order.id,
        orderNo: order.orderNo,
        shopId: order.shopId,
        buyerId: order.buyerId,
        status: order.status,
        totalAmount: order.totalAmount,
        buyerNote: order.buyerNote,
        sellerNote: order.sellerNote,
        paidAt: order.paidAt,
        shippedAt: order.shippedAt,
        completedAt: order.completedAt,
        cancelledAt: order.cancelledAt,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      },
      fulfillmentJobs: [],
    }
  }
}

type MediaUploadResult = {
  url?: string
  signedUrl?: string
  variants?: Record<string, { url?: string }>
}

type Provisioning = {
  status: string
  code: string
  resourceType?: string | null
  resourceId?: string | null
  capability?: string | null
}

type FulfillmentJob = {
  id: string
  deliverableId?: string | null
  status: string
  resultMessageId?: string | null
  lastErrorCode?: string | null
  metadata?: Record<string, unknown> | null
  createdAt?: string | null
  updatedAt?: string | null
}

type OrderReview = {
  id: string
  rating: number
  content?: string | null
  isAnonymous?: boolean | null
  createdAt?: string | null
}

type CommerceProductContext = {
  product: Product
  shop: Shop
  server?: {
    id: string
    name?: string | null
    slug?: string | null
    ownerId?: string | null
  } | null
  links?: {
    product?: string | null
    shop?: string | null
    server?: string | null
    providerProfile?: string | null
    buddyProfile?: string | null
    assetHome?: string | null
    checkoutPreview?: string | null
  }
}

async function loadCommerceProductContext(productId: string): Promise<CommerceProductContext> {
  try {
    return await fetchApi<CommerceProductContext>(`/api/commerce/products/${productId}/context`)
  } catch (err) {
    const product = await fetchApi<Product>(`/api/products/${productId}`)
    const shop = await fetchApi<Shop>(`/api/shops/${product.shopId}`)
    const server = shop.serverId
      ? await fetchApi<NonNullable<CommerceProductContext['server']>>(
          `/api/servers/${shop.serverId}`,
        ).catch(() => null)
      : null

    return {
      product,
      shop,
      server,
      links: {
        product: `/app/shop/products/${product.id}`,
        shop: shop.serverId
          ? `/app/servers/${shop.serverId}/shop`
          : shop.ownerUserId
            ? `/app/shop/users/${shop.ownerUserId}?view=buyer`
            : null,
        server: server?.slug
          ? `/app/servers/${server.slug}`
          : server?.id
            ? `/app/servers/${server.id}`
            : null,
        providerProfile: shop.ownerUserId ? `/app/profile/${shop.ownerUserId}` : null,
      },
    }
  }
}

type ProductEntitlementConfig = {
  resourceType?: string
  resourceId?: string
  capability?: string
  durationSeconds?: number | null
  renewalPeriodSeconds?: number | null
  repeatable?: boolean | null
  privilegeDescription?: string
}

type DeliveryState =
  | 'pending'
  | 'usable'
  | 'delivered'
  | 'awaiting_review'
  | 'completed'
  | 'refunding'
type EntitlementFilter = 'all' | DeliveryState
type ShopSettingsSection = 'shop' | 'orders'
type DeliveryPreset =
  | 'service'
  | 'paid_file'
  | 'desktop_pet_pack'
  | 'badge'
  | 'gift'
  | 'service_ticket'
type CommunityAssetType =
  | 'badge'
  | 'gift'
  | 'coupon'
  | 'service_ticket'
  | 'collectible'
  | 'content_pass'
  | 'reward'

interface ShopAssetDefinition {
  id: string
  assetType: CommunityAssetType
  name: string
  description?: string | null
  imageUrl?: string | null
  giftable: boolean
  consumable: boolean
  status: string
}

type ServerEntry = {
  server: { id: string; name: string; slug?: string | null }
  member?: { role?: string | null } | null
}

const BILLING_MODES: BillingMode[] = ['one_time', 'fixed_duration', 'subscription']
const RESOURCE_CAPABILITIES: ResourceCapability[] = ['use', 'view', 'download', 'redeem', 'manage']
const DELIVERY_PRESETS: Array<{
  value: DeliveryPreset
  icon: typeof ShieldCheck
  assetType?: CommunityAssetType
}> = [
  { value: 'service', icon: ShieldCheck },
  { value: 'paid_file', icon: FileText },
  { value: 'desktop_pet_pack', icon: Package },
  { value: 'badge', icon: Award, assetType: 'badge' },
  { value: 'gift', icon: Gem, assetType: 'gift' },
  { value: 'service_ticket', icon: Ticket, assetType: 'service_ticket' },
]

const selectClassName =
  'h-11 rounded-xl border border-border-subtle bg-bg-secondary px-3 text-sm font-bold text-text-primary outline-none transition focus:border-primary/60'

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : null
}

function toProductSlug(name: string) {
  const base =
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'product'
  return `${base}-${Date.now()}`
}

function firstEntitlementConfig(product?: Product | null): ProductEntitlementConfig | null {
  const config = Array.isArray(product?.entitlementConfig)
    ? product?.entitlementConfig[0]
    : product?.entitlementConfig
  if (!config || typeof config !== 'object') return null
  return config as ProductEntitlementConfig
}

function splitPrivilegeLines(value?: string | null) {
  return (value ?? '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function isInstantDeliveryProduct(product?: Product | null) {
  if (product?.type !== 'entitlement') return false
  const config = firstEntitlementConfig(product)
  return config?.resourceType !== 'service'
}

function productImage(product?: Product | null) {
  const image = product?.media?.find((item) => item.type === 'image') ?? product?.media?.[0]
  return image?.thumbnailUrl ?? image?.url ?? null
}

function uploadedImageUrl(result: MediaUploadResult) {
  return (
    result.variants?.preview?.url ??
    result.variants?.thumbnail?.url ??
    result.variants?.avatar?.url ??
    result.url ??
    result.signedUrl ??
    null
  )
}

function formatFileSizeLabel(size?: number | null) {
  if (!size || size <= 0) return null
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function metadataString(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key]
  return typeof value === 'string' && value.trim() ? value : null
}

function entitlementImage(entitlement: Entitlement) {
  return (
    metadataString(entitlement.metadata, 'productImageUrl') ?? entitlement.shop?.logoUrl ?? null
  )
}

function productAssetType(product?: Product | null) {
  if (hasDesktopPetPackTag(product?.tags)) return DESKTOP_PET_PACK_ASSET_TYPE
  const config = firstEntitlementConfig(product)
  if (config?.resourceType !== 'community_asset') return null
  return product?.tags?.find((tag) =>
    ['badge', 'gift', 'coupon', 'service_ticket', 'collectible'].includes(tag),
  )
}

function parseProvisioning(metadata?: Record<string, unknown> | null): Provisioning | null {
  const provisioning = metadata?.provisioning
  if (!provisioning || typeof provisioning !== 'object' || Array.isArray(provisioning)) return null
  const value = provisioning as Record<string, unknown>
  if (typeof value.status !== 'string' || typeof value.code !== 'string') return null
  return {
    status: value.status,
    code: value.code,
    resourceType: typeof value.resourceType === 'string' ? value.resourceType : null,
    resourceId: typeof value.resourceId === 'string' ? value.resourceId : null,
    capability: typeof value.capability === 'string' ? value.capability : null,
  }
}

function isFileDeliveryPreset(preset: DeliveryPreset) {
  return preset === 'paid_file' || preset === 'desktop_pet_pack'
}

function withDesktopPetTagsFromInput(value: string) {
  return withDesktopPetPackTags(
    value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
  )
}

function withoutDesktopPetTagsFromInput(value: string) {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag && !isDesktopPetPackTag(tag))
}

function PriceBadge({ amount }: { amount: number }) {
  const { t } = useTranslation()
  return (
    <span className="inline-flex items-center gap-1 text-danger">
      <ShrimpCoinIcon size={15} />
      <span className="font-black tabular-nums">{amount.toLocaleString()}</span>
      <span className="sr-only">{t('common.shrimpCoin')}</span>
    </span>
  )
}

function ProductFormSection({
  title,
  description,
  children,
}: {
  title: ReactNode
  description?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="grid gap-3 rounded-2xl border border-border-subtle bg-bg-secondary/40 p-4">
      <div>
        <div className="text-xs font-black uppercase tracking-[0.12em] text-text-primary">
          {title}
        </div>
        {description && <p className="mt-1 text-xs leading-5 text-text-muted">{description}</p>}
      </div>
      {children}
    </section>
  )
}

function ShopMediaPicker({
  label,
  imageUrl,
  uploading,
  onUpload,
  onRemove,
  wide = false,
}: {
  label: string
  imageUrl?: string | null
  uploading: boolean
  onUpload: (file: File) => void
  onRemove: () => void
  wide?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className={cn('grid gap-2', wide && 'sm:col-span-1')}>
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl border border-border-subtle bg-bg-primary/45',
          wide ? 'h-28' : 'h-28 sm:h-full',
        )}
      >
        {imageUrl ? (
          <img src={imageUrl} alt={label} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-text-muted">
            <ImagePlus size={22} />
            <span className="text-xs font-black">{label}</span>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg-deep/50 text-primary backdrop-blur-sm">
            <Loader2 className="animate-spin" size={22} />
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <label
          className={cn(
            'inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-border-subtle bg-bg-secondary px-3 text-xs font-black text-text-primary transition hover:border-primary/40 hover:text-primary',
            uploading && 'pointer-events-none opacity-60',
          )}
        >
          {uploading ? <Loader2 className="animate-spin" size={14} /> : <ImagePlus size={14} />}
          {label}
          <input
            type="file"
            accept="image/*"
            disabled={uploading}
            className="sr-only"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              if (file) onUpload(file)
              event.currentTarget.value = ''
            }}
          />
        </label>
        {imageUrl && (
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-full border border-border-subtle bg-bg-secondary px-3 text-xs font-black text-text-muted transition hover:border-danger/30 hover:text-danger"
            onClick={onRemove}
          >
            <XCircle size={14} />
            {t('commerce.removeCover')}
          </button>
        )}
      </div>
    </div>
  )
}

function CommerceBusinessSignals({
  canManage,
  productCount,
  serviceCount,
  assetCount,
}: {
  canManage: boolean
  productCount: number
  serviceCount: number
  assetCount: number
}) {
  const { t } = useTranslation()
  const signals = [
    {
      icon: Store,
      label: t('commerce.businessSignals.storefront'),
      value: canManage
        ? t('commerce.businessSignals.shareable')
        : t('commerce.businessSignals.visible'),
      detail: t('commerce.businessSignals.storefrontHint'),
    },
    {
      icon: ShoppingBag,
      label: t('commerce.businessSignals.shelf'),
      value: t('commerce.businessSignals.productMetric', { count: productCount }),
      detail: t('commerce.businessSignals.shelfHint', {
        serviceCount,
        assetCount,
      }),
    },
    {
      icon: WalletCards,
      label: t('commerce.businessSignals.fulfillment'),
      value: t('commerce.businessSignals.wallet'),
      detail: t('commerce.businessSignals.fulfillmentHint'),
    },
  ]

  return (
    <CommerceSurface tone="quiet" className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-black text-text-primary">
            {t('commerce.businessSignals.title')}
          </div>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            {t('commerce.businessSignals.description')}
          </p>
        </div>
        <CommercePill tone="primary" icon={<ShieldCheck size={13} />}>
          {t('commerce.businessSignals.traceable')}
        </CommercePill>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {signals.map((signal) => {
          const Icon = signal.icon
          return (
            <div
              key={signal.label}
              className="rounded-lg border border-border-subtle bg-bg-primary/35 p-3"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon size={18} />
                </span>
                <span className="rounded-full bg-bg-secondary px-2 py-1 text-xs font-black text-text-primary">
                  {signal.value}
                </span>
              </div>
              <div className="text-sm font-black text-text-primary">{signal.label}</div>
              <p className="mt-1 text-xs leading-5 text-text-muted">{signal.detail}</p>
            </div>
          )
        })}
      </div>
    </CommerceSurface>
  )
}

function activeEntitlement(entitlement: Entitlement) {
  if (!entitlement.isActive || entitlement.status !== 'active') return false
  if (!entitlement.expiresAt) return true
  return new Date(entitlement.expiresAt).getTime() > Date.now()
}

function entitlementPaidFileId(entitlement: Entitlement) {
  if (entitlement.paidFile?.id) return entitlement.paidFile.id
  return entitlement.resourceType === 'workspace_file' ? entitlement.resourceId : null
}

function entitlementDeliveryState(entitlement: Entitlement): DeliveryState {
  const provisioning = parseProvisioning(entitlement.metadata)
  const orderStatus = entitlement.order?.status
  const isManualService =
    entitlement.resourceType === 'service' || provisioning?.resourceType === 'service'
  if (orderStatus === 'refunded') return 'refunding'
  if (isManualService) {
    if (orderStatus === 'completed') return 'completed'
    if (orderStatus === 'delivered') return 'awaiting_review'
    if (orderStatus === 'shipped') return 'delivered'
    if (['pending', 'paid', 'processing'].includes(orderStatus ?? '')) return 'pending'
    if (provisioning?.status === 'manual_pending') return 'pending'
    if (provisioning?.status === 'provisioned') return 'delivered'
  }
  if (provisioning?.status === 'manual_pending') return 'pending'
  if (!activeEntitlement(entitlement)) return 'completed'
  if (orderStatus === 'completed') return 'completed'
  if (entitlementPaidFileId(entitlement)) return 'usable'
  if (orderStatus === 'delivered') return 'awaiting_review'
  if (provisioning?.status === 'provisioned') return 'delivered'
  return 'usable'
}

function entitlementGroupKey(entitlement: Entitlement) {
  return entitlementDeliveryState(entitlement)
}

function EntitlementStatus({ entitlement }: { entitlement: Entitlement }) {
  const { t } = useTranslation()
  const state = entitlementDeliveryState(entitlement)
  const isReady = state === 'usable' || state === 'delivered'
  return (
    <CommercePill
      tone={isReady ? 'success' : state === 'pending' ? 'warning' : 'primary'}
      icon={isReady ? <CheckCircle2 size={13} /> : <Clock3 size={13} />}
    >
      {t(`commerce.deliveryStatus.${state}`)}
    </CommercePill>
  )
}

function ProductMeta({ product }: { product: Product }) {
  const { t } = useTranslation()
  const config = firstEntitlementConfig(product)
  const durationSeconds = config?.durationSeconds ?? config?.renewalPeriodSeconds ?? null
  const durationDays = durationSeconds ? Math.ceil(durationSeconds / 86400) : null
  const isCommunityAsset = config?.resourceType === 'community_asset'

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-text-muted">
      <CommercePill
        tone="primary"
        icon={isCommunityAsset ? <Package size={13} /> : <ShieldCheck size={13} />}
      >
        {isCommunityAsset
          ? t('communityEconomy.assetDelivery')
          : t(`commerce.resourceTypes.${config?.resourceType ?? 'service'}`, {
              defaultValue: t('commerce.resourceEntitlement'),
            })}
      </CommercePill>
      <CommercePill icon={<Clock3 size={13} />}>
        {t(`commerce.billingModes.${product.billingMode ?? 'one_time'}`)}
      </CommercePill>
      <CommercePill icon={<CalendarClock size={13} />}>
        {durationDays ? t('commerce.validDays', { count: durationDays }) : t('commerce.permanent')}
      </CommercePill>
    </div>
  )
}

function ProductDeliverySummary({
  product,
  compact = false,
}: {
  product: Product
  compact?: boolean
}) {
  const { t } = useTranslation()
  const config = firstEntitlementConfig(product)
  const isCommunityAsset = config?.resourceType === 'community_asset'
  const isPaidFile = config?.resourceType === 'workspace_file'
  const isExternalApp = config?.resourceType === 'external_app'
  const title = isCommunityAsset
    ? t('communityEconomy.assetDelivery')
    : t(`commerce.resourceTypes.${config?.resourceType ?? 'service'}`, {
        defaultValue: t('commerce.resourceEntitlement'),
      })
  const description =
    config?.privilegeDescription ||
    (isCommunityAsset
      ? t('communityEconomy.assetDeliveryHint')
      : isPaidFile
        ? t('shop.fulfillmentFileHint')
        : isExternalApp
          ? t('shop.fulfillmentExternalAppHint')
          : t('shop.fulfillmentServiceHint'))
  const descriptionLines = splitPrivilegeLines(description)
  const Icon = isCommunityAsset ? Package : ShieldCheck

  if (compact) {
    return (
      <div className="mt-2 flex items-start gap-2 rounded-xl bg-bg-secondary/60 px-3 py-2 text-xs leading-5 text-text-secondary">
        <Icon size={15} className="mt-0.5 shrink-0 text-primary" />
        <span className="min-w-0">
          <span className="font-black text-text-primary">{title}</span>
          <span className="mx-1 text-text-muted">·</span>
          <span>{descriptionLines.join(' / ') || description}</span>
        </span>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-bg-secondary/60 p-3">
      <div className="flex items-center gap-2 text-xs font-bold text-text-muted">
        <Icon size={15} className="text-primary" />
        {t('communityEconomy.deliveryType')}
      </div>
      <div className="mt-2 text-sm font-black text-text-primary">{title}</div>
      {descriptionLines.length > 1 ? (
        <ul className="mt-2 grid gap-1.5 text-sm leading-6 text-text-secondary">
          {descriptionLines.map((line) => (
            <li key={line} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm leading-6 text-text-secondary">{description}</p>
      )}
    </div>
  )
}

function ProductSourceSummary({
  product,
  shop,
  server,
}: {
  product: Product
  shop?: Shop | null
  server?: {
    id: string
    name?: string | null
    slug?: string | null
    ownerId?: string | null
  } | null
}) {
  const { t } = useTranslation()
  const shopName = shop?.name ?? t('commerce.consumerStorefront')
  const serverName = server?.name ?? server?.slug ?? null
  const config = firstEntitlementConfig(product)
  const isInstant = isInstantDeliveryProduct(product)
  const shopHref = server?.slug
    ? `/app/servers/${server.slug}/shop`
    : server?.id
      ? `/app/servers/${server.id}/shop`
      : shop?.serverId
        ? `/app/servers/${shop.serverId}/shop`
        : shop?.ownerUserId
          ? `/app/shop/users/${shop.ownerUserId}?view=buyer`
          : null
  const ownerProfileHref = shop?.ownerUserId
    ? `/app/profile/${shop.ownerUserId}`
    : server?.ownerId
      ? `/app/profile/${server.ownerId}`
      : null
  const content = (
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Store size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm font-black text-text-primary">
          <span className="truncate">{t('shop.productSourceTitle', { shop: shopName })}</span>
        </div>
        {serverName && (
          <div className="mt-1 text-xs font-bold text-text-muted">
            {t('shop.productSourceServer', { server: serverName })}
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <CommercePill tone="primary" icon={<Package size={13} />}>
            {t(`commerce.resourceTypes.${config?.resourceType ?? 'service'}`, {
              defaultValue: t('commerce.resourceEntitlement'),
            })}
          </CommercePill>
          <CommercePill tone={isInstant ? 'success' : 'warning'} icon={<CheckCircle2 size={13} />}>
            {isInstant ? t('commerce.immediateDelivery') : t('commerce.manualDelivery')}
          </CommercePill>
        </div>
      </div>
    </div>
  )

  return (
    <div className="rounded-xl border border-border-subtle bg-bg-secondary/55 p-3">
      {content}
      {(shopHref || ownerProfileHref) && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-border-subtle/60 pt-3">
          {shopHref && (
            <a
              href={shopHref}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-border-subtle bg-bg-primary/60 px-3 text-xs font-black text-text-primary transition hover:border-primary/40 hover:text-primary"
            >
              <Store size={14} />
              {t('shop.openShop')}
            </a>
          )}
          {ownerProfileHref && (
            <a
              href={ownerProfileHref}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-border-subtle bg-bg-primary/60 px-3 text-xs font-black text-text-primary transition hover:border-primary/40 hover:text-primary"
            >
              <ExternalLink size={14} />
              {t('shop.openOwnerProfile')}
            </a>
          )}
        </div>
      )}
    </div>
  )
}

function ProvisioningPill({ provisioning }: { provisioning?: Provisioning | null }) {
  const { t } = useTranslation()
  if (!provisioning) return null
  const isProvisioned = provisioning.status === 'provisioned'
  const isManual = provisioning.status === 'manual_pending'
  return (
    <CommercePill
      tone={isProvisioned ? 'success' : isManual ? 'warning' : 'danger'}
      icon={isProvisioned ? <CheckCircle2 size={13} /> : <Clock3 size={13} />}
    >
      {t(`commerce.provisioning.${provisioning.status}`, {
        defaultValue: provisioning.status,
      })}
    </CommercePill>
  )
}

function PurchaseDeliveryStatus({
  provisioning,
  fulfillmentJobs,
}: {
  provisioning?: Provisioning | null
  fulfillmentJobs: FulfillmentJob[]
}) {
  const { t } = useTranslation()
  const primaryJob = fulfillmentJobs[0]
  const status = primaryJob?.status ?? provisioning?.status ?? 'provisioned'
  const isCommunityAsset = provisioning?.resourceType === 'community_asset'
  const resourceType = isCommunityAsset
    ? t('communityEconomy.assetDelivery')
    : t(`commerce.resourceTypes.${provisioning?.resourceType ?? 'service'}`, {
        defaultValue: t('commerce.resourceEntitlement'),
      })
  const resourceId = provisioning?.resourceId
  const deliveryTarget = isCommunityAsset
    ? t('communityEconomy.assets')
    : (resourceId ?? primaryJob?.resultMessageId ?? primaryJob?.id ?? t('common.unknown'))

  return (
    <div className="rounded-xl border border-success/20 bg-success/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-success/80">
            {t('communityEconomy.purchaseDeliveryStatus')}
          </p>
          <p className="mt-1 text-sm font-bold text-text-primary">
            {t(`communityEconomy.status.${status}`, status)}
          </p>
        </div>
        <ProvisioningPill provisioning={provisioning} />
      </div>
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-lg bg-bg-secondary/60 px-3 py-2">
          <p className="font-black uppercase tracking-[0.12em] text-text-muted/60">
            {t('communityEconomy.type')}
          </p>
          <p className="mt-1 truncate font-bold text-text-primary">{resourceType}</p>
        </div>
        <div className="rounded-lg bg-bg-secondary/60 px-3 py-2">
          <p className="font-black uppercase tracking-[0.12em] text-text-muted/60">
            {t('communityEconomy.deliveryTarget')}
          </p>
          <p className="mt-1 truncate font-bold text-text-primary">{deliveryTarget}</p>
        </div>
      </div>
    </div>
  )
}

function ProductFulfillmentPanel({ product }: { product: Product }) {
  const { t } = useTranslation()
  const config = firstEntitlementConfig(product)
  const isAsset = config?.resourceType === 'community_asset'
  const isFile = config?.resourceType === 'workspace_file'
  const isExternalApp = config?.resourceType === 'external_app'
  const title = isAsset
    ? t('shop.fulfillmentAssetTitle')
    : isFile
      ? t('shop.fulfillmentFileTitle')
      : isExternalApp
        ? t('shop.fulfillmentExternalAppTitle')
        : t('shop.fulfillmentServiceTitle')
  const hint = isAsset
    ? t('shop.fulfillmentAssetHint')
    : isFile
      ? t('shop.fulfillmentFileHint')
      : isExternalApp
        ? t('shop.fulfillmentExternalAppHint')
        : t('shop.fulfillmentServiceHint')

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-secondary/60 p-3">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {isAsset ? <Package size={18} /> : <ShieldCheck size={18} />}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-black text-text-primary">{title}</div>
          <p className="mt-1 text-sm leading-6 text-text-muted">{hint}</p>
        </div>
      </div>
    </div>
  )
}

function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto px-4 py-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">{children}</div>
    </div>
  )
}

export function PersonalShopPage({
  initialSection = 'shop',
}: {
  initialSection?: ShopSettingsSection
} = {}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const params = useParams({ strict: false }) as { userId?: string }
  const search = useSearch({ strict: false }) as { view?: string }
  const currentUser = useAuthStore((s) => s.user)
  const targetUserId = params.userId ?? currentUser?.id
  const forceBuyerView = search.view === 'buyer'
  const [keyword, setKeyword] = useState('')
  const [shopName, setShopName] = useState('')
  const [shopDescription, setShopDescription] = useState('')
  const [shopLogoUrl, setShopLogoUrl] = useState('')
  const [shopLogoPreviewUrl, setShopLogoPreviewUrl] = useState('')
  const [shopBannerUrl, setShopBannerUrl] = useState('')
  const [shopBannerPreviewUrl, setShopBannerPreviewUrl] = useState('')
  const [shopVisibility, setShopVisibility] = useState<'private' | 'login_required' | 'public'>(
    'login_required',
  )
  const [shopMediaUploading, setShopMediaUploading] = useState<'logo' | 'banner' | null>(null)
  const [name, setName] = useState('')
  const [summary, setSummary] = useState('')
  const [price, setPrice] = useState('100')
  const [resourceType, setResourceType] = useState('service')
  const [resourceId, setResourceId] = useState('')
  const [capability, setCapability] = useState<ResourceCapability>('use')
  const [durationDays, setDurationDays] = useState('30')
  const [billingMode, setBillingMode] = useState<BillingMode>('fixed_duration')
  const [repeatable, setRepeatable] = useState(true)
  const [privilegeDescription, setPrivilegeDescription] = useState('')
  const [deliveryPreset, setDeliveryPreset] = useState<DeliveryPreset>('service')
  const [assetName, setAssetName] = useState('')
  const [assetDescription, setAssetDescription] = useState('')
  const [productImageUrl, setProductImageUrl] = useState('')
  const [productImagePreviewUrl, setProductImagePreviewUrl] = useState('')
  const [productImageUploading, setProductImageUploading] = useState(false)
  const [productTags, setProductTags] = useState('')
  const [productGlobalPublic, setProductGlobalPublic] = useState(false)
  const [paidFileServerId, setPaidFileServerId] = useState('')
  const [paidFileNode, setPaidFileNode] = useState<WorkspaceNode | null>(null)
  const [paidFileUploading, setPaidFileUploading] = useState(false)
  const [paidFilePickerOpen, setPaidFilePickerOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<ShopSettingsSection>(initialSection)
  const [shopSheet, setShopSheet] = useState<'store' | 'product' | null>(null)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const numericPrice = Number(price)
  const numericDurationDays = Number(durationDays)
  const durationInvalid =
    billingMode !== 'one_time' && (!numericDurationDays || numericDurationDays <= 0)
  const priceInvalid = !Number.isFinite(numericPrice) || numericPrice <= 0

  const { data, isLoading } = useQuery({
    queryKey: ['personal-shop', targetUserId, forceBuyerView],
    queryFn: async () => {
      if (!targetUserId) throw new Error('missing user')
      if (!params.userId || params.userId === currentUser?.id) {
        return { shop: await fetchApi<Shop>('/api/me/shop'), canManage: !forceBuyerView }
      }
      try {
        return {
          shop: await fetchApi<Shop>(`/api/users/${targetUserId}/shop/manage`),
          canManage: !forceBuyerView,
        }
      } catch {
        return {
          shop: await fetchApi<Shop>(`/api/users/${targetUserId}/shop`),
          canManage: false,
        }
      }
    },
    enabled: Boolean(targetUserId),
  })

  const shop = data?.shop
  const canManage = data?.canManage === true
  const buyerShopPath = targetUserId ? `/app/shop/users/${targetUserId}?view=buyer` : '/app/shop/me'
  const buyerShopUrl =
    typeof window !== 'undefined' ? `${window.location.origin}${buyerShopPath}` : buyerShopPath
  const copyBuyerShopLink = async () => {
    try {
      await navigator.clipboard.writeText(buyerShopUrl)
      showToast(t('commerce.shopLinkCopied'), 'success')
    } catch {
      showToast(t('commerce.shopLinkCopyFailed'), 'error')
    }
  }

  useEffect(() => {
    if (!shop) return
    setShopName(shop.name)
    setShopDescription(shop.description ?? '')
    setShopLogoUrl(shop.logoUrl ?? '')
    setShopLogoPreviewUrl(shop.logoUrl ?? '')
    setShopBannerUrl(shop.bannerUrl ?? '')
    setShopBannerPreviewUrl(shop.bannerUrl ?? '')
    setShopVisibility(
      shop.visibility === 'public' || shop.visibility === 'private'
        ? shop.visibility
        : 'login_required',
    )
  }, [shop])

  useEffect(() => {
    setActiveSection(initialSection)
  }, [initialSection])

  useEffect(() => {
    if (deliveryPreset === 'service') {
      setResourceType('service')
      setCapability('use')
      return
    }
    if (isFileDeliveryPreset(deliveryPreset)) {
      setResourceType('workspace_file')
      setCapability('download')
      return
    }
    setResourceType('community_asset')
    setCapability('redeem')
  }, [deliveryPreset])

  const { data: serverEntries = [] } = useQuery({
    queryKey: ['servers'],
    queryFn: () => fetchApi<ServerEntry[]>('/api/servers'),
    enabled: Boolean(canManage),
  })

  useEffect(() => {
    if (paidFileServerId || serverEntries.length === 0) return
    setPaidFileServerId(serverEntries[0]?.server.id ?? '')
  }, [paidFileServerId, serverEntries])

  const resetProductForm = () => {
    setEditingProduct(null)
    setName('')
    setSummary('')
    setPrice('100')
    setResourceType('service')
    setResourceId('')
    setCapability('use')
    setDurationDays('30')
    setBillingMode('fixed_duration')
    setRepeatable(true)
    setPrivilegeDescription('')
    setDeliveryPreset('service')
    setAssetName('')
    setAssetDescription('')
    setProductImageUrl('')
    setProductImagePreviewUrl('')
    setProductTags('')
    setProductGlobalPublic(false)
    setPaidFileNode(null)
  }

  const beginEditProduct = (product: Product) => {
    const config = firstEntitlementConfig(product)
    const durationSeconds = config?.durationSeconds ?? config?.renewalPeriodSeconds ?? null
    const assetType = productAssetType(product)
    const preset: DeliveryPreset =
      config?.resourceType === 'workspace_file'
        ? hasDesktopPetPackTag(product.tags)
          ? 'desktop_pet_pack'
          : 'paid_file'
        : assetType === 'badge' || assetType === 'gift' || assetType === 'service_ticket'
          ? assetType
          : 'service'
    const coverUrl = product.media?.[0]?.thumbnailUrl ?? product.media?.[0]?.url ?? ''
    setEditingProduct(product)
    setName(product.name)
    setSummary(product.summary ?? '')
    setPrice(String(product.basePrice ?? 0))
    setResourceType(config?.resourceType ?? 'service')
    setResourceId(config?.resourceId ?? '')
    setCapability((config?.capability as ResourceCapability | undefined) ?? 'use')
    setDurationDays(durationSeconds ? String(Math.ceil(durationSeconds / 86400)) : '30')
    setBillingMode(product.billingMode ?? 'fixed_duration')
    setRepeatable(config?.repeatable !== false)
    setPrivilegeDescription(config?.privilegeDescription ?? '')
    setDeliveryPreset(preset)
    setAssetName(product.name)
    setAssetDescription(config?.privilegeDescription ?? product.summary ?? '')
    setProductImageUrl(coverUrl)
    setProductImagePreviewUrl(coverUrl)
    setProductTags(product.tags?.join(', ') ?? '')
    setProductGlobalPublic(product.globalPublic === true)
    setPaidFileNode(null)
    setShopSheet('product')
  }

  const { data: productsData, isFetching: isFetchingProducts } = useQuery({
    queryKey: ['personal-shop-products', shop?.id, keyword],
    queryFn: () =>
      fetchApi<{ products: Product[] }>(
        `/api/shops/${shop!.id}/products?keyword=${encodeURIComponent(keyword.trim())}`,
      ),
    enabled: Boolean(shop?.id),
  })
  const products = productsData?.products ?? []
  const serviceProductCount = products.filter(
    (product) =>
      firstEntitlementConfig(product)?.resourceType !== 'community_asset' &&
      !hasDesktopPetPackTag(product.tags),
  ).length
  const assetProductCount = products.length - serviceProductCount

  const { data: shopAssetsData } = useQuery({
    queryKey: ['shop-community-assets', shop?.id],
    queryFn: () => fetchApi<{ assets: ShopAssetDefinition[] }>(`/api/shops/${shop!.id}/assets`),
    enabled: Boolean(canManage && shop?.id),
  })
  const shopAssets = shopAssetsData?.assets ?? []

  const saveShop = useMutation({
    mutationFn: () => {
      const path =
        params.userId && params.userId !== currentUser?.id
          ? `/api/users/${targetUserId}/shop/manage`
          : '/api/me/shop'
      return fetchApi<Shop>(path, {
        method: 'POST',
        body: JSON.stringify({
          name: shopName.trim(),
          description: shopDescription.trim() || null,
          logoUrl: shopLogoUrl.trim() || null,
          bannerUrl: shopBannerUrl.trim() || null,
          visibility: shopVisibility,
        }),
      })
    },
    onSuccess: async () => {
      setShopSheet(null)
      await queryClient.invalidateQueries({ queryKey: ['personal-shop', targetUserId] })
      showToast(t('commerce.shopSaved'), 'success')
    },
    onError: (err) => showToast(getApiErrorMessage(err, t, 'commerce.shopSaveFailed'), 'error'),
  })

  const createProduct = useMutation({
    mutationFn: async () => {
      const durationSeconds = numericDurationDays > 0 ? numericDurationDays * 24 * 60 * 60 : null
      const selectedPreset = DELIVERY_PRESETS.find((preset) => preset.value === deliveryPreset)
      const coverUrl = productImageUrl.trim() || null
      const editingConfig = editingProduct ? firstEntitlementConfig(editingProduct) : null
      let assetDefinition: ShopAssetDefinition | null = null
      let assetDefinitionId: string | null = null
      if (selectedPreset?.assetType) {
        if (editingConfig?.resourceType === 'community_asset' && editingConfig.resourceId) {
          assetDefinitionId = editingConfig.resourceId
        } else {
          assetDefinition = await fetchApi<ShopAssetDefinition>(`/api/shops/${shop!.id}/assets`, {
            method: 'POST',
            body: JSON.stringify({
              assetType: selectedPreset.assetType,
              name: assetName.trim() || name.trim(),
              description: assetDescription.trim() || summary.trim() || null,
              imageUrl: coverUrl,
              giftable: true,
              transferable: true,
              consumable: selectedPreset.assetType === 'service_ticket',
              revocable: true,
              expiresAfterDays:
                billingMode === 'one_time' || !numericDurationDays ? null : numericDurationDays,
              status: 'active',
              metadata: { createdFrom: 'creator_product', deliveryPreset },
            }),
          })
          assetDefinitionId = assetDefinition.id
        }
      }

      const baseTags = selectedPreset?.assetType
        ? [selectedPreset.assetType]
        : deliveryPreset === 'desktop_pet_pack'
          ? ['paid_file', ...DESKTOP_PET_PACK_MARKETPLACE_TAGS]
          : deliveryPreset === 'paid_file'
            ? ['paid_file']
            : deliveryPreset === 'service'
              ? ['service']
              : []
      const customTags = productTags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
      const productPayload = {
        name: name.trim(),
        slug: editingProduct?.slug ?? toProductSlug(name),
        type: 'entitlement',
        billingMode,
        status: 'active',
        summary: summary.trim() || undefined,
        media: coverUrl
          ? [{ type: 'image', url: coverUrl, thumbnailUrl: coverUrl, position: 0 }]
          : undefined,
        tags: [...new Set([...baseTags, ...customTags])],
        globalPublic: productGlobalPublic,
        basePrice: Math.round(numericPrice),
        entitlementConfig: {
          resourceType: assetDefinitionId
            ? 'community_asset'
            : isFileDeliveryPreset(deliveryPreset)
              ? 'workspace_file'
              : resourceType.trim() || 'service',
          resourceId: assetDefinitionId ?? (resourceId.trim() || undefined),
          capability: assetDefinitionId
            ? 'redeem'
            : isFileDeliveryPreset(deliveryPreset)
              ? 'download'
              : capability,
          durationSeconds: billingMode === 'one_time' ? null : durationSeconds,
          renewalPeriodSeconds: billingMode === 'subscription' ? durationSeconds : undefined,
          repeatable,
          privilegeDescription:
            privilegeDescription.trim() ||
            assetDescription.trim() ||
            (assetDefinition ? assetDefinition.description : undefined),
        },
      }

      const product = await fetchApi<Product>(
        editingProduct
          ? `/api/shops/${shop!.id}/products/${editingProduct.id}`
          : `/api/shops/${shop!.id}/products`,
        {
          method: editingProduct ? 'PUT' : 'POST',
          body: JSON.stringify(productPayload),
        },
      )
      if (assetDefinition && !editingProduct) {
        const offers = await fetchApi<{ offers: Array<{ id: string; productId: string }> }>(
          `/api/shops/${shop!.id}/offers?keyword=${encodeURIComponent(name.trim())}`,
        )
        const offer = offers.offers.find((item) => item.productId === product.id)
        if (offer) {
          await fetchApi(`/api/shops/${shop!.id}/offers/${offer.id}/deliverables`, {
            method: 'POST',
            body: JSON.stringify({
              kind: 'community_asset',
              resourceType: 'community_asset',
              resourceId: assetDefinition.id,
              metadata: { deliveryPreset, productId: product.id },
            }),
          })
        }
      }
      return product
    },
    onSuccess: async (product) => {
      const wasEditing = Boolean(editingProduct)
      resetProductForm()
      setShopSheet(null)
      await queryClient.invalidateQueries({ queryKey: ['personal-shop-products', shop?.id] })
      await queryClient.invalidateQueries({ queryKey: ['shop-community-assets', shop?.id] })
      showToast(wasEditing ? t('commerce.productUpdated') : t('commerce.productCreated'), 'success')
      if (!wasEditing) {
        navigate({
          to: '/shop/products/$productId',
          params: { productId: product.id },
        })
      }
    },
    onError: (err) =>
      showToast(getApiErrorMessage(err, t, 'commerce.productCreateFailed'), 'error'),
  })

  const deleteProduct = useMutation({
    mutationFn: (product: Product) =>
      fetchApi(`/api/shops/${product.shopId}/products/${product.id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['personal-shop-products', shop?.id] })
      showToast(t('commerce.productDeleted'), 'success')
    },
    onError: (err) =>
      showToast(getApiErrorMessage(err, t, 'commerce.productDeleteFailed'), 'error'),
  })

  const confirmDeleteProduct = async (product: Product) => {
    const ok = await useConfirmStore.getState().confirm({
      title: t('commerce.deleteProduct'),
      message: t('commerce.deleteProductConfirm'),
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (ok) deleteProduct.mutate(product)
  }

  const canSubmitProduct =
    canManage &&
    Boolean(name.trim()) &&
    Boolean(resourceType.trim()) &&
    (!isFileDeliveryPreset(deliveryPreset) || Boolean(resourceId.trim())) &&
    !priceInvalid &&
    !durationInvalid &&
    !productImageUploading &&
    !paidFileUploading &&
    !createProduct.isPending

  const filtered = useMemo(() => products, [products])
  const sectionOptions = [
    {
      value: 'shop' as const,
      label: t('commerce.activeProducts'),
      icon: <ShoppingBag size={13} />,
    },
    {
      value: 'orders' as const,
      label: t('commerce.orders'),
      icon: <ReceiptText size={13} />,
    },
  ]
  const selectedDeliveryPreset = DELIVERY_PRESETS.find((preset) => preset.value === deliveryPreset)
  const PreviewDeliveryIcon = selectedDeliveryPreset?.icon ?? ShieldCheck
  const selectedDeliveryLabel = t(`communityEconomy.deliveryPreset.${deliveryPreset}`)
  const selectedDeliveryHint = t(`communityEconomy.deliveryPresetHint.${deliveryPreset}`)
  const buyerPreviewName = name.trim() || t('commerce.productName')
  const buyerPreviewSummary =
    summary.trim() || privilegeDescription.trim() || assetDescription.trim() || selectedDeliveryHint
  const previewResourceType = isFileDeliveryPreset(deliveryPreset)
    ? 'workspace_file'
    : deliveryPreset === 'service'
      ? resourceType
      : 'community_asset'
  const previewAssetType =
    deliveryPreset === 'desktop_pet_pack'
      ? DESKTOP_PET_PACK_ASSET_TYPE
      : selectedDeliveryPreset?.assetType
  const paidFileTitle =
    deliveryPreset === 'desktop_pet_pack'
      ? t('commerce.desktopPetPackUploadTitle')
      : t('commerce.paidFileUploadTitle')
  const paidFileHint =
    deliveryPreset === 'desktop_pet_pack'
      ? t('commerce.desktopPetPackUploadHint')
      : t('commerce.paidFileUploadHint')
  const starterPresets: DeliveryPreset[] = [
    'service',
    'paid_file',
    'desktop_pet_pack',
    'badge',
    'gift',
    'service_ticket',
  ]
  const startProductWithPreset = (preset: DeliveryPreset) => {
    if (!isFileDeliveryPreset(preset)) {
      setPaidFileNode(null)
      if (isFileDeliveryPreset(deliveryPreset)) setResourceId('')
    }
    if (preset === 'desktop_pet_pack') {
      setBillingMode('one_time')
      setRepeatable(false)
      setProductGlobalPublic(true)
      setProductTags((current) =>
        withDesktopPetTagsFromInput(current)
          .filter((tag) => tag !== 'paid_file')
          .join(', '),
      )
    } else {
      setProductTags((current) => withoutDesktopPetTagsFromInput(current).join(', '))
    }
    setDeliveryPreset(preset)
    setShopSheet('product')
  }
  const uploadProductCover = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast(t('commerce.imageFileRequired'), 'error')
      return
    }
    setProductImageUploading(true)
    try {
      const uploadFile = await compressImageForUpload(file)
      const formData = new FormData()
      formData.append('file', uploadFile)
      const result = await fetchApi<MediaUploadResult>('/api/media/upload', {
        method: 'POST',
        body: formData,
      })
      const imageUrl = uploadedImageUrl(result)
      if (!imageUrl) throw new Error(t('commerce.imageUploadFailed'))
      setProductImageUrl(imageUrl)
      setProductImagePreviewUrl(result.signedUrl ?? imageUrl)
    } catch (err) {
      showToast(getApiErrorMessage(err, t, 'commerce.imageUploadFailed'), 'error')
    } finally {
      setProductImageUploading(false)
    }
  }
  const uploadShopMedia = async (kind: 'logo' | 'banner', file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast(t('commerce.imageFileRequired'), 'error')
      return
    }
    setShopMediaUploading(kind)
    try {
      const uploadFile = await compressImageForUpload(file, {
        maxWidth: kind === 'banner' ? 1800 : 640,
        maxHeight: kind === 'banner' ? 600 : 640,
      })
      const formData = new FormData()
      formData.append('file', uploadFile)
      const result = await fetchApi<MediaUploadResult>('/api/media/upload', {
        method: 'POST',
        body: formData,
      })
      const imageUrl = result.url ?? uploadedImageUrl(result)
      if (!imageUrl) throw new Error(t('commerce.imageUploadFailed'))
      const previewUrl = result.signedUrl ?? imageUrl
      if (kind === 'logo') {
        setShopLogoUrl(imageUrl)
        setShopLogoPreviewUrl(previewUrl)
      } else {
        setShopBannerUrl(imageUrl)
        setShopBannerPreviewUrl(previewUrl)
      }
    } catch (err) {
      showToast(getApiErrorMessage(err, t, 'commerce.imageUploadFailed'), 'error')
    } finally {
      setShopMediaUploading(null)
    }
  }
  const uploadPaidFile = async (file: File) => {
    if (!paidFileServerId) {
      showToast(t('commerce.paidFileServerRequired'), 'error')
      return
    }
    if (deliveryPreset === 'desktop_pet_pack' && !isDesktopPetPackFilename(file.name)) {
      showToast(t('commerce.desktopPetPackFileRequired'), 'error')
      return
    }
    setPaidFileUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const node = await fetchApi<WorkspaceNode>(
        `/api/servers/${paidFileServerId}/workspace/upload`,
        {
          method: 'POST',
          body: formData,
        },
      )
      bindPaidFileNode(node)
      showToast(t('commerce.paidFileUploaded'), 'success')
    } catch (err) {
      showToast(getApiErrorMessage(err, t, 'commerce.paidFileUploadFailed'), 'error')
    } finally {
      setPaidFileUploading(false)
    }
  }
  const bindPaidFileNode = (node: WorkspaceNode) => {
    setPaidFilePickerOpen(false)
    setPaidFileNode(node)
    setResourceId(node.id)
    if (!name.trim()) setName(node.name.replace(/\.[^.]+$/, ''))
    if (!summary.trim()) {
      setSummary(
        t(
          deliveryPreset === 'desktop_pet_pack'
            ? 'commerce.desktopPetPackDefaultSummary'
            : 'commerce.paidFileDefaultSummary',
          { name: node.name },
        ),
      )
    }
    if (!privilegeDescription.trim()) {
      setPrivilegeDescription(
        t(
          deliveryPreset === 'desktop_pet_pack'
            ? 'commerce.desktopPetPackDefaultPrivilege'
            : 'commerce.paidFileDefaultPrivilege',
          { name: node.name },
        ),
      )
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-text-muted">
        <Loader2 className="animate-spin" />
      </div>
    )
  }

  if (!shop) {
    return <div className="p-6 text-sm text-text-muted">{t('commerce.shopUnavailable')}</div>
  }

  return (
    <PageShell>
      <CommerceSurface tone="accent" className="relative overflow-hidden px-5 py-5 sm:px-6">
        {shop.bannerUrl && (
          <div
            className="absolute inset-0 bg-cover bg-center opacity-25"
            style={{ backgroundImage: `url(${shop.bannerUrl})` }}
            aria-hidden="true"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-bg-primary/90 via-bg-primary/70 to-bg-primary/30" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-bg-primary/70 text-primary shadow-inner">
              {shop.logoUrl ? (
                <img src={shop.logoUrl} alt={shop.name} className="h-full w-full object-cover" />
              ) : (
                <Store size={24} />
              )}
            </div>
            <div className="min-w-0">
              <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-primary">
                {canManage ? t('commerce.creatorStudio') : t('commerce.consumerStorefront')}
              </div>
              <h1 className="truncate text-2xl font-black text-text-primary sm:text-3xl">
                {shop.name}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
                {shop.description || t('commerce.shopHeroFallback')}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm font-bold text-text-muted">
                <span>
                  <span className="text-text-primary tabular-nums">{products.length}</span>{' '}
                  {t('commerce.activeProducts')}
                </span>
                <span>
                  <span className="text-text-primary tabular-nums">{serviceProductCount}</span>{' '}
                  {t('commerce.serviceProducts')}
                </span>
                <span>
                  <span className="text-text-primary tabular-nums">{assetProductCount}</span>{' '}
                  {t('commerce.assetProducts')}
                </span>
                {canManage && (
                  <span>
                    {t('communityEconomy.assetDefinitionsCount', { count: shopAssets.length })}
                  </span>
                )}
              </div>
            </div>
          </div>
          {canManage && (
            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <a
                href={buyerShopPath}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-border-subtle bg-bg-primary/60 px-3 text-xs font-black text-text-primary transition hover:border-primary/40 hover:text-primary"
              >
                <Eye size={14} />
                {t('commerce.previewAsBuyer')}
              </a>
              <Button size="sm" variant="glass" onClick={copyBuyerShopLink}>
                <Copy size={14} />
                {t('commerce.copyStoreLink')}
              </Button>
              <Button size="sm" variant="glass" onClick={() => setShopSheet('store')}>
                <Settings2 size={14} />
                {t('commerce.editStorefront')}
              </Button>
              <Button size="sm" onClick={() => setShopSheet('product')}>
                <Package size={14} />
                {t('commerce.publishService')}
              </Button>
            </div>
          )}
          {!canManage && (
            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              {targetUserId && (
                <a
                  href={`/app/profile/${targetUserId}`}
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-border-subtle bg-bg-primary/60 px-4 text-sm font-black text-text-primary transition hover:border-primary/40 hover:text-primary"
                >
                  <ExternalLink size={16} />
                  {t('shop.openOwnerProfile')}
                </a>
              )}
              <a
                href="/app/settings/wallet/entitlements"
                className="inline-flex h-10 items-center gap-2 rounded-full border border-border-subtle bg-bg-primary/60 px-4 text-sm font-black text-text-primary transition hover:border-primary/40 hover:text-primary"
              >
                <ShieldCheck size={16} />
                {t('commerce.viewEntitlement')}
              </a>
              <a
                href="/app/settings/wallet/assets"
                className="inline-flex h-10 items-center gap-2 rounded-full border border-border-subtle bg-bg-primary/60 px-4 text-sm font-black text-text-primary transition hover:border-primary/40 hover:text-primary"
              >
                <Package size={16} />
                {t('communityEconomy.viewAssets')}
              </a>
            </div>
          )}
        </div>
      </CommerceSurface>

      {canManage && (
        <CommerceBusinessSignals
          canManage={canManage}
          productCount={products.length}
          serviceCount={serviceProductCount}
          assetCount={assetProductCount}
        />
      )}

      {canManage && (
        <CommerceSurface tone="quiet" className="p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CommerceSegmentedControl
              value={activeSection}
              options={sectionOptions}
              onChange={setActiveSection}
            />
            <div className="inline-flex items-center gap-2 rounded-full bg-bg-primary/50 px-3 py-1.5 text-xs font-black text-text-muted">
              {t('commerce.currentSection')}
              <span className="text-text-primary">
                {activeSection === 'shop'
                  ? t('commerce.sectionProducts')
                  : t('commerce.sectionOrders')}
              </span>
            </div>
          </div>
        </CommerceSurface>
      )}

      {canManage && activeSection === 'shop' && (
        <CommerceSurface tone="quiet" className="p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-black text-text-primary">
                {t('commerce.communityStorePlaybook')}
              </div>
              <p className="mt-1 text-sm leading-6 text-text-muted">
                {t('commerce.communityStorePlaybookHint')}
              </p>
            </div>
            <CommercePill tone="primary" icon={<Store size={13} />}>
              {t('commerce.creatorStudio')}
            </CommercePill>
          </div>
          <div className="grid gap-3 xl:grid-cols-3 2xl:grid-cols-6">
            {starterPresets.map((preset) => {
              const meta = DELIVERY_PRESETS.find((item) => item.value === preset)
              const Icon = meta?.icon ?? ShieldCheck
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => startProductWithPreset(preset)}
                  className="group rounded-2xl border border-border-subtle bg-bg-secondary/45 p-4 text-left transition hover:border-primary/35 hover:bg-bg-secondary/70"
                >
                  <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-bg-primary/65 text-primary transition group-hover:bg-primary/15">
                    <Icon size={19} />
                  </span>
                  <span className="block text-sm font-black text-text-primary">
                    {t(`communityEconomy.deliveryPreset.${preset}`)}
                  </span>
                  <span className="mt-1 block min-h-10 text-xs leading-5 text-text-muted">
                    {t(`communityEconomy.deliveryPresetHint.${preset}`)}
                  </span>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-black text-primary">
                    {t('commerce.startWithPreset')}
                    <ChevronRight size={13} />
                  </span>
                </button>
              )
            })}
          </div>
        </CommerceSurface>
      )}

      {activeSection === 'orders' && canManage ? (
        <ShopOrdersContent />
      ) : (
        <>
          <CommerceSurface className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-base font-black text-text-primary">
                  <ShoppingBag size={18} />
                  {t('commerce.activeProducts')}
                </h2>
                <p className="mt-1 text-sm leading-6 text-text-muted">
                  {t('commerce.productsShelfHint')}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex min-w-[220px] items-center gap-2 rounded-xl border border-border-subtle bg-bg-secondary px-3 py-2">
                  <Search size={16} className="text-text-muted" />
                  <input
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder={t('commerce.searchProducts')}
                    className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
                  />
                </div>
                {canManage && (
                  <Button size="sm" variant="glass" onClick={() => setShopSheet('product')}>
                    <Package size={14} />
                    {t('commerce.publishService')}
                  </Button>
                )}
              </div>
            </div>
            {!canManage && !isFetchingProducts && filtered.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    shopName={shop.name}
                    onClick={(id) => {
                      window.location.href = `/app/shop/products/${id}`
                    }}
                  />
                ))}
              </div>
            ) : (
              <CommerceList>
                {isFetchingProducts ? (
                  <div className="py-10 text-center text-text-muted">
                    <Loader2 className="inline animate-spin" />
                  </div>
                ) : filtered.length === 0 ? (
                  <CommerceEmptyState
                    icon={<ShoppingBag size={24} />}
                    title={t('commerce.noProducts')}
                    description={t('commerce.noProductsHint')}
                    action={
                      canManage ? (
                        <Button size="sm" onClick={() => startProductWithPreset('service')}>
                          <Package size={14} />
                          {t('commerce.publishService')}
                        </Button>
                      ) : undefined
                    }
                  />
                ) : (
                  filtered.map((product) => {
                    const config = firstEntitlementConfig(product)
                    return (
                      <CommerceListItem
                        key={product.id}
                        className="border-t"
                        media={
                          <ProductVisual
                            name={product.name}
                            media={product.media}
                            productType={product.type}
                            resourceType={config?.resourceType}
                            assetType={productAssetType(product)}
                            showLabel={false}
                            className="aspect-[3/2] w-full shrink-0 xl:w-44"
                          />
                        }
                        title={product.name}
                        subtitle={product.summary ?? t('commerce.entitlementGenericContent')}
                        meta={
                          <>
                            <ProductMeta product={product} />
                            <PriceBadge amount={product.basePrice} />
                          </>
                        }
                        action={
                          <>
                            <a
                              href={`/app/shop/products/${product.id}`}
                              className="inline-flex h-9 items-center gap-1 rounded-full border border-border-subtle bg-bg-primary/60 px-3 text-xs font-black text-text-primary transition hover:border-primary/40 hover:text-primary"
                            >
                              {canManage ? t('commerce.openProduct') : t('commerce.viewProduct')}
                              <ChevronRight size={14} />
                            </a>
                            {canManage && (
                              <>
                                <button
                                  type="button"
                                  title={t('commerce.editProduct')}
                                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition hover:bg-primary/10 hover:text-primary"
                                  onClick={() => beginEditProduct(product)}
                                >
                                  <Settings2 size={15} />
                                </button>
                                <button
                                  type="button"
                                  title={t('commerce.deleteProduct')}
                                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition hover:bg-danger/10 hover:text-danger"
                                  onClick={() => void confirmDeleteProduct(product)}
                                >
                                  <Trash2 size={15} />
                                </button>
                              </>
                            )}
                          </>
                        }
                      >
                        <ProductDeliverySummary product={product} compact />
                      </CommerceListItem>
                    )
                  })
                )}
              </CommerceList>
            )}
          </CommerceSurface>
        </>
      )}
      {canManage && (
        <>
          <CommerceDrawer
            open={shopSheet === 'store'}
            title={t('commerce.storeIdentity')}
            description={t('commerce.storeIdentityHint')}
            closeLabel={t('common.close')}
            onClose={() => setShopSheet(null)}
            footer={
              <Button
                className="w-full"
                onClick={() => saveShop.mutate()}
                disabled={!shopName.trim() || saveShop.isPending}
              >
                {saveShop.isPending ? t('commerce.saving') : t('commerce.saveShop')}
              </Button>
            }
          >
            <div className="grid gap-4">
              <ProductFormSection
                title={t('commerce.storeMedia')}
                description={t('commerce.storeMediaHint')}
              >
                <div className="grid gap-3 sm:grid-cols-[112px_minmax(0,1fr)]">
                  <ShopMediaPicker
                    label={t('commerce.shopLogo')}
                    imageUrl={shopLogoPreviewUrl || shopLogoUrl}
                    uploading={shopMediaUploading === 'logo'}
                    onUpload={(file) => uploadShopMedia('logo', file)}
                    onRemove={() => {
                      setShopLogoUrl('')
                      setShopLogoPreviewUrl('')
                    }}
                  />
                  <ShopMediaPicker
                    label={t('commerce.shopBanner')}
                    imageUrl={shopBannerPreviewUrl || shopBannerUrl}
                    uploading={shopMediaUploading === 'banner'}
                    onUpload={(file) => uploadShopMedia('banner', file)}
                    onRemove={() => {
                      setShopBannerUrl('')
                      setShopBannerPreviewUrl('')
                    }}
                    wide
                  />
                </div>
              </ProductFormSection>
              <label className="grid gap-1.5">
                <span className="text-xs font-black uppercase tracking-[0.12em] text-text-muted">
                  {t('commerce.shopName')}
                </span>
                <Input value={shopName} onChange={(e) => setShopName(e.target.value)} />
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-black uppercase tracking-[0.12em] text-text-muted">
                  {t('commerce.shopDescription')}
                </span>
                <Input
                  value={shopDescription}
                  onChange={(e) => setShopDescription(e.target.value)}
                />
              </label>
              <label className="flex items-start gap-3 rounded-2xl border border-border-subtle bg-bg-primary/35 p-3">
                <input
                  type="checkbox"
                  checked={shopVisibility === 'public'}
                  onChange={(event) =>
                    setShopVisibility(event.target.checked ? 'public' : 'login_required')
                  }
                  className="mt-1 h-4 w-4 rounded border-border-subtle bg-bg-secondary text-primary"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-black text-text-primary">
                    {t('commerceMarketplace.publicPersonalShop')}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-text-muted">
                    {t('commerceMarketplace.publicPersonalShopHint')}
                  </span>
                </span>
              </label>
            </div>
          </CommerceDrawer>

          <CommerceDrawer
            open={shopSheet === 'product'}
            title={editingProduct ? t('commerce.editProduct') : t('commerce.publishService')}
            description={
              editingProduct ? t('commerce.editProductHint') : t('commerce.publishServiceHint')
            }
            closeLabel={t('common.close')}
            onClose={() => {
              setShopSheet(null)
              setEditingProduct(null)
            }}
            footer={
              <Button
                className="w-full"
                onClick={() => createProduct.mutate()}
                disabled={!canSubmitProduct}
              >
                {createProduct.isPending
                  ? t('commerce.saving')
                  : editingProduct
                    ? t('commerce.saveProductChanges')
                    : t('commerce.createProduct')}
              </Button>
            }
          >
            <div className="grid gap-4">
              <ProductFormSection
                title={t('commerce.publishBasics')}
                description={t('commerce.publishBasicsHint')}
              >
                <div className="grid gap-3 rounded-2xl border border-border-subtle bg-bg-primary/35 p-3 sm:grid-cols-[132px_minmax(0,1fr)]">
                  <div className="relative">
                    <ProductVisual
                      name={buyerPreviewName}
                      imageUrl={productImagePreviewUrl || productImageUrl}
                      productType="entitlement"
                      resourceType={previewResourceType}
                      assetType={previewAssetType}
                      showLabel={false}
                      className="aspect-[3/2] w-full"
                    />
                    {productImageUploading && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-bg-deep/45 text-primary backdrop-blur-sm">
                        <Loader2 className="animate-spin" size={22} />
                      </div>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-col justify-center gap-3">
                    <div>
                      <div className="text-sm font-black text-text-primary">
                        {t('commerce.productCover')}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-text-muted">
                        {t('commerce.productCoverHint')}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <label
                        className={cn(
                          'inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-border-subtle bg-bg-secondary px-3 text-xs font-black text-text-primary transition hover:border-primary/40 hover:text-primary',
                          productImageUploading && 'pointer-events-none opacity-60',
                        )}
                      >
                        {productImageUploading ? (
                          <Loader2 className="animate-spin" size={14} />
                        ) : (
                          <ImagePlus size={14} />
                        )}
                        {productImageUploading
                          ? t('commerce.uploadingCover')
                          : t('commerce.uploadCover')}
                        <input
                          type="file"
                          accept="image/*"
                          disabled={productImageUploading}
                          className="sr-only"
                          onChange={(event) => {
                            const file = event.currentTarget.files?.[0]
                            if (file) void uploadProductCover(file)
                            event.currentTarget.value = ''
                          }}
                        />
                      </label>
                      {productImageUrl && (
                        <button
                          type="button"
                          className="inline-flex h-9 items-center gap-2 rounded-full border border-border-subtle bg-bg-secondary px-3 text-xs font-black text-text-muted transition hover:border-danger/30 hover:text-danger"
                          onClick={() => {
                            setProductImageUrl('')
                            setProductImagePreviewUrl('')
                          }}
                        >
                          <XCircle size={14} />
                          {t('commerce.removeCover')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <label className="grid gap-1.5">
                  <span className="text-xs font-black uppercase tracking-[0.12em] text-text-muted">
                    {t('commerce.productName')}
                  </span>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('commerce.productName')}
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs font-black uppercase tracking-[0.12em] text-text-muted">
                    {t('commerce.productSummary')}
                  </span>
                  <Input
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder={t('commerce.productSummary')}
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs font-black uppercase tracking-[0.12em] text-text-muted">
                    {t('commerceMarketplace.productTags')}
                  </span>
                  <Input
                    value={productTags}
                    onChange={(e) => setProductTags(e.target.value)}
                    placeholder={t('commerceMarketplace.productTagsPlaceholder')}
                  />
                </label>
                <label className="flex items-start gap-3 rounded-2xl border border-border-subtle bg-bg-primary/35 p-3">
                  <input
                    type="checkbox"
                    checked={productGlobalPublic}
                    onChange={(event) => setProductGlobalPublic(event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-border-subtle bg-bg-secondary text-primary"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-black text-text-primary">
                      {t('commerceMarketplace.globalPublic')}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-text-muted">
                      {t('commerceMarketplace.globalPublicHint')}
                    </span>
                  </span>
                </label>
              </ProductFormSection>

              <ProductFormSection
                title={t('commerce.deliveryAndPricing')}
                description={t('commerce.deliveryAndPricingHint')}
              >
                <div className="grid gap-2 sm:grid-cols-2">
                  {DELIVERY_PRESETS.map((preset) => {
                    const Icon = preset.icon
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => {
                          if (!isFileDeliveryPreset(preset.value)) {
                            setPaidFileNode(null)
                            if (isFileDeliveryPreset(deliveryPreset)) setResourceId('')
                          }
                          if (isFileDeliveryPreset(preset.value)) {
                            setResourceId(paidFileNode?.id ?? '')
                          }
                          if (preset.value === 'desktop_pet_pack') {
                            setBillingMode('one_time')
                            setRepeatable(false)
                            setProductGlobalPublic(true)
                            setProductTags((current) =>
                              withDesktopPetTagsFromInput(current)
                                .filter((tag) => tag !== 'paid_file')
                                .join(', '),
                            )
                          } else {
                            setProductTags((current) =>
                              withoutDesktopPetTagsFromInput(current).join(', '),
                            )
                          }
                          setDeliveryPreset(preset.value)
                        }}
                        className={cn(
                          'rounded-2xl border p-3 text-left transition',
                          deliveryPreset === preset.value
                            ? 'border-primary/50 bg-primary/10 text-primary'
                            : 'border-border-subtle bg-bg-secondary/50 text-text-secondary hover:border-primary/30',
                        )}
                      >
                        <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-bg-primary/70">
                          <Icon size={18} />
                        </span>
                        <span className="block text-sm font-black">
                          {t(`communityEconomy.deliveryPreset.${preset.value}`)}
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-text-muted">
                          {t(`communityEconomy.deliveryPresetHint.${preset.value}`)}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="grid gap-1.5">
                    <span className="text-xs font-black uppercase tracking-[0.12em] text-text-muted">
                      {t('commerce.billingMode')}
                    </span>
                    <select
                      className={selectClassName}
                      value={billingMode}
                      onChange={(e) => setBillingMode(e.target.value as BillingMode)}
                      aria-label={t('commerce.billingMode')}
                    >
                      {BILLING_MODES.map((mode) => (
                        <option key={mode} value={mode}>
                          {t(`commerce.billingModes.${mode}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-black uppercase tracking-[0.12em] text-text-muted">
                      {t('commerce.productPrice')}
                    </span>
                    <Input
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder={t('commerce.productPrice')}
                      inputMode="numeric"
                    />
                    {priceInvalid && (
                      <span className="text-xs font-bold text-danger">
                        {t('commerce.priceInvalidHint')}
                      </span>
                    )}
                  </label>
                  {billingMode !== 'one_time' && (
                    <label className="grid gap-1.5">
                      <span className="text-xs font-black uppercase tracking-[0.12em] text-text-muted">
                        {t('commerce.durationDays')}
                      </span>
                      <Input
                        value={durationDays}
                        onChange={(e) => setDurationDays(e.target.value)}
                        placeholder={t('commerce.durationDays')}
                        inputMode="numeric"
                      />
                      {durationInvalid && (
                        <span className="text-xs font-bold text-danger">
                          {t('commerce.durationInvalidHint')}
                        </span>
                      )}
                    </label>
                  )}
                  <label className="flex items-center gap-3 rounded-xl border border-border-subtle bg-bg-secondary/50 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={repeatable}
                      onChange={(e) => setRepeatable(e.target.checked)}
                      className="h-4 w-4 accent-primary"
                    />
                    <span className="text-xs font-black text-text-primary">
                      {t('commerce.repeatablePurchase')}
                    </span>
                  </label>
                </div>
              </ProductFormSection>

              <ProductFormSection
                title={t('commerce.fulfillmentTarget')}
                description={t('commerce.fulfillmentTargetHint')}
              >
                {deliveryPreset === 'service' ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1.5">
                      <span className="text-xs font-black uppercase tracking-[0.12em] text-text-muted">
                        {t('commerce.capability')}
                      </span>
                      <select
                        className={selectClassName}
                        value={capability}
                        onChange={(e) => setCapability(e.target.value as ResourceCapability)}
                        aria-label={t('commerce.capability')}
                      >
                        {RESOURCE_CAPABILITIES.map((item) => (
                          <option key={item} value={item}>
                            {t(`commerce.capabilities.${item}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-xs font-black uppercase tracking-[0.12em] text-text-muted">
                        {t('commerce.resourceId')}
                      </span>
                      <Input
                        value={resourceId}
                        onChange={(e) => setResourceId(e.target.value)}
                        placeholder={t('commerce.resourceId')}
                      />
                    </label>
                  </div>
                ) : isFileDeliveryPreset(deliveryPreset) ? (
                  <div className="grid gap-3">
                    <label className="grid gap-1.5">
                      <span className="text-xs font-black uppercase tracking-[0.12em] text-text-muted">
                        {t('commerce.paidFileServer')}
                      </span>
                      <select
                        className={selectClassName}
                        value={paidFileServerId}
                        onChange={(e) => {
                          setPaidFileServerId(e.target.value)
                          setPaidFileNode(null)
                          setResourceId('')
                        }}
                        aria-label={t('commerce.paidFileServer')}
                      >
                        {serverEntries.length === 0 && (
                          <option value="">{t('commerce.paidFileServerPlaceholder')}</option>
                        )}
                        {serverEntries.map((entry) => (
                          <option key={entry.server.id} value={entry.server.id}>
                            {entry.server.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="rounded-2xl border border-border-subtle bg-bg-primary/35 p-3">
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-sm font-black text-text-primary">
                            <FileText size={16} className="text-primary" />
                            {paidFileNode ? paidFileNode.name : paidFileTitle}
                          </div>
                          <p className="mt-1 text-xs leading-5 text-text-muted">
                            {paidFileNode
                              ? t('commerce.paidFileSelected', {
                                  size:
                                    formatFileSizeLabel(paidFileNode.sizeBytes) ??
                                    t('common.unknown'),
                                })
                              : paidFileHint}
                          </p>
                        </div>
                        <label
                          className={cn(
                            'inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 text-xs font-black text-primary transition hover:bg-primary/15',
                            (paidFileUploading || !paidFileServerId) &&
                              'pointer-events-none opacity-60',
                          )}
                        >
                          {paidFileUploading ? (
                            <Loader2 className="animate-spin" size={15} />
                          ) : (
                            <FileText size={15} />
                          )}
                          {paidFileUploading
                            ? t('commerce.uploadingPaidFile')
                            : t('commerce.uploadPaidFile')}
                          <input
                            type="file"
                            accept={
                              deliveryPreset === 'desktop_pet_pack'
                                ? '.zip,.shadowpet,.shadowpet.zip,application/zip,application/x-zip-compressed'
                                : undefined
                            }
                            disabled={paidFileUploading || !paidFileServerId}
                            className="sr-only"
                            onChange={(event) => {
                              const file = event.currentTarget.files?.[0]
                              if (file) void uploadPaidFile(file)
                              event.currentTarget.value = ''
                            }}
                          />
                        </label>
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-10 rounded-full px-4 text-xs"
                          disabled={!paidFileServerId}
                          onClick={() => setPaidFilePickerOpen(true)}
                        >
                          {t('commerce.chooseWorkspaceFile')}
                        </Button>
                      </div>
                    </div>
                    {!resourceId.trim() && (
                      <p className="text-xs font-bold text-danger">
                        {deliveryPreset === 'desktop_pet_pack'
                          ? t('commerce.desktopPetPackRequiredHint')
                          : t('commerce.paidFileRequiredHint')}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="grid gap-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-black uppercase tracking-[0.12em] text-text-muted">
                        {t('communityEconomy.assetDelivery')}
                      </span>
                      <span className="text-xs font-bold text-text-muted">
                        {t('communityEconomy.assetDefinitionsCount', { count: shopAssets.length })}
                      </span>
                    </div>
                    <Input
                      value={assetName}
                      onChange={(e) => setAssetName(e.target.value)}
                      placeholder={t('communityEconomy.assetNamePlaceholder')}
                    />
                    <Input
                      value={assetDescription}
                      onChange={(e) => setAssetDescription(e.target.value)}
                      placeholder={t('communityEconomy.assetDescriptionPlaceholder')}
                    />
                  </div>
                )}
                {paidFilePickerOpen && paidFileServerId && (
                  <WorkspaceFilePicker
                    serverId={paidFileServerId}
                    mode="select-file"
                    title={t('commerce.chooseWorkspaceFile')}
                    onConfirm={({ node }) => {
                      bindPaidFileNode(node)
                      setPaidFilePickerOpen(false)
                    }}
                    onClose={() => setPaidFilePickerOpen(false)}
                  />
                )}
                <textarea
                  value={privilegeDescription}
                  onChange={(e) => setPrivilegeDescription(e.target.value)}
                  placeholder={t('commerce.privilegeDescription')}
                  rows={3}
                  className="min-h-24 w-full resize-y rounded-xl border border-border-subtle bg-bg-secondary px-3 py-2 text-sm font-bold text-text-primary outline-none transition placeholder:text-text-muted focus:border-primary/60"
                />
              </ProductFormSection>

              <ProductFormSection
                title={t('commerce.buyerPreview')}
                description={t('commerce.buyerPreviewHint')}
              >
                <div className="rounded-2xl border border-primary/20 bg-primary/[0.06] p-4">
                  <div className="grid gap-4 sm:grid-cols-[128px_minmax(0,1fr)]">
                    <ProductVisual
                      name={buyerPreviewName}
                      imageUrl={productImagePreviewUrl || productImageUrl}
                      productType="entitlement"
                      resourceType={previewResourceType}
                      assetType={previewAssetType}
                      className="aspect-[3/2] w-full"
                    />
                    <div className="min-w-0">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <CommercePill tone="primary" icon={<PreviewDeliveryIcon size={13} />}>
                          {selectedDeliveryLabel}
                        </CommercePill>
                      </div>
                      <div className="text-base font-black text-text-primary">
                        {buyerPreviewName}
                      </div>
                      <p className="mt-1 text-sm leading-6 text-text-secondary">
                        {buyerPreviewSummary}
                      </p>
                      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                        <div className="rounded-xl bg-bg-primary/55 px-3 py-2">
                          <div className="font-black uppercase tracking-[0.12em] text-text-muted">
                            {t('commerce.productPrice')}
                          </div>
                          <div className="mt-1">
                            <PriceBadge amount={Number.isFinite(numericPrice) ? numericPrice : 0} />
                          </div>
                        </div>
                        <div className="rounded-xl bg-bg-primary/55 px-3 py-2">
                          <div className="font-black uppercase tracking-[0.12em] text-text-muted">
                            {t('communityEconomy.deliveryType')}
                          </div>
                          <div className="mt-1 font-black text-text-primary">
                            {selectedDeliveryLabel}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </ProductFormSection>
            </div>
          </CommerceDrawer>
        </>
      )}
    </PageShell>
  )
}

export function ProductDetailPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const params = useParams({ strict: false }) as { productId: string }
  const [showPurchaseModal, setShowPurchaseModal] = useState(false)
  const [purchaseError, setPurchaseError] = useState<string | null>(null)
  const {
    data: productContext,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['commerce-product-context', params.productId],
    queryFn: () => loadCommerceProductContext(params.productId),
  })
  const product = productContext?.product
  const productShop = productContext?.shop
  const productServer = productContext?.server
  const { data: entitlements = [] } = useQuery({
    queryKey: ['entitlements'],
    queryFn: () => fetchApi<Entitlement[]>('/api/entitlements'),
  })

  const purchase = useMutation({
    mutationFn: () =>
      fetchApi<{
        entitlement: Entitlement
        provisioning?: Provisioning
        fulfillmentJobs?: FulfillmentJob[]
      }>(`/api/shops/${product!.shopId}/products/${product!.id}/purchase`, {
        method: 'POST',
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
      }),
    onSuccess: async (result) => {
      setPurchaseError(null)
      await queryClient.invalidateQueries({ queryKey: ['entitlements'] })
      await queryClient.invalidateQueries({ queryKey: ['community-assets'] })
      showToast(t('commerce.purchaseCompleted'), 'success')
      if (entitlementHasOpenablePaidFile(result.entitlement)) {
        window.location.assign(deliveryDetailHref(result.entitlement.id, { openContent: true }))
      }
    },
    onError: (err) => {
      const message = getApiErrorMessage(err, t, 'commerce.purchaseFailed')
      setPurchaseError(message)
      showToast(message, 'error')
    },
  })

  if (isLoading || !product) {
    if (isError) {
      return (
        <PageShell>
          <CommerceEmptyState
            icon={<ShoppingBag />}
            title={t('commerce.productUnavailable')}
            description={t('commerce.productUnavailableHint')}
          />
        </PageShell>
      )
    }
    return (
      <div className="flex h-full items-center justify-center text-text-muted">
        <Loader2 className="animate-spin" />
      </div>
    )
  }

  const image = productImage(product)
  const config = firstEntitlementConfig(product)
  const provisioning = purchase.data?.provisioning
  const durationSeconds = config?.durationSeconds ?? config?.renewalPeriodSeconds ?? null
  const durationDays = durationSeconds ? Math.ceil(durationSeconds / 86400) : null
  const productIsCommunityAsset = config?.resourceType === 'community_asset'
  const productIsInstantDelivery = isInstantDeliveryProduct(product)
  const purchasedEntitlement = entitlements.find(
    (entitlement) => entitlement.productId === product.id && activeEntitlement(entitlement),
  )
  const alreadyPurchased = hasActivePurchasedEntitlement(product, entitlements)
  const deliveryEntitlement = purchase.data?.entitlement ?? purchasedEntitlement
  const canOpenPurchasedContent = entitlementHasOpenablePaidFile(deliveryEntitlement)
  const deliveryHref = deliveryDetailHref(deliveryEntitlement?.id, {
    openContent: canOpenPurchasedContent,
  })
  const modalDetails = {
    name: product.name,
    summary: product.summary,
    imageUrl: image,
    media: product.media,
    productType: product.type,
    resourceType: config?.resourceType,
    assetType: productAssetType(product),
    priceLabel: `${product.basePrice.toLocaleString()} ${t('common.shrimpCoin')}`,
    billingModeLabel: t(`commerce.billingModes.${product.billingMode ?? 'one_time'}`),
    entitlementLabel: t(`commerce.resourceTypes.${config?.resourceType ?? 'service'}`, {
      defaultValue: config?.resourceType ?? t('commerce.resourceEntitlement'),
    }),
    durationLabel: durationDays
      ? t('commerce.validDays', { count: durationDays })
      : t('commerce.permanent'),
    targetLabel: productIsCommunityAsset
      ? t('communityEconomy.assets')
      : (config?.resourceId ?? product.id),
    deliveryLabel: productIsCommunityAsset
      ? t('communityEconomy.assetDelivery')
      : productIsInstantDelivery
        ? t('commerce.immediateDelivery')
        : t('commerce.manualDelivery'),
  }

  return (
    <PageShell>
      <CommerceSurface tone="accent" className="overflow-hidden p-4 sm:p-5">
        <div className="grid gap-5 sm:grid-cols-[minmax(0,0.9fr)_minmax(280px,0.82fr)] sm:items-start lg:grid-cols-[minmax(0,0.82fr)_minmax(320px,0.58fr)]">
          <div className="rounded-2xl border border-border-subtle bg-bg-primary/30 p-3">
            <ProductVisual
              name={product.name}
              media={product.media}
              productType={product.type}
              resourceType={config?.resourceType}
              assetType={productAssetType(product)}
              className="mx-auto aspect-[3/2] max-h-[300px] w-full rounded-xl border border-border-subtle sm:max-h-[360px] lg:max-h-[420px]"
            />
          </div>
          <div className="grid min-w-0 gap-4 p-1 sm:p-0 lg:p-5">
            <div className="min-w-0 space-y-4">
              <div className="min-w-0">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-black text-primary">
                  <ShieldCheck size={13} />
                  {t('commerce.productDetail')}
                </div>
                <h1 className="text-2xl font-black text-text-primary">{product.name}</h1>
                {product.summary && (
                  <p className="mt-2 text-sm leading-6 text-text-secondary">{product.summary}</p>
                )}
              </div>
              <ProductMeta product={product} />
              <aside className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border-subtle bg-bg-secondary/45 p-4">
                <div className="rounded-xl border border-border-subtle bg-bg-primary/50 p-3">
                  <div className="text-xs font-bold text-text-muted">
                    {t('commerce.productPrice')}
                  </div>
                  <div className="mt-2 text-2xl">
                    <PriceBadge amount={product.basePrice} />
                  </div>
                </div>
                <ProductDeliverySummary product={product} />
                <div className="flex flex-wrap items-center gap-3">
                  {canOpenPurchasedContent ? (
                    <a
                      href={deliveryHref}
                      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-black text-white shadow-[0_0_24px_rgba(0,198,209,0.24)] transition hover:bg-primary/90"
                    >
                      <ExternalLink size={16} />
                      {t('commerce.openResource')}
                    </a>
                  ) : (
                    <Button
                      className="w-full"
                      onClick={() => setShowPurchaseModal(true)}
                      disabled={purchase.isPending || alreadyPurchased}
                    >
                      {alreadyPurchased
                        ? t('shop.purchased')
                        : purchase.isPending
                          ? t('commerce.purchasing')
                          : t('commerce.buyNow')}
                    </Button>
                  )}
                  {purchase.data && (
                    <div className="flex flex-wrap items-center gap-3">
                      <a
                        href={deliveryHref}
                        className="inline-flex items-center gap-2 text-sm font-bold text-success"
                      >
                        <ReceiptText size={16} />
                        {t('shop.viewDeliveryDetail')}
                      </a>
                      <a
                        href="/app/settings/wallet/entitlements"
                        className="inline-flex items-center gap-2 text-sm font-bold text-primary"
                      >
                        <ShieldCheck size={16} />
                        {t('shop.openPurchaseDelivery')}
                      </a>
                    </div>
                  )}
                  <ProvisioningPill provisioning={provisioning} />
                </div>
              </aside>
              <ProductSourceSummary product={product} shop={productShop} server={productServer} />
              <ProductFulfillmentPanel product={product} />
              {product.description && (
                <div className="rounded-xl border border-border-subtle bg-bg-secondary/60 p-3 text-sm leading-6 text-text-secondary">
                  {product.description}
                </div>
              )}
              {purchase.data && (
                <PurchaseDeliveryStatus
                  provisioning={provisioning}
                  fulfillmentJobs={purchase.data.fulfillmentJobs ?? []}
                />
              )}
            </div>
          </div>
        </div>
      </CommerceSurface>
      <PurchaseConfirmationModal
        open={showPurchaseModal}
        details={modalDetails}
        isPending={purchase.isPending}
        isCompleted={!!purchase.data}
        completionLabel={productIsInstantDelivery ? undefined : t('commerce.purchaseOrderCreated')}
        error={purchaseError}
        provisioningStatus={productIsInstantDelivery ? (provisioning?.status ?? null) : null}
        viewEntitlementHref={deliveryHref}
        onClose={() => {
          setShowPurchaseModal(false)
          setPurchaseError(null)
        }}
        onConfirm={() => {
          if (alreadyPurchased) {
            setPurchaseError(t('shop.alreadyPurchased'))
            return
          }
          purchase.mutate()
        }}
      />
    </PageShell>
  )
}

export function AssetHomePage() {
  const { t } = useTranslation()
  const params = useParams({ strict: false }) as { assetId: string }
  const { data: asset, isLoading } = useQuery({
    queryKey: ['community-asset', params.assetId],
    queryFn: () => fetchApi<CommunityAsset>(`/api/economy/assets/${params.assetId}`),
    enabled: Boolean(params.assetId),
  })
  const shopId = asset?.definition.shopId ?? null
  const { data: shop } = useQuery({
    queryKey: ['asset-home-shop', shopId],
    queryFn: () => fetchApi<Shop>(`/api/shops/${shopId}`),
    enabled: Boolean(shopId),
  })
  const { data: productsData } = useQuery({
    queryKey: ['asset-home-products', shopId, asset?.definition.id],
    queryFn: () => fetchApi<{ products: Product[] }>(`/api/shops/${shopId}/products`),
    enabled: Boolean(shopId && asset?.definition.id),
  })

  if (isLoading || !asset) {
    return (
      <div className="flex h-full items-center justify-center text-text-muted">
        <Loader2 className="animate-spin" />
      </div>
    )
  }

  const { grant, definition } = asset
  const linkedProducts = (productsData?.products ?? []).filter((product) => {
    const config = firstEntitlementConfig(product)
    return config?.resourceType === 'community_asset' && config.resourceId === definition.id
  })
  const salesCount = linkedProducts.reduce((sum, product) => sum + (product.salesCount ?? 0), 0)
  const ratingCount = linkedProducts.reduce((sum, product) => sum + (product.ratingCount ?? 0), 0)
  const ratingTotal = linkedProducts.reduce(
    (sum, product) => sum + (product.avgRating ?? 0) * (product.ratingCount ?? 0),
    0,
  )
  const averageRating = ratingCount > 0 ? ratingTotal / ratingCount : 0
  const assetTypeLabel = t(`communityEconomy.assetTypes.${definition.assetType}`, {
    defaultValue: definition.assetType,
  })
  const sourceOrderId = metadataString(grant.metadata, 'orderId') ?? grant.sourceId ?? null
  const expiresAt = formatDate(grant.expiresAt) ?? t('communityEconomy.never')

  return (
    <PageShell>
      <CommerceSurface tone="accent" className="overflow-hidden p-0">
        <div className="border-b border-border-subtle/70 bg-bg-primary/20 p-4 sm:p-5">
          <ProductVisual
            name={definition.name}
            imageUrl={definition.imageUrl}
            resourceType="community_asset"
            assetType={definition.assetType}
            className="mx-auto aspect-[3/2] w-full max-w-[760px] rounded-2xl border border-border-subtle"
          />
        </div>
        <div className="flex min-w-0 flex-col gap-5 p-5 sm:p-6">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-black text-primary">
              <Package size={13} />
              {t('communityEconomy.assetHome')}
            </div>
            <h1 className="text-2xl font-black text-text-primary sm:text-3xl">{definition.name}</h1>
            {definition.description && (
              <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
                {definition.description}
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <AssetProfileMetric
              label={t('communityEconomy.type')}
              value={assetTypeLabel}
              icon={<Package size={15} />}
            />
            <AssetProfileMetric
              label={t('communityEconomy.remaining')}
              value={`${grant.remainingQuantity}/${grant.quantity}`}
              icon={<ShieldCheck size={15} />}
            />
            <AssetProfileMetric
              label={t('communityEconomy.expiresAt')}
              value={expiresAt}
              icon={<CalendarClock size={15} />}
            />
          </div>

          <div className="grid gap-3 rounded-2xl border border-border-subtle bg-bg-primary/35 p-4 sm:grid-cols-3">
            <AssetProfileMetric
              label={t('commerce.assetMetricSales')}
              value={String(salesCount)}
              icon={<ShoppingBag size={15} />}
            />
            <AssetProfileMetric
              label={t('commerce.assetMetricRating')}
              value={ratingCount > 0 ? averageRating.toFixed(1) : t('commerce.assetMetricNoRating')}
              icon={<Award size={15} />}
            />
            <AssetProfileMetric
              label={t('communityEconomy.source.purchase')}
              value={shop?.name ?? definition.issuerKind ?? t('common.unknown')}
              icon={<Store size={15} />}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href="/app/settings/wallet/assets"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-border-subtle bg-bg-primary/60 px-4 text-sm font-black text-text-primary transition hover:border-primary/40 hover:text-primary"
            >
              <WalletCards size={16} />
              {t('communityEconomy.viewAssets')}
            </a>
            {shop?.ownerUserId && (
              <a
                href={`/app/shop/users/${shop.ownerUserId}?view=buyer`}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-border-subtle bg-bg-primary/60 px-4 text-sm font-black text-text-primary transition hover:border-primary/40 hover:text-primary"
              >
                <Store size={16} />
                {t('commerce.consumerStorefront')}
              </a>
            )}
            {shop?.ownerUserId && (
              <a
                href={`/app/profile/${shop.ownerUserId}`}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-border-subtle bg-bg-primary/60 px-4 text-sm font-black text-text-primary transition hover:border-primary/40 hover:text-primary"
              >
                <ExternalLink size={16} />
                {t('shop.openOwnerProfile')}
              </a>
            )}
          </div>
        </div>
      </CommerceSurface>

      <CommerceSurface className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-text-primary">
              {t('communityEconomy.assetHomeServices')}
            </h2>
            <p className="mt-1 text-sm leading-6 text-text-muted">
              {t('communityEconomy.assetHomeServicesHint')}
            </p>
          </div>
          <CommercePill tone="primary" icon={<ShoppingBag size={13} />}>
            {linkedProducts.length}
          </CommercePill>
        </div>
        <CommerceList>
          {linkedProducts.length === 0 ? (
            <CommerceEmptyState
              icon={<ShoppingBag size={24} />}
              title={t('communityEconomy.noLinkedProducts')}
              description={t('communityEconomy.noLinkedProductsHint')}
            />
          ) : (
            linkedProducts.map((product) => (
              <CommerceListItem
                key={product.id}
                className="border-t"
                media={
                  <ProductVisual
                    name={product.name}
                    media={product.media}
                    productType={product.type}
                    resourceType="community_asset"
                    assetType={definition.assetType}
                    showLabel={false}
                    className="aspect-[3/2] w-full shrink-0 xl:w-28"
                  />
                }
                title={product.name}
                subtitle={product.summary ?? t('commerce.entitlementGenericContent')}
                meta={
                  <>
                    <ProductMeta product={product} />
                    <PriceBadge amount={product.basePrice} />
                  </>
                }
                action={
                  <a
                    href={`/app/shop/products/${product.id}`}
                    className="inline-flex h-9 items-center gap-1 rounded-full border border-border-subtle bg-bg-primary/60 px-3 text-xs font-black text-text-primary transition hover:border-primary/40 hover:text-primary"
                  >
                    {t('commerce.viewProduct')}
                    <ChevronRight size={14} />
                  </a>
                }
              />
            ))
          )}
        </CommerceList>
      </CommerceSurface>

      <CommerceSurface className="p-5">
        <div className="mb-4">
          <h2 className="text-base font-black text-text-primary">
            {t('communityEconomy.assetHomeTimeline')}
          </h2>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            {t('communityEconomy.assetHomeTimelineHint')}
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <AssetProfileMetric
            label={t('communityEconomy.status.active')}
            value={t(`communityEconomy.status.${grant.status}`, { defaultValue: grant.status })}
            icon={<CheckCircle2 size={15} />}
          />
          <AssetProfileMetric
            label={t('shop.orderNo')}
            value={sourceOrderId ?? t('common.unknown')}
            icon={<ReceiptText size={15} />}
          />
          <AssetProfileMetric
            label={t('communityEconomy.assetBehavior.giftable')}
            value={
              definition.giftable
                ? t('communityEconomy.assetBehavior.giftable')
                : t('communityEconomy.assetBehavior.bound')
            }
            icon={<Gift size={15} />}
          />
        </div>
      </CommerceSurface>
    </PageShell>
  )
}

function AssetProfileMetric({
  label,
  value,
  icon,
}: {
  label: string
  value: ReactNode
  icon: ReactNode
}) {
  return (
    <div className="rounded-xl border border-border-subtle bg-bg-secondary/55 px-3 py-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-text-muted">
        <span className="text-primary">{icon}</span>
        {label}
      </div>
      <div className="truncate text-sm font-black text-text-primary">{value}</div>
    </div>
  )
}

export function EntitlementsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<EntitlementFilter>('all')
  const [previewFile, setPreviewFile] = useState<{
    id: string
    filename: string
    url: string
    contentType: string
    size: number
    paidFileId?: string
  } | null>(null)
  const { data: entitlements = [], isLoading } = useQuery({
    queryKey: ['entitlements'],
    queryFn: () => fetchApi<Entitlement[]>('/api/entitlements'),
  })

  const entitlementStats = useMemo(() => {
    const pending = entitlements.filter(
      (entitlement) => entitlementDeliveryState(entitlement) === 'pending',
    ).length
    const usable = entitlements.filter(
      (entitlement) => entitlementDeliveryState(entitlement) === 'usable',
    ).length
    const delivered = entitlements.filter(
      (entitlement) => entitlementDeliveryState(entitlement) === 'delivered',
    ).length
    const awaitingReview = entitlements.filter(
      (entitlement) => entitlementDeliveryState(entitlement) === 'awaiting_review',
    ).length
    const completed = entitlements.filter(
      (entitlement) => entitlementDeliveryState(entitlement) === 'completed',
    ).length
    const refunding = entitlements.filter(
      (entitlement) => entitlementDeliveryState(entitlement) === 'refunding',
    ).length
    return { pending, usable, delivered, awaitingReview, completed, refunding }
  }, [entitlements])

  const displayedEntitlements = useMemo(() => {
    if (filter !== 'all') {
      return entitlements.filter((entitlement) => entitlementDeliveryState(entitlement) === filter)
    }
    switch (filter) {
      default:
        return entitlements
    }
  }, [entitlements, filter])

  const groupedEntitlements = useMemo(() => {
    const groups = new Map<string, Entitlement[]>()
    for (const entitlement of displayedEntitlements) {
      const key = entitlementGroupKey(entitlement)
      groups.set(key, [...(groups.get(key) ?? []), entitlement])
    }
    return (
      ['pending', 'usable', 'delivered', 'awaiting_review', 'completed', 'refunding'] as const
    )
      .map((key) => ({ key, items: groups.get(key) ?? [] }))
      .filter((group) => group.items.length > 0)
  }, [displayedEntitlements])

  const filterOptions: Array<{ key: EntitlementFilter; count: number }> = [
    { key: 'all', count: entitlements.length },
    { key: 'pending', count: entitlementStats.pending },
    { key: 'usable', count: entitlementStats.usable },
    { key: 'delivered', count: entitlementStats.delivered },
    { key: 'awaiting_review', count: entitlementStats.awaitingReview },
    { key: 'completed', count: entitlementStats.completed },
    { key: 'refunding', count: entitlementStats.refunding },
  ]

  const openPaidFile = useMutation({
    mutationFn: async (entitlement: Entitlement) => {
      const fileId = entitlementPaidFileId(entitlement)
      if (!fileId) throw new Error('PAID_FILE_NOT_FOUND')
      const result = await fetchApi<{ viewerUrl: string }>(`/api/paid-files/${fileId}/open`, {
        method: 'POST',
      })
      return { entitlement, fileId, viewerUrl: result.viewerUrl }
    },
    onSuccess: ({ entitlement, fileId, viewerUrl }) => {
      setPreviewFile({
        id: `paid-file-${fileId}`,
        filename: entitlement.paidFile?.name ?? entitlement.product?.name ?? t('commerce.paidFile'),
        url: viewerUrl,
        contentType: entitlement.paidFile?.mime ?? 'text/html',
        size: entitlement.paidFile?.sizeBytes ?? 0,
        paidFileId: fileId,
      })
    },
    onError: (err) => showToast(getApiErrorMessage(err, t, 'commerce.openResourceFailed'), 'error'),
  })

  const content = (
    <>
      <CommerceSurface tone="accent" className="px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-bg-primary/70 text-primary shadow-inner">
              <WalletCards size={24} />
            </div>
            <div className="min-w-0">
              <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-primary">
                {t('commerce.purchaseDeliveryEyebrow')}
              </div>
              <h1 className="truncate text-2xl font-black text-text-primary sm:text-3xl">
                {t('commerce.purchaseDeliveryTitle')}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
                {t('commerce.purchaseDeliveryDescription')}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-bold text-text-muted">
            <span>
              <span className="text-text-primary tabular-nums">{entitlementStats.pending}</span>{' '}
              {t('commerce.deliveryStatus.pending')}
            </span>
            <span>
              <span className="text-text-primary tabular-nums">{entitlementStats.usable}</span>{' '}
              {t('commerce.deliveryStatus.usable')}
            </span>
            <span>
              <span className="text-text-primary tabular-nums">{entitlementStats.delivered}</span>{' '}
              {t('commerce.deliveryStatus.delivered')}
            </span>
          </div>
        </div>
      </CommerceSurface>

      <CommerceSurface tone="quiet" className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-black text-text-primary">
              {t('commerce.purchaseDeliveryLibrary')}
            </div>
            <p className="mt-1 text-sm leading-6 text-text-muted">
              {t('commerce.purchaseDeliveryLibraryHint')}
            </p>
          </div>
          <CommerceSegmentedControl
            value={filter}
            options={filterOptions.map((option) => ({
              value: option.key,
              label:
                option.key === 'all'
                  ? t('commerce.entitlementFilters.all')
                  : t(`commerce.deliveryStatus.${option.key}`),
              count: option.count,
            }))}
            onChange={setFilter}
          />
        </div>
      </CommerceSurface>

      <CommerceList>
        {isLoading ? (
          <div className="py-10 text-center text-text-muted">
            <Loader2 className="inline animate-spin" />
          </div>
        ) : entitlements.length === 0 ? (
          <CommerceEmptyState
            icon={<WalletCards size={24} />}
            title={t('commerce.noEntitlements')}
            description={t('commerce.noEntitlementsHint')}
            action={
              <a
                href="/app/settings/shop"
                className="inline-flex h-10 items-center gap-2 rounded-full border border-border-subtle bg-bg-primary/70 px-4 text-sm font-black text-text-primary transition hover:border-primary/40 hover:text-primary"
              >
                <Store size={16} />
                {t('commerce.discoverShops')}
              </a>
            }
          />
        ) : displayedEntitlements.length === 0 ? (
          <CommerceEmptyState
            icon={<ShieldCheck size={24} />}
            title={t('commerce.noFilteredEntitlements')}
            description={t('commerce.noFilteredEntitlementsHint')}
          />
        ) : (
          <>
            {groupedEntitlements.map((group) => (
              <section key={group.key}>
                <div className="flex items-center gap-2 border-t border-border-subtle bg-bg-tertiary/25 px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-text-muted first:border-t-0">
                  <ShieldCheck size={13} />
                  {t(`commerce.deliveryGroups.${group.key}`)}
                </div>
                <div>
                  {group.items.map((entitlement) => {
                    const fileId = entitlementPaidFileId(entitlement)
                    const canOpen = Boolean(fileId && activeEntitlement(entitlement))
                    const title =
                      entitlement.product?.name ??
                      entitlement.paidFile?.name ??
                      t('commerce.resourceEntitlement')
                    const associatedResource =
                      entitlement.paidFile?.name ??
                      entitlement.product?.summary ??
                      t('commerce.entitlementGenericContent')
                    const expiry = formatDate(entitlement.expiresAt) ?? t('commerce.neverExpires')
                    return (
                      <CommerceListItem
                        key={entitlement.id}
                        className="border-t"
                        media={
                          <ProductVisual
                            name={title}
                            imageUrl={entitlementImage(entitlement)}
                            productType={entitlement.product?.type}
                            resourceType={
                              fileId ? 'workspace_file' : (entitlement.resourceType ?? undefined)
                            }
                            assetType={metadataString(entitlement.metadata, 'productAssetType')}
                            showLabel={false}
                            className="aspect-[3/2] w-full shrink-0 xl:w-28"
                          />
                        }
                        title={title}
                        subtitle={associatedResource}
                        meta={
                          <>
                            {entitlement.shop?.name && (
                              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-text-muted">
                                <Store size={13} />
                                {entitlement.shop.name}
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-text-muted">
                              <CalendarClock size={13} />
                              {expiry}
                            </span>
                          </>
                        }
                        action={
                          <>
                            <a
                              href={`/app/settings/wallet/orders/${entitlement.id}`}
                              className="inline-flex h-9 items-center gap-1 rounded-full border border-border-subtle bg-bg-primary/60 px-3 text-xs font-black text-text-primary transition hover:border-primary/40 hover:text-primary"
                            >
                              <ReceiptText size={14} />
                              {t('commerce.viewOrderDetail')}
                            </a>
                            {!canOpen && <EntitlementStatus entitlement={entitlement} />}
                            {canOpen ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => openPaidFile.mutate(entitlement)}
                                disabled={openPaidFile.isPending}
                              >
                                <ExternalLink size={14} />
                                {openPaidFile.isPending
                                  ? t('commerce.openingResource')
                                  : t('commerce.openResource')}
                              </Button>
                            ) : (
                              <span className="text-xs font-bold text-text-muted">
                                {t('commerce.entitlementNoOpenableContent')}
                              </span>
                            )}
                          </>
                        }
                      />
                    )
                  })}
                </div>
              </section>
            ))}
          </>
        )}
      </CommerceList>
    </>
  )

  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1">
        {embedded ? <div className="space-y-4">{content}</div> : <PageShell>{content}</PageShell>}
      </div>
      {previewFile && (
        <FilePreviewPanel
          attachment={previewFile}
          presentation="overlay"
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  )
}

function PurchaseTimeline({ entitlement }: { entitlement: Entitlement }) {
  const { t } = useTranslation()
  const state = entitlementDeliveryState(entitlement)
  const order = entitlement.order
  const primaryJob = entitlement.fulfillmentJobs?.[0]
  const orderStatus = order?.status
  const isInstantOpenable =
    Boolean(entitlementPaidFileId(entitlement)) ||
    ['workspace_file', 'community_asset', 'external_app'].includes(entitlement.resourceType ?? '')
  const completedTime =
    order?.completedAt ?? (!activeEntitlement(entitlement) ? entitlement.expiresAt : null)
  const processingDone =
    ['processing', 'shipped', 'delivered', 'completed'].includes(orderStatus ?? '') ||
    Boolean(primaryJob?.createdAt && state !== 'pending')
  const deliveredDone = ['usable', 'delivered', 'awaiting_review', 'completed'].includes(state)
  const processingTime =
    primaryJob?.createdAt ??
    (processingDone
      ? (order?.shippedAt ?? order?.updatedAt ?? order?.paidAt ?? entitlement.createdAt)
      : null)
  const deliveredTime =
    primaryJob?.updatedAt ??
    (orderStatus === 'delivered' ? order?.updatedAt : null) ??
    order?.shippedAt ??
    (deliveredDone ? (completedTime ?? order?.updatedAt ?? order?.paidAt ?? null) : null)
  const steps = isInstantOpenable
    ? [
        {
          key: 'paid',
          label: t('shop.timelinePaid'),
          time: order?.paidAt ?? entitlement.createdAt,
          done: Boolean(order?.paidAt ?? entitlement.createdAt),
        },
        {
          key: 'ready',
          label: t('commerce.timelineReadyToOpen'),
          time: deliveredDone ? deliveredTime : null,
          done: deliveredDone,
        },
        {
          key: 'completed',
          label: t('shop.timelineCompleted'),
          time: completedTime ?? deliveredTime,
          done: deliveredDone || state === 'completed' || orderStatus === 'completed',
        },
      ]
    : [
        {
          key: 'paid',
          label: t('shop.timelinePaid'),
          time: order?.paidAt ?? entitlement.createdAt,
          done: Boolean(order?.paidAt ?? entitlement.createdAt),
        },
        {
          key: 'processing',
          label: t('shop.timelineProcessing'),
          time: processingDone ? processingTime : null,
          done: processingDone,
        },
        {
          key: 'delivered',
          label: t('shop.timelineDelivered'),
          time: deliveredDone ? deliveredTime : null,
          done: deliveredDone,
        },
        {
          key: 'completed',
          label: t('shop.timelineCompleted'),
          time: completedTime,
          done: state === 'completed',
        },
      ]

  return (
    <CommerceSurface className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-text-primary">{t('commerce.orderTimeline')}</h2>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            {t('commerce.orderTimelineHint')}
          </p>
        </div>
        <EntitlementStatus entitlement={entitlement} />
      </div>
      <div className={cn('grid gap-3', isInstantOpenable ? 'md:grid-cols-3' : 'md:grid-cols-4')}>
        {steps.map((step) => (
          <div
            key={step.key}
            className={cn(
              'rounded-2xl border px-4 py-3',
              step.done
                ? 'border-primary/25 bg-primary/8 text-text-primary'
                : 'border-border-subtle bg-bg-secondary/45 text-text-muted',
            )}
          >
            <div className="flex items-center gap-2 text-sm font-black">
              {step.done ? (
                <CheckCircle2 size={16} className="text-primary" />
              ) : (
                <Clock3 size={16} />
              )}
              {step.label}
            </div>
            <div className="mt-2 text-xs font-bold text-text-muted">
              {formatDate(step.time) ??
                (step.done ? t('shop.timelineRecorded') : t('shop.timelinePending'))}
            </div>
          </div>
        ))}
      </div>
    </CommerceSurface>
  )
}

export function PurchaseOrderDetailPage() {
  const { t } = useTranslation()
  const params = useParams({ strict: false }) as { entitlementId: string }
  const search = useSearch({ strict: false }) as { by?: string; open?: string | number | boolean }
  const lookupByOrder = search.by === 'order'
  const queryClient = useQueryClient()
  const autoOpenAttemptedRef = useRef(false)
  const entitlementDetailQueryKey = [
    'entitlement-detail',
    lookupByOrder ? 'order' : 'entitlement',
    params.entitlementId,
  ] as const
  const [previewFile, setPreviewFile] = useState<{
    id: string
    filename: string
    url: string
    contentType: string
    size: number
    paidFileId?: string
  } | null>(null)
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewContent, setReviewContent] = useState('')
  const [reviewAnonymous, setReviewAnonymous] = useState(false)

  const {
    data: entitlement,
    isLoading,
    isError,
  } = useQuery({
    queryKey: entitlementDetailQueryKey,
    queryFn: () =>
      lookupByOrder
        ? loadEntitlementDetailByOrder(params.entitlementId)
        : loadEntitlementDetail(params.entitlementId),
    enabled: Boolean(params.entitlementId),
  })
  const reviewServerId = entitlement?.shop?.serverId ?? entitlement?.serverId ?? null
  const reviewOrderId = entitlement?.order?.id ?? entitlement?.orderId ?? null
  const reviewProductId = entitlement?.product?.id ?? entitlement?.productId ?? null
  const { data: orderReviews = [] } = useQuery({
    queryKey: ['purchase-order-reviews', reviewServerId, reviewOrderId],
    queryFn: () =>
      fetchApi<OrderReview[]>(
        `/api/servers/${reviewServerId}/shop/orders/${reviewOrderId}/reviews`,
      ),
    enabled: Boolean(reviewServerId && reviewOrderId),
  })

  const openPaidFile = useMutation({
    mutationFn: async () => {
      if (!entitlement) throw new Error('ENTITLEMENT_NOT_FOUND')
      const fileId = entitlementPaidFileId(entitlement)
      if (!fileId) throw new Error('PAID_FILE_NOT_FOUND')
      const result = await fetchApi<{ viewerUrl: string }>(`/api/paid-files/${fileId}/open`, {
        method: 'POST',
      })
      return { fileId, viewerUrl: result.viewerUrl }
    },
    onSuccess: ({ fileId, viewerUrl }) => {
      if (!entitlement) return
      setPreviewFile({
        id: `paid-file-${fileId}`,
        filename: entitlement.paidFile?.name ?? entitlement.product?.name ?? t('commerce.paidFile'),
        url: viewerUrl,
        contentType: entitlement.paidFile?.mime ?? 'text/html',
        size: entitlement.paidFile?.sizeBytes ?? 0,
        paidFileId: fileId,
      })
    },
    onError: (err) => showToast(getApiErrorMessage(err, t, 'commerce.openResourceFailed'), 'error'),
  })

  const cancelEntitlement = useMutation({
    mutationFn: () => {
      if (!entitlement || entitlement.metadata?.orderOnly) throw new Error('ENTITLEMENT_NOT_FOUND')
      return fetchApi(`/api/entitlements/${entitlement.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: t('commerce.refundRequestReason') }),
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: entitlementDetailQueryKey })
      await queryClient.invalidateQueries({ queryKey: ['entitlements'] })
      showToast(t('commerce.refundRequestSubmitted'), 'success')
    },
    onError: (err) => showToast(getApiErrorMessage(err, t, 'commerce.cancelFailed'), 'error'),
  })

  const cancelRenewal = useMutation({
    mutationFn: () => {
      if (!entitlement || entitlement.metadata?.orderOnly) throw new Error('ENTITLEMENT_NOT_FOUND')
      return fetchApi(`/api/entitlements/${entitlement.id}/cancel-renewal`, {
        method: 'POST',
        body: JSON.stringify({ reason: t('commerce.cancelRenewalReason') }),
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: entitlementDetailQueryKey })
      await queryClient.invalidateQueries({ queryKey: ['entitlements'] })
      showToast(t('commerce.renewalCancelled'), 'success')
    },
    onError: (err) => showToast(getApiErrorMessage(err, t, 'commerce.cancelFailed'), 'error'),
  })

  const confirmOrder = useMutation({
    mutationFn: () => {
      if (!reviewOrderId) throw new Error('ORDER_CONTEXT_MISSING')
      const path = reviewServerId
        ? `/api/servers/${reviewServerId}/shop/orders/${reviewOrderId}/complete`
        : `/api/orders/${reviewOrderId}/complete`
      return fetchApi(path, {
        method: 'POST',
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: entitlementDetailQueryKey })
      await queryClient.invalidateQueries({ queryKey: ['entitlements'] })
      await queryClient.invalidateQueries({ queryKey: ['wallet'] })
      showToast(t('shop.orderCompleted'), 'success')
    },
    onError: (err) => showToast(getApiErrorMessage(err, t, 'shop.orderCompleteFailed'), 'error'),
  })

  const submitReview = useMutation({
    mutationFn: () => {
      if (!reviewServerId || !reviewOrderId || !reviewProductId) {
        throw new Error('ORDER_CONTEXT_MISSING')
      }
      return fetchApi(`/api/servers/${reviewServerId}/shop/orders/${reviewOrderId}/review`, {
        method: 'POST',
        body: JSON.stringify({
          productId: reviewProductId,
          rating: reviewRating,
          content: reviewContent.trim() || undefined,
          isAnonymous: reviewAnonymous,
        }),
      })
    },
    onSuccess: async () => {
      setShowReviewForm(false)
      setReviewRating(5)
      setReviewContent('')
      setReviewAnonymous(false)
      await queryClient.invalidateQueries({
        queryKey: ['purchase-order-reviews', reviewServerId, reviewOrderId],
      })
      await queryClient.invalidateQueries({ queryKey: entitlementDetailQueryKey })
      await queryClient.invalidateQueries({ queryKey: ['product-reviews', reviewProductId] })
      showToast(t('shop.reviewSubmitted'), 'success')
    },
    onError: (err) => showToast(getApiErrorMessage(err, t, 'shop.reviewSubmitFailed'), 'error'),
  })

  const autoOpenFileId = entitlement ? entitlementPaidFileId(entitlement) : null
  const shouldOpenFromSearch = ['1', 'true'].includes(String(search.open ?? ''))
  const shouldAutoOpenContent = Boolean(
    shouldOpenFromSearch && entitlement && autoOpenFileId && activeEntitlement(entitlement),
  )

  useEffect(() => {
    if (!shouldAutoOpenContent || autoOpenAttemptedRef.current || openPaidFile.isPending) return
    autoOpenAttemptedRef.current = true
    openPaidFile.mutate()
  }, [openPaidFile, shouldAutoOpenContent])

  if (isLoading || !entitlement) {
    if (isError) {
      return (
        <PageShell>
          <CommerceEmptyState
            icon={<ReceiptText />}
            title={t('commerce.orderUnavailable')}
            description={t('commerce.orderUnavailableHint')}
          />
        </PageShell>
      )
    }
    return (
      <div className="flex h-full items-center justify-center text-text-muted">
        <Loader2 className="animate-spin" />
      </div>
    )
  }

  const title = entitlement.product?.name ?? entitlement.paidFile?.name ?? t('commerce.orders')
  const summary =
    entitlement.product?.summary ??
    entitlement.paidFile?.name ??
    t('commerce.entitlementGenericContent')
  const shopHref = entitlement.shop?.ownerUserId
    ? `/app/shop/users/${entitlement.shop.ownerUserId}?view=buyer`
    : entitlement.shop?.serverId
      ? `/app/servers/${entitlement.shop.serverId}/shop`
      : null
  const ownerProfileHref = entitlement.shop?.ownerUserId
    ? `/app/profile/${entitlement.shop.ownerUserId}`
    : null
  const productHref = entitlement.productId ? `/app/shop/products/${entitlement.productId}` : null
  const canOpen = Boolean(entitlementPaidFileId(entitlement) && activeEntitlement(entitlement))
  const isExternalAppEntitlement = entitlement.resourceType === 'external_app'
  const isManualServiceEntitlement = entitlement.resourceType === 'service'
  const isCompletedService = isManualServiceEntitlement && entitlement.order?.status === 'completed'
  const isOrderOnlyDetail = entitlement.metadata?.orderOnly === true
  const canCancel = !isOrderOnlyDetail && entitlement.status === 'active' && entitlement.isActive
  const canCancelRenewal = canCancel && Boolean(entitlement.nextRenewalAt)
  const canConfirmOrder =
    ['shipped', 'delivered'].includes(entitlement.order?.status ?? '') && Boolean(reviewOrderId)
  const hasReviewed = orderReviews.length > 0
  const canReview =
    entitlement.order?.status === 'completed' &&
    Boolean(reviewServerId && reviewOrderId && reviewProductId) &&
    !hasReviewed
  const buyerName =
    entitlement.buyer?.displayName ?? entitlement.buyer?.username ?? entitlement.userId

  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1">
        <PageShell>
          <a
            href="/app/settings/wallet/entitlements"
            className="inline-flex w-fit items-center gap-2 rounded-full border border-border-subtle bg-bg-secondary/60 px-3 py-2 text-sm font-black text-text-primary transition hover:border-primary/40 hover:text-primary"
          >
            <ArrowLeft size={16} />
            {t('commerce.backToPurchases')}
          </a>

          <CommerceSurface tone="accent" className="overflow-hidden p-4 sm:p-5">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.42fr)] lg:items-stretch">
              <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(132px,240px)_minmax(0,1fr)] sm:items-start">
                <ProductVisual
                  name={title}
                  imageUrl={entitlementImage(entitlement)}
                  productType={entitlement.product?.type}
                  resourceType={entitlement.resourceType ?? undefined}
                  assetType={metadataString(entitlement.metadata, 'productAssetType')}
                  className="aspect-[3/2] w-full rounded-2xl border border-border-subtle"
                />
                <div className="min-w-0">
                  <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-black text-primary">
                    <ReceiptText size={13} />
                    {t('commerce.orderDetail')}
                  </div>
                  <h1 className="text-2xl font-black leading-tight text-text-primary sm:text-3xl">
                    {title}
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">{summary}</p>

                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    <AssetProfileMetric
                      label={t('shop.orderNo')}
                      value={entitlement.order?.orderNo ?? entitlement.orderId ?? entitlement.id}
                      icon={<ReceiptText size={15} />}
                    />
                    <AssetProfileMetric
                      label={t('commerce.productPrice')}
                      value={
                        <PriceBadge
                          amount={
                            entitlement.order?.totalAmount ?? entitlement.product?.basePrice ?? 0
                          }
                        />
                      }
                      icon={<ShrimpCoinIcon size={15} />}
                    />
                    <AssetProfileMetric
                      label={t('commerce.buyer')}
                      value={buyerName}
                      icon={<WalletCards size={15} />}
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {productHref && (
                      <a
                        href={productHref}
                        className="inline-flex h-9 items-center gap-2 rounded-full border border-border-subtle bg-bg-primary/50 px-3 text-xs font-black text-text-secondary transition hover:border-primary/40 hover:text-primary"
                      >
                        <Package size={14} />
                        {t('commerce.viewProduct')}
                      </a>
                    )}
                    {shopHref && (
                      <a
                        href={shopHref}
                        className="inline-flex h-9 items-center gap-2 rounded-full border border-border-subtle bg-bg-primary/50 px-3 text-xs font-black text-text-secondary transition hover:border-primary/40 hover:text-primary"
                      >
                        <Store size={14} />
                        {t('shop.openShop')}
                      </a>
                    )}
                    {ownerProfileHref && (
                      <a
                        href={ownerProfileHref}
                        className="inline-flex h-9 items-center gap-2 rounded-full border border-border-subtle bg-bg-primary/50 px-3 text-xs font-black text-text-secondary transition hover:border-primary/40 hover:text-primary"
                      >
                        <ExternalLink size={14} />
                        {t('shop.openOwnerProfile')}
                      </a>
                    )}
                  </div>
                </div>
              </div>

              <aside className="flex min-w-0 flex-col justify-between gap-4 rounded-2xl border border-border-subtle bg-bg-primary/55 p-4">
                <div className="min-w-0">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <CommercePill
                      tone={canOpen ? 'success' : 'primary'}
                      icon={canOpen ? <ExternalLink size={13} /> : <ShieldCheck size={13} />}
                    >
                      {canOpen ? t('commerce.openableContent') : t('commerce.orderDetail')}
                    </CommercePill>
                    <EntitlementStatus entitlement={entitlement} />
                  </div>
                  <h2 className="text-lg font-black text-text-primary">
                    {canOpen ? t('commerce.openContentTitle') : t('commerce.orderStatusTitle')}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-text-muted">
                    {canOpen
                      ? t('commerce.openContentHeroHint')
                      : t('commerce.orderStatusHeroHint')}
                  </p>
                </div>
                {canOpen ? (
                  <Button
                    className="h-12 w-full text-base"
                    variant="primary"
                    onClick={() => openPaidFile.mutate()}
                    disabled={openPaidFile.isPending}
                  >
                    <ExternalLink size={18} />
                    {openPaidFile.isPending
                      ? t('commerce.openingResource')
                      : t('commerce.openResource')}
                  </Button>
                ) : (
                  <div className="rounded-xl border border-border-subtle bg-bg-secondary/50 px-3 py-3">
                    <EntitlementStatus entitlement={entitlement} />
                  </div>
                )}
              </aside>
            </div>
          </CommerceSurface>

          <PurchaseTimeline entitlement={entitlement} />

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <CommerceSurface className="p-5">
              <h2 className="text-base font-black text-text-primary">
                {t('commerce.deliveryContent')}
              </h2>
              <div className="mt-4 grid gap-3">
                <CommerceListItem
                  media={
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      {canOpen ? <ExternalLink size={20} /> : <ShieldCheck size={20} />}
                    </span>
                  }
                  title={
                    canOpen
                      ? (entitlement.paidFile?.name ?? t('commerce.openableContent'))
                      : isExternalAppEntitlement
                        ? t('commerce.externalAppEntitlementContent')
                        : isCompletedService
                          ? t('commerce.serviceCompletedContent')
                          : t('commerce.entitlementGenericContent')
                  }
                  subtitle={
                    canOpen
                      ? t('commerce.deliveryOpenableHint')
                      : isExternalAppEntitlement
                        ? t('commerce.externalAppEntitlementHint')
                        : isCompletedService
                          ? t('commerce.serviceCompletedHint')
                          : t('commerce.deliveryPendingHint')
                  }
                  action={
                    canOpen ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openPaidFile.mutate()}
                        disabled={openPaidFile.isPending}
                      >
                        <ExternalLink size={14} />
                        {openPaidFile.isPending
                          ? t('commerce.openingResource')
                          : t('commerce.openResource')}
                      </Button>
                    ) : (
                      <EntitlementStatus entitlement={entitlement} />
                    )
                  }
                />
                {entitlement.fulfillmentJobs?.map((job) => (
                  <CommerceListItem
                    key={job.id}
                    className="border-t"
                    media={
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-bg-secondary text-text-muted">
                        <MessageSquare size={20} />
                      </span>
                    }
                    title={t('commerce.fulfillmentJob')}
                    subtitle={job.resultMessageId ?? job.lastErrorCode ?? job.id}
                    meta={
                      <CommercePill
                        tone={job.status === 'fulfilled' ? 'success' : 'warning'}
                        icon={<Clock3 size={13} />}
                      >
                        {t(`communityEconomy.status.${job.status}`, {
                          defaultValue: job.status,
                        })}
                      </CommercePill>
                    }
                  />
                ))}
              </div>
            </CommerceSurface>

            <CommerceSurface className="p-5">
              <h2 className="text-base font-black text-text-primary">
                {t('commerce.afterSaleRules')}
              </h2>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                {t('commerce.afterSaleRulesHint')}
              </p>
              <div className="mt-4 grid gap-2">
                {ownerProfileHref && (
                  <a
                    href={ownerProfileHref}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-border-subtle bg-bg-primary/60 px-4 text-sm font-black text-text-primary transition hover:border-primary/40 hover:text-primary"
                  >
                    <MessageSquare size={16} />
                    {t('commerce.contactSeller')}
                  </a>
                )}
                {canConfirmOrder && (
                  <Button
                    variant="primary"
                    onClick={() => confirmOrder.mutate()}
                    disabled={confirmOrder.isPending}
                  >
                    <CheckCircle2 size={16} />
                    {t('shop.confirmReceipt')}
                  </Button>
                )}
                {canReview && !showReviewForm && (
                  <Button variant="secondary" onClick={() => setShowReviewForm(true)}>
                    <Star size={16} />
                    {t('shop.writeReview')}
                  </Button>
                )}
                {hasReviewed && (
                  <CommercePill tone="success" icon={<CheckCircle2 size={13} />}>
                    {t('shop.reviewed')}
                  </CommercePill>
                )}
                {canCancelRenewal && (
                  <>
                    <div className="rounded-2xl border border-border-subtle bg-bg-primary/45 px-4 py-3 text-sm leading-6 text-text-muted">
                      <span className="font-black text-text-primary">
                        {t('commerce.nextRenewal')}
                      </span>
                      <span className="mx-2">·</span>
                      {formatDate(entitlement.nextRenewalAt)}
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => cancelRenewal.mutate()}
                      disabled={cancelRenewal.isPending}
                    >
                      <RefreshCcw size={16} />
                      {cancelRenewal.isPending
                        ? t('commerce.cancelRenewalInProgress')
                        : t('commerce.cancelRenewal')}
                    </Button>
                  </>
                )}
                {showReviewForm && (
                  <div className="rounded-2xl border border-border-subtle bg-bg-primary/45 p-4">
                    <div className="mb-3 text-sm font-black text-text-primary">
                      {t('shop.productRating')}
                    </div>
                    <div className="mb-4 flex gap-1">
                      {[1, 2, 3, 4, 5].map((rating) => (
                        <button
                          key={rating}
                          type="button"
                          onClick={() => setReviewRating(rating)}
                          className={cn(
                            'rounded-lg p-1 transition',
                            rating <= reviewRating ? 'text-warning' : 'text-text-muted',
                          )}
                        >
                          <Star size={20} fill={rating <= reviewRating ? 'currentColor' : 'none'} />
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={reviewContent}
                      onChange={(event) => setReviewContent(event.target.value)}
                      placeholder={t('shop.reviewPlaceholder')}
                      className="min-h-24 w-full resize-none rounded-2xl border border-border-subtle bg-bg-secondary/70 px-3 py-2 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-primary/45"
                    />
                    <label className="mt-3 flex items-center gap-2 text-xs font-bold text-text-muted">
                      <input
                        type="checkbox"
                        checked={reviewAnonymous}
                        onChange={(event) => setReviewAnonymous(event.target.checked)}
                      />
                      {t('shop.anonymousReviewLabel')}
                    </label>
                    <div className="mt-4 flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setShowReviewForm(false)}>
                        {t('common.cancel')}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => submitReview.mutate()}
                        disabled={submitReview.isPending}
                      >
                        {t('shop.submitReview')}
                      </Button>
                    </div>
                  </div>
                )}
                <Button
                  variant="glass"
                  onClick={() => cancelEntitlement.mutate()}
                  disabled={!canCancel || cancelEntitlement.isPending}
                >
                  <RefreshCcw size={16} />
                  {cancelEntitlement.isPending
                    ? t('commerce.cancelInProgress')
                    : t('commerce.requestRefund')}
                </Button>
              </div>
            </CommerceSurface>
          </div>
        </PageShell>
      </div>
      {previewFile && (
        <FilePreviewPanel
          attachment={previewFile}
          presentation="overlay"
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  )
}

function ShopOrdersContent() {
  const { t } = useTranslation()
  const { data: shop } = useQuery({
    queryKey: ['personal-shop', 'me'],
    queryFn: () => fetchApi<Shop>('/api/me/shop'),
  })
  const { data: entitlements = [], isLoading } = useQuery({
    queryKey: ['shop-entitlements', shop?.id],
    queryFn: () => fetchApi<Entitlement[]>(`/api/shops/${shop!.id}/entitlements`),
    enabled: Boolean(shop?.id),
  })

  return (
    <CommerceSurface className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-black text-text-primary">
            <ReceiptText size={18} />
            {t('commerce.orders')}
          </h2>
          <p className="mt-1 text-sm leading-6 text-text-muted">{t('commerce.ordersShelfHint')}</p>
        </div>
        <CommercePill tone="primary" icon={<Package size={13} />}>
          {entitlements.length}
        </CommercePill>
      </div>
      {isLoading ? (
        <div className="py-8 text-center text-text-muted">
          <Loader2 className="inline animate-spin" />
        </div>
      ) : entitlements.length === 0 ? (
        <CommerceEmptyState
          icon={<ReceiptText size={24} />}
          title={t('commerce.noOrders')}
          description={t('commerce.noOrdersHint')}
        />
      ) : (
        <CommerceList>
          {entitlements.map((entitlement) => {
            const provisioning = parseProvisioning(entitlement.metadata)
            const title =
              entitlement.product?.name ??
              entitlement.paidFile?.name ??
              entitlement.productId ??
              entitlement.id
            const buyerName =
              entitlement.buyer?.displayName ?? entitlement.buyer?.username ?? entitlement.userId
            return (
              <CommerceListItem
                key={entitlement.id}
                className="border-t"
                media={
                  <ProductVisual
                    name={title}
                    imageUrl={entitlementImage(entitlement)}
                    productType={entitlement.product?.type}
                    resourceType={entitlement.resourceType ?? undefined}
                    assetType={metadataString(entitlement.metadata, 'productAssetType')}
                    showLabel={false}
                    className="aspect-[3/2] w-full shrink-0 xl:w-28"
                  />
                }
                title={title}
                subtitle={`${t('commerce.buyer')} ${buyerName}`}
                meta={
                  <>
                    <CommercePill icon={<CalendarClock size={13} />}>
                      {formatDate(entitlement.expiresAt) ?? t('commerce.neverExpires')}
                    </CommercePill>
                    <ProvisioningPill provisioning={provisioning} />
                  </>
                }
                action={
                  <>
                    <a
                      href={`/app/settings/wallet/orders/${entitlement.id}`}
                      className="inline-flex h-9 items-center gap-1 rounded-full border border-border-subtle bg-bg-primary/60 px-3 text-xs font-black text-text-primary transition hover:border-primary/40 hover:text-primary"
                    >
                      <ReceiptText size={14} />
                      {t('commerce.viewOrderDetail')}
                    </a>
                    <EntitlementStatus entitlement={entitlement} />
                  </>
                }
              />
            )
          })}
        </CommerceList>
      )}
    </CommerceSurface>
  )
}

export function ShopOrdersPage() {
  const { t } = useTranslation()

  return (
    <PageShell>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-black text-primary">
            <Package size={13} />
            {t('commerce.orders')}
          </div>
          <h1 className="text-2xl font-black text-text-primary">{t('commerce.orders')}</h1>
        </div>
        <a
          href="/app/settings/shop"
          className="inline-flex items-center gap-2 rounded-xl border border-border-subtle bg-bg-secondary px-3 py-2 text-sm font-bold text-text-primary transition hover:border-primary/40"
        >
          <Store size={16} />
          {t('commerce.myShop')}
        </a>
      </header>
      <ShopOrdersContent />
    </PageShell>
  )
}
