import { cn, EmptyState, GlassPanel, Input } from '@shadowob/ui'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import {
  Loader2,
  type LucideIcon,
  PackageOpen,
  Search,
  ShoppingBag,
  Sparkles,
  Tags,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ProductCard, type ProductCardProduct } from '../components/shop/ui/product-card'
import { fetchApi } from '../lib/api'

type MarketplaceProduct = ProductCardProduct & {
  price: number
  shop: {
    id: string
    name: string
    scopeKind: 'server' | 'user' | string
    server?: { id: string; name: string; slug?: string | null } | null
    owner?: { id: string; username: string; displayName?: string | null } | null
  }
}

type MarketplaceProductsResponse = {
  products: MarketplaceProduct[]
  total: number
}

type MarketplaceCategory = {
  tag: string
  title: string
  productCount: number
  salesCount: number
  ratingCount: number
  avgRating: number
  score: number
  href: string
}

type MarketplaceCategoriesResponse = {
  categories: MarketplaceCategory[]
  total: number
}

const CATEGORY_ICON_POOL: LucideIcon[] = [Sparkles, PackageOpen, ShoppingBag, Tags]

export function ShopTagPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { tag } = useParams({ strict: false }) as { tag: string }
  const decodedTag = decodeURIComponent(tag)
  const [search, setSearch] = useState('')
  const normalizedSearch = search.trim()
  const effectiveSearch = normalizedSearch.length >= 2 ? normalizedSearch : ''

  const { data, isLoading } = useQuery({
    queryKey: ['shop-tag-products', decodedTag, effectiveSearch],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '72', tag: decodedTag })
      if (effectiveSearch) params.set('q', effectiveSearch)
      return fetchApi<MarketplaceProductsResponse>(`/api/discover/marketplace/products?${params}`)
    },
  })

  const { data: categoriesData } = useQuery({
    queryKey: ['shop-tag-categories', effectiveSearch],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '12' })
      if (effectiveSearch) params.set('q', effectiveSearch)
      return fetchApi<MarketplaceCategoriesResponse>(
        `/api/discover/marketplace/categories?${params}`,
      )
    },
  })

  const products = useMemo(
    () =>
      [...(data?.products ?? [])].sort(
        (a, b) =>
          (b.salesCount ?? 0) * 6 +
            (b.ratingCount ?? 0) * 2 +
            (b.avgRating ?? 0) -
            ((a.salesCount ?? 0) * 6 + (a.ratingCount ?? 0) * 2 + (a.avgRating ?? 0)) ||
          a.name.localeCompare(b.name),
      ),
    [data?.products],
  )
  const categories = useMemo(
    () => buildTagPageCategories(categoriesData?.categories ?? [], decodedTag),
    [categoriesData?.categories, decodedTag],
  )

  return (
    <div className="h-full overflow-y-auto px-4 py-5 md:px-6">
      <GlassPanel className="mx-auto flex max-w-7xl flex-col gap-4 overflow-hidden !rounded-[32px] border-white/10 bg-[#050508]/62 p-4 shadow-[0_28px_90px_rgba(0,0,0,0.26)] backdrop-blur-2xl md:p-5">
        <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-2">
          <Input
            icon={Search}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('commerceMarketplace.searchInTag')}
            className="h-12 !rounded-full border-white/10 bg-bg-primary/70"
          />
        </div>

        {categories.length ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {categories.map((category, index) => {
              const Icon = CATEGORY_ICON_POOL[index % CATEGORY_ICON_POOL.length] ?? Tags
              const active = category.tag === decodedTag
              return (
                <button
                  key={category.tag}
                  type="button"
                  onClick={() =>
                    navigate({
                      to: '/shop/tags/$tag',
                      params: { tag: category.tag },
                    })
                  }
                  className={cn(
                    'inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-black transition hover:-translate-y-0.5',
                    active
                      ? 'border-primary/45 bg-primary text-bg-primary'
                      : 'border-white/10 bg-white/[0.06] text-text-secondary hover:border-primary/40 hover:bg-primary/15 hover:text-primary',
                  )}
                >
                  <Icon size={15} />
                  {category.title}
                </button>
              )
            })}
          </div>
        ) : null}

        <section className="py-2">
          <div className="mb-4 flex flex-col gap-2 px-1 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-2xl font-black tracking-[-0.03em] text-text-primary">
                <Tags size={14} />
                {decodedTag}
              </div>
              <p className="mt-1 text-sm leading-6 text-text-muted">
                {t('commerceMarketplace.tagPageSubtitle')}
              </p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-black text-text-muted">
              {data?.total ?? 0}
            </span>
          </div>

          {isLoading ? (
            <div className="flex min-h-[360px] items-center justify-center rounded-[24px] border border-white/10 bg-white/[0.04] text-primary">
              <Loader2 className="animate-spin" />
            </div>
          ) : products.length === 0 ? (
            <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-6">
              <EmptyState
                icon={ShoppingBag}
                title={t('commerceMarketplace.noTaggedProducts')}
                description={t('commerceMarketplace.noTaggedProductsHint')}
              />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={{
                    ...product,
                    basePrice: product.basePrice ?? product.price,
                  }}
                  shopName={product.shop.name}
                  serverName={product.shop.server?.name ?? null}
                  onClick={() =>
                    navigate({
                      to: '/shop/products/$productId',
                      params: { productId: product.id },
                    })
                  }
                  onShopClick={() => {
                    if (product.shop.server) {
                      navigate({
                        to: '/servers/$serverSlug/shop',
                        params: { serverSlug: product.shop.server.slug ?? product.shop.server.id },
                      })
                      return
                    }
                    if (product.shop.owner) {
                      navigate({
                        to: '/shop/users/$userId',
                        params: { userId: product.shop.owner.id },
                        search: { view: 'buyer' },
                      })
                    }
                  }}
                />
              ))}
            </div>
          )}
        </section>
      </GlassPanel>
    </div>
  )
}

function ensureSelectedCategory(categories: MarketplaceCategory[], selectedTag: string) {
  if (!selectedTag || categories.some((category) => category.tag === selectedTag)) return categories
  return [
    {
      tag: selectedTag,
      title: selectedTag,
      productCount: 0,
      salesCount: 0,
      ratingCount: 0,
      avgRating: 0,
      score: 0,
      href: `/app/shop/tags/${encodeURIComponent(selectedTag)}`,
    },
    ...categories,
  ]
}

function buildTagPageCategories(categories: MarketplaceCategory[], selectedTag: string) {
  const ordered = ensureSelectedCategory(categories, selectedTag)
  const selectedCategory = ordered.find((category) => category.tag === selectedTag)
  return selectedCategory
    ? [selectedCategory, ...ordered.filter((category) => category.tag !== selectedTag)].slice(0, 12)
    : ordered.slice(0, 12)
}
