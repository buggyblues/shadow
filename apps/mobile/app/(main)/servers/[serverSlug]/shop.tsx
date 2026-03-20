import AsyncStorage from '@react-native-async-storage/async-storage'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { useLocalSearchParams } from 'expo-router'
import {
  ArrowUpDown,
  Check,
  ChevronRight,
  Heart,
  Minus,
  Package,
  Plus,
  Search,
  ShoppingCart,
  Star,
  Tag,
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
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { EmptyState } from '../../../../src/components/common/empty-state'
import { LoadingScreen } from '../../../../src/components/common/loading-screen'
import { PriceCompact } from '../../../../src/components/common/price-display'
import { ShrimpCoinIcon } from '../../../../src/components/common/shrimp-coin'
import { fetchApi, getImageUrl } from '../../../../src/lib/api'
import { showToast } from '../../../../src/lib/toast'
import { useAuthStore } from '../../../../src/stores/auth.store'
import { fontSize, radius, spacing, useColors } from '../../../../src/theme'

const SCREEN_WIDTH = Dimensions.get('window').width

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
  const { serverSlug } = useLocalSearchParams<{ serverSlug: string }>()
  const { t } = useTranslation()
  const colors = useColors()
  const queryClient = useQueryClient()
  const _currentUser = useAuthStore((s) => s.user)

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
        return '#f0b132'
      case 'shipped':
      case 'delivered':
        return colors.primary
      case 'completed':
        return '#23a559'
      case 'cancelled':
      case 'refunded':
        return '#f23f43'
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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Top bar ──────────────────────────────── */}
      <View
        style={[
          styles.topBar,
          { backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        {/* Wallet */}
        <View style={styles.walletChip}>
          <Text style={[styles.walletText, { color: colors.primary }]}>
            <PriceCompact amount={wallet?.balance ?? 0} size={14} />
          </Text>
        </View>
        {/* View tabs */}
        <View style={styles.viewTabs}>
          {(
            [
              { key: 'browse', label: t('shop.browse') },
              { key: 'orders', label: t('shop.orders') },
              { key: 'favorites', label: t('shop.favorites') },
            ] as { key: ShopView; label: string }[]
          ).map((tab) => (
            <Pressable
              key={tab.key}
              style={[
                styles.viewTab,
                activeView === tab.key && {
                  borderBottomColor: colors.primary,
                  borderBottomWidth: 2,
                },
              ]}
              onPress={() => setActiveView(tab.key)}
            >
              <Text
                style={{
                  color: activeView === tab.key ? colors.primary : colors.textMuted,
                  fontSize: fontSize.sm,
                  fontWeight: '600',
                }}
              >
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {/* Cart button */}
        <Pressable style={styles.cartBtn} onPress={() => setShowCart(true)}>
          <ShoppingCart size={22} color={colors.text} />
          {cartCount > 0 && (
            <View style={[styles.cartBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.cartBadgeText}>{cartCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* ── Browse view ──────────────────────────── */}
      {(activeView === 'browse' || activeView === 'favorites') && (
        <>
          {/* Search + sort */}
          <View style={[styles.searchRow, { backgroundColor: colors.surface }]}>
            <View style={[styles.searchBox, { backgroundColor: colors.inputBackground }]}>
              <Search size={16} color={colors.textMuted} />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                value={search}
                onChangeText={setSearch}
                placeholder={t('shop.searchPlaceholder')}
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <Pressable onPress={() => setShowSortMenu(!showSortMenu)} style={styles.sortBtn}>
              <ArrowUpDown size={16} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* Sort dropdown */}
          {showSortMenu && (
            <View
              style={[
                styles.sortMenu,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              {(
                [
                  { key: 'default', label: t('shop.sortDefault') },
                  { key: 'price_asc', label: t('shop.sortPriceAsc') },
                  { key: 'price_desc', label: t('shop.sortPriceDesc') },
                  { key: 'sales', label: t('shop.sortSales') },
                ] as { key: typeof sortBy; label: string }[]
              ).map((opt) => (
                <Pressable
                  key={opt.key}
                  style={styles.sortOption}
                  onPress={() => {
                    setSortBy(opt.key)
                    setShowSortMenu(false)
                  }}
                >
                  <Text
                    style={{
                      color: sortBy === opt.key ? colors.primary : colors.text,
                      fontSize: fontSize.sm,
                    }}
                  >
                    {opt.label}
                  </Text>
                  {sortBy === opt.key && <Check size={14} color={colors.primary} />}
                </Pressable>
              ))}
            </View>
          )}

          {/* Categories */}
          {categories.length > 0 && activeView === 'browse' && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={[styles.catBar, { borderBottomColor: colors.border }]}
              contentContainerStyle={styles.catBarContent}
            >
              <Pressable
                style={[
                  styles.catChip,
                  !activeCategoryId && { backgroundColor: `${colors.primary}15` },
                ]}
                onPress={() => setActiveCategoryId(null)}
              >
                <Text
                  style={{
                    color: !activeCategoryId ? colors.primary : colors.textMuted,
                    fontWeight: '600',
                    fontSize: fontSize.sm,
                  }}
                >
                  {t('shop.allCategories')}
                </Text>
              </Pressable>
              {categories.map((cat) => (
                <Pressable
                  key={cat.id}
                  style={[
                    styles.catChip,
                    activeCategoryId === cat.id && { backgroundColor: `${colors.primary}15` },
                  ]}
                  onPress={() => setActiveCategoryId(cat.id)}
                >
                  <Text
                    style={{
                      color: activeCategoryId === cat.id ? colors.primary : colors.textMuted,
                      fontWeight: '600',
                      fontSize: fontSize.sm,
                    }}
                  >
                    {cat.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {/* Products grid */}
          {filtered.length === 0 ? (
            <EmptyState
              icon={activeView === 'favorites' ? '❤️' : '🛒'}
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
                  <Pressable
                    style={[styles.productCard, { backgroundColor: colors.surface }]}
                    onPress={() => setSelectedProduct(item)}
                  >
                    {imgUrl ? (
                      <Image
                        source={{ uri: imgUrl }}
                        style={styles.productImage}
                        contentFit="cover"
                      />
                    ) : (
                      <View
                        style={[
                          styles.productImage,
                          {
                            backgroundColor: colors.inputBackground,
                            alignItems: 'center',
                            justifyContent: 'center',
                          },
                        ]}
                      >
                        <Package size={32} color={colors.textMuted} />
                      </View>
                    )}
                    {/* Favorite heart */}
                    <Pressable
                      style={styles.favBtn}
                      onPress={(e) => {
                        e.stopPropagation?.()
                        toggleFavorite(item.id)
                      }}
                    >
                      <Heart
                        size={18}
                        color={favorites.has(item.id) ? '#f23f43' : '#ffffff80'}
                        fill={favorites.has(item.id) ? '#f23f43' : 'transparent'}
                      />
                    </Pressable>
                    <View style={styles.productInfo}>
                      <Text style={[styles.productName, { color: colors.text }]} numberOfLines={2}>
                        {item.name}
                      </Text>
                      {/* Rating + sales */}
                      {(item.avgRating > 0 || item.salesCount > 0) && (
                        <View style={styles.metaRow}>
                          {item.avgRating > 0 && (
                            <View style={styles.ratingRow}>
                              <Star size={10} color="#f0b132" fill="#f0b132" />
                              <Text style={[styles.ratingText, { color: colors.textMuted }]}>
                                {item.avgRating.toFixed(1)}
                              </Text>
                            </View>
                          )}
                          {item.salesCount > 0 && (
                            <Text style={[styles.salesText, { color: colors.textMuted }]}>
                              {t('shop.sold')} {item.salesCount}
                            </Text>
                          )}
                        </View>
                      )}
                      {/* Tags */}
                      {item.tags?.length > 0 && (
                        <View style={styles.tagRow}>
                          {item.tags.slice(0, 2).map((tag) => (
                            <View
                              key={tag}
                              style={[styles.tagChip, { backgroundColor: `${colors.primary}15` }]}
                            >
                              <Text
                                style={{ color: colors.primary, fontSize: 9, fontWeight: '600' }}
                              >
                                {tag}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                      <Text style={[styles.productPrice, { color: colors.primary }]}>
                        <PriceCompact amount={item.basePrice} size={12} />
                      </Text>
                    </View>
                  </Pressable>
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
          ListEmptyComponent={<EmptyState icon="📦" title={t('shop.noOrders')} />}
          renderItem={({ item: order }) => (
            <View style={[styles.orderCard, { backgroundColor: colors.surface }]}>
              <View style={styles.orderHeader}>
                <Text style={[styles.orderNo, { color: colors.textMuted }]}>#{order.orderNo}</Text>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: `${statusColor(order.status)}20` },
                  ]}
                >
                  <Text
                    style={{ color: statusColor(order.status), fontSize: 10, fontWeight: '700' }}
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
                    <View
                      style={[
                        styles.orderItemImage,
                        {
                          backgroundColor: colors.inputBackground,
                          alignItems: 'center',
                          justifyContent: 'center',
                        },
                      ]}
                    >
                      <Package size={16} color={colors.textMuted} />
                    </View>
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
                      <PriceCompact amount={item.price} size={14} />
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>
                      ×{item.quantity}
                    </Text>
                  </View>
                </View>
              ))}
              <View style={styles.orderFooter}>
                <Text style={{ color: colors.text, fontWeight: '800' }}>
                  {t('shop.total')}: <PriceCompact amount={order.totalAmount} size={14} />
                </Text>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  {(order.status === 'pending' || order.status === 'paid') && (
                    <Pressable
                      style={[styles.orderActionBtn, { backgroundColor: '#f23f43' + '15' }]}
                      onPress={() => cancelOrderMutation.mutate(order.id)}
                    >
                      <Text style={{ color: '#f23f43', fontSize: fontSize.xs, fontWeight: '600' }}>
                        {t('shop.cancelOrder')}
                      </Text>
                    </Pressable>
                  )}
                  {order.status === 'completed' && (
                    <Pressable
                      style={[styles.orderActionBtn, { backgroundColor: `${colors.primary}15` }]}
                      onPress={() => {
                        setReviewProductId(order.items[0]?.productId ?? null)
                        setShowReviews(true)
                      }}
                    >
                      <Text
                        style={{ color: colors.primary, fontSize: fontSize.xs, fontWeight: '600' }}
                      >
                        {t('shop.viewReviews')}
                      </Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </View>
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
                ) : null}

                <View style={styles.detailBody}>
                  {/* Price + favorite */}
                  <View style={styles.detailPriceRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <ShrimpCoinIcon size={20} color={colors.shrimpCoin} />
                      <Text
                        style={[styles.detailPrice, { color: colors.shrimpCoin, marginLeft: 4 }]}
                      >
                        {selectedSkuId
                          ? ((productDetail?.skus ?? []).find((s) => s.id === selectedSkuId)
                              ?.price ?? selectedProduct.basePrice)
                          : selectedProduct.basePrice}
                      </Text>
                    </View>
                    <Pressable onPress={() => toggleFavorite(selectedProduct.id)}>
                      <Heart
                        size={24}
                        color={favorites.has(selectedProduct.id) ? '#f23f43' : colors.textMuted}
                        fill={favorites.has(selectedProduct.id) ? '#f23f43' : 'transparent'}
                      />
                    </Pressable>
                  </View>

                  <Text style={[styles.detailName, { color: colors.text }]}>
                    {selectedProduct.name}
                  </Text>

                  {/* Tags */}
                  {selectedProduct.tags?.length > 0 && (
                    <View style={[styles.tagRow, { marginTop: spacing.sm }]}>
                      {selectedProduct.tags.map((tag) => (
                        <View
                          key={tag}
                          style={[styles.tagChip, { backgroundColor: `${colors.primary}15` }]}
                        >
                          <Tag size={10} color={colors.primary} />
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
                        <Star size={14} color="#f0b132" fill="#f0b132" />
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
                                        ? `${colors.primary}15`
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
                                  <PriceCompact amount={sku.price} size={12} /> · {t('shop.stock')}{' '}
                                  {sku.stock}
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
                        <Minus size={14} color={colors.text} />
                      </Pressable>
                      <Text
                        style={{
                          color: colors.text,
                          fontWeight: '700',
                          minWidth: 24,
                          textAlign: 'center',
                        }}
                      >
                        {quantity}
                      </Text>
                      <Pressable
                        onPress={() => setQuantity(quantity + 1)}
                        style={[styles.qtyBtn, { backgroundColor: colors.inputBackground }]}
                      >
                        <Plus size={14} color={colors.text} />
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
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>
                          {selectedProduct.ratingCount} {t('shop.reviewCount')}
                        </Text>
                        <ChevronRight size={14} color={colors.textMuted} />
                      </View>
                    </Pressable>
                  )}

                  {/* Add to cart button */}
                  <Pressable
                    style={[styles.addBtn, { backgroundColor: colors.primary }]}
                    onPress={handleAddToCart}
                    disabled={addToCartMutation.isPending}
                  >
                    <ShoppingCart size={18} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSize.md }}>
                      {addToCartMutation.isPending ? t('common.loading') : t('shop.addToCart')}
                    </Text>
                  </Pressable>
                </View>
              </ScrollView>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* ── Cart Modal ───────────────────────────── */}
      <Modal visible={showCart} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setShowCart(false)}>
          <View
            style={[styles.modalSheet, { backgroundColor: colors.surface }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.cartHeader}>
              <Text style={[styles.detailName, { color: colors.text }]}>{t('shop.cart')}</Text>
              <Pressable onPress={() => setShowCart(false)}>
                <X size={22} color={colors.textMuted} />
              </Pressable>
            </View>
            {cartItems.length === 0 ? (
              <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
                <ShoppingCart size={40} color={colors.textMuted} />
                <Text style={{ color: colors.textMuted, marginTop: spacing.md }}>
                  {t('shop.emptyCart')}
                </Text>
              </View>
            ) : (
              <ScrollView>
                {cartItems.map((item) => (
                  <View
                    key={item.id}
                    style={[styles.cartItem, { borderBottomColor: colors.border }]}
                  >
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
                        <Package size={16} color={colors.textMuted} />
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
                          marginTop: 2,
                        }}
                      >
                        <PriceCompact amount={item.unitPrice} size={12} />
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
                          <Trash2 size={12} color="#f23f43" />
                        ) : (
                          <Minus size={14} color={colors.text} />
                        )}
                      </Pressable>
                      <Text
                        style={{
                          color: colors.text,
                          fontWeight: '700',
                          minWidth: 24,
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
                        <Plus size={14} color={colors.text} />
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
                      <PriceCompact amount={cartTotal} size={14} />
                    </Text>
                  </View>
                  <Pressable
                    style={[
                      styles.checkoutBtn,
                      {
                        backgroundColor: colors.primary,
                        opacity: checkoutMutation.isPending ? 0.6 : 1,
                      },
                    ]}
                    onPress={() => checkoutMutation.mutate()}
                    disabled={checkoutMutation.isPending}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSize.md }}>
                      {checkoutMutation.isPending ? t('common.loading') : t('shop.checkout')}
                    </Text>
                  </Pressable>
                </View>
              </ScrollView>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* ── Reviews Modal ────────────────────────── */}
      <Modal visible={showReviews} transparent animationType="slide">
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            setShowReviews(false)
            setReviewProductId(null)
          }}
        >
          <View
            style={[styles.modalSheet, { backgroundColor: colors.surface }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.cartHeader}>
              <Text style={[styles.detailName, { color: colors.text }]}>{t('shop.reviews')}</Text>
              <Pressable
                onPress={() => {
                  setShowReviews(false)
                  setReviewProductId(null)
                }}
              >
                <X size={22} color={colors.textMuted} />
              </Pressable>
            </View>
            {reviews.length === 0 ? (
              <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
                <Star size={40} color={colors.textMuted} />
                <Text style={{ color: colors.textMuted, marginTop: spacing.md }}>
                  {t('shop.noReviews')}
                </Text>
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
                      <View style={{ flexDirection: 'row', gap: 2 }}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star
                            key={n}
                            size={12}
                            color="#f0b132"
                            fill={n <= review.rating ? '#f0b132' : 'transparent'}
                          />
                        ))}
                      </View>
                    </View>
                    {review.content && (
                      <Text
                        style={{ color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 4 }}
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
          </View>
        </Pressable>
      </Modal>
    </View>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    gap: spacing.sm,
  },
  walletChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  walletText: {
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  viewTabs: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  viewTab: {
    paddingVertical: spacing.xs,
    paddingHorizontal: 4,
  },
  cartBtn: { padding: spacing.sm, position: 'relative' },
  cartBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  // Search
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    height: 40,
    gap: spacing.sm,
  },
  searchInput: { flex: 1, fontSize: fontSize.md },
  sortBtn: { padding: spacing.sm },
  // Sort menu
  sortMenu: {
    marginHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  // Categories
  catBar: { maxHeight: 44, borderBottomWidth: 1 },
  catBarContent: {
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
    height: 44,
  },
  catChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99 },
  // Grid
  grid: { padding: spacing.sm },
  gridRow: { gap: spacing.sm, paddingHorizontal: spacing.sm, marginBottom: spacing.sm },
  productCard: { flex: 1, borderRadius: radius.xl, overflow: 'hidden' },
  productImage: { width: '100%', height: 130 },
  favBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  productInfo: { padding: spacing.md },
  productName: { fontSize: fontSize.sm, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ratingText: { fontSize: 10 },
  salesText: { fontSize: 10 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  productPrice: { fontSize: fontSize.sm, fontWeight: '800', marginTop: 6 },
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
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  orderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  orderItemImage: { width: 40, height: 40, borderRadius: radius.md },
  orderItemName: { fontSize: fontSize.sm, fontWeight: '600' },
  orderFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  orderActionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.lg },
  // Detail modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' },
  detailImage: { width: '100%', height: 220 },
  detailBody: { padding: spacing.xl },
  detailPriceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  detailPrice: { fontSize: 24, fontWeight: '800' },
  detailName: { fontSize: fontSize.xl, fontWeight: '800', marginTop: spacing.xs },
  detailDesc: { fontSize: fontSize.sm, marginTop: spacing.md, lineHeight: 20 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: spacing.sm },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  // SKU
  skuSection: { marginTop: spacing.lg },
  skuLabel: { fontSize: fontSize.sm, fontWeight: '700', marginBottom: spacing.sm },
  skuGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  skuChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  skuImage: { width: 24, height: 24, borderRadius: 4 },
  // Quantity
  qtySection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Reviews link
  reviewsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
  },
  // Add to cart
  addBtn: {
    flexDirection: 'row',
    height: 48,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  // Cart modal
  cartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.xl,
  },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    gap: spacing.md,
  },
  cartItemImage: { width: 48, height: 48, borderRadius: radius.md },
  cartFooter: {
    padding: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  checkoutBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
  },
  // Reviews modal
  reviewCard: { padding: spacing.md, borderRadius: radius.lg, marginBottom: spacing.sm },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reviewImage: { width: 60, height: 60, borderRadius: radius.md, marginRight: spacing.sm },
  reviewReply: { marginTop: spacing.sm, padding: spacing.sm, borderRadius: radius.md },
})
