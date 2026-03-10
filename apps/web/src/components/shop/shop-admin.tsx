import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ChevronDown,
  Edit3,
  Eye,
  EyeOff,
  FolderPlus,
  ImagePlus,
  Layers,
  Package,
  Plus,
  Save,
  Search,
  ShoppingBag,
  Tag,
  Trash2,
  X,
  Upload,
  CheckCircle,
  Truck,
  ShieldCheck,
  XCircle,
  Clock,
  MoreVertical,
  Settings
} from 'lucide-react'
import { useEffect, useMemo, useState, useRef } from 'react'
import { fetchApi } from '../../lib/api'
import type { Product, ProductCategory, Shop } from './shop-page'
import { PriceDisplay, ShrimpCoinIcon } from './ui/currency'

/* ─────────── Admin Section Types ─────────── */
type AdminSection = 'products' | 'categories' | 'orders' | 'settings'

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
  onBack: () => void
}

export function ShopAdmin({ serverId, onBack }: ShopAdminProps) {
  const [section, setSection] = useState<AdminSection>('products')

  const sections: { key: AdminSection; label: string; icon: React.ReactNode }[] = [
    { key: 'products', label: '商品管理', icon: <Package size={16} /> },
    { key: 'categories', label: '分类管理', icon: <Layers size={16} /> },
    { key: 'orders', label: '订单管理', icon: <Tag size={16} /> },
    { key: 'settings', label: '店铺设置', icon: <ShoppingBag size={16} /> },
  ]

  return (
    <div className="flex-1 flex flex-col bg-[#F9FAFB] dark:bg-bg-primary overflow-hidden h-full font-sans">
      {/* ── Header ── */}
      <div className="h-14 px-5 flex items-center bg-white/80 dark:bg-bg-primary/80 backdrop-blur-md border-b border-gray-200 dark:border-border-subtle shrink-0 gap-3 z-20 transition-colors">
        <button
          type="button"
          onClick={onBack}
          className="p-2 -ml-2 text-gray-500 hover:text-gray-900 dark:text-text-muted dark:hover:text-text-primary hover:bg-gray-100 dark:hover:bg-bg-modifier-hover rounded-xl transition-all"
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="font-bold text-gray-900 dark:text-text-primary text-base">店铺管理</h2>
      </div>

      {/* ── Section Tabs ── */}
      <div className="flex bg-white dark:bg-bg-secondary px-3 py-2 sticky top-0 z-10 shadow-sm border-b border-gray-100 dark:border-border-subtle gap-1 overflow-x-auto no-scrollbar">
        {sections.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSection(s.key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-xl whitespace-nowrap transition-all ${
              section === s.key 
                 ? 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400' 
                 : 'text-gray-500 dark:text-text-muted hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-bg-modifier-hover'
            }`}
          >
            {s.icon}
            {s.label}
          </button>
        ))}
      </div>

      {/* ── Section Content ── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-4xl mx-auto w-full">
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
  const queryClient = useQueryClient()
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shop-products', serverId] }),
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
        onSaved={() => {
          setIsCreating(false)
          setEditingProduct(null)
          queryClient.invalidateQueries({ queryKey: ['shop-products', serverId] })
        }}
      />
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 group">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-cyan-600 transition-colors" />
          <input
            type="text"
            placeholder="搜索已有商品..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-white dark:bg-bg-secondary text-gray-900 dark:text-text-primary text-sm rounded-2xl border border-gray-200 dark:border-border-dim focus:outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 placeholder:text-gray-400 transition-all font-medium shadow-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-bold rounded-2xl shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          <Plus size={18} strokeWidth={2.5} />
          添加商品
        </button>
      </div>

      {/* Product list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-gray-400 dark:text-text-muted">
          <div className="w-24 h-24 mb-6 rounded-full bg-white dark:bg-bg-secondary flex items-center justify-center shadow-sm">
             <Package size={48} className="text-gray-300 dark:text-gray-600" strokeWidth={1.5} />
          </div>
          <p className="text-base font-bold text-gray-900 dark:text-text-primary mb-1">暂无商品</p>
          <p className="text-sm">点击"添加商品"开始上架您的第一件商品</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((product) => (
            <div
              key={product.id}
              className="flex items-center gap-4 p-4 bg-white dark:bg-bg-secondary rounded-2xl border border-gray-100 dark:border-border-dim hover:border-cyan-200 dark:hover:border-cyan-800 transition-all group shadow-sm hover:shadow-md"
            >
              {/* Thumbnail */}
              <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-50 dark:bg-bg-tertiary shrink-0 border border-gray-100 dark:border-border-dim border">
                {product.media?.[0]?.url ? (
                  <img src={product.media[0].url} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300 dark:text-gray-600">
                    <Package size={24} />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-gray-900 dark:text-text-primary text-sm font-bold truncate">{product.name}</span>
                  <StatusBadge status={product.status} />
                  {product.type === 'entitlement' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 font-bold border border-orange-100 dark:border-orange-900/30">权益</span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-text-muted font-medium">
                  <span className="text-rose-500 dark:text-rose-400 font-bold flex items-baseline gap-0.5">
                     <PriceDisplay amount={product.basePrice} />
                  </span>
                  <span className="flex items-center gap-1"><Package size={12}/> 库存 {product.skus?.reduce((s, k) => s + k.stock, 0) || 0}</span>
                  <span className="flex items-center gap-1"><Layers size={12}/> 销量 {product.salesCount}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => setEditingProduct(product)}
                  className="p-2.5 text-gray-400 hover:text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 rounded-xl transition-all"
                  title="编辑商品"
                >
                  <Edit3 size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('确定要删除该商品吗? 删除后将不可恢复。')) deleteMutation.mutate(product.id)
                  }}
                  className="p-2.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-all"
                  title="删除此商品"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Status Badge ─── */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    active: { color: 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-900/30', label: '已上架' },
    draft: { color: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-border-dim', label: '草稿' },
    archived: { color: 'bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-900/30', label: '已下架' },
  }
  const info = map[status] || map.draft!
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold border ${info.color}`}>
      {info.label}
    </span>
  )
}

/* ╔═══════════════════════════════════════════╗
   ║           Product Form                    ║
   ╚═══════════════════════════════════════════╝ */

interface ProductFormProps {
  serverId: string
  product: Product | null
  onCancel: () => void
  onSaved: () => void
}

function ProductForm({ serverId, product, onCancel, onSaved }: ProductFormProps) {
  const isEditing = !!product

  // Basic fields
  const [name, setName] = useState(product?.name || '')
  const [slug, setSlug] = useState(product?.slug || '')
  const [type, setType] = useState<'physical' | 'entitlement'>(product?.type || 'physical')
  const [status, setStatus] = useState<'draft' | 'active' | 'archived'>(product?.status || 'draft')
  const [summary, setSummary] = useState(product?.summary || '')
  const [description, setDescription] = useState(product?.description || '')
  const [basePrice, setBasePrice] = useState(product?.basePrice?.toString() || '0')
  const [tags, setTags] = useState(product?.tags?.join(', ') || '')
  const [categoryId, setCategoryId] = useState(product?.categoryId || '')

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
  const [entType, setEntType] = useState(product?.entitlementConfig?.type || 'channel_access')
  const [entTargetId, setEntTargetId] = useState(product?.entitlementConfig?.targetId || '')
  const [entDuration, setEntDuration] = useState(
    product?.entitlementConfig?.durationSeconds?.toString() || '',
  )
  const [entDesc, setEntDesc] = useState(product?.entitlementConfig?.privilegeDescription || '')

  // Categories data
  const { data: categories = [] } = useQuery({
    queryKey: ['shop-categories', serverId],
    queryFn: () => fetchApi<ProductCategory[]>(`/api/servers/${serverId}/shop/categories`),
  })

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
        status,
        summary: summary || undefined,
        description: description || undefined,
        basePrice: Number(basePrice) || 0,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        categoryId: categoryId || undefined,
        media: mediaUrls.map((url, i) => ({ url, type: 'image', position: i })),
        specNames: specNames.split(',').map((s) => s.trim()).filter(Boolean),
        skus: skus.map((s) => ({
          specValues: s.specValues,
          price: Number(s.price) || 0,
          stock: Number(s.stock) || 0,
          skuCode: s.skuCode || undefined,
        })),
      }

      if (type === 'entitlement') {
        body.entitlementConfig = {
          type: entType,
          targetId: entTargetId || undefined,
          durationSeconds: entDuration ? Number(entDuration) : null,
          privilegeDescription: entDesc || undefined,
        }
      }

      if (isEditing) {
        return fetchApi(`/api/servers/${serverId}/shop/products/${product!.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return fetchApi(`/api/servers/${serverId}/shop/products`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      })
    },
    onSuccess: onSaved,
  })

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Form header */}
      <div className="flex items-center justify-between bg-white dark:bg-bg-secondary p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-border-subtle sticky top-2 z-20">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="p-2 text-gray-500 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 dark:text-text-muted dark:bg-bg-tertiary dark:hover:bg-bg-modifier-hover rounded-xl transition-all"
          >
            <ArrowLeft size={18} />
          </button>
          <h3 className="text-gray-900 dark:text-text-primary font-bold text-lg">
            {isEditing ? '编辑商品规则' : '上架新商品'}
          </h3>
        </div>
        <button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !name.trim()}
          className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-bold rounded-xl shadow-md hover:shadow-cyan-500/30 transition-all active:scale-[0.98] disabled:opacity-50"
        >
          <Save size={16} />
          {saveMutation.isPending ? '正在保存...' : '保存更改'}
        </button>
      </div>

      {saveMutation.isError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-600 text-sm flex items-center gap-2 font-medium">
           <XCircle size={18} />
           保存失败：{(saveMutation.error as Error).message}
        </div>
      )}

      <div className="space-y-6">
        {/* ── Section: 基本信息 ── */}
        <FormSection title="基本信息">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FormField label="商品名称 (必填)" className="md:col-span-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：高级会员 / 限定手办"
                className="w-full p-3 bg-gray-50 dark:bg-bg-tertiary text-gray-900 dark:text-white text-sm rounded-xl border border-gray-200 dark:border-border-dim focus:outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 transition-all font-medium"
              />
            </FormField>

            <FormField label="商品短链 (Slug)">
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="将自动生成 (如 vip-1)"
                className="w-full p-3 bg-gray-50 dark:bg-bg-tertiary text-gray-900 dark:text-white text-sm rounded-xl border border-gray-200 dark:border-border-dim focus:outline-none focus:border-cyan-500 transition-all font-mono"
              />
            </FormField>

            <FormField label="归属分类">
              <div className="relative">
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full p-3 pr-10 bg-gray-50 dark:bg-bg-tertiary text-gray-900 dark:text-white text-sm rounded-xl border border-gray-200 dark:border-border-dim focus:outline-none focus:border-cyan-500 transition-all appearance-none"
                >
                  <option value="">未分类 (设为默认)</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-gray-400">
                  <ChevronDown size={14} />
                </div>
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
                        ? 'border-cyan-500 bg-cyan-50 text-cyan-600 dark:bg-cyan-900/20 dark:text-cyan-400'
                        : 'border-transparent bg-gray-50 text-gray-500 hover:bg-gray-100 dark:bg-bg-tertiary dark:text-text-muted dark:hover:bg-bg-modifier-hover'
                    }`}
                  >
                    {t === 'physical' ? '实物商品' : '虚拟权益'}
                  </button>
                ))}
              </div>
            </FormField>

            <FormField label="上架状态">
              <div className="flex gap-2 bg-gray-50 dark:bg-bg-tertiary p-1.5 rounded-2xl border border-gray-200 dark:border-border-dim">
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
                        ? 'bg-white dark:bg-bg-secondary text-gray-900 dark:text-white shadow-sm ring-1 ring-gray-200 dark:ring-border-dim'
                        : 'text-gray-500 dark:text-text-muted hover:text-gray-700 dark:hover:text-text-primary'
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
        <FormSection title="价格与展示">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
            <FormField label="商品底价 (美元 / 虾币)">
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
                  <ShrimpCoinIcon className="w-4 h-4 text-rose-400" />
                </div>
                <input
                  type="number"
                  min="0"
                  value={basePrice}
                  onChange={(e) => setBasePrice(e.target.value)}
                  className="w-full p-3 pl-9 bg-gray-50 dark:bg-bg-tertiary text-rose-500 dark:text-rose-400 text-lg font-black rounded-xl border border-gray-200 dark:border-border-dim focus:outline-none focus:border-cyan-500 transition-all font-mono"
                />
              </div>
            </FormField>

            <FormField label="搜索标签 (用逗号分隔)">
              <div className="relative">
                 <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"><Tag size={16} /></span>
                 <input
                    type="text"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="例如: 热门, 新品, 游戏"
                    className="w-full p-3 pl-10 bg-gray-50 dark:bg-bg-tertiary text-gray-900 dark:text-white text-sm rounded-xl border border-gray-200 dark:border-border-dim focus:outline-none focus:border-cyan-500 transition-all"
                  />
              </div>
            </FormField>
          </div>

          <FormField label="商品简介" className="mb-5">
            <input
              type="text"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="一句话吸引顾客的简短描述"
              maxLength={100}
              className="w-full p-3 bg-gray-50 dark:bg-bg-tertiary text-gray-900 dark:text-white text-sm rounded-xl border border-gray-200 dark:border-border-dim focus:outline-none focus:border-cyan-500 transition-all"
            />
          </FormField>

          <FormField label="图文详情">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="详细介绍该商品的特色、规格、使用说明等..."
              rows={5}
              className="w-full p-3 bg-gray-50 dark:bg-bg-tertiary text-gray-900 dark:text-white text-sm rounded-xl border border-gray-200 dark:border-border-dim focus:outline-none focus:border-cyan-500 transition-all resize-y"
            />
          </FormField>
        </FormSection>

        {/* ── Section: 媒体 ── */}
        <FormSection title="画廊图片">
          <div className="flex flex-wrap gap-3 mb-4">
            {mediaUrls.map((url, idx) => (
              <div
                key={idx}
                className="relative w-24 h-24 rounded-2xl overflow-hidden shadow-sm border border-gray-100 dark:border-border-dim bg-gray-50 dark:bg-bg-tertiary group"
              >
                <img src={url} alt="" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setMediaUrls(mediaUrls.filter((_, i) => i !== idx))}
                  className="absolute top-1 right-1 p-1 bg-black/50 backdrop-blur-sm rounded-full text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-rose-500"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            
            <ImageUploadInput
              onUpload={(url) => setMediaUrls([...mediaUrls, url])}
              className="w-24 h-24"
            />
          </div>
          <p className="text-xs text-gray-400 dark:text-text-muted">首张图片将作为商品的默认封面，建议使用 4:5 或正方形比例的高清套图。</p>
        </FormSection>

        {/* ── Section: SKU ── */}
        <FormSection title="规格库存 (SKU)">
          <FormField label="规格属性体系 (如有多维需用逗号区分)" className="mb-5">
            <input
              type="text"
              value={specNames}
              onChange={(e) => setSpecNames(e.target.value)}
              placeholder="例如: 颜色, 尺码"
              className="w-full p-3 bg-gray-50 dark:bg-bg-tertiary text-gray-900 dark:text-white text-sm rounded-xl border border-gray-200 dark:border-border-dim focus:outline-none focus:border-cyan-500 transition-all"
            />
          </FormField>

          {skus.length > 0 && (
             <div className="mb-3 p-1 rounded-xl bg-gray-50 dark:bg-bg-tertiary border border-gray-100 dark:border-border-dim overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                 <thead>
                   <tr className="text-gray-500 dark:text-text-muted text-xs border-b border-gray-200 dark:border-border-dim">
                     <th className="py-2 px-3 font-semibold w-[40%]">规格值组合</th>
                     <th className="py-2 px-3 font-semibold">价格</th>
                     <th className="py-2 px-3 font-semibold">库存数</th>
                     <th className="py-2 px-3 font-semibold w-10 text-center">操作</th>
                   </tr>
                 </thead>
                 <tbody>
                    {skus.map((sku, idx) => (
                      <tr key={idx} className="group transition-colors rounded-lg overflow-hidden border-b last:border-0 border-gray-200/50 dark:border-border-subtle/50">
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
                            className="bg-white dark:bg-bg-secondary w-full p-2 text-sm rounded-lg border border-gray-200 dark:border-border-dim focus:outline-none focus:border-cyan-500"
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
                            className="bg-white dark:bg-bg-secondary w-full p-2 text-sm rounded-lg border border-gray-200 dark:border-border-dim focus:outline-none focus:border-cyan-500 font-mono"
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
                            className="bg-white dark:bg-bg-secondary w-full p-2 text-sm rounded-lg border border-gray-200 dark:border-border-dim focus:outline-none focus:border-cyan-500 font-mono"
                          />
                        </td>
                        <td className="py-1 px-2 text-center">
                           <button
                            type="button"
                            onClick={() => setSkus(skus.filter((_, i) => i !== idx))}
                            className="p-2 text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors inline-flex"
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
              setSkus([...skus, { specValues: [], price: basePrice || '0', stock: '99', skuCode: '' }])
            }
            className="flex items-center justify-center gap-2 w-full py-3 text-sm font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-900/10 hover:bg-cyan-100 dark:hover:bg-cyan-900/30 border border-dashed border-cyan-200 dark:border-cyan-800 rounded-xl transition-all"
          >
            <Plus size={16} strokeWidth={3} />
            创建一组 SKU 款式
          </button>
        </FormSection>

        {/* ── Section: Entitlement Config ── */}
        {type === 'entitlement' && (
          <FormSection title="虚拟权益投递配置">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <FormField label="权益类型">
                <div className="relative">
                  <select
                    value={entType}
                    onChange={(e) => setEntType(e.target.value)}
                    className="w-full p-3 pr-10 bg-gray-50 dark:bg-bg-tertiary text-gray-900 dark:text-white text-sm rounded-xl border border-gray-200 dark:border-border-dim focus:outline-none focus:border-cyan-500 transition-all appearance-none font-medium"
                  >
                    <option value="channel_access">解锁私密频道访问</option>
                    <option value="channel_speak">授予特定频道发言权</option>
                    <option value="app_access">授予生态应用访问</option>
                    <option value="custom_role">自动授予专属身份组</option>
                    <option value="custom">自定义投递</option>
                  </select>
                  <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-gray-400"><ChevronDown size={14} /></div>
                </div>
              </FormField>

              <FormField label="目标对象 ID">
                <input
                  type="text"
                  value={entTargetId}
                  onChange={(e) => setEntTargetId(e.target.value)}
                  placeholder="例如频道或角色的数字 ID"
                  className="w-full p-3 bg-gray-50 dark:bg-bg-tertiary text-gray-900 dark:text-white text-sm rounded-xl border border-gray-200 dark:border-border-dim focus:outline-none focus:border-cyan-500 transition-all font-mono"
                />
              </FormField>

              <FormField label="生效时长 (秒)">
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"><Clock size={16}/></span>
                  <input
                    type="number"
                    value={entDuration}
                    onChange={(e) => setEntDuration(e.target.value)}
                    placeholder="留空即表示永久有效"
                    className="w-full p-3 pl-10 bg-gray-50 dark:bg-bg-tertiary text-gray-900 dark:text-white text-sm rounded-xl border border-gray-200 dark:border-border-dim focus:outline-none focus:border-cyan-500 transition-all font-mono"
                  />
                </div>
              </FormField>

              <FormField label="面向买家的白话说明">
                <input
                  type="text"
                  value={entDesc}
                  onChange={(e) => setEntDesc(e.target.value)}
                  placeholder="例：付款后自动拥有 VIP 大群浏览发言权限"
                  className="w-full p-3 bg-gray-50 dark:bg-bg-tertiary text-gray-900 dark:text-white text-sm rounded-xl border border-gray-200 dark:border-border-dim focus:outline-none focus:border-cyan-500 transition-all"
                />
              </FormField>
            </div>
          </FormSection>
        )}
      </div>
    </div>
  )
}

/* ╔═══════════════════════════════════════════╗
   ║          Category Manager                 ║
   ╚═══════════════════════════════════════════╝ */

function CategoryManager({ serverId }: { serverId: string }) {
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
    },
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
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetchApi(`/api/servers/${serverId}/shop/categories/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shop-categories', serverId] }),
  })

  return (
    <div className="p-4 md:p-6 space-y-6">
      
      {/* ── Add New Area ── */}
      <div className="bg-white dark:bg-bg-secondary p-5 rounded-2xl border border-gray-100 dark:border-border-subtle shadow-sm flex flex-col md:flex-row items-end md:items-center gap-4">
        <div className="flex-1 w-full relative">
          <span className="text-[10px] font-bold text-gray-500 uppercase block mb-1.5">分类展示名</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如：数字设备"
            className="w-full p-2.5 bg-gray-50 dark:bg-bg-tertiary text-gray-900 dark:text-white text-sm rounded-xl border border-gray-200 dark:border-border-dim focus:outline-none focus:border-cyan-500 transition-all font-bold"
          />
        </div>
        <div className="w-full md:w-48 relative">
           <span className="text-[10px] font-bold text-gray-500 uppercase block mb-1.5">代码标识 (Slug)</span>
           <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="如：digital"
            className="w-full p-2.5 bg-gray-50 dark:bg-bg-tertiary text-gray-900 dark:text-white text-sm rounded-xl border border-gray-200 dark:border-border-dim focus:outline-none focus:border-cyan-500 transition-all font-mono"
          />
        </div>
        <button
          type="button"
          onClick={() => createMutation.mutate()}
          disabled={!name.trim() || createMutation.isPending}
          className="w-full md:w-auto mt-2 md:mt-0 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-bold rounded-xl shadow-md hover:shadow-cyan-500/30 transition-all disabled:opacity-50"
        >
          <FolderPlus size={16} />
          新建类目
        </button>
      </div>

      {/* ── List Area ── */}
      <div className="bg-white dark:bg-bg-secondary rounded-2xl border border-gray-100 dark:border-border-subtle shadow-sm overflow-hidden">
        {categories.length === 0 ? (
          <div className="py-20 text-center text-gray-400">
             <Layers size={32} className="mx-auto mb-3 opacity-20" />
             空空如也，先建个类目吧
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-border-dim">
             {categories.map((cat) => {
               const isEdit = editingId === cat.id
               return (
                 <div key={cat.id} className="p-4 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-bg-tertiary/50 transition-colors group">
                    <div className="w-10 h-10 rounded-full bg-cyan-50 dark:bg-cyan-900/10 flex items-center justify-center text-cyan-600 dark:text-cyan-400 shrink-0">
                      <Layers size={18} />
                    </div>
                    {isEdit ? (
                      <div className="flex-1 flex gap-2">
                        <input
                          type="text"
                          defaultValue={cat.name}
                          className="w-1/2 p-2 bg-white dark:bg-bg-secondary text-gray-900 dark:text-white text-sm rounded-lg border border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              updateMutation.mutate({ id: cat.id, data: { name: e.currentTarget.value } })
                            }
                          }}
                          onBlur={(e) => updateMutation.mutate({ id: cat.id, data: { name: e.target.value } })}
                          autoFocus
                        />
                      </div>
                    ) : (
                      <div className="flex-1">
                        <div className="text-sm font-bold text-gray-900 dark:text-white leading-none mb-1.5">{cat.name}</div>
                        <div className="text-[11px] font-mono text-gray-400 bg-gray-100 dark:bg-border-dim inline-block px-1.5 py-0.5 rounded leading-none">{cat.slug}</div>
                      </div>
                    )}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => setEditingId(isEdit ? null : cat.id)}
                        className="p-2 text-gray-400 hover:text-cyan-600 dark:hover:bg-cyan-900/20 rounded-lg transition-colors"
                      >
                        <Edit3 size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => { if(confirm('删除此分类？')) deleteMutation.mutate(cat.id) }}
                        className="p-2 text-gray-400 hover:text-rose-600 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                 </div>
               )
             })}
          </div>
        )}
      </div>
    </div>
  )
}

/* ╔═══════════════════════════════════════════╗
   ║            Order Manager                  ║
   ╚═══════════════════════════════════════════╝ */

function OrderManager({ serverId }: { serverId: string }) {
  const [filterMode, setFilterMode] = useState<'all'|'pending'>('all')
  const { data: orders = [] } = useQuery({
    queryKey: ['admin-orders', serverId, filterMode],
    queryFn: () => fetchApi<AdminOrder[]>(`/api/servers/${serverId}/shop/orders/admin${filterMode === 'pending' ? '?status=paid' : ''}`),
  })

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex gap-2">
         <button 
           className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${filterMode === 'all' ? 'bg-gray-900 text-white shadow-md dark:bg-white dark:text-gray-900' : 'bg-white text-gray-600 dark:bg-bg-secondary border border-gray-200 dark:border-border-dim'}`}
           onClick={() => setFilterMode('all')}
         >全部订单</button>
         <button 
           className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${filterMode === 'pending' ? 'bg-cyan-500 text-white shadow-md' : 'bg-white text-gray-600 dark:bg-bg-secondary border border-gray-200 dark:border-border-dim'}`}
           onClick={() => setFilterMode('pending')}
         >待发货处理</button>
      </div>

      <div className="space-y-4 pt-2">
        {orders.length === 0 ? (
           <div className="py-24 text-center text-gray-400 bg-white dark:bg-bg-secondary rounded-2xl border border-gray-100 dark:border-border-subtle shadow-sm flex flex-col items-center">
             <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mb-3 text-cyan-500">
                <CheckCircle size={24} className="opacity-20" />
             </div>
             当前暂无相关订单记录
           </div>
        ) : (
          orders.map(order => (
             <div key={order.id} className="bg-white dark:bg-bg-secondary rounded-2xl border border-gray-100 dark:border-border-subtle shadow-sm p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between border-b border-gray-100 dark:border-border-dim pb-4 mb-4">
                   <div>
                     <div className="text-xs font-bold text-gray-500 mb-1">
                        {new Date(order.createdAt).toLocaleString()}
                     </div>
                     <div className="text-sm font-mono font-bold text-gray-900 dark:text-white">
                        # {order.orderNo}
                     </div>
                   </div>
                   <div className="text-right flex flex-col items-end gap-1">
                      <span className="text-lg font-black text-rose-500 dark:text-rose-400 block"><PriceDisplay amount={order.totalAmount} /></span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-gray-100 dark:bg-bg-tertiary">状态: {order.status}</span>
                   </div>
                </div>

                <div className="space-y-3">
                   {order.items.map(item => (
                     <div key={item.id} className="flex gap-3 items-center">
                        <div className="w-12 h-12 rounded-lg bg-gray-50 dark:bg-bg-tertiary overflow-hidden border border-gray-100 dark:border-border-dim shrink-0">
                           {item.imageUrl ? <img src={item.imageUrl} className="w-full h-full object-cover" /> : <Package size={16} className="m-auto mt-4 opacity-30"/>}
                        </div>
                        <div className="flex-1">
                           <div className="text-sm font-bold text-gray-900 dark:text-white">{item.productName}</div>
                           {item.specValues?.length > 0 && <div className="text-xs text-gray-500">{item.specValues.join('/')}</div>}
                        </div>
                        <div className="text-sm font-bold text-gray-500">x{item.quantity}</div>
                     </div>
                   ))}
                </div>
             </div>
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
  const queryClient = useQueryClient()
  const { data: shop } = useQuery({
    queryKey: ['shop', serverId],
    queryFn: () => fetchApi<Shop>(`/api/servers/${serverId}/shop`),
  })

  const [shopName, setShopName] = useState(shop?.name || '')
  const [shopDesc, setShopDesc] = useState(shop?.description || '')
  const [logoUrl, setLogoUrl] = useState(shop?.logoUrl || '')
  const [bannerUrl, setBannerUrl] = useState(shop?.bannerUrl || '')

  useEffect(() => {
    if (shop) {
      setShopName(shop.name)
      setShopDesc(shop.description || '')
      setLogoUrl(shop.logoUrl || '')
      setBannerUrl(shop.bannerUrl || '')
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
        }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shop', serverId] }),
  })

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
      
      <div className="bg-white dark:bg-bg-secondary rounded-3xl p-6 border border-gray-100 dark:border-border-subtle shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
         <h4 className="text-xl font-black text-gray-900 dark:text-white mb-6">店铺基础视觉设置</h4>

         <div className="space-y-6">
            <FormField label="店铺主标题">
              <input
                type="text"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                placeholder="给店铺起个响亮的名字"
                className="w-full p-3 bg-gray-50 dark:bg-bg-tertiary text-gray-900 dark:text-white text-lg rounded-xl border border-gray-200 dark:border-border-dim focus:outline-none focus:border-cyan-500 transition-all font-bold"
              />
            </FormField>

            <FormField label="店铺公告/简介">
              <textarea
                value={shopDesc}
                onChange={(e) => setShopDesc(e.target.value)}
                placeholder="向顾客传达核心理念或活动大促信息"
                rows={3}
                className="w-full p-3 bg-gray-50 dark:bg-bg-tertiary text-gray-900 dark:text-white text-sm rounded-xl border border-gray-200 dark:border-border-dim focus:outline-none focus:border-cyan-500 transition-all resize-none"
              />
            </FormField>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="col-span-1">
                 <FormField label="品牌 Logo">
                   <div className="mt-2 flex flex-col gap-2">
                     <ImageUploadInput shape="circle" onUpload={setLogoUrl} className="w-24 h-24" previewUrl={logoUrl} />
                     <div className="text-[11px] text-gray-400 mt-1 leading-tight">建议正方形图片。<br/>将在首页左上角展示。</div>
                   </div>
                 </FormField>
              </div>

              <div className="col-span-1 md:col-span-2">
                 <FormField label="店铺门面海报 (Banner)">
                   <div className="mt-2">
                     <ImageUploadInput shape="rect" onUpload={setBannerUrl} className="w-full h-32 md:h-28 aspect-[21/9]" previewUrl={bannerUrl} />
                     <div className="text-[11px] text-gray-400 mt-2">推荐宽图，将会自适应拉伸填充顶部背景。</div>
                   </div>
                 </FormField>
              </div>
            </div>
         </div>

         <div className="mt-8 pt-6 border-t border-gray-100 dark:border-border-dim flex flex-col md:flex-row items-center justify-between gap-4">
           <div className="flex-1">
             {updateMutation.isSuccess && <span className="text-emerald-500 font-bold text-sm bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 animate-pulse"><CheckCircle size={14}/> 设置已生效并保存</span>}
           </div>
           <button
            type="button"
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending}
            className="w-full md:w-auto flex items-center justify-center gap-2 px-8 py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-bold rounded-xl hover:scale-[1.02] active:scale-[0.98] shadow-xl hover:shadow-gray-900/20 dark:hover:shadow-white/20 transition-all disabled:opacity-50"
          >
            <Settings size={18} />
            {updateMutation.isPending ? '保存中...' : '保存最新设置'}
          </button>
         </div>
      </div>

    </div>
  )
}

/* ─────────── Shared UI Components ─────────── */

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-bg-secondary rounded-3xl border border-gray-100 dark:border-border-subtle p-5 md:p-6 shadow-sm">
      <h4 className="text-gray-900 dark:text-white text-sm font-black mb-5 tracking-wide flex items-center gap-2">
        <span className="w-1.5 h-4 bg-cyan-500 rounded-full block"></span>
        {title}
      </h4>
      {children}
    </div>
  )
}

function FormField({ label, required, className, children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className || ''} group`}>
      <span className="text-gray-600 dark:text-text-secondary text-[11px] font-bold mb-1.5 block uppercase tracking-wider group-focus-within:text-cyan-600 transition-colors">
        {label}
        {required && <span className="text-rose-500 ml-1 text-base leading-none relative top-1">*</span>}
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
  previewUrl 
}: { 
  onUpload: (url: string) => void;
  className?: string;
  shape?: 'rect'|'circle';
  previewUrl?: string;
}) {
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetchApi<{ url: string }>('/api/media/upload', {
        method: 'POST',
        body: formData,
      })
      if (res && res.url) {
        onUpload(res.url)
      }
    } catch (err) {
      console.error('Failed to upload image', err)
      alert("上传失败！")
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div 
      className={`relative bg-gray-50 hover:bg-gray-100 dark:bg-bg-tertiary dark:hover:bg-bg-modifier-hover border-2 border-dashed border-gray-200 dark:border-border-dim hover:border-cyan-400 focus-within:border-cyan-500 focus-within:ring-2 focus-within:ring-cyan-500/20 overflow-hidden flex flex-col items-center justify-center transition-all cursor-pointer group ${shape === 'circle' ? 'rounded-full' : 'rounded-2xl'} ${className || ''}`}
      onClick={() => fileInputRef.current?.click()}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}
    >
      {previewUrl && !isUploading ? (
         <>
           <img src={previewUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
           <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-white text-xs font-bold bg-black/50 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 backdrop-blur-sm"><Edit3 size={14}/> 更换</span>
           </div>
         </>
      ) : (
         <div className="flex flex-col items-center opacity-50 group-hover:opacity-100 group-focus-within:opacity-100 group-hover:text-cyan-600 transition-all p-2 text-center">
           {isUploading ? (
             <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
           ) : (
             <Upload size={shape === 'circle' ? 24 : 28} strokeWidth={1.5} className="mb-2" />
           )}
           {shape !== 'circle' && <span className="text-[11px] font-bold mt-1">{isUploading ? '正在极速上传...' : '点击上传图片'}</span>}
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
    </div>
  )
}
