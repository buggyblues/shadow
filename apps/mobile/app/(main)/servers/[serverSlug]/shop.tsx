import AsyncStorage from '@react-native-async-storage/async-storage'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  ArrowUpDown,
  Award,
  Check,
  ChevronRight,
  FileText,
  Gift,
  Heart,
  Minus,
  Package,
  Plus,
  Search,
  ShieldCheck,
  ShoppingCart,
  Star,
  Store,
  Tag,
  Ticket,
  Trash2,
  X,
} from 'lucide-react-native'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native'
import { EmptyState } from '../../../../src/components/common/empty-state'
import { LoadingScreen } from '../../../../src/components/common/loading-screen'
import { PriceCompact } from '../../../../src/components/common/price-display'
import { ShrimpCoinIcon } from '../../../../src/components/common/shrimp-coin'
import {
  AppText,
  BackgroundSurface,
  Button,
  CardPressable,
  GlassPanel,
  MenuItem,
  MobileBackButton,
  MobileNavigationBar,
  SegmentedControl,
  Sheet,
  TextField,
} from '../../../../src/components/ui'
import { fetchApi, getImageUrl } from '../../../../src/lib/api'
import { showToast } from '../../../../src/lib/toast'
import { useAuthStore } from '../../../../src/stores/auth.store'
import {
  border,
  fontSize,
  iconSize,
  lineHeight,
  palette,
  radius,
  size,
  spacing,
  useColors,
} from '../../../../src/theme'

function createIdempotencyKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const SCREEN_WIDTH = Dimensions.get('window').width

type ProductVisualKind = 'service' | 'file' | 'badge' | 'gift' | 'ticket' | 'physical'

const PRODUCT_VISUAL_THEME: Record<
  ProductVisualKind,
  { bg: string; border: string; color: string; tint: string; icon: typeof Package }
> = {
  service: {
    bg: palette.surface,
    border: palette.cyan,
    color: palette.cyanSurface,
    tint: palette.surface,
    icon: ShieldCheck,
  },
  file: {
    bg: palette.surface,
    border: palette.cyan,
    color: palette.cyanSurface,
    tint: palette.surface,
    icon: FileText,
  },
  badge: {
    bg: palette.surface,
    border: palette.yellow,
    color: palette.warningSurface,
    tint: palette.surface,
    icon: Award,
  },
  gift: {
    bg: palette.surface,
    border: palette.crimson,
    color: palette.dangerSurface,
    tint: palette.surface,
    icon: Gift,
  },
  ticket: {
    bg: palette.surface,
    border: palette.emerald,
    color: palette.successSurface,
    tint: palette.surface,
    icon: Ticket,
  },
  physical: {
    bg: palette.surface,
    border: palette.warning,
    color: palette.warningSurface,
    tint: palette.surface,
    icon: Package,
  },
}

// ── Types ────────────────────────────────────────────────────────────────────

interface ProductMedia {
  id: string
  url: string
  type: 'image' | 'video'
  position: number
}

interface SkuItem {
  id: string
  productId: string
  specValues: string[]
  price: number
  stock: number
  imageUrl?: string | null
  skuCode?: string | null
  isActive: boolean
}

interface Product {
  id: string
  shopId: string
  name: string
  slug: string
  description: string | null
  summary: string | null
  basePrice: number
  type: 'physical' | 'entitlement'
  status: string
  categoryId: string | null
  specNames: string[]
  tags: string[]
  salesCount: number
  avgRating: number
  ratingCount: number
  currency: string
  media?: ProductMedia[]
  skus?: SkuItem[]
  imageUrl?: string | null
  createdAt: string
}

interface ShopSummary {
  id: string
  name: string
  description?: string | null
  logoUrl?: string | null
  bannerUrl?: string | null
}

function getProductVisualKind(product?: Pick<Product, 'type' | 'tags'> | null): ProductVisualKind {
  if (product?.type === 'physical') return 'physical'
  if (product?.tags?.some((tag) => tag === 'workspace_file' || tag === 'file')) return 'file'
  if (product?.tags?.some((tag) => tag === 'badge')) return 'badge'
  if (product?.tags?.some((tag) => tag === 'gift' || tag === 'collectible')) return 'gift'
  if (product?.tags?.some((tag) => tag === 'service_ticket' || tag === 'coupon')) return 'ticket'
  return 'service'
}

function ProductCoverFallback({
  product,
  style,
  compact = false,
}: {
  product?: Pick<Product, 'type' | 'tags' | 'name'> | null
  style?: StyleProp<ViewStyle>
  compact?: boolean
}) {
  const { t } = useTranslation()
  const kind = getProductVisualKind(product)
  const theme = PRODUCT_VISUAL_THEME[kind]
  const Icon = theme.icon

  return (
    <View
      style={[
        styles.productVisual,
        { backgroundColor: theme.bg, borderColor: theme.border },
        style,
      ]}
      accessibilityLabel={product?.name ?? t(`shop.visual.${kind}`)}
    >
      {!compact && (
        <View style={[styles.productVisualBadge, { backgroundColor: theme.tint }]}>
          <Text style={[styles.productVisualBadgeText, { color: theme.color }]}>
            {t(`shop.visual.${kind}`)}
          </Text>
        </View>
      )}
      <View style={[styles.productVisualIcon, { backgroundColor: theme.tint }]}>
        <Icon size={compact ? 18 : 30} color={theme.color} strokeWidth={2.4} />
      </View>
      {!compact && (
        <Text style={[styles.productVisualCaption, { color: theme.color }]} numberOfLines={1}>
          {t(`shop.visualPromise.${kind}`)}
        </Text>
      )}
    </View>
  )
}

interface ProductsResponse {
  products: Product[]
  total: number
}

interface Category {
  id: string
  name: string
  slug: string
  position: number
  iconUrl?: string | null
}

interface CartItem {
  id: string
  productId: string
  skuId?: string | null
  quantity: number
  product: { id: string; name: string; status: string; basePrice: number; type: string } | null
  sku: {
    id: string
    specValues: string[]
    price: number
    stock: number
    imageUrl?: string | null
  } | null
  imageUrl: string | null
  unitPrice: number
}

interface OrderItem {
  id: string
  productId: string
  skuId?: string | null
  productName: string
  specValues: string[]
  price: number
  quantity: number
  imageUrl?: string | null
}

interface Order {
  id: string
  orderNo: string
  status: string
  totalAmount: number
  currency: string
  createdAt: string
  items: OrderItem[]
}

interface Review {
  id: string
  productId: string
  orderId: string
  userId: string
  rating: number
  content: string | null
  images: string[] | null
  reply: string | null
  repliedAt: string | null
  createdAt: string
  authorName: string
  isAnonymous: boolean
}

type ShopView = 'browse' | 'orders' | 'favorites'

// ── Component ────────────────────────────────────────────────────────────────

export default function ShopScreen() {
  const { serverSlug, productId } = useLocalSearchParams<{
    serverSlug: string
    productId?: string | string[]
  }>()
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const queryClient = useQueryClient()
  const _currentUser = useAuthStore((s) => s.user)
  const deepLinkProductId = Array.isArray(productId) ? productId[0] : productId

  // UI state
  const [search, setSearch] = useState('')
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'default' | 'price_asc' | 'price_desc' | 'sales'>('default')
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [showCart, setShowCart] = useState(false)
  const [_showOrders, _setShowOrders] = useState(false)
  const [activeView, setActiveView] = useState<ShopView>('browse')
  const [favorites, setFavorites] = useState<Set<string>>(new Set())

  // SKU selection
  const [selectedSkuId, setSelectedSkuId] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)

  // Review
  const [showReviews, setShowReviews] = useState(false)
  const [reviewProductId, setReviewProductId] = useState<string | null>(null)

  // ── Server ──────────────────────────────────────
  const { data: server } = useQuery({
    queryKey: ['server', serverSlug],
    queryFn: () => fetchApi<{ id: string; name: string }>(`/api/servers/${serverSlug}`),
    enabled: !!serverSlug,
  })

  const { data: shop } = useQuery({
    queryKey: ['shop', server?.id],
    queryFn: () => fetchApi<ShopSummary>(`/api/servers/${server!.id}/shop`),
    enabled: !!server?.id,
  })

  // ── Wallet ──────────────────────────────────────
  const { data: wallet } = useQuery({
    queryKey: ['wallet'],
    queryFn: () => fetchApi<{ balance: number }>('/api/wallet'),
  })

  // ── Products ────────────────────────────────────
  const {
    data: productsData,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['shop-products', server?.id],
    queryFn: async () => {
      const result = await fetchApi<Product[] | ProductsResponse>(
        `/api/servers/${server!.id}/shop/products`,
      )
      return Array.isArray(result) ? { products: result, total: result.length } : result
    },
    enabled: !!server?.id,
  })

  const products = productsData?.products ?? []

  useEffect(() => {
    if (!deepLinkProductId || selectedProduct?.id === deepLinkProductId) return
    const product = products.find((item) => item.id === deepLinkProductId)
    if (!product) return
    setActiveView('browse')
    setSelectedProduct(product)
  }, [deepLinkProductId, products, selectedProduct?.id])

  // ── Categories ──────────────────────────────────
  const { data: categories = [] } = useQuery({
    queryKey: ['shop-categories', server?.id],
    queryFn: () => fetchApi<Category[]>(`/api/servers/${server!.id}/shop/categories`),
    enabled: !!server?.id,
  })

  // ── Cart (server-side) ──────────────────────────
  const { data: cartItems = [], refetch: refetchCart } = useQuery({
    queryKey: ['shop-cart', server?.id],
    queryFn: () => fetchApi<CartItem[]>(`/api/servers/${server!.id}/shop/cart`),
    enabled: !!server?.id,
  })

  // ── Orders ──────────────────────────────────────
  const { data: orders = [], refetch: refetchOrders } = useQuery({
    queryKey: ['shop-orders', server?.id],
    queryFn: () => fetchApi<Order[]>(`/api/servers/${server!.id}/shop/orders`),
    enabled: !!server?.id && activeView === 'orders',
  })

  // ── Product Detail (with SKU/media) ─────────────
  const { data: productDetail } = useQuery({
    queryKey: ['shop-product-detail', selectedProduct?.id],
    queryFn: () =>
      fetchApi<Product>(`/api/servers/${server!.id}/shop/products/${selectedProduct!.id}`),
    enabled: !!server?.id && !!selectedProduct?.id,
  })

  // ── Reviews ─────────────────────────────────────
  const { data: reviews = [] } = useQuery({
    queryKey: ['shop-reviews', reviewProductId],
    queryFn: () =>
      fetchApi<Review[]>(`/api/servers/${server!.id}/shop/products/${reviewProductId}/reviews`),
    enabled: !!server?.id && !!reviewProductId,
  })

  // ── Favorites (local) ──────────────────────────
  useEffect(() => {
    if (!server?.id) return
    AsyncStorage.getItem(`shop:favorites:${server.id}`).then((raw) => {
      if (raw) setFavorites(new Set(JSON.parse(raw)))
    })
  }, [server?.id])

  const toggleFavorite = useCallback(
    async (productId: string) => {
      if (!server?.id) return
      setFavorites((prev) => {
        const next = new Set(prev)
        if (next.has(productId)) next.delete(productId)
        else next.add(productId)
        AsyncStorage.setItem(`shop:favorites:${server!.id}`, JSON.stringify([...next]))
        return next
      })
    },
    [server?.id],
  )

  // ── Cart mutations ─────────────────────────────
  const addToCartMutation = useMutation({
    mutationFn: (params: { productId: string; skuId?: string | null; quantity: number }) =>
      fetchApi(`/api/servers/${server!.id}/shop/cart`, {
        method: 'POST',
        body: JSON.stringify(params),
      }),
    onSuccess: () => {
      refetchCart()
      showToast(t('shop.addedToCart'), 'success')
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  const updateCartMutation = useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) =>
      fetchApi(`/api/servers/${server!.id}/shop/cart/${itemId}`, {
        method: 'PUT',
        body: JSON.stringify({ quantity }),
      }),
    onSuccess: () => refetchCart(),
  })

  const removeCartMutation = useMutation({
    mutationFn: (itemId: string) =>
      fetchApi(`/api/servers/${server!.id}/shop/cart/${itemId}`, { method: 'DELETE' }),
    onSuccess: () => refetchCart(),
  })

  // ── Checkout ───────────────────────────────────
  const checkoutMutation = useMutation({
    mutationFn: () =>
      fetchApi(`/api/servers/${server!.id}/shop/orders`, {
        method: 'POST',
        body: JSON.stringify({
          idempotencyKey: createIdempotencyKey('shop-order'),
          items: cartItems.map((c) => ({
            productId: c.productId,
            skuId: c.skuId,
            quantity: c.quantity,
          })),
        }),
      }),
    onSuccess: () => {
      refetchCart()
      setShowCart(false)
      showToast(t('shop.orderSuccess'), 'success')
      queryClient.invalidateQueries({ queryKey: ['shop-products', server?.id] })
      queryClient.invalidateQueries({ queryKey: ['wallet'] })
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  // ── Cancel order ───────────────────────────────
  const cancelOrderMutation = useMutation({
    mutationFn: (orderId: string) =>
      fetchApi(`/api/servers/${server!.id}/shop/orders/${orderId}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      refetchOrders()
      queryClient.invalidateQueries({ queryKey: ['wallet'] })
    },
  })

  const completeOrderMutation = useMutation({
    mutationFn: (orderId: string) =>
      fetchApi(`/api/servers/${server!.id}/shop/orders/${orderId}/complete`, { method: 'POST' }),
    onSuccess: () => {
      refetchOrders()
      queryClient.invalidateQueries({ queryKey: ['wallet'] })
      showToast(t('shop.orderCompleted'), 'success')
    },
    onError: (err: Error) => showToast(err.message || t('shop.orderCompleteFailed'), 'error'),
  })

  // ── Filter + sort ──────────────────────────────
  const filtered = useMemo(() => {
    let list = products.filter(
      (p) =>
        p.status === 'active' &&
        (!activeCategoryId || p.categoryId === activeCategoryId) &&
        (!search || p.name.toLowerCase().includes(search.toLowerCase())),
    )

    if (activeView === 'favorites') {
      list = list.filter((p) => favorites.has(p.id))
    }

    switch (sortBy) {
      case 'price_asc':
        list = [...list].sort((a, b) => a.basePrice - b.basePrice)
        break
      case 'price_desc':
        list = [...list].sort((a, b) => b.basePrice - a.basePrice)
        break
      case 'sales':
        list = [...list].sort((a, b) => (b.salesCount ?? 0) - (a.salesCount ?? 0))
        break
    }
    return list
  }, [products, activeCategoryId, search, sortBy, activeView, favorites])

  const cartTotal = cartItems.reduce((s, c) => s + c.unitPrice * c.quantity, 0)
  const cartCount = cartItems.reduce((s, c) => s + c.quantity, 0)

  const getProductImage = (p: Product) => {
    const url = p.media?.[0]?.url ?? p.imageUrl
    return url ? getImageUrl(url) : null
  }

  const handleAddToCart = () => {
    if (!selectedProduct) return
    const detail = productDetail ?? selectedProduct
    const skus = detail.skus ?? []
    if (skus.length > 0 && !selectedSkuId) {
      showToast(t('shop.selectSpec'), 'error')
      return
    }
    addToCartMutation.mutate({
      productId: selectedProduct.id,
      skuId: selectedSkuId ?? undefined,
      quantity,
    })
    setSelectedProduct(null)
    setSelectedSkuId(null)
    setQuantity(1)
  }

  if (isLoading) return <LoadingScreen />

  // ── Order status helpers ───────────────────────
  const statusColor = (status: string) => {
    switch (status) {
      case 'paid':
      case 'processing':
        return colors.warning
      case 'shipped':
      case 'delivered':
        return colors.primary
      case 'completed':
        return colors.success
      case 'cancelled':
      case 'refunded':
        return colors.error
      default:
        return colors.textMuted
    }
  }

  const statusLabel = (status: string) => {
    const map: Record<string, string> = {
      pending: t('shop.statusPending'),
      paid: t('shop.statusPaid'),
      processing: t('shop.statusProcessing'),
      shipped: t('shop.statusShipped'),
      delivered: t('shop.statusDelivered'),
      completed: t('shop.statusCompleted'),
      cancelled: t('shop.statusCancelled'),
      refunded: t('shop.statusRefunded'),
    }
    return map[status] ?? status
  }

  return (
    <BackgroundSurface style={styles.container}>
      <MobileNavigationBar
        title={t('server.shop')}
        left={<MobileBackButton onPress={() => router.back()} />}
        right={
          <View style={styles.shopHeaderActions}>
            <View style={styles.walletChip}>
              <AppText variant="bodyStrong" tone="primary" style={styles.walletText}>
                <PriceCompact amount={wallet?.balance ?? 0} size={iconSize.sm} />
              </AppText>
            </View>
            <View style={styles.cartBtn}>
              <Button
                variant="ghost"
                size="icon"
                icon={ShoppingCart}
                iconColor={colors.text}
                onPress={() => setShowCart(true)}
              />
              {cartCount > 0 && (
                <View style={[styles.cartBadge, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.cartBadgeText, { color: colors.background }]}>
                    {cartCount}
                  </Text>
                </View>
              )}
            </View>
          </View>
        }
      />
      <View style={styles.shopTabs}>
        <SegmentedControl
          value={activeView}
          onChange={setActiveView}
          options={[
            { value: 'browse', label: t('shop.browse') },
            { value: 'orders', label: t('shop.orders') },
            { value: 'favorites', label: t('shop.favorites') },
          ]}
        />
      </View>

      {/* ── Browse view ──────────────────────────── */}
      {(activeView === 'browse' || activeView === 'favorites') && (
        <>
          <GlassPanel style={styles.shopHero}>
            <View style={styles.shopHeroTop}>
              <View style={[styles.shopLogo, { backgroundColor: colors.inputBackground }]}>
                {shop?.logoUrl ? (
                  <Image
                    source={{ uri: getImageUrl(shop.logoUrl) ?? shop.logoUrl }}
                    style={styles.shopLogoImage}
                    contentFit="cover"
                  />
                ) : (
                  <Store size={iconSize['2xl']} color={colors.primary} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="title" style={styles.shopTitle} numberOfLines={1}>
                  {shop?.name ?? t('shop.serverStorefront')}
                </AppText>
                <AppText variant="label" tone="secondary" numberOfLines={1}>
                  {t('shop.serverProvidedBy', {
                    server: server?.name ?? serverSlug,
                    shop: shop?.name ?? t('shop.serverStorefront'),
                  })}
                </AppText>
              </View>
            </View>
            {shop?.description ? (
              <AppText
                variant="body"
                tone="secondary"
                style={styles.shopSubtitle}
                numberOfLines={2}
              >
                {shop.description}
              </AppText>
            ) : null}
          </GlassPanel>

          {/* Search + sort */}
          <GlassPanel style={styles.searchRow}>
            <TextField
              value={search}
              onChangeText={setSearch}
              placeholder={t('shop.searchPlaceholder')}
              icon={Search}
              containerStyle={styles.searchField}
            />
            <Button
              variant="glass"
              size="icon"
              icon={ArrowUpDown}
              iconColor={colors.textMuted}
              onPress={() => setShowSortMenu(true)}
              style={styles.sortBtn}
            />
          </GlassPanel>

          {/* Sort dropdown */}
          <Sheet
            visible={showSortMenu}
            onClose={() => setShowSortMenu(false)}
            title={t('sort.title', '排序方式')}
          >
            {(
              [
                { key: 'default', label: t('shop.sortDefault') },
                { key: 'price_asc', label: t('shop.sortPriceAsc') },
                { key: 'price_desc', label: t('shop.sortPriceDesc') },
                { key: 'sales', label: t('shop.sortSales') },
              ] as { key: typeof sortBy; label: string }[]
            ).map((opt) => (
              <MenuItem
                key={opt.key}
                icon={ArrowUpDown}
                title={opt.label}
                tone={sortBy === opt.key ? 'primary' : 'muted'}
                right={
                  sortBy === opt.key ? (
                    <Check size={iconSize.sm} color={colors.primary} />
                  ) : undefined
                }
                onPress={() => {
                  setSortBy(opt.key)
                  setShowSortMenu(false)
                }}
              />
            ))}
          </Sheet>

          {/* Categories */}
          {categories.length > 0 && activeView === 'browse' && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={[styles.catBar, { borderBottomColor: colors.border }]}
              contentContainerStyle={styles.catBarContent}
            >
              <Button
                variant={!activeCategoryId ? 'primary' : 'glass'}
                size="sm"
                onPress={() => setActiveCategoryId(null)}
              >
                {t('shop.allCategories')}
              </Button>
              {categories.map((cat) => (
                <Button
                  key={cat.id}
                  variant={activeCategoryId === cat.id ? 'primary' : 'glass'}
                  size="sm"
                  onPress={() => setActiveCategoryId(cat.id)}
                >
                  {cat.name}
                </Button>
              ))}
            </ScrollView>
          )}

          {/* Products grid */}
          {filtered.length === 0 ? (
            <EmptyState
              icon={activeView === 'favorites' ? Heart : ShoppingCart}
              title={activeView === 'favorites' ? t('shop.noFavorites') : t('shop.noProducts')}
            />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              numColumns={2}
              contentContainerStyle={styles.grid}
              columnWrapperStyle={styles.gridRow}
              refreshControl={
                <RefreshControl
                  refreshing={isRefetching}
                  onRefresh={() => refetch()}
                  tintColor={colors.primary}
                />
              }
              renderItem={({ item }) => {
                const imgUrl = getProductImage(item)
                return (
                  <CardPressable
                    variant="glassCard"
                    style={styles.productCard}
                    onPress={() => setSelectedProduct(item)}
                  >
                    {imgUrl ? (
                      <Image
                        source={{ uri: imgUrl }}
                        style={styles.productImage}
                        contentFit="cover"
                      />
                    ) : (
                      <ProductCoverFallback product={item} style={styles.productImage} />
                    )}
                    {/* Favorite heart */}
                    <Pressable
                      style={[styles.favBtn, { backgroundColor: colors.overlay }]}
                      onPress={(e) => {
                        e.stopPropagation?.()
                        toggleFavorite(item.id)
                      }}
                    >
                      <Heart
                        size={iconSize.lg}
                        color={favorites.has(item.id) ? colors.error : colors.textMuted}
                        fill={favorites.has(item.id) ? colors.error : 'transparent'}
                      />
                    </Pressable>
                    <View style={styles.productInfo}>
                      <AppText variant="bodyStrong" style={styles.productName} numberOfLines={2}>
                        {item.name}
                      </AppText>
                      <View style={styles.productSourceLine}>
                        <Store size={iconSize.micro} color={colors.primary} />
                        <AppText
                          variant="label"
                          tone="secondary"
                          style={styles.productSourceText}
                          numberOfLines={1}
                        >
                          {shop?.name ?? t('shop.serverStorefront')} · {server?.name ?? serverSlug}
                        </AppText>
                      </View>
                      {/* Rating + sales */}
                      {(item.avgRating > 0 || item.salesCount > 0) && (
                        <View style={styles.metaRow}>
                          {item.avgRating > 0 && (
                            <View style={styles.ratingRow}>
                              <Star
                                size={iconSize.micro}
                                color={colors.warning}
                                fill={colors.warning}
                              />
                              <AppText variant="label" tone="secondary" style={styles.ratingText}>
                                {item.avgRating.toFixed(1)}
                              </AppText>
                            </View>
                          )}
                          {item.salesCount > 0 && (
                            <AppText variant="label" tone="secondary" style={styles.salesText}>
                              {t('shop.sold')} {item.salesCount}
                            </AppText>
                          )}
                        </View>
                      )}
                      {/* Tags */}
                      {item.tags?.length > 0 && (
                        <View style={styles.tagRow}>
                          {item.tags.slice(0, 2).map((tag) => (
                            <View
                              key={tag}
                              style={[styles.tagChip, { backgroundColor: colors.inputBackground }]}
                            >
                              <AppText variant="label" tone="primary" style={styles.tagText}>
                                {tag}
                              </AppText>
                            </View>
                          ))}
                        </View>
                      )}
                      <AppText variant="bodyStrong" tone="primary" style={styles.productPrice}>
                        <PriceCompact amount={item.basePrice} size={iconSize.xs} />
                      </AppText>
                    </View>
                  </CardPressable>
                )
              }}
            />
          )}
        </>
      )}

      {/* ── Orders view ──────────────────────────── */}
      {activeView === 'orders' && (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.orderList}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={() => refetchOrders()}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={<EmptyState icon={Package} title={t('shop.noOrders')} />}
          renderItem={({ item: order }) => (
            <GlassPanel style={styles.orderCard}>
              <View style={styles.orderHeader}>
                <Text style={[styles.orderNo, { color: colors.textMuted }]}>#{order.orderNo}</Text>
                <View style={[styles.statusBadge, { backgroundColor: colors.inputBackground }]}>
                  <Text
                    style={{
                      color: statusColor(order.status),
                      fontSize: fontSize.micro,
                      fontWeight: '700',
                    }}
                  >
                    {statusLabel(order.status)}
                  </Text>
                </View>
              </View>
              {order.items.map((item) => (
                <View key={item.id} style={styles.orderItem}>
                  {item.imageUrl ? (
                    <Image
                      source={{ uri: getImageUrl(item.imageUrl)! }}
                      style={styles.orderItemImage}
                      contentFit="cover"
                    />
                  ) : (
                    <ProductCoverFallback style={styles.orderItemImage} compact />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.orderItemName, { color: colors.text }]} numberOfLines={1}>
                      {item.productName}
                    </Text>
                    {item.specValues.length > 0 && (
                      <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>
                        {item.specValues.join(' / ')}
                      </Text>
                    )}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text
                      style={{ color: colors.primary, fontWeight: '700', fontSize: fontSize.sm }}
                    >
                      <PriceCompact amount={item.price} size={iconSize.sm} />
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>
                      ×{item.quantity}
                    </Text>
                  </View>
                </View>
              ))}
              <View style={[styles.orderFooter, { borderTopColor: colors.border }]}>
                <Text style={{ color: colors.text, fontWeight: '800' }}>
                  {t('shop.total')}: <PriceCompact amount={order.totalAmount} size={iconSize.sm} />
                </Text>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  {(order.status === 'pending' || order.status === 'paid') && (
                    <Button
                      variant="glass"
                      size="xs"
                      icon={X}
                      iconColor={colors.error}
                      onPress={() => cancelOrderMutation.mutate(order.id)}
                    >
                      {t('shop.cancelOrder')}
                    </Button>
                  )}
                  {order.status === 'delivered' && (
                    <Button
                      variant="primary"
                      size="xs"
                      icon={ShieldCheck}
                      onPress={() => completeOrderMutation.mutate(order.id)}
                      loading={completeOrderMutation.isPending}
                    >
                      {t('shop.confirmReceipt')}
                    </Button>
                  )}
                  {order.status === 'completed' && (
                    <Button
                      variant="glass"
                      size="xs"
                      icon={Star}
                      iconColor={colors.primary}
                      onPress={() => {
                        setReviewProductId(order.items[0]?.productId ?? null)
                        setShowReviews(true)
                      }}
                    >
                      {t('shop.viewReviews')}
                    </Button>
                  )}
                </View>
              </View>
            </GlassPanel>
          )}
        />
      )}

      {/* ── Product Detail Modal ─────────────────── */}
      <Modal visible={!!selectedProduct} transparent animationType="slide">
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            setSelectedProduct(null)
            setSelectedSkuId(null)
            setQuantity(1)
          }}
        >
          <View
            style={[styles.modalSheet, { backgroundColor: colors.surface }]}
            onStartShouldSetResponder={() => true}
          >
            {selectedProduct && (
              <ScrollView bounces={false}>
                {/* Media carousel */}
                {(productDetail ?? selectedProduct).media &&
                (productDetail ?? selectedProduct).media!.length > 0 ? (
                  <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
                    {(productDetail ?? selectedProduct).media!.map((m) => (
                      <Image
                        key={m.id}
                        source={{ uri: getImageUrl(m.url)! }}
                        style={[styles.detailImage, { width: SCREEN_WIDTH }]}
                        contentFit="cover"
                      />
                    ))}
                  </ScrollView>
                ) : getProductImage(selectedProduct) ? (
                  <Image
                    source={{ uri: getProductImage(selectedProduct)! }}
                    style={styles.detailImage}
                    contentFit="cover"
                  />
                ) : (
                  <ProductCoverFallback product={selectedProduct} style={styles.detailImage} />
                )}

                <View style={styles.detailBody}>
                  {/* Price + favorite */}
                  <View style={styles.detailPriceRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <ShrimpCoinIcon size={iconSize.xl} color={colors.shrimpCoin} />
                      <Text
                        style={[
                          styles.detailPrice,
                          { color: colors.shrimpCoin, marginLeft: spacing.xs },
                        ]}
                      >
                        {selectedSkuId
                          ? ((productDetail?.skus ?? []).find((s) => s.id === selectedSkuId)
                              ?.price ?? selectedProduct.basePrice)
                          : selectedProduct.basePrice}
                      </Text>
                    </View>
                    <Pressable onPress={() => toggleFavorite(selectedProduct.id)}>
                      <Heart
                        size={iconSize['3xl']}
                        color={favorites.has(selectedProduct.id) ? colors.error : colors.textMuted}
                        fill={favorites.has(selectedProduct.id) ? colors.error : 'transparent'}
                      />
                    </Pressable>
                  </View>

                  <Text style={[styles.detailName, { color: colors.text }]}>
                    {selectedProduct.name}
                  </Text>
                  <View
                    style={[
                      styles.productSourcePanel,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                  >
                    <View style={styles.productSourcePanelHeader}>
                      <Store size={iconSize.md} color={colors.primary} />
                      <Text style={[styles.productSourceTitle, { color: colors.text }]}>
                        {t('shop.productSourceTitle', {
                          shop: shop?.name ?? t('shop.serverStorefront'),
                        })}
                      </Text>
                    </View>
                    <Text style={[styles.productSourceBody, { color: colors.textSecondary }]}>
                      {t('shop.productSourceServer', { server: server?.name ?? serverSlug })}
                    </Text>
                    <Text style={[styles.productSourceBody, { color: colors.textMuted }]}>
                      {t('shop.productSourceHint')}
                    </Text>
                  </View>

                  {/* Tags */}
                  {selectedProduct.tags?.length > 0 && (
                    <View style={[styles.tagRow, { marginTop: spacing.sm }]}>
                      {selectedProduct.tags.map((tag) => (
                        <View
                          key={tag}
                          style={[styles.tagChip, { backgroundColor: colors.inputBackground }]}
                        >
                          <Tag size={iconSize.micro} color={colors.primary} />
                          <Text
                            style={{
                              color: colors.primary,
                              fontSize: fontSize.xs,
                              fontWeight: '600',
                            }}
                          >
                            {tag}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Stats */}
                  <View style={styles.statsRow}>
                    {selectedProduct.avgRating > 0 && (
                      <View style={styles.statItem}>
                        <Star size={iconSize.sm} color={colors.warning} fill={colors.warning} />
                        <Text style={{ color: colors.text, fontWeight: '700' }}>
                          {selectedProduct.avgRating.toFixed(1)}
                        </Text>
                        <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>
                          ({selectedProduct.ratingCount})
                        </Text>
                      </View>
                    )}
                    <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>
                      {t('shop.sold')} {selectedProduct.salesCount ?? 0}
                    </Text>
                  </View>

                  {/* Description */}
                  {(selectedProduct.description || selectedProduct.summary) && (
                    <Text style={[styles.detailDesc, { color: colors.textSecondary }]}>
                      {selectedProduct.description || selectedProduct.summary}
                    </Text>
                  )}

                  {/* SKU selector */}
                  {productDetail?.specNames &&
                    productDetail.specNames.length > 0 &&
                    productDetail.skus &&
                    productDetail.skus.length > 0 && (
                      <View style={styles.skuSection}>
                        <Text style={[styles.skuLabel, { color: colors.text }]}>
                          {productDetail.specNames.join(' / ')}
                        </Text>
                        <View style={styles.skuGrid}>
                          {productDetail.skus
                            .filter((s) => s.isActive)
                            .map((sku) => (
                              <Pressable
                                key={sku.id}
                                style={[
                                  styles.skuChip,
                                  {
                                    backgroundColor:
                                      selectedSkuId === sku.id
                                        ? colors.surfaceHover
                                        : colors.inputBackground,
                                    borderColor:
                                      selectedSkuId === sku.id ? colors.primary : colors.border,
                                  },
                                ]}
                                onPress={() => setSelectedSkuId(sku.id)}
                              >
                                {sku.imageUrl && (
                                  <Image
                                    source={{ uri: getImageUrl(sku.imageUrl)! }}
                                    style={styles.skuImage}
                                    contentFit="cover"
                                  />
                                )}
                                <Text
                                  style={{
                                    color: selectedSkuId === sku.id ? colors.primary : colors.text,
                                    fontSize: fontSize.sm,
                                    fontWeight: '600',
                                  }}
                                >
                                  {sku.specValues.join(' ')}
                                </Text>
                                <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>
                                  <PriceCompact amount={sku.price} size={iconSize.xs} /> ·{' '}
                                  {t('shop.stock')} {sku.stock}
                                </Text>
                              </Pressable>
                            ))}
                        </View>
                      </View>
                    )}

                  {/* Quantity */}
                  <View style={styles.qtySection}>
                    <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>
                      {t('shop.quantity')}
                    </Text>
                    <View style={styles.qtyRow}>
                      <Pressable
                        onPress={() => setQuantity(Math.max(1, quantity - 1))}
                        style={[styles.qtyBtn, { backgroundColor: colors.inputBackground }]}
                      >
                        <Minus size={iconSize.sm} color={colors.text} />
                      </Pressable>
                      <Text
                        style={{
                          color: colors.text,
                          fontWeight: '700',
                          minWidth: size.avatarXs,
                          textAlign: 'center',
                        }}
                      >
                        {quantity}
                      </Text>
                      <Pressable
                        onPress={() => setQuantity(quantity + 1)}
                        style={[styles.qtyBtn, { backgroundColor: colors.inputBackground }]}
                      >
                        <Plus size={iconSize.sm} color={colors.text} />
                      </Pressable>
                    </View>
                  </View>

                  {/* Reviews link */}
                  {selectedProduct.ratingCount > 0 && (
                    <Pressable
                      style={[styles.reviewsLink, { borderTopColor: colors.border }]}
                      onPress={() => {
                        setReviewProductId(selectedProduct.id)
                        setShowReviews(true)
                      }}
                    >
                      <Text style={{ color: colors.text, fontWeight: '600' }}>
                        {t('shop.reviews')}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                        <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>
                          {selectedProduct.ratingCount} {t('shop.reviewCount')}
                        </Text>
                        <ChevronRight size={iconSize.sm} color={colors.textMuted} />
                      </View>
                    </Pressable>
                  )}

                  {/* Add to cart button */}
                  <Button
                    variant="primary"
                    size="lg"
                    icon={ShoppingCart}
                    onPress={handleAddToCart}
                    loading={addToCartMutation.isPending}
                    disabled={addToCartMutation.isPending}
                  >
                    {t('shop.addToCart')}
                  </Button>
                </View>
              </ScrollView>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* ── Cart Modal ───────────────────────────── */}
      <Sheet
        visible={showCart}
        onClose={() => setShowCart(false)}
        title={t('shop.cart')}
        action={
          <Button
            variant="ghost"
            size="icon"
            icon={X}
            iconColor={colors.textMuted}
            onPress={() => setShowCart(false)}
          />
        }
      >
        {cartItems.length === 0 ? (
          <View style={styles.cartEmpty}>
            <ShoppingCart size={iconSize['6xl']} color={colors.textMuted} />
            <AppText tone="secondary">{t('shop.emptyCart')}</AppText>
          </View>
        ) : (
          <ScrollView>
            {cartItems.map((item) => (
              <View key={item.id} style={[styles.cartItem, { borderBottomColor: colors.border }]}>
                {item.imageUrl ? (
                  <Image
                    source={{ uri: getImageUrl(item.imageUrl)! }}
                    style={styles.cartItemImage}
                    contentFit="cover"
                  />
                ) : (
                  <View
                    style={[
                      styles.cartItemImage,
                      {
                        backgroundColor: colors.inputBackground,
                        alignItems: 'center',
                        justifyContent: 'center',
                      },
                    ]}
                  >
                    <Package size={iconSize.md} color={colors.textMuted} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '600' }} numberOfLines={1}>
                    {item.product?.name ?? '—'}
                  </Text>
                  {item.sku && item.sku.specValues.length > 0 && (
                    <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>
                      {item.sku.specValues.join(' / ')}
                    </Text>
                  )}
                  <Text
                    style={{
                      color: colors.primary,
                      fontSize: fontSize.sm,
                      fontWeight: '700',
                      marginTop: spacing.xxs,
                    }}
                  >
                    <PriceCompact amount={item.unitPrice} size={iconSize.xs} />
                  </Text>
                </View>
                <View style={styles.qtyRow}>
                  <Pressable
                    onPress={() => {
                      if (item.quantity <= 1) removeCartMutation.mutate(item.id)
                      else
                        updateCartMutation.mutate({
                          itemId: item.id,
                          quantity: item.quantity - 1,
                        })
                    }}
                    style={[styles.qtyBtn, { backgroundColor: colors.inputBackground }]}
                  >
                    {item.quantity <= 1 ? (
                      <Trash2 size={iconSize.xs} color={colors.error} />
                    ) : (
                      <Minus size={iconSize.sm} color={colors.text} />
                    )}
                  </Pressable>
                  <Text
                    style={{
                      color: colors.text,
                      fontWeight: '700',
                      minWidth: size.avatarXs,
                      textAlign: 'center',
                    }}
                  >
                    {item.quantity}
                  </Text>
                  <Pressable
                    onPress={() =>
                      updateCartMutation.mutate({
                        itemId: item.id,
                        quantity: item.quantity + 1,
                      })
                    }
                    style={[styles.qtyBtn, { backgroundColor: colors.inputBackground }]}
                  >
                    <Plus size={iconSize.sm} color={colors.text} />
                  </Pressable>
                </View>
              </View>
            ))}

            <View style={styles.cartFooter}>
              <View>
                <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>
                  {t('shop.total')}
                </Text>
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: fontSize.xl }}>
                  <PriceCompact amount={cartTotal} size={iconSize.sm} />
                </Text>
              </View>
              <Button
                variant="primary"
                size="md"
                onPress={() => checkoutMutation.mutate()}
                loading={checkoutMutation.isPending}
                disabled={checkoutMutation.isPending}
              >
                {t('shop.checkout')}
              </Button>
            </View>
          </ScrollView>
        )}
      </Sheet>

      {/* ── Reviews Modal ────────────────────────── */}
      <Sheet
        visible={showReviews}
        onClose={() => {
          setShowReviews(false)
          setReviewProductId(null)
        }}
        title={t('shop.reviews')}
        action={
          <Button
            variant="ghost"
            size="icon"
            icon={X}
            iconColor={colors.textMuted}
            onPress={() => {
              setShowReviews(false)
              setReviewProductId(null)
            }}
          />
        }
      >
        {reviews.length === 0 ? (
          <View style={styles.cartEmpty}>
            <Star size={iconSize['6xl']} color={colors.textMuted} />
            <AppText tone="secondary">{t('shop.noReviews')}</AppText>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
            {reviews.map((review) => (
              <View
                key={review.id}
                style={[styles.reviewCard, { backgroundColor: colors.background }]}
              >
                <View style={styles.reviewHeader}>
                  <Text style={{ color: colors.text, fontWeight: '600' }}>
                    {review.isAnonymous ? t('shop.anonymous') : review.authorName}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: spacing.xxs }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        size={iconSize.xs}
                        color={colors.warning}
                        fill={n <= review.rating ? colors.warning : 'transparent'}
                      />
                    ))}
                  </View>
                </View>
                {review.content && (
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontSize: fontSize.sm,
                      marginTop: spacing.xs,
                    }}
                  >
                    {review.content}
                  </Text>
                )}
                {review.images && review.images.length > 0 && (
                  <ScrollView horizontal style={{ marginTop: spacing.sm }}>
                    {review.images.map((img) => (
                      <Image
                        key={img}
                        source={{ uri: getImageUrl(img)! }}
                        style={styles.reviewImage}
                        contentFit="cover"
                      />
                    ))}
                  </ScrollView>
                )}
                {review.reply && (
                  <View style={[styles.reviewReply, { backgroundColor: colors.surface }]}>
                    <Text
                      style={{
                        color: colors.primary,
                        fontSize: fontSize.xs,
                        fontWeight: '600',
                      }}
                    >
                      {t('shop.shopReply')}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>
                      {review.reply}
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
        )}
      </Sheet>
    </BackgroundSurface>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  shopHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xs,
  },
  shopTabs: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  walletChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  walletText: {
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  cartBtn: { padding: spacing.sm, position: 'relative' },
  cartBadge: {
    position: 'absolute',
    top: spacing.none,
    right: spacing.none,
    width: size.badgeMd,
    height: size.badgeMd,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadgeText: { fontSize: fontSize.micro, fontWeight: '700' },
  // Search
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    margin: spacing.md,
  },
  searchField: {
    flex: 1,
  },
  sortBtn: { padding: spacing.sm },
  shopHero: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  shopHeroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  shopLogo: {
    width: size.controlLg,
    height: size.controlLg,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  shopLogoImage: {
    width: '100%',
    height: '100%',
  },
  shopTitle: {
    fontWeight: '900',
  },
  shopSubtitle: {
    lineHeight: lineHeight.sm,
  },
  consumerPath: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  consumerStep: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight,
  },
  consumerStepIcon: {
    width: size.controlXs - spacing.xxs,
    height: size.controlXs - spacing.xxs,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  consumerStepText: {
    flex: 1,
    fontSize: fontSize.micro,
    fontWeight: '700',
  },
  // Categories
  catBar: { maxHeight: size.controlMd, borderBottomWidth: border.hairline },
  catBarContent: {
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
    height: size.controlMd,
  },
  // Grid
  grid: { padding: spacing.sm },
  gridRow: { gap: spacing.sm, paddingHorizontal: spacing.sm, marginBottom: spacing.sm },
  productCard: { flex: 1, borderRadius: radius.xl, overflow: 'hidden' },
  productImage: { width: '100%', aspectRatio: 3 / 2 },
  productVisual: {
    overflow: 'hidden',
    borderWidth: border.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  productVisualBadge: {
    position: 'absolute',
    left: spacing.sm,
    top: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.full,
  },
  productVisualBadgeText: {
    fontSize: fontSize.micro,
    fontWeight: '800',
  },
  productVisualIcon: {
    width: size.controlLg,
    height: size.controlLg,
    borderRadius: radius['2lg'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  productVisualCaption: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    bottom: spacing.sm,
    textAlign: 'center',
    fontSize: fontSize.micro,
    fontWeight: '700',
  },
  favBtn: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: size.iconButtonSm,
    height: size.iconButtonSm,
    borderRadius: radius['2lg'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  productInfo: { padding: spacing.md },
  productName: { fontSize: fontSize.sm, fontWeight: '700' },
  productSourceLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  productSourceText: { flex: 1, fontSize: fontSize.micro },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  ratingText: { fontSize: fontSize.micro },
  salesText: { fontSize: fontSize.micro },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.tight,
    paddingVertical: spacing.xxs,
    borderRadius: radius.sm,
  },
  tagText: {
    fontSize: fontSize.micro,
    fontWeight: '600',
  },
  productPrice: { fontSize: fontSize.sm, fontWeight: '800', marginTop: spacing.tight },
  // Orders
  orderList: { padding: spacing.md, gap: spacing.md },
  orderCard: { borderRadius: radius.xl, padding: spacing.lg },
  orderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  orderNo: { fontSize: fontSize.xs, fontFamily: 'monospace' },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.full,
  },
  orderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  orderItemImage: { width: size.iconButtonLg, height: size.iconButtonLg, borderRadius: radius.md },
  orderItemName: { fontSize: fontSize.sm, fontWeight: '600' },
  orderFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: border.hairline,
  },
  // Detail modal
  modalOverlay: { flex: 1, backgroundColor: palette.blackOverlay, justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: '85%' },
  detailImage: { width: '100%', aspectRatio: 3 / 2 },
  detailBody: { padding: spacing.xl },
  detailPriceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  detailPrice: { fontSize: fontSize['2xl'], fontWeight: '800' },
  detailName: { fontSize: fontSize.xl, fontWeight: '800', marginTop: spacing.xs },
  productSourcePanel: {
    marginTop: spacing.md,
    borderWidth: border.hairline,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.tight,
  },
  productSourcePanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  productSourceTitle: { flex: 1, fontSize: fontSize.sm, fontWeight: '800' },
  productSourceBody: { fontSize: fontSize.sm, lineHeight: lineHeight.sm },
  detailDesc: { fontSize: fontSize.sm, marginTop: spacing.md, lineHeight: lineHeight.sm },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: spacing.sm },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  // SKU
  skuSection: { marginTop: spacing.lg },
  skuLabel: { fontSize: fontSize.sm, fontWeight: '700', marginBottom: spacing.sm },
  skuGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  skuChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: border.hairline,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  skuImage: { width: size.avatarXs, height: size.avatarXs, borderRadius: radius.sm },
  // Quantity
  qtySection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  qtyBtn: {
    width: size.controlXs,
    height: size.controlXs,
    borderRadius: radius['2lg'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Reviews link
  reviewsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: border.hairline,
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
  },
  // Cart modal
  cartEmpty: {
    paddingVertical: spacing['3xl'],
    alignItems: 'center',
    gap: spacing.md,
  },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: border.hairline,
    gap: spacing.md,
  },
  cartItemImage: { width: size.controlLg, height: size.controlLg, borderRadius: radius.md },
  cartFooter: {
    padding: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // Reviews modal
  reviewCard: { padding: spacing.md, borderRadius: radius.lg, marginBottom: spacing.sm },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reviewImage: {
    width: size.plusPanelIconLg,
    height: size.plusPanelIconLg,
    borderRadius: radius.md,
    marginRight: spacing.sm,
  },
  reviewReply: { marginTop: spacing.sm, padding: spacing.sm, borderRadius: radius.md },
})
