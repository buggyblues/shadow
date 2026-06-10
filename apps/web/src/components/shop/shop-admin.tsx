import { Badge, Button, Card, cn } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  Award,
  CheckCircle,
  ChevronDown,
  Clock,
  Edit3,
  Eye,
  EyeOff,
  FileText,
  FolderPlus,
  Gift,
  Layers,
  Package,
  Plus,
  Save,
  Settings,
  ShoppingBag,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { compressImageForUpload } from '../../lib/image-upload'
import { showToast } from '../../lib/toast'
import { useShopStore } from '../../stores/shop.store'
import { useConfirmStore } from '../common/confirm-dialog'
import { WorkspaceFilePicker } from '../workspace/WorkspaceFilePicker'
import type { Product, ProductCategory, Shop } from './shop-page'
import { PriceDisplay, ShrimpCoinIcon } from './ui/currency'
import { ProductVisual } from './ui/product-visual'
import { ShopPanel, ShopPillBar, ShopPillButton, ShopSearchField } from './ui/shop-layout'

type WorkspaceUploadNode = {
  id: string
  name: string
  sizeBytes?: number | null
}

/* ─────────── Admin Section Types ─────────── */
type AdminSection = 'products' | 'categories' | 'orders' | 'settings'
type ProductTemplate = 'ai_service' | 'paid_file' | 'membership' | 'badge_gift' | 'physical'

function formatFileSizeLabel(size?: number | null) {
  if (!size || size <= 0) return null
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

interface OrderItem {
  id: string
  productName: string
  specValues: string[]
  price: number
  quantity: number
  imageUrl?: string
}

interface AdminOrder {
  id: string
  orderNo: string
  buyerId: string
  status: string
  totalAmount: number
  buyerNote?: string
  sellerNote?: string
  trackingNo?: string
  items: OrderItem[]
  createdAt: string
}

/* ─────────── Component ─────────── */

export interface ShopAdminProps {
  serverId: string
  onBack?: () => void
  embedded?: boolean
}

export function ShopAdmin({ serverId, onBack, embedded = false }: ShopAdminProps) {
  const { t } = useTranslation()
  const [section, setSection] = useState<AdminSection>('products')

  const sections: { key: AdminSection; label: string; icon: ReactNode }[] = [
    {
      key: 'products',
      label: t('shop.adminProducts', '商品管理'),
      icon: <Package size={16} />,
    },
    {
      key: 'categories',
      label: t('shop.adminCategories', '分类管理'),
      icon: <Layers size={16} />,
    },
    { key: 'orders', label: t('shop.adminOrders', '订单管理'), icon: <Tag size={16} /> },
    {
      key: 'settings',
      label: t('shop.adminSettings', '店铺设置'),
      icon: <ShoppingBag size={16} />,
    },
  ]

  return (
    <div
      className={cn(
        'flex h-full flex-1 flex-col overflow-hidden font-sans',
        embedded ? 'bg-transparent' : 'bg-bg-primary',
      )}
    >
      {/* ── Header ── */}
      {(!embedded || onBack) && (
        <div className="z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border-subtle bg-bg-tertiary/50 px-5 backdrop-blur-xl transition-colors">
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              icon={ArrowLeft}
              onClick={onBack}
              className="-ml-2"
            />
          )}
          <h2 className="text-base font-black text-text-primary">
            {t('shop.adminTitle', '店铺管理')}
          </h2>
        </div>
      )}

      {/* ── Section Content ── */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-hidden">
        <ShopPillBar
          className={cn(
            'sticky top-0 z-10 shrink-0 border-b border-[var(--glass-line)] px-4 pt-3',
            embedded ? 'bg-bg-secondary/10' : 'bg-bg-primary/35 backdrop-blur-xl',
          )}
        >
          {sections.map((s) => (
            <ShopPillButton
              key={s.key}
              active={section === s.key}
              onClick={() => setSection(s.key)}
              className="inline-flex h-10 items-center gap-2 px-4 text-sm"
            >
              {s.icon}
              {s.label}
            </ShopPillButton>
          ))}
        </ShopPillBar>
        <div className={cn('w-full', embedded ? 'max-w-none' : 'mx-auto max-w-5xl')}>
          {section === 'products' && <ProductManager serverId={serverId} />}
          {section === 'categories' && <CategoryManager serverId={serverId} />}
          {section === 'orders' && <OrderManager serverId={serverId} />}
          {section === 'settings' && <ShopSettings serverId={serverId} />}
        </div>
      </div>
    </div>
  )
}

/* ╔═══════════════════════════════════════════╗
   ║           Product Manager                 ║
   ╚═══════════════════════════════════════════╝ */

function ProductManager({ serverId }: { serverId: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [search, setSearch] = useState('')

  const { data: productsData } = useQuery({
    queryKey: ['shop-products', serverId],
    queryFn: () =>
      fetchApi<{ products: Product[]; total: number }>(`/api/servers/${serverId}/shop/products`),
  })

  const products = productsData?.products || []

  const filtered = useMemo(() => {
    if (!search.trim()) return products
    const q = search.toLowerCase()
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q),
    )
  }, [products, search])

  const deleteMutation = useMutation({
    mutationFn: (productId: string) =>
      fetchApi(`/api/servers/${serverId}/shop/products/${productId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shop-products', serverId] })
      showToast(t('shop.productDeleted'), 'success')
    },
    onError: (err: Error) => showToast(err.message || t('shop.deleteProductError'), 'error'),
  })

  if (isCreating || editingProduct) {
    return (
      <ProductForm
        serverId={serverId}
        product={editingProduct}
        onCancel={() => {
          setIsCreating(false)
          setEditingProduct(null)
        }}
        onSaved={(savedProduct) => {
          const shouldOpenProduct = isCreating && savedProduct?.id
          setIsCreating(false)
          setEditingProduct(null)
          queryClient.invalidateQueries({ queryKey: ['shop-products', serverId] })
          if (shouldOpenProduct) {
            useShopStore.getState().setActiveProductId(savedProduct.id)
            navigate({ to: '/servers/$serverSlug/shop', params: { serverSlug: serverId } })
          }
        }}
      />
    )
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      {/* Toolbar */}
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
        <ShopSearchField
          value={search}
          onChange={setSearch}
          placeholder={t('shop.searchProducts')}
          className="w-full flex-1"
        />
        <Button variant="primary" icon={Plus} onClick={() => setIsCreating(true)}>
          {t('shop.createProduct')}
        </Button>
      </div>

      {/* Product list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-text-muted">
          <div className="w-24 h-24 mb-6 rounded-full bg-bg-secondary flex items-center justify-center shadow-sm">
            <Package size={48} className="text-text-muted/40" strokeWidth={1.5} />
          </div>
          <p className="mb-1 text-base font-bold text-text-primary">{t('shop.noProductsFound')}</p>
          <p className="text-sm">{t('shop.noProductsFoundHint')}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((product) => (
            <ShopPanel
              key={product.id}
              className="group flex min-w-0 flex-col gap-3 p-4 transition-all duration-200 hover:border-primary/30 hover:bg-bg-secondary/40 sm:flex-row sm:items-center"
            >
              {/* Thumbnail */}
              <div className="aspect-[3/2] w-full shrink-0 overflow-hidden rounded-[18px] border border-[var(--glass-line)] bg-bg-secondary/45 sm:w-24">
                {product.media?.[0]?.url ? (
                  <img
                    src={product.media[0].url}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-text-muted/40">
                    <Package size={24} />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex min-w-0 flex-1 flex-col justify-center">
                <div className="mb-1 flex min-w-0 flex-wrap items-center gap-2">
                  <span className="min-w-0 truncate text-sm font-bold text-text-primary">
                    {product.name}
                  </span>
                  <StatusBadge status={product.status} />
                  {product.type === 'entitlement' && (
                    <Badge variant="warning" size="xs">
                      {t('shop.entitlement')}
                    </Badge>
                  )}
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-3 text-xs font-medium text-text-muted">
                  <span className="text-danger font-bold flex items-baseline gap-0.5">
                    <PriceDisplay amount={product.basePrice} />
                  </span>
                  <span className="flex items-center gap-1">
                    <Package size={12} /> {t('shop.stock')}{' '}
                    {product.skus?.reduce((s, k) => s + k.stock, 0) || 0}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-1 self-end transition-opacity sm:self-auto sm:opacity-0 sm:group-hover:opacity-100">
                <Button
                  variant="ghost"
                  size="icon"
                  icon={Edit3}
                  onClick={() => setEditingProduct(product)}
                  title={t('shop.editProduct')}
                  aria-label={t('shop.editProduct')}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  icon={Trash2}
                  className="hover:!text-danger"
                  title={t('shop.deleteThisProduct')}
                  aria-label={t('shop.deleteThisProduct')}
                  onClick={async () => {
                    const ok = await useConfirmStore.getState().confirm({
                      title: t('shop.deleteProduct'),
                      message: t('shop.deleteProductConfirm'),
                      confirmLabel: t('common.delete'),
                      danger: true,
                    })
                    if (ok) deleteMutation.mutate(product.id)
                  }}
                />
              </div>
            </ShopPanel>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Status Badge ─── */
function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation()
  const map: Record<string, { variant: 'success' | 'neutral' | 'danger'; labelKey: string }> = {
    active: { variant: 'success', labelKey: 'shop.productStatus.active' },
    draft: { variant: 'neutral', labelKey: 'shop.productStatus.draft' },
    archived: { variant: 'danger', labelKey: 'shop.productStatus.archived' },
  }
  const info = map[status] || map.draft!
  return (
    <Badge variant={info.variant} size="xs">
      {t(info.labelKey)}
    </Badge>
  )
}

/* ╔═══════════════════════════════════════════╗
   ║           Product Form                    ║
   ╚═══════════════════════════════════════════╝ */

interface ProductFormProps {
  serverId: string
  product: Product | null
  onCancel: () => void
  onSaved: (product?: Product | null) => void
}

type EntitlementRule = {
  resourceType: string
  resourceId: string
  capability: string
  durationSeconds: string
  repeatable: boolean
  privilegeDescription: string
}

function normalizeEntitlementRules(product: Product | null): EntitlementRule[] {
  if (!product?.entitlementConfig) {
    return [
      {
        resourceType: 'service',
        resourceId: '',
        capability: 'use',
        durationSeconds: '',
        repeatable: true,
        privilegeDescription: '',
      },
    ]
  }

  const raw = product.entitlementConfig as unknown
  const list = Array.isArray(raw) ? raw : [raw]
  return list
    .filter(Boolean)
    .map((cfg) => {
      const item = cfg as {
        resourceType?: string
        resourceId?: string
        capability?: string
        durationSeconds?: number | null
        repeatable?: boolean | null
        privilegeDescription?: string
      }
      return {
        resourceType: item.resourceType || 'service',
        resourceId: item.resourceId || '',
        capability: item.capability || 'use',
        durationSeconds:
          item.durationSeconds === null || item.durationSeconds === undefined
            ? ''
            : String(item.durationSeconds),
        repeatable: item.repeatable !== false,
        privilegeDescription: item.privilegeDescription || '',
      }
    })
    .filter((r) => !!r.resourceType)
}

function inferProductTemplate(product: Product | null): ProductTemplate {
  if (product?.type === 'physical') return 'physical'
  const rule = normalizeEntitlementRules(product)[0]
  if (rule?.resourceType === 'workspace_file') return 'paid_file'
  if (rule?.resourceType === 'subscription') return 'membership'
  if (rule?.resourceType === 'community_asset') return 'badge_gift'
  return 'ai_service'
}

function ProductForm({ serverId, product, onCancel, onSaved }: ProductFormProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const isEditing = !!product

  // Basic fields
  const [name, setName] = useState(product?.name || '')
  const [slug, setSlug] = useState(product?.slug || '')
  const [type, setType] = useState<'physical' | 'entitlement'>(product?.type || 'physical')
  const [status, setStatus] = useState<'draft' | 'active' | 'archived'>(product?.status || 'active')
  const [summary, setSummary] = useState(product?.summary || '')
  const [description, setDescription] = useState(product?.description || '')
  const [basePrice, setBasePrice] = useState(product?.basePrice?.toString() || '0')
  const [billingMode, setBillingMode] = useState<'one_time' | 'fixed_duration' | 'subscription'>(
    product?.billingMode || 'one_time',
  )
  const [tags, setTags] = useState(product?.tags?.join(', ') || '')
  const [globalPublic, setGlobalPublic] = useState(product?.globalPublic === true)
  const [categoryId, setCategoryId] = useState(product?.categoryId || '')
  const [selectedTemplate, setSelectedTemplate] = useState<ProductTemplate>(
    inferProductTemplate(product),
  )
  const [paidFileNode, setPaidFileNode] = useState<WorkspaceUploadNode | null>(null)
  const [paidFileUploading, setPaidFileUploading] = useState(false)
  const [paidFilePickerOpen, setPaidFilePickerOpen] = useState(false)

  // Media
  const [mediaUrls, setMediaUrls] = useState<string[]>(product?.media?.map((m) => m.url) || [])

  // SKUs
  const [specNames, setSpecNames] = useState(product?.specNames?.join(', ') || '')
  const [skus, setSkus] = useState<
    { specValues: string[]; price: string; stock: string; skuCode: string }[]
  >(
    product?.skus?.map((s) => ({
      specValues: s.specValues,
      price: s.price.toString(),
      stock: s.stock.toString(),
      skuCode: s.skuCode || '',
    })) || [],
  )

  // Entitlement config
  const [entitlementRules, setEntitlementRules] = useState<EntitlementRule[]>(
    normalizeEntitlementRules(product),
  )

  const { data: editingProductDetail } = useQuery({
    queryKey: ['shop-product-detail', serverId, product?.id],
    queryFn: () => fetchApi<Product>(`/api/servers/${serverId}/shop/products/${product!.id}`),
    enabled: isEditing,
  })

  useEffect(() => {
    if (!isEditing || !product) return
    const source =
      editingProductDetail &&
      typeof editingProductDetail === 'object' &&
      'id' in editingProductDetail &&
      (editingProductDetail as Product).id
        ? (editingProductDetail as Product)
        : product
    setName(source.name || '')
    setSlug(source.slug || '')
    setType(source.type || 'physical')
    setStatus(source.status || 'draft')
    setSummary(source.summary || '')
    setDescription(source.description || '')
    setBasePrice(source.basePrice?.toString() || '0')
    setBillingMode(source.billingMode || 'one_time')
    setTags(source.tags?.join(', ') || '')
    setGlobalPublic(source.globalPublic === true)
    setSelectedTemplate(inferProductTemplate(source))
    setCategoryId(source.categoryId || '')
    setMediaUrls(source.media?.map((m) => m.url) || [])
    setSpecNames(source.specNames?.join(', ') || '')
    setSkus(
      source.skus?.map((s) => ({
        specValues: s.specValues,
        price: s.price.toString(),
        stock: s.stock.toString(),
        skuCode: s.skuCode || '',
      })) || [],
    )
    setEntitlementRules(normalizeEntitlementRules(source))
  }, [editingProductDetail, isEditing, product])

  const bindPaidFileNode = (node: WorkspaceUploadNode) => {
    setPaidFilePickerOpen(false)
    setPaidFileNode(node)
    setEntitlementRules((rules) => {
      const next = rules.length
        ? [...rules]
        : [
            {
              resourceType: 'workspace_file',
              resourceId: '',
              capability: 'download',
              durationSeconds: '',
              repeatable: true,
              privilegeDescription: '',
            },
          ]
      next[0] = {
        ...next[0]!,
        resourceType: 'workspace_file',
        resourceId: node.id,
        capability: 'download',
        privilegeDescription:
          next[0]!.privilegeDescription ||
          t('commerce.paidFileDefaultPrivilege', { name: node.name }),
      }
      return next
    })
    if (!name.trim()) setName(node.name.replace(/\.[^.]+$/, ''))
    if (!summary.trim()) setSummary(t('commerce.paidFileDefaultSummary', { name: node.name }))
  }

  const uploadPaidFile = async (file: File) => {
    setPaidFileUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const node = await fetchApi<WorkspaceUploadNode>(
        `/api/servers/${serverId}/workspace/upload`,
        {
          method: 'POST',
          body: formData,
        },
      )
      bindPaidFileNode(node)
      showToast(t('commerce.paidFileUploaded'), 'success')
    } catch (err) {
      const message = err instanceof Error ? err.message : t('commerce.paidFileUploadFailed')
      showToast(message || t('commerce.paidFileUploadFailed'), 'error')
    } finally {
      setPaidFileUploading(false)
    }
  }

  const templateOptions = useMemo(
    () => [
      { key: 'ai_service' as const, icon: Sparkles, resourceType: 'service', capability: 'use' },
      {
        key: 'paid_file' as const,
        icon: FileText,
        resourceType: 'workspace_file',
        capability: 'download',
      },
      {
        key: 'membership' as const,
        icon: CheckCircle,
        resourceType: 'subscription',
        capability: 'use',
      },
      {
        key: 'badge_gift' as const,
        icon: Award,
        resourceType: 'community_asset',
        capability: 'redeem',
      },
      { key: 'physical' as const, icon: Package, resourceType: '', capability: 'use' },
    ],
    [],
  )

  const applyTemplate = (template: ProductTemplate) => {
    setSelectedTemplate(template)
    if (template !== 'paid_file') setPaidFileNode(null)
    const option = templateOptions.find((item) => item.key === template)
    setType(template === 'physical' ? 'physical' : 'entitlement')
    setBillingMode(template === 'membership' ? 'fixed_duration' : 'one_time')
    setTags(
      template === 'badge_gift'
        ? 'badge, gift'
        : template === 'physical'
          ? 'physical'
          : template.replace('_', ', '),
    )
    if (!summary.trim()) setSummary(t(`shop.productTemplates.${template}.summary`))
    if (template !== 'physical' && option) {
      setEntitlementRules([
        {
          resourceType: option.resourceType,
          resourceId: '',
          capability: option.capability,
          durationSeconds: template === 'paid_file' ? '' : '2592000',
          repeatable: true,
          privilegeDescription: t(`shop.productTemplates.${template}.promise`),
        },
      ])
    }
  }

  // Categories data
  const { data: categories = [] } = useQuery({
    queryKey: ['shop-categories', serverId],
    queryFn: () => fetchApi<ProductCategory[]>(`/api/servers/${serverId}/shop/categories`),
  })
  const paidFileMissing =
    selectedTemplate === 'paid_file' && type === 'entitlement' && !entitlementRules[0]?.resourceId

  // Auto-generate slug
  useEffect(() => {
    if (!isEditing && name && !slug) {
      setSlug(
        name
          .toLowerCase()
          .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
          .replace(/^-|-$/g, ''),
      )
    }
  }, [name, isEditing, slug])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        name,
        slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
        type,
        billingMode,
        status,
        summary: summary || undefined,
        description: description || undefined,
        basePrice: Number(basePrice) || 0,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        globalPublic,
        categoryId: categoryId || undefined,
        media: mediaUrls.map((url, i) => ({ url, type: 'image', position: i })),
        specNames: specNames
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        skus: skus.map((s) => ({
          specValues: s.specValues,
          price: Number(s.price) || 0,
          stock: Number(s.stock) || 0,
          skuCode: s.skuCode || undefined,
        })),
      }

      if (type === 'entitlement') {
        body.entitlementConfig = entitlementRules.map((rule) => ({
          resourceType: rule.resourceType || 'service',
          resourceId: rule.resourceId || undefined,
          capability: rule.capability || 'use',
          durationSeconds:
            billingMode === 'one_time' || !rule.durationSeconds
              ? null
              : Number(rule.durationSeconds),
          repeatable: rule.repeatable,
          privilegeDescription: rule.privilegeDescription || undefined,
        }))
      }

      if (isEditing) {
        return fetchApi<Product>(`/api/servers/${serverId}/shop/products/${product!.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return fetchApi<Product>(`/api/servers/${serverId}/shop/products`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      })
    },
    onSuccess: async (savedProduct) => {
      if (product?.id) {
        await queryClient.invalidateQueries({
          queryKey: ['shop-product-detail', serverId, product.id],
        })
      }
      await queryClient.invalidateQueries({ queryKey: ['shop-products', serverId] })
      onSaved(savedProduct)
    },
  })

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Form header */}
      <div className="flex items-center justify-between bg-bg-tertiary/50 backdrop-blur-xl p-4 rounded-[24px] border border-border-subtle sticky top-2 z-20">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" icon={ArrowLeft} onClick={onCancel} />
          <h3 className="text-text-primary font-black text-lg">
            {isEditing ? t('shop.editProduct') : t('shop.createProduct')}
          </h3>
        </div>
        <Button
          variant="primary"
          icon={Save}
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !name.trim() || paidFileMissing || paidFileUploading}
          loading={saveMutation.isPending}
        >
          {saveMutation.isPending ? t('commerce.saving') : t('shop.saveProduct')}
        </Button>
      </div>

      {saveMutation.isError && (
        <div className="p-4 bg-danger/10 border border-danger/20 rounded-2xl text-danger text-sm flex items-center gap-2 font-black">
          <XCircle size={18} />
          {t('shop.saveProductFailed')}：{(saveMutation.error as Error).message}
        </div>
      )}

      <div className="space-y-6">
        <FormSection title={t('shop.publishWizard')}>
          <div className="mb-4 grid gap-2 sm:grid-cols-4">
            {(
              [
                'publishStepTemplate',
                'publishStepPromise',
                'publishStepPrice',
                'publishStepPreview',
              ] as const
            ).map((step, index) => (
              <div
                key={step}
                className="rounded-xl border border-border-subtle bg-bg-tertiary/45 px-3 py-2"
              >
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-primary">
                  {String(index + 1).padStart(2, '0')}
                </div>
                <div className="mt-1 text-xs font-black text-text-primary">{t(`shop.${step}`)}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            {templateOptions.map((template) => {
              const Icon = template.icon
              return (
                <button
                  key={template.key}
                  type="button"
                  onClick={() => applyTemplate(template.key)}
                  className={cn(
                    'rounded-2xl border p-3 text-left transition',
                    selectedTemplate === template.key
                      ? 'border-primary/50 bg-primary/10 text-primary'
                      : 'border-border-subtle bg-bg-tertiary/55 text-text-secondary hover:border-primary/30',
                  )}
                >
                  <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-bg-secondary/80">
                    <Icon size={18} />
                  </span>
                  <span className="block text-sm font-black">
                    {t(`shop.productTemplates.${template.key}.label`)}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-text-muted">
                    {t(`shop.productTemplates.${template.key}.hint`)}
                  </span>
                </button>
              )
            })}
          </div>
        </FormSection>

        {/* ── Section: 基本信息 ── */}
        <FormSection title={t('shop.publishBasics')}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FormField label="商品名称 (必填)" className="md:col-span-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：高级会员 / 限定手办"
                className="w-full p-3 bg-bg-tertiary text-white text-sm rounded-xl border border-border-subtle focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-medium"
              />
            </FormField>

            <FormField label="商品短链 (Slug)">
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="将自动生成 (如 vip-1)"
                className="w-full p-3 bg-bg-tertiary text-white text-sm rounded-xl border border-border-subtle focus:outline-none focus:border-primary transition-all font-mono"
              />
            </FormField>

            <FormField label="归属分类">
              <div className="relative">
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full p-3 pr-10 bg-bg-tertiary text-white text-sm rounded-xl border border-border-subtle focus:outline-none focus:border-primary transition-all appearance-none"
                >
                  <option value="">未分类 (设为默认)</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-text-muted"></div>
              </div>
            </FormField>

            <FormField label="商品类型">
              <div className="flex gap-2">
                {(['physical', 'entitlement'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all border-2 ${
                      type === t
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-transparent bg-bg-tertiary text-text-muted hover:bg-bg-modifier-hover'
                    }`}
                  >
                    {t === 'physical' ? '实物商品' : '虚拟权益'}
                  </button>
                ))}
              </div>
            </FormField>

            <FormField label="上架状态">
              <div className="flex gap-2 bg-bg-tertiary p-1.5 rounded-2xl border border-border-subtle">
                {(
                  [
                    { value: 'active', label: '上架展示', icon: <Eye size={14} /> },
                    { value: 'draft', label: '暂存草稿', icon: <EyeOff size={14} /> },
                    { value: 'archived', label: '下架隐藏', icon: <XCircle size={14} /> },
                  ] as const
                ).map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setStatus(s.value)}
                    className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 text-xs font-bold rounded-xl transition-all ${
                      status === s.value
                        ? 'bg-bg-secondary text-white shadow-sm ring-1 ring-border-dim'
                        : 'text-text-muted hover:text-text-primary'
                    }`}
                  >
                    {s.icon}
                    {s.label}
                  </button>
                ))}
              </div>
            </FormField>
          </div>
        </FormSection>

        {/* ── Section: 价格 ── */}
        <FormSection title={t('shop.publishPricing')}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
            <FormField label="商品底价 (美元 / 虾币)">
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
                  <ShrimpCoinIcon className="w-4 h-4 text-danger" />
                </div>
                <input
                  type="number"
                  min="0"
                  value={basePrice}
                  onChange={(e) => setBasePrice(e.target.value)}
                  className="w-full p-3 pl-9 bg-bg-tertiary text-danger text-lg font-black rounded-xl border border-border-subtle focus:outline-none focus:border-primary transition-all font-mono"
                />
              </div>
            </FormField>

            <FormField label={t('commerce.billingMode')}>
              <div className="relative">
                <select
                  value={billingMode}
                  onChange={(e) =>
                    setBillingMode(e.target.value as 'one_time' | 'fixed_duration' | 'subscription')
                  }
                  className="w-full p-3 pr-10 bg-bg-tertiary text-white text-sm rounded-xl border border-border-subtle focus:outline-none focus:border-primary transition-all appearance-none font-medium"
                >
                  <option value="one_time">{t('commerce.billingModes.one_time')}</option>
                  <option value="fixed_duration">
                    {t('commerce.billingModes.fixed_duration')}
                  </option>
                  <option value="subscription">{t('commerce.billingModes.subscription')}</option>
                </select>
                <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-text-muted">
                  <ChevronDown size={14} />
                </div>
              </div>
            </FormField>

            <FormField label="搜索标签 (用逗号分隔)">
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted">
                  <Tag size={16} />
                </span>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="例如: 热门, 新品, 游戏"
                  className="w-full p-3 pl-10 bg-bg-tertiary text-white text-sm rounded-xl border border-border-subtle focus:outline-none focus:border-primary transition-all"
                />
              </div>
            </FormField>
          </div>

          <label className="mb-5 flex items-start gap-3 rounded-xl border border-border-subtle bg-bg-tertiary/45 p-3">
            <input
              type="checkbox"
              checked={globalPublic}
              onChange={(event) => setGlobalPublic(event.target.checked)}
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

          <FormField label="商品简介" className="mb-5">
            <input
              type="text"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="一句话吸引顾客的简短描述"
              maxLength={100}
              className="w-full p-3 bg-bg-tertiary text-white text-sm rounded-xl border border-border-subtle focus:outline-none focus:border-primary transition-all"
            />
          </FormField>

          <FormField label="图文详情">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="详细介绍该商品的特色、规格、使用说明等..."
              rows={5}
              className="w-full p-3 bg-bg-tertiary text-white text-sm rounded-xl border border-border-subtle focus:outline-none focus:border-primary transition-all resize-y"
            />
          </FormField>
        </FormSection>

        {/* ── Section: 媒体 ── */}
        <FormSection title={t('shop.publishMedia')}>
          <div className="flex flex-wrap gap-3 mb-4">
            {mediaUrls.map((url, idx) => (
              <div
                key={idx}
                className="relative aspect-[3/2] w-32 rounded-2xl overflow-hidden shadow-sm border border-border-subtle bg-bg-tertiary group"
              >
                <img src={url} alt="" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setMediaUrls(mediaUrls.filter((_, i) => i !== idx))}
                  className="absolute top-1 right-1 p-1 bg-bg-deep/50 backdrop-blur-sm rounded-full text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-danger"
                >
                  <X size={14} />
                </button>
              </div>
            ))}

            <ImageUploadInput
              onUpload={(url) => setMediaUrls([...mediaUrls, url])}
              className="aspect-[3/2] w-32"
            />
          </div>
          <p className="text-xs text-text-muted ">{t('commerce.productCoverRatioHint')}</p>
        </FormSection>

        {/* ── Section: SKU ── */}
        <FormSection title={t('shop.publishSku')}>
          <FormField label="规格属性体系 (如有多维需用逗号区分)" className="mb-5">
            <input
              type="text"
              value={specNames}
              onChange={(e) => setSpecNames(e.target.value)}
              placeholder="例如: 颜色, 尺码"
              className="w-full p-3 bg-bg-tertiary text-white text-sm rounded-xl border border-border-subtle focus:outline-none focus:border-primary transition-all"
            />
          </FormField>

          {skus.length > 0 && (
            <div className="mb-3 p-1 rounded-xl bg-bg-tertiary border border-border-subtle overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="text-text-muted text-xs border-b border-border-subtle">
                    <th className="py-2 px-3 font-black w-[40%]">规格值组合</th>
                    <th className="py-2 px-3 font-black">价格</th>
                    <th className="py-2 px-3 font-black">库存数</th>
                    <th className="py-2 px-3 font-black w-10 text-center">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {skus.map((sku, idx) => (
                    <tr
                      key={idx}
                      className="group transition-colors rounded-lg overflow-hidden border-b last:border-0 border-border-subtle/50"
                    >
                      <td className="py-1.5 px-2">
                        <input
                          type="text"
                          value={sku.specValues.join(', ')}
                          onChange={(e) => {
                            const updated = [...skus]
                            updated[idx] = {
                              ...sku,
                              specValues: e.target.value.split(',').map((s) => s.trim()),
                            }
                            setSkus(updated)
                          }}
                          placeholder="如: 白色, XL"
                          className="bg-bg-secondary w-full p-2 text-sm rounded-lg border border-border-subtle focus:outline-none focus:border-primary"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="number"
                          value={sku.price}
                          onChange={(e) => {
                            const updated = [...skus]
                            updated[idx] = { ...sku, price: e.target.value }
                            setSkus(updated)
                          }}
                          className="bg-bg-secondary w-full p-2 text-sm rounded-lg border border-border-subtle focus:outline-none focus:border-primary font-mono"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="number"
                          value={sku.stock}
                          onChange={(e) => {
                            const updated = [...skus]
                            updated[idx] = { ...sku, stock: e.target.value }
                            setSkus(updated)
                          }}
                          className="bg-bg-secondary w-full p-2 text-sm rounded-lg border border-border-subtle focus:outline-none focus:border-primary font-mono"
                        />
                      </td>
                      <td className="py-1 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => setSkus(skus.filter((_, i) => i !== idx))}
                          className="p-2 text-text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-colors inline-flex"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button
            type="button"
            onClick={() =>
              setSkus([
                ...skus,
                { specValues: [], price: basePrice || '0', stock: '99', skuCode: '' },
              ])
            }
            className="flex items-center justify-center gap-2 w-full py-3 text-sm font-bold text-primary bg-primary/10 hover:bg-primary/20 border border-dashed border-primary/30 rounded-xl transition-all"
          >
            <Plus size={16} strokeWidth={3} />
            创建一组 SKU 款式
          </button>
        </FormSection>

        {/* ── Section: Entitlement Config ── */}
        {type === 'entitlement' && (
          <FormSection title={t('commerce.entitlementDeliveryConfig')}>
            <div className="space-y-4">
              {selectedTemplate === 'paid_file' && (
                <div className="rounded-2xl border border-primary/20 bg-primary/[0.06] p-4">
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-black text-text-primary">
                        <FileText size={16} className="text-primary" />
                        {paidFileNode
                          ? paidFileNode.name
                          : entitlementRules[0]?.resourceId
                            ? t('commerce.paidFileBound')
                            : t('commerce.paidFileUploadTitle')}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-text-muted">
                        {paidFileNode
                          ? t('commerce.paidFileSelected', {
                              size:
                                formatFileSizeLabel(paidFileNode.sizeBytes) ?? t('common.unknown'),
                            })
                          : t('commerce.paidFileUploadHint')}
                      </p>
                    </div>
                    <label
                      className={cn(
                        'inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 text-xs font-black text-primary transition hover:bg-primary/15',
                        paidFileUploading && 'pointer-events-none opacity-60',
                      )}
                    >
                      {paidFileUploading ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      ) : (
                        <Upload size={15} />
                      )}
                      {paidFileUploading
                        ? t('commerce.uploadingPaidFile')
                        : t('commerce.uploadPaidFile')}
                      <input
                        type="file"
                        disabled={paidFileUploading}
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
                      onClick={() => setPaidFilePickerOpen(true)}
                    >
                      {t('commerce.chooseWorkspaceFile')}
                    </Button>
                  </div>
                  {!entitlementRules[0]?.resourceId && (
                    <p className="mt-3 text-xs font-bold text-danger">
                      {t('commerce.paidFileRequiredHint')}
                    </p>
                  )}
                </div>
              )}
              {paidFilePickerOpen && (
                <WorkspaceFilePicker
                  serverId={serverId}
                  mode="select-file"
                  title={t('commerce.chooseWorkspaceFile')}
                  onConfirm={({ node }) => {
                    bindPaidFileNode(node)
                    setPaidFilePickerOpen(false)
                  }}
                  onClose={() => setPaidFilePickerOpen(false)}
                />
              )}
              {entitlementRules.map((rule, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 md:grid-cols-2 gap-5 p-4 rounded-2xl border border-border-subtle bg-bg-tertiary/60"
                >
                  <FormField label={t('commerce.resourceType')}>
                    <input
                      type="text"
                      value={rule.resourceType}
                      onChange={(e) => {
                        const next = [...entitlementRules]
                        next[idx] = { ...rule, resourceType: e.target.value }
                        setEntitlementRules(next)
                      }}
                      placeholder={t('commerce.resourceTypePlaceholder')}
                      className="w-full p-3 bg-bg-tertiary text-white text-sm rounded-xl border border-border-subtle focus:outline-none focus:border-primary transition-all font-mono"
                    />
                  </FormField>

                  <FormField label={t('commerce.capability')}>
                    <div className="relative">
                      <select
                        value={rule.capability}
                        onChange={(e) => {
                          const next = [...entitlementRules]
                          next[idx] = { ...rule, capability: e.target.value }
                          setEntitlementRules(next)
                        }}
                        className="w-full p-3 pr-10 bg-bg-tertiary text-white text-sm rounded-xl border border-border-subtle focus:outline-none focus:border-primary transition-all appearance-none font-medium"
                      >
                        <option value="use">{t('commerce.capabilities.use')}</option>
                        <option value="view">{t('commerce.capabilities.view')}</option>
                        <option value="download">{t('commerce.capabilities.download')}</option>
                        <option value="redeem">{t('commerce.capabilities.redeem')}</option>
                        <option value="manage">{t('commerce.capabilities.manage')}</option>
                      </select>
                      <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-text-muted">
                        <ChevronDown size={14} />
                      </div>
                    </div>
                  </FormField>

                  <FormField label={t('commerce.resourceId')}>
                    <input
                      type="text"
                      value={rule.resourceId}
                      onChange={(e) => {
                        const next = [...entitlementRules]
                        next[idx] = { ...rule, resourceId: e.target.value }
                        setEntitlementRules(next)
                      }}
                      placeholder={t('commerce.resourceIdPlaceholder')}
                      className="w-full p-3 bg-bg-tertiary text-white text-sm rounded-xl border border-border-subtle focus:outline-none focus:border-primary transition-all font-mono"
                    />
                  </FormField>

                  {billingMode !== 'one_time' && (
                    <FormField label={t('commerce.durationSeconds')}>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted">
                          <Clock size={16} />
                        </span>
                        <input
                          type="number"
                          value={rule.durationSeconds}
                          onChange={(e) => {
                            const next = [...entitlementRules]
                            next[idx] = { ...rule, durationSeconds: e.target.value }
                            setEntitlementRules(next)
                          }}
                          placeholder={t('commerce.durationSecondsPlaceholder')}
                          className="w-full p-3 pl-10 bg-bg-tertiary text-white text-sm rounded-xl border border-border-subtle focus:outline-none focus:border-primary transition-all font-mono"
                        />
                      </div>
                    </FormField>
                  )}

                  <FormField label={t('commerce.repeatablePurchase')}>
                    <label className="flex min-h-12 items-center gap-3 rounded-xl border border-border-subtle bg-bg-tertiary px-3 py-2 text-sm font-bold text-text-primary">
                      <input
                        type="checkbox"
                        checked={rule.repeatable}
                        onChange={(e) => {
                          const next = [...entitlementRules]
                          next[idx] = { ...rule, repeatable: e.target.checked }
                          setEntitlementRules(next)
                        }}
                        className="h-4 w-4 accent-primary"
                      />
                      {t('commerce.repeatablePurchaseHint')}
                    </label>
                  </FormField>

                  <FormField label="面向买家的白话说明">
                    <textarea
                      value={rule.privilegeDescription}
                      onChange={(e) => {
                        const next = [...entitlementRules]
                        next[idx] = { ...rule, privilegeDescription: e.target.value }
                        setEntitlementRules(next)
                      }}
                      placeholder="例：付款后自动拥有 VIP 大群浏览发言权限"
                      rows={3}
                      className="min-h-24 w-full resize-y rounded-xl border border-border-subtle bg-bg-tertiary p-3 text-sm text-white transition-all focus:border-primary focus:outline-none"
                    />
                  </FormField>

                  <div className="md:col-span-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        if (entitlementRules.length === 1) return
                        setEntitlementRules(entitlementRules.filter((_, i) => i !== idx))
                      }}
                      disabled={entitlementRules.length === 1}
                      className="px-3 py-1.5 text-xs font-bold text-danger bg-danger/10 rounded-lg border border-danger/20 disabled:opacity-50"
                    >
                      删除该规则
                    </button>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() =>
                  setEntitlementRules([
                    ...entitlementRules,
                    {
                      resourceType: 'service',
                      resourceId: '',
                      capability: 'use',
                      durationSeconds: '',
                      repeatable: true,
                      privilegeDescription: '',
                    },
                  ])
                }
                className="flex items-center justify-center gap-2 w-full py-3 text-sm font-bold text-primary bg-primary/10 hover:bg-primary/20 border border-dashed border-primary/30 rounded-xl transition-all"
              >
                <Plus size={16} strokeWidth={3} />
                新增权益规则
              </button>
            </div>
          </FormSection>
        )}

        <FormSection title={t('shop.buyerPreview')}>
          <div className="grid gap-4 rounded-2xl border border-primary/20 bg-primary/[0.06] p-4 sm:grid-cols-[132px_minmax(0,1fr)]">
            <ProductVisual
              name={name || t(`shop.productTemplates.${selectedTemplate}.label`)}
              imageUrl={mediaUrls[0]}
              productType={type}
              resourceType={entitlementRules[0]?.resourceType}
              assetType={tags.includes('badge') ? 'badge' : tags.includes('gift') ? 'gift' : null}
              className="aspect-[3/2] w-full"
            />
            <div className="min-w-0">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-black text-primary">
                <Gift size={13} />
                {t(`shop.productTemplates.${selectedTemplate}.label`)}
              </div>
              <div className="text-base font-black text-text-primary">
                {name || t('shop.productName')}
              </div>
              <p className="mt-1 line-clamp-2 text-sm leading-6 text-text-secondary">
                {summary || entitlementRules[0]?.privilegeDescription || t('shop.deliveryPromise')}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-bg-primary/65 px-3 py-1 text-sm font-black text-danger">
                  <ShrimpCoinIcon size={14} />
                  {(Number(basePrice) || 0).toLocaleString()}
                </span>
                <span className="rounded-full bg-bg-primary/65 px-3 py-1 text-xs font-black text-text-muted">
                  {entitlementRules[0]?.privilegeDescription || t('shop.deliveryPromise')}
                </span>
              </div>
            </div>
          </div>
        </FormSection>
      </div>
    </div>
  )
}

/* ╔═══════════════════════════════════════════╗
   ║          Category Manager                 ║
   ╚═══════════════════════════════════════════╝ */

function CategoryManager({ serverId }: { serverId: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const { data: categories = [] } = useQuery({
    queryKey: ['shop-categories', serverId],
    queryFn: () => fetchApi<ProductCategory[]>(`/api/servers/${serverId}/shop/categories`),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      fetchApi(`/api/servers/${serverId}/shop/categories`, {
        method: 'POST',
        body: JSON.stringify({
          name,
          slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      setName('')
      setSlug('')
      queryClient.invalidateQueries({ queryKey: ['shop-categories', serverId] })
      showToast(t('shop.categoryCreated'), 'success')
    },
    onError: (err: Error) => showToast(err.message || t('shop.createCategoryError'), 'error'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; slug?: string } }) =>
      fetchApi(`/api/servers/${serverId}/shop/categories/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      setEditingId(null)
      queryClient.invalidateQueries({ queryKey: ['shop-categories', serverId] })
    },
    onError: (err: Error) => showToast(err.message || t('shop.updateCategoryError'), 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetchApi(`/api/servers/${serverId}/shop/categories/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shop-categories', serverId] })
      showToast(t('shop.categoryDeleted'), 'success')
    },
    onError: (err: Error) => showToast(err.message || t('shop.deleteCategoryError'), 'error'),
  })

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* ── Add New Area ── */}
      <Card
        variant="glass"
        className="!rounded-[40px] !p-5 flex flex-col md:flex-row items-end md:items-center gap-4"
      >
        <div className="flex-1 w-full relative">
          <span className="text-[11px] font-bold text-text-muted uppercase block mb-1.5">
            分类展示名
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如：数字设备"
            className="w-full p-2.5 bg-bg-tertiary text-white text-sm rounded-xl border border-border-subtle focus:outline-none focus:border-primary transition-all font-bold"
          />
        </div>
        <div className="w-full md:w-48 relative">
          <span className="text-[11px] font-bold text-text-muted uppercase block mb-1.5">
            代码标识 (Slug)
          </span>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="如：digital"
            className="w-full p-2.5 bg-bg-tertiary text-white text-sm rounded-xl border border-border-subtle focus:outline-none focus:border-primary transition-all font-mono"
          />
        </div>
        <Button
          variant="primary"
          icon={FolderPlus}
          onClick={() => createMutation.mutate()}
          disabled={!name.trim() || createMutation.isPending}
          loading={createMutation.isPending}
          className="w-full md:w-auto mt-2 md:mt-0"
        >
          新建类目
        </Button>
      </Card>

      {/* ── List Area ── */}
      <Card variant="glass" className="!rounded-[40px] !p-0 overflow-hidden">
        {categories.length === 0 ? (
          <div className="py-20 text-center text-text-muted">
            <Layers size={32} className="mx-auto mb-3 opacity-20" />
            空空如也，先建个类目吧
          </div>
        ) : (
          <div className="divide-y divide-border-dim">
            {categories.map((cat) => {
              const isEdit = editingId === cat.id
              return (
                <div
                  key={cat.id}
                  className="p-4 flex items-center gap-4 hover:bg-bg-tertiary/50 transition-colors group"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <Layers size={18} />
                  </div>
                  {isEdit ? (
                    <div className="flex-1 flex gap-2">
                      <input
                        type="text"
                        defaultValue={cat.name}
                        className="w-1/2 p-2 bg-bg-secondary text-white text-sm rounded-lg border border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            updateMutation.mutate({
                              id: cat.id,
                              data: { name: e.currentTarget.value },
                            })
                          }
                        }}
                        onBlur={(e) =>
                          updateMutation.mutate({ id: cat.id, data: { name: e.target.value } })
                        }
                      />
                    </div>
                  ) : (
                    <div className="flex-1">
                      <div className="text-sm font-bold text-white leading-none mb-1.5">
                        {cat.name}
                      </div>
                      <div className="text-[11px] font-mono text-text-muted bg-border-dim inline-block px-1.5 py-0.5 rounded leading-none">
                        {cat.slug}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => setEditingId(isEdit ? null : cat.id)}
                      className="p-2 text-text-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                    >
                      <Edit3 size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await useConfirmStore.getState().confirm({
                          title: '删除分类',
                          message: '确定删除此分类？',
                          confirmLabel: '删除',
                          danger: true,
                        })
                        if (ok) deleteMutation.mutate(cat.id)
                      }}
                      className="p-2 text-text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

/* ╔═══════════════════════════════════════════╗
   ║            Order Manager                  ║
   ╚═══════════════════════════════════════════╝ */

function OrderManager({ serverId }: { serverId: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [filterMode, setFilterMode] = useState<'all' | 'pending'>('all')
  const [trackingInputs, setTrackingInputs] = useState<Record<string, string>>({})
  const [sellerNotes, setSellerNotes] = useState<Record<string, string>>({})

  const transitionMutation = useMutation({
    mutationFn: ({
      orderId,
      status,
      trackingNo,
      sellerNote,
    }: {
      orderId: string
      status: 'processing' | 'shipped' | 'delivered' | 'completed' | 'cancelled' | 'refunded'
      trackingNo?: string
      sellerNote?: string
    }) =>
      fetchApi(`/api/servers/${serverId}/shop/orders/${orderId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status, trackingNo, sellerNote }),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders', serverId] })
      showToast(t('shop.orderStatusUpdated', '订单状态已更新'), 'success')
    },
    onError: (err: Error) =>
      showToast(err.message || t('shop.updateOrderStatusFailed', '更新订单状态失败'), 'error'),
  })

  const { data: orders = [] } = useQuery({
    queryKey: ['admin-orders', serverId, filterMode],
    queryFn: () =>
      fetchApi<AdminOrder[]>(
        `/api/servers/${serverId}/shop/orders/manage${filterMode === 'pending' ? '?status=paid' : ''}`,
      ),
  })

  function nextActions(status: string) {
    switch (status) {
      case 'paid':
        return [{ label: '开始处理', to: 'processing' as const }]
      case 'processing':
        return [{ label: '标记已发货', to: 'shipped' as const }]
      case 'shipped':
        return [{ label: '标记已送达', to: 'delivered' as const }]
      case 'delivered':
        return [{ label: '标记已完成', to: 'completed' as const }]
      default:
        return []
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex gap-2">
        <Button
          variant={filterMode === 'all' ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => setFilterMode('all')}
        >
          全部订单
        </Button>
        <Button
          variant={filterMode === 'pending' ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => setFilterMode('pending')}
        >
          待发货处理
        </Button>
      </div>

      <div className="space-y-4 pt-2">
        {orders.length === 0 ? (
          <div className="py-24 text-center text-text-muted bg-bg-secondary rounded-2xl border border-border-subtle shadow-sm flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-bg-tertiary flex items-center justify-center mb-3 text-primary">
              <CheckCircle size={24} className="opacity-20" />
            </div>
            当前暂无相关订单记录
          </div>
        ) : (
          orders.map((order) => (
            <Card key={order.id} variant="glass" className="!rounded-[40px] !p-4">
              <div className="flex items-start justify-between border-b border-border-subtle pb-4 mb-4">
                <div>
                  <div className="text-xs font-bold text-text-muted mb-1">
                    {new Date(order.createdAt).toLocaleString()}
                  </div>
                  <div className="text-sm font-mono font-bold text-white"># {order.orderNo}</div>
                </div>
                <div className="text-right flex flex-col items-end gap-1">
                  <span className="text-lg font-black text-danger block">
                    <PriceDisplay amount={order.totalAmount} />
                  </span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-bg-tertiary">
                    状态: {order.status}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                {order.items.map((item) => (
                  <div key={item.id} className="flex gap-3 items-center">
                    <div className="aspect-[3/2] w-20 shrink-0 overflow-hidden rounded-lg border border-border-subtle bg-bg-tertiary">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.productName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Package size={16} className="m-auto mt-4 opacity-30" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-bold text-white">{item.productName}</div>
                      {item.specValues?.length > 0 && (
                        <div className="text-xs text-text-muted">{item.specValues.join('/')}</div>
                      )}
                    </div>
                    <div className="text-sm font-bold text-text-muted">x{item.quantity}</div>
                  </div>
                ))}
              </div>

              {nextActions(order.status).length > 0 && (
                <div className="mt-4 pt-4 border-t border-border-subtle flex flex-wrap gap-2">
                  <input
                    type="text"
                    placeholder="补充物流单号（可选）"
                    value={trackingInputs[order.id] || ''}
                    onChange={(e) =>
                      setTrackingInputs((prev) => ({ ...prev, [order.id]: e.target.value }))
                    }
                    className="w-full p-2 text-xs rounded-lg border border-border-subtle bg-bg-tertiary"
                  />
                  <textarea
                    placeholder="订单流转备注（可选）"
                    value={sellerNotes[order.id] || ''}
                    onChange={(e) =>
                      setSellerNotes((prev) => ({ ...prev, [order.id]: e.target.value }))
                    }
                    rows={2}
                    className="w-full p-2 text-xs rounded-lg border border-border-subtle bg-bg-tertiary"
                  />
                  {nextActions(order.status).map((action) => (
                    <Button
                      key={action.to}
                      variant="primary"
                      size="sm"
                      onClick={() =>
                        transitionMutation.mutate({
                          orderId: order.id,
                          status: action.to,
                          trackingNo: trackingInputs[order.id] || undefined,
                          sellerNote: sellerNotes[order.id] || undefined,
                        })
                      }
                      disabled={transitionMutation.isPending}
                      loading={transitionMutation.isPending}
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  )
}

/* ╔═══════════════════════════════════════════╗
   ║           Shop Settings                   ║
   ╚═══════════════════════════════════════════╝ */

function ShopSettings({ serverId }: { serverId: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: shop } = useQuery({
    queryKey: ['shop', serverId],
    queryFn: () => fetchApi<Shop>(`/api/servers/${serverId}/shop`),
  })

  const [shopName, setShopName] = useState(shop?.name || '')
  const [shopDesc, setShopDesc] = useState(shop?.description || '')
  const [logoUrl, setLogoUrl] = useState(shop?.logoUrl || '')
  const [bannerUrl, setBannerUrl] = useState(shop?.bannerUrl || '')
  const [supportBuddyUserId, setSupportBuddyUserId] = useState('')

  const { data: membersData } = useQuery({
    queryKey: ['server-members', serverId],
    queryFn: () =>
      fetchApi<
        Array<{
          userId: string
          role: 'owner' | 'admin' | 'member'
          user?: { username?: string | null; displayName?: string | null; isBot?: boolean }
        }>
      >(`/api/servers/${serverId}/members`),
  })
  const members = Array.isArray(membersData) ? membersData : []

  useEffect(() => {
    if (shop) {
      setShopName(shop.name)
      setShopDesc(shop.description || '')
      setLogoUrl(shop.logoUrl || '')
      setBannerUrl(shop.bannerUrl || '')
      setSupportBuddyUserId((shop.settings?.supportBuddyUserId as string | undefined) || '')
    }
  }, [shop])

  const updateMutation = useMutation({
    mutationFn: () =>
      fetchApi(`/api/servers/${serverId}/shop`, {
        method: 'PUT',
        body: JSON.stringify({
          name: shopName,
          description: shopDesc,
          logoUrl,
          bannerUrl,
          settings: {
            ...(shop?.settings || {}),
            supportBuddyUserId: supportBuddyUserId || null,
          },
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shop', serverId] })
      showToast(t('shop.shopSettingsSaved', '店铺设置已保存'), 'success')
    },
    onError: (err: Error) =>
      showToast(err.message || t('shop.saveShopSettingsFailed', '保存店铺设置失败'), 'error'),
  })

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
      <Card
        variant="glass"
        className="!rounded-[40px] !p-6 animate-in fade-in slide-in-from-bottom-4 duration-500"
      >
        <h4 className="text-xl font-black text-text-primary mb-6">店铺基础视觉设置</h4>

        <div className="space-y-6">
          <FormField label="店铺主标题">
            <input
              type="text"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              placeholder="给店铺起个响亮的名字"
              className="w-full p-3 bg-bg-tertiary text-white text-lg rounded-xl border border-border-subtle focus:outline-none focus:border-primary transition-all font-bold"
            />
          </FormField>

          <FormField label="店铺公告/简介">
            <textarea
              value={shopDesc}
              onChange={(e) => setShopDesc(e.target.value)}
              placeholder="向顾客传达核心理念或活动大促信息"
              rows={3}
              className="w-full p-3 bg-bg-tertiary text-white text-sm rounded-xl border border-border-subtle focus:outline-none focus:border-primary transition-all resize-none"
            />
          </FormField>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="col-span-1">
              <FormField label="品牌 Logo">
                <div className="mt-2 flex flex-col gap-2">
                  <ImageUploadInput
                    shape="circle"
                    onUpload={setLogoUrl}
                    className="w-24 h-24"
                    previewUrl={logoUrl}
                  />
                  <div className="text-[11px] text-text-muted mt-1 leading-tight">
                    建议正方形图片。
                    <br />
                    将在首页左上角展示。
                  </div>
                </div>
              </FormField>
            </div>

            <div className="col-span-1 md:col-span-2">
              <FormField label="店铺门面海报 (Banner)">
                <div className="mt-2">
                  <ImageUploadInput
                    shape="rect"
                    onUpload={setBannerUrl}
                    className="w-full h-32 md:h-28 aspect-[21/9]"
                    previewUrl={bannerUrl}
                  />
                  <div className="text-[11px] text-text-muted mt-2">
                    推荐宽图，将会自适应拉伸填充顶部背景。
                  </div>
                </div>
              </FormField>
            </div>
          </div>
        </div>

        <div className="mt-6 p-4 rounded-2xl border border-border-subtle bg-bg-tertiary">
          <p className="text-sm font-bold text-white mb-2">客服 Buddy 配置</p>
          <p className="text-xs text-text-muted  mb-3">
            设置后，买家在商品详情页点击客服时会自动创建私有客服频道并拉入该 Buddy。
          </p>
          <div className="relative">
            <select
              value={supportBuddyUserId}
              onChange={(e) => setSupportBuddyUserId(e.target.value)}
              className="w-full p-3 pr-10 bg-bg-secondary text-sm rounded-xl border border-border-subtle appearance-none"
            >
              <option value="">不指定 Buddy（仅店主/管理员接待）</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.user?.displayName || m.user?.username || m.userId.slice(0, 8)}
                  {m.role === 'owner' ? '（店主）' : m.role === 'admin' ? '（管理员）' : ''}
                  {m.user?.isBot ? '（Buddy）' : ''}
                </option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-text-muted">
              <ChevronDown size={14} />
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-border-subtle flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex-1">
            {updateMutation.isSuccess && (
              <span className="text-success font-bold text-sm bg-success/10 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 animate-pulse">
                <CheckCircle size={14} /> 设置已生效并保存
              </span>
            )}
          </div>
          <Button
            variant="primary"
            size="lg"
            icon={Settings}
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending}
            loading={updateMutation.isPending}
            className="w-full md:w-auto"
          >
            {updateMutation.isPending ? '保存中...' : '保存最新设置'}
          </Button>
        </div>
      </Card>
    </div>
  )
}

/* ─────────── Shared UI Components ─────────── */

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card variant="glass" className="!rounded-[40px] !p-5 md:!p-6">
      <h4 className="text-text-primary text-sm font-black mb-5 tracking-widest uppercase flex items-center gap-2">
        <span className="w-1.5 h-4 bg-primary rounded-full block"></span>
        {title}
      </h4>
      {children}
    </Card>
  )
}

function FormField({
  label,
  required,
  className,
  children,
}: {
  label: string
  required?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <label className={`block ${className || ''} group`}>
      <span className="text-text-secondary text-[11px] font-bold mb-1.5 block uppercase tracking-widest group-focus-within:text-primary transition-colors">
        {label}
        {required && (
          <span className="text-danger ml-1 text-base leading-none relative top-1">*</span>
        )}
      </span>
      {children}
    </label>
  )
}

/* ── Image Upload Component ── */

function ImageUploadInput({
  onUpload,
  className,
  shape = 'rect',
  previewUrl,
}: {
  onUpload: (url: string) => void
  className?: string
  shape?: 'rect' | 'circle'
  previewUrl?: string
}) {
  const { t } = useTranslation()
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    try {
      const uploadFile = await compressImageForUpload(file)
      const formData = new FormData()
      formData.append('file', uploadFile)
      const res = await fetchApi<{ url: string; signedUrl?: string }>('/api/media/upload', {
        method: 'POST',
        body: formData,
      })
      if (res?.url) {
        onUpload(res.url)
      }
    } catch (err) {
      console.error('Failed to upload image', err)
      showToast((err as Error)?.message || t('workspace.uploadFailed', '上传失败'), 'error')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <button
      type="button"
      className={`relative bg-bg-tertiary hover:bg-bg-modifier-hover border-2 border-dashed border-border-subtle hover:border-primary focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 overflow-hidden flex flex-col items-center justify-center transition-all cursor-pointer group ${shape === 'circle' ? 'rounded-full' : 'rounded-2xl'} ${className || ''}`}
      onClick={() => fileInputRef.current?.click()}
    >
      {previewUrl && !isUploading ? (
        <>
          <img
            src={previewUrl}
            alt="已上传图片"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
          <div className="absolute inset-0 bg-bg-deep/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-white text-xs font-bold bg-bg-deep/50 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 backdrop-blur-sm">
              <Edit3 size={14} /> 更换
            </span>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center opacity-50 group-hover:opacity-100 group-focus-within:opacity-100 group-hover:text-primary transition-all p-2 text-center">
          {isUploading ? (
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          ) : (
            <Upload size={shape === 'circle' ? 24 : 28} strokeWidth={1.5} className="mb-2" />
          )}
          {shape !== 'circle' && (
            <span className="text-[11px] font-bold mt-1">
              {isUploading ? '正在极速上传...' : '点击上传图片'}
            </span>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        disabled={isUploading}
        className="hidden"
      />
    </button>
  )
}
