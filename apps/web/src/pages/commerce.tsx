import { Button, cn, GlassPanel, Input } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import {
  Award,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ExternalLink,
  FileText,
  Gem,
  Loader2,
  Package,
  ReceiptText,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Store,
  Ticket,
  Trash2,
  UserRound,
  WalletCards,
  XCircle,
} from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
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
import type { Product, Shop } from '../components/shop/shop-page'
import { ShrimpCoinIcon } from '../components/shop/ui/currency'
import { fetchApi } from '../lib/api'
import { getApiErrorMessage } from '../lib/api-errors'
import { showToast } from '../lib/toast'
import { useAuthStore } from '../stores/auth.store'

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
}

type ProductEntitlementConfig = {
  resourceType?: string
  resourceId?: string
  capability?: string
  durationSeconds?: number | null
  renewalPeriodSeconds?: number | null
  privilegeDescription?: string
}

type EntitlementFilter = 'all' | 'openable' | 'expiring' | 'history'
type ShopSettingsSection = 'shop' | 'orders'
type DeliveryPreset = 'service' | 'badge' | 'gift' | 'service_ticket'
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

const BILLING_MODES: BillingMode[] = ['one_time', 'fixed_duration', 'subscription']
const RESOURCE_CAPABILITIES: ResourceCapability[] = ['use', 'view', 'download', 'redeem', 'manage']
const DELIVERY_PRESETS: Array<{
  value: DeliveryPreset
  icon: typeof ShieldCheck
  assetType?: CommunityAssetType
}> = [
  { value: 'service', icon: ShieldCheck },
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

function productImage(product?: Product | null) {
  const image = product?.media?.find((item) => item.type === 'image') ?? product?.media?.[0]
  return image?.thumbnailUrl ?? image?.url ?? null
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

function activeEntitlement(entitlement: Entitlement) {
  if (!entitlement.isActive || entitlement.status !== 'active') return false
  if (!entitlement.expiresAt) return true
  return new Date(entitlement.expiresAt).getTime() > Date.now()
}

function entitlementPaidFileId(entitlement: Entitlement) {
  if (entitlement.paidFile?.id) return entitlement.paidFile.id
  return entitlement.resourceType === 'workspace_file' ? entitlement.resourceId : null
}

function entitlementGroupKey(entitlement: Entitlement) {
  if (activeEntitlement(entitlement)) {
    if (
      entitlement.expiresAt &&
      new Date(entitlement.expiresAt).getTime() - Date.now() <= 7 * 24 * 60 * 60 * 1000
    ) {
      return 'expiring'
    }
    return 'active'
  }
  return 'inactive'
}

function entitlementIsExpiring(entitlement: Entitlement) {
  return (
    activeEntitlement(entitlement) &&
    Boolean(entitlement.expiresAt) &&
    new Date(entitlement.expiresAt as string).getTime() - Date.now() <= 7 * 24 * 60 * 60 * 1000
  )
}

function EntitlementStatus({ entitlement }: { entitlement: Entitlement }) {
  const { t } = useTranslation()
  const isActive = entitlement.isActive && entitlement.status === 'active'
  return (
    <CommercePill
      tone={isActive ? 'success' : 'warning'}
      icon={isActive ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
    >
      {t(`commerce.status.${entitlement.status}`, { defaultValue: entitlement.status })}
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
  const title = isCommunityAsset
    ? t('communityEconomy.assetDelivery')
    : t(`commerce.resourceTypes.${config?.resourceType ?? 'service'}`, {
        defaultValue: t('commerce.resourceEntitlement'),
      })
  const description =
    config?.privilegeDescription ||
    product.summary ||
    (isCommunityAsset ? t('communityEconomy.assetDeliveryHint') : t('commerce.serviceDeliveryHint'))
  const Icon = isCommunityAsset ? Package : ShieldCheck

  if (compact) {
    return (
      <div className="mt-2 flex items-start gap-2 rounded-xl bg-bg-secondary/60 px-3 py-2 text-xs leading-5 text-text-secondary">
        <Icon size={15} className="mt-0.5 shrink-0 text-primary" />
        <span className="min-w-0">
          <span className="font-black text-text-primary">{title}</span>
          <span className="mx-1 text-text-muted">·</span>
          <span>{description}</span>
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
      <p className="mt-1 text-sm leading-6 text-text-secondary">{description}</p>
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
  const params = useParams({ strict: false }) as { userId?: string }
  const currentUser = useAuthStore((s) => s.user)
  const targetUserId = params.userId ?? currentUser?.id
  const [keyword, setKeyword] = useState('')
  const [shopName, setShopName] = useState('')
  const [shopDescription, setShopDescription] = useState('')
  const [name, setName] = useState('')
  const [summary, setSummary] = useState('')
  const [price, setPrice] = useState('100')
  const [resourceType, setResourceType] = useState('service')
  const [resourceId, setResourceId] = useState('')
  const [capability, setCapability] = useState<ResourceCapability>('use')
  const [durationDays, setDurationDays] = useState('30')
  const [billingMode, setBillingMode] = useState<BillingMode>('fixed_duration')
  const [privilegeDescription, setPrivilegeDescription] = useState('')
  const [deliveryPreset, setDeliveryPreset] = useState<DeliveryPreset>('service')
  const [assetName, setAssetName] = useState('')
  const [assetDescription, setAssetDescription] = useState('')
  const [activeSection, setActiveSection] = useState<ShopSettingsSection>(initialSection)
  const [shopSheet, setShopSheet] = useState<'store' | 'product' | null>(null)
  const numericPrice = Number(price)
  const numericDurationDays = Number(durationDays)
  const durationInvalid =
    billingMode !== 'one_time' && (!numericDurationDays || numericDurationDays <= 0)
  const priceInvalid = !Number.isFinite(numericPrice) || numericPrice <= 0

  const { data, isLoading } = useQuery({
    queryKey: ['personal-shop', targetUserId],
    queryFn: async () => {
      if (!targetUserId) throw new Error('missing user')
      if (!params.userId || params.userId === currentUser?.id) {
        return { shop: await fetchApi<Shop>('/api/me/shop'), canManage: true }
      }
      try {
        return {
          shop: await fetchApi<Shop>(`/api/users/${targetUserId}/shop/manage`),
          canManage: true,
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

  useEffect(() => {
    if (!shop) return
    setShopName(shop.name)
    setShopDescription(shop.description ?? '')
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
    setResourceType('community_asset')
    setCapability('redeem')
  }, [deliveryPreset])

  const { data: productsData, isFetching: isFetchingProducts } = useQuery({
    queryKey: ['personal-shop-products', shop?.id, keyword],
    queryFn: () =>
      fetchApi<{ products: Product[] }>(
        `/api/shops/${shop!.id}/products?keyword=${encodeURIComponent(keyword.trim())}`,
      ),
    enabled: Boolean(shop?.id),
  })
  const products = productsData?.products ?? []

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
      let assetDefinition: ShopAssetDefinition | null = null
      if (selectedPreset?.assetType) {
        assetDefinition = await fetchApi<ShopAssetDefinition>(`/api/shops/${shop!.id}/assets`, {
          method: 'POST',
          body: JSON.stringify({
            assetType: selectedPreset.assetType,
            name: assetName.trim() || name.trim(),
            description: assetDescription.trim() || summary.trim() || null,
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
      }

      const product = await fetchApi<Product>(`/api/shops/${shop!.id}/products`, {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          slug: toProductSlug(name),
          type: 'entitlement',
          billingMode,
          status: 'active',
          summary: summary.trim() || undefined,
          basePrice: Math.round(numericPrice),
          entitlementConfig: {
            resourceType: assetDefinition ? 'community_asset' : resourceType.trim() || 'service',
            resourceId: assetDefinition?.id ?? (resourceId.trim() || undefined),
            capability: assetDefinition ? 'redeem' : capability,
            durationSeconds: billingMode === 'one_time' ? null : durationSeconds,
            renewalPeriodSeconds: billingMode === 'subscription' ? durationSeconds : undefined,
            privilegeDescription:
              privilegeDescription.trim() ||
              assetDescription.trim() ||
              (assetDefinition ? assetDefinition.description : undefined),
          },
        }),
      })
      if (assetDefinition) {
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
    onSuccess: async () => {
      setName('')
      setSummary('')
      setResourceId('')
      setPrivilegeDescription('')
      setAssetName('')
      setAssetDescription('')
      setDeliveryPreset('service')
      setShopSheet(null)
      await queryClient.invalidateQueries({ queryKey: ['personal-shop-products', shop?.id] })
      await queryClient.invalidateQueries({ queryKey: ['shop-community-assets', shop?.id] })
      showToast(t('commerce.productCreated'), 'success')
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

  const canSubmitProduct =
    canManage &&
    Boolean(name.trim()) &&
    Boolean(resourceType.trim()) &&
    !priceInvalid &&
    !durationInvalid &&
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
      <CommerceSurface tone="accent" className="px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-bg-primary/70 text-primary shadow-inner">
              <Store size={24} />
            </div>
            <div className="min-w-0">
              <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-primary">
                {t('commerce.creatorStudio')}
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
                  {t('communityEconomy.assetDefinitionsCount', { count: shopAssets.length })}
                </span>
                <span>
                  {t('commerce.currentSection')}{' '}
                  <span className="text-text-primary">
                    {activeSection === 'shop'
                      ? t('commerce.sectionProducts')
                      : t('commerce.sectionOrders')}
                  </span>
                </span>
              </div>
            </div>
          </div>
          {canManage && (
            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <CommerceSegmentedControl
                value={activeSection}
                options={sectionOptions}
                onChange={setActiveSection}
              />
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
        </div>
      </CommerceSurface>

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
                />
              ) : (
                filtered.map((product) => {
                  const image = productImage(product)
                  return (
                    <CommerceListItem
                      key={product.id}
                      className="border-t"
                      media={
                        <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/15 text-primary">
                          {image ? (
                            <img src={image} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <ShoppingBag size={22} />
                          )}
                        </span>
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
                            {t('commerce.openProduct')}
                            <ChevronRight size={14} />
                          </a>
                          {canManage && (
                            <button
                              type="button"
                              title={t('commerce.deleteProduct')}
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition hover:bg-danger/10 hover:text-danger"
                              onClick={() => deleteProduct.mutate(product)}
                            >
                              <Trash2 size={15} />
                            </button>
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
            </div>
          </CommerceDrawer>

          <CommerceDrawer
            open={shopSheet === 'product'}
            title={t('commerce.publishService')}
            description={t('commerce.publishServiceHint')}
            closeLabel={t('common.close')}
            onClose={() => setShopSheet(null)}
            footer={
              <Button
                className="w-full"
                onClick={() => createProduct.mutate()}
                disabled={!canSubmitProduct}
              >
                {createProduct.isPending ? t('commerce.saving') : t('commerce.createProduct')}
              </Button>
            }
          >
            <div className="grid gap-3">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('commerce.productName')}
              />
              <Input
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder={t('commerce.productSummary')}
              />
              <div className="grid gap-2">
                <span className="text-xs font-black uppercase tracking-[0.12em] text-text-muted">
                  {t('communityEconomy.deliveryType')}
                </span>
                <div className="grid gap-2 sm:grid-cols-2">
                  {DELIVERY_PRESETS.map((preset) => {
                    const Icon = preset.icon
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => setDeliveryPreset(preset.value)}
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
              </div>
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
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder={t('commerce.productPrice')}
                  inputMode="numeric"
                />
                <Input
                  value={durationDays}
                  onChange={(e) => setDurationDays(e.target.value)}
                  placeholder={t('commerce.durationDays')}
                  inputMode="numeric"
                />
              </div>
              {deliveryPreset === 'service' ? (
                <>
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
                  <Input
                    value={resourceId}
                    onChange={(e) => setResourceId(e.target.value)}
                    placeholder={t('commerce.resourceId')}
                  />
                </>
              ) : (
                <div className="grid gap-3 rounded-2xl border border-border-subtle bg-bg-secondary/50 p-4">
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
              <Input
                value={privilegeDescription}
                onChange={(e) => setPrivilegeDescription(e.target.value)}
                placeholder={t('commerce.privilegeDescription')}
              />
              <div className="rounded-2xl border border-primary/20 bg-primary/[0.06] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-xs font-black uppercase tracking-[0.12em] text-primary">
                    {t('commerce.buyerPreview')}
                  </span>
                  <CommercePill tone="primary" icon={<PreviewDeliveryIcon size={13} />}>
                    {selectedDeliveryLabel}
                  </CommercePill>
                </div>
                <div className="text-base font-black text-text-primary">{buyerPreviewName}</div>
                <p className="mt-1 text-sm leading-6 text-text-secondary">{buyerPreviewSummary}</p>
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
                    <div className="mt-1 font-black text-text-primary">{selectedDeliveryLabel}</div>
                  </div>
                </div>
              </div>
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
  const { data: product, isLoading } = useQuery({
    queryKey: ['commerce-product-detail', params.productId],
    queryFn: () => fetchApi<Product>(`/api/products/${params.productId}`),
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
    onSuccess: async () => {
      setPurchaseError(null)
      await queryClient.invalidateQueries({ queryKey: ['entitlements'] })
      await queryClient.invalidateQueries({ queryKey: ['community-assets'] })
      showToast(t('commerce.purchaseCompleted'), 'success')
    },
    onError: (err) => {
      const message = getApiErrorMessage(err, t, 'commerce.purchaseFailed')
      setPurchaseError(message)
      showToast(message, 'error')
    },
  })

  if (isLoading || !product) {
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
  const modalDetails = {
    name: product.name,
    summary: product.summary,
    imageUrl: image,
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
      : t('commerce.immediateDelivery'),
  }

  return (
    <PageShell>
      <GlassPanel className="overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[340px_minmax(0,1fr)]">
          <div className="flex aspect-square items-center justify-center bg-primary/10 text-primary lg:aspect-auto">
            {image ? (
              <img src={image} alt="" className="h-full min-h-[280px] w-full object-cover" />
            ) : (
              <ShoppingBag size={56} />
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-4 p-5">
            <div>
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
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border-subtle bg-bg-secondary/60 p-3">
                <div className="text-xs font-bold text-text-muted">
                  {t('commerce.productPrice')}
                </div>
                <div className="mt-2 text-2xl">
                  <PriceBadge amount={product.basePrice} />
                </div>
              </div>
              <ProductDeliverySummary product={product} />
            </div>
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
            <div className="mt-auto flex flex-wrap items-center gap-3">
              <Button onClick={() => setShowPurchaseModal(true)} disabled={purchase.isPending}>
                {purchase.isPending ? t('commerce.purchasing') : t('commerce.buyNow')}
              </Button>
              {purchase.data && (
                <div className="flex flex-wrap items-center gap-3">
                  <a
                    href="/app/settings?tab=wallet&section=entitlements"
                    className="inline-flex items-center gap-2 text-sm font-bold text-success"
                  >
                    <ShieldCheck size={16} />
                    {t('commerce.viewEntitlement')}
                  </a>
                  <a
                    href="/app/settings?tab=wallet&section=assets"
                    className="inline-flex items-center gap-2 text-sm font-bold text-primary"
                  >
                    <Package size={16} />
                    {t('communityEconomy.viewAssets')}
                  </a>
                </div>
              )}
              <ProvisioningPill provisioning={provisioning} />
            </div>
          </div>
        </div>
      </GlassPanel>
      <PurchaseConfirmationModal
        open={showPurchaseModal}
        details={modalDetails}
        isPending={purchase.isPending}
        isCompleted={!!purchase.data}
        error={purchaseError}
        provisioningStatus={provisioning?.status ?? null}
        onClose={() => {
          setShowPurchaseModal(false)
          setPurchaseError(null)
        }}
        onConfirm={() => purchase.mutate()}
      />
    </PageShell>
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
    const active = entitlements.filter(activeEntitlement).length
    const openable = entitlements.filter(
      (entitlement) => activeEntitlement(entitlement) && entitlementPaidFileId(entitlement),
    ).length
    const expiring = entitlements.filter(entitlementIsExpiring).length
    return { active, openable, expiring }
  }, [entitlements])

  const displayedEntitlements = useMemo(() => {
    switch (filter) {
      case 'openable':
        return entitlements.filter(
          (entitlement) => activeEntitlement(entitlement) && entitlementPaidFileId(entitlement),
        )
      case 'expiring':
        return entitlements.filter(entitlementIsExpiring)
      case 'history':
        return entitlements.filter((entitlement) => !activeEntitlement(entitlement))
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
    return (['expiring', 'active', 'inactive'] as const)
      .map((key) => ({ key, items: groups.get(key) ?? [] }))
      .filter((group) => group.items.length > 0)
  }, [displayedEntitlements])

  const filterOptions: Array<{ key: EntitlementFilter; count: number }> = [
    { key: 'all', count: entitlements.length },
    { key: 'openable', count: entitlementStats.openable },
    { key: 'expiring', count: entitlementStats.expiring },
    { key: 'history', count: entitlements.length - entitlementStats.active },
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
                {t('commerce.entitlementLibraryEyebrow')}
              </div>
              <h1 className="truncate text-2xl font-black text-text-primary sm:text-3xl">
                {t('commerce.entitlementLibraryTitle')}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
                {t('commerce.entitlementLibraryDescription')}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-bold text-text-muted">
            <span>
              <span className="text-text-primary tabular-nums">{entitlementStats.openable}</span>{' '}
              {t('commerce.entitlementsSummaryOpenable')}
            </span>
            <span>
              <span className="text-text-primary tabular-nums">{entitlementStats.active}</span>{' '}
              {t('commerce.entitlementsSummaryActive')}
            </span>
            <span>
              <span className="text-text-primary tabular-nums">{entitlementStats.expiring}</span>{' '}
              {t('commerce.entitlementsSummaryExpiring')}
            </span>
          </div>
        </div>
      </CommerceSurface>

      <CommerceSurface tone="quiet" className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-black text-text-primary">
              {t('commerce.entitlementLibrary')}
            </div>
            <p className="mt-1 text-sm leading-6 text-text-muted">
              {t('commerce.entitlementLibraryHint')}
            </p>
          </div>
          <CommerceSegmentedControl
            value={filter}
            options={filterOptions.map((option) => ({
              value: option.key,
              label: t(`commerce.entitlementFilters.${option.key}`),
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
                href="/app/settings?tab=shop"
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
                  {t(`commerce.entitlementGroups.${group.key}`)}
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
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-bg-primary/70 text-primary">
                            {fileId ? <FileText size={22} /> : <ShieldCheck size={22} />}
                          </div>
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
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-bg-primary/70 text-primary">
                    <UserRound size={20} />
                  </div>
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
                action={<EntitlementStatus entitlement={entitlement} />}
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
          href="/app/settings?tab=shop"
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
