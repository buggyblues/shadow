import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import {
  Bot,
  Coins,
  Compass,
  type LucideIcon,
  Package,
  Search,
  Server,
  ShieldCheck,
  ShoppingBag,
  Store,
  X,
} from 'lucide-react-native'
import { type ReactNode, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  BackgroundSurface,
  Badge,
  Button,
  EmptyState,
  GlassPanel,
  IconButton,
  PageScroll,
  TextField,
} from '../../src/components/ui'
import { fetchApi } from '../../src/lib/api'
import { showToast } from '../../src/lib/toast'
import {
  border,
  fontSize,
  iconSize,
  lineHeight,
  radius,
  size,
  spacing,
  useColors,
} from '../../src/theme'

type HubSection = 'all' | 'buddies' | 'market' | 'shops' | 'communities'

interface ServerEntry {
  server: { id: string; name: string; slug: string | null; iconUrl: string | null }
  member: { role: string }
}

interface HubOwner {
  id: string
  username: string
  displayName: string | null
  avatarUrl: string | null
}

interface HubServer {
  id: string
  name: string
  slug: string | null
  iconUrl: string | null
}

interface HubBuddy {
  id: string
  title: string
  description: string | null
  baseDailyRate: number
  messageFee: number
  rentalCount: number
  buddy: HubOwner | null
  owner: HubOwner | null
}

interface HubProduct {
  id: string
  name: string
  summary: string | null
  description: string | null
  type: 'physical' | 'entitlement' | string
  price: number
  tags?: string[]
  imageUrl: string | null
  salesCount: number
  shop: {
    id: string
    name: string
    scopeKind: 'server' | 'user' | string
    logoUrl: string | null
    bannerUrl: string | null
    server: HubServer | null
    owner: HubOwner | null
  }
}

interface HubShop {
  id: string
  name: string
  description: string | null
  scopeKind: 'server' | 'user' | string
  logoUrl: string | null
  bannerUrl: string | null
  productCount: number
  server: HubServer | null
  owner: HubOwner | null
}

interface HubCommunity {
  id: string
  name: string
  slug: string | null
  description: string | null
  iconUrl: string | null
  bannerUrl: string | null
  memberCount: number
  inviteCode: string
}

interface DiscoverCommerceResponse {
  buddies: HubBuddy[]
  products: HubProduct[]
  shops: HubShop[]
  communities: HubCommunity[]
  totals: {
    buddies: number
    products: number
    shops: number
    communities: number
  }
}

interface MarketplaceProductsResponse {
  products: HubProduct[]
  total: number
  hasMore: boolean
}

interface MarketplaceCategory {
  tag: string
  title: string
  productCount: number
  salesCount: number
  ratingCount: number
  avgRating: number
  score: number
  href: string
}

interface MarketplaceCategoriesResponse {
  categories: MarketplaceCategory[]
  total: number
}

const HUB_SECTIONS: Array<{ key: HubSection; icon: LucideIcon }> = [
  { key: 'all', icon: Compass },
  { key: 'buddies', icon: Bot },
  { key: 'market', icon: ShoppingBag },
  { key: 'shops', icon: Store },
  { key: 'communities', icon: Server },
]

const CATEGORY_ICON_POOL: LucideIcon[] = [ShoppingBag, Package, Store, Compass]

export default function DiscoverScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSection, setActiveSection] = useState<HubSection>('all')
  const [selectedMarketplaceTag, setSelectedMarketplaceTag] = useState('')
  const normalizedSearch = searchQuery.trim()
  const effectiveSearch = normalizedSearch.length >= 2 ? normalizedSearch : ''

  const { data: myServers = [] } = useQuery({
    queryKey: ['servers'],
    queryFn: () => fetchApi<ServerEntry[]>('/api/servers'),
  })
  const joinedServerIds = useMemo(() => new Set(myServers.map((s) => s.server.id)), [myServers])

  const { data, isLoading } = useQuery({
    queryKey: ['discover-commerce', effectiveSearch],
    queryFn: () =>
      fetchApi<DiscoverCommerceResponse>(
        `/api/discover/business?limit=10${effectiveSearch ? `&q=${encodeURIComponent(effectiveSearch)}` : ''}`,
      ),
  })

  const { data: marketplaceData, isLoading: isMarketplaceLoading } = useQuery({
    queryKey: ['discover-marketplace-products', effectiveSearch, selectedMarketplaceTag],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '24' })
      if (effectiveSearch) params.set('q', effectiveSearch)
      if (selectedMarketplaceTag) params.set('tag', selectedMarketplaceTag)
      return fetchApi<MarketplaceProductsResponse>(`/api/discover/marketplace/products?${params}`)
    },
  })

  const { data: marketplaceCategoriesData } = useQuery({
    queryKey: ['discover-marketplace-categories', effectiveSearch],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '12' })
      if (effectiveSearch) params.set('q', effectiveSearch)
      return fetchApi<MarketplaceCategoriesResponse>(
        `/api/discover/marketplace/categories?${params}`,
      )
    },
  })

  const hub = data ?? {
    buddies: [],
    products: [],
    shops: [],
    communities: [],
    totals: { buddies: 0, products: 0, shops: 0, communities: 0 },
  }
  const marketplaceProducts = marketplaceData?.products ?? []
  const marketplaceCategories = useMemo(
    () =>
      selectedMarketplaceTag
        ? ensureSelectedCategory(
            marketplaceCategoriesData?.categories ?? categoriesFromProducts(marketplaceProducts),
            selectedMarketplaceTag,
          )
        : (marketplaceCategoriesData?.categories ?? categoriesFromProducts(marketplaceProducts)),
    [marketplaceCategoriesData?.categories, marketplaceProducts, selectedMarketplaceTag],
  )

  const joinMutation = useMutation({
    mutationFn: ({ inviteCode }: { inviteCode: string }) =>
      fetchApi<{ id: string; slug?: string | null }>('/api/servers/_/join', {
        method: 'POST',
        body: JSON.stringify({ inviteCode }),
      }),
    onSuccess: (server) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      router.push(`/(main)/servers/${server.slug ?? server.id}`)
    },
    onError: (err: { message?: string }) => showToast(err?.message || t('common.error'), 'error'),
  })

  const counts = {
    all:
      hub.buddies.length + marketplaceProducts.length + hub.shops.length + hub.communities.length,
    buddies: hub.totals.buddies,
    market: marketplaceData?.total ?? marketplaceProducts.length,
    shops: hub.totals.shops,
    communities: hub.totals.communities,
  }
  const isSearching = effectiveSearch.length > 0
  const empty = counts.all === 0

  const openSeller = (owner: HubOwner | null) => {
    if (owner?.id) router.push(`/(main)/profile/${owner.id}`)
  }

  const openShop = (shop: HubShop | HubProduct['shop']) => {
    if (shop.server) {
      router.push(`/(main)/servers/${shop.server.slug ?? shop.server.id}/shop` as never)
      return
    }
    openSeller(shop.owner)
  }

  const openProduct = (product: HubProduct) => {
    if (product.shop.server) {
      const serverSlug = product.shop.server.slug ?? product.shop.server.id
      router.push(`/(main)/servers/${serverSlug}/shop?productId=${product.id}` as never)
      return
    }
    openSeller(product.shop.owner)
  }

  return (
    <BackgroundSurface style={styles.container}>
      <PageScroll compact contentContainerStyle={styles.content}>
        <GlassPanel style={styles.hero}>
          <View style={styles.eyebrow}>
            <ShoppingBag size={iconSize.sm} color={colors.primary} />
            <Text style={[styles.eyebrowText, { color: colors.primary }]}>
              {t('discover.supermarket.eyebrow')}
            </Text>
          </View>
          <Text style={[styles.heroTitle, { color: colors.text }]}>
            {t('discover.supermarket.title')}
          </Text>
          <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
            {t('discover.supermarket.subtitle')}
          </Text>
          <TextField
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('discover.searchPlaceholder')}
            left={<Search size={iconSize.lg} color={colors.textMuted} />}
            right={
              searchQuery.length > 0 ? (
                <IconButton
                  icon={X}
                  variant="ghost"
                  iconColor={colors.textMuted}
                  iconSize={18}
                  style={styles.clearButton}
                  onPress={() => setSearchQuery('')}
                />
              ) : null
            }
            style={styles.searchBox}
          />
          <MarketplaceCategoryChips
            categories={marketplaceCategories}
            selectedTag={selectedMarketplaceTag}
            onSelect={(tag) => {
              setSelectedMarketplaceTag(tag)
              setActiveSection('market')
            }}
          />
        </GlassPanel>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabs}
        >
          {HUB_SECTIONS.map((section) => {
            const Icon = section.icon
            const active = activeSection === section.key
            return (
              <Pressable
                key={section.key}
                onPress={() => setActiveSection(section.key)}
                style={[
                  styles.tab,
                  {
                    borderColor: active ? colors.primary : colors.border,
                    backgroundColor: active ? colors.surfaceHover : colors.inputBackground,
                  },
                ]}
              >
                <Icon size={15} color={active ? colors.primary : colors.textMuted} />
                <Text
                  style={[
                    styles.tabText,
                    { color: active ? colors.primary : colors.textSecondary },
                  ]}
                >
                  {t(`discover.sections.${section.key}`)}
                </Text>
                <Text
                  style={[styles.tabCount, { color: active ? colors.primary : colors.textMuted }]}
                >
                  {counts[section.key]}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>

        {isLoading || isMarketplaceLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : empty ? (
          <GlassPanel style={styles.emptyPanel}>
            <EmptyState
              icon={Search}
              title={isSearching ? t('discover.noSearchResults') : t('discover.emptyTitle')}
              description={
                isSearching ? t('discover.noSearchResultsDesc') : t('discover.emptyDesc')
              }
            />
          </GlassPanel>
        ) : (
          <View style={styles.lanes}>
            {(activeSection === 'all' || activeSection === 'buddies') && (
              <HubLane title={t('discover.lanes.buddies')} empty={t('discover.emptyLane.buddies')}>
                {hub.buddies.map((item) => (
                  <BuddyCard key={item.id} item={item} onOpen={() => openSeller(item.owner)} />
                ))}
              </HubLane>
            )}

            {(activeSection === 'all' || activeSection === 'market') && (
              <HubLane title={t('discover.lanes.market')} empty={t('discover.emptyLane.market')}>
                <MarketplaceAisleCards
                  categories={marketplaceCategories}
                  selectedTag={selectedMarketplaceTag}
                  onSelect={(tag) => {
                    setSelectedMarketplaceTag(tag)
                    setActiveSection('market')
                  }}
                />
                <MarketplaceTagChips
                  categories={marketplaceCategories}
                  selectedTag={selectedMarketplaceTag}
                  onSelect={(tag) => {
                    setSelectedMarketplaceTag(tag)
                    setActiveSection('market')
                  }}
                />
                {marketplaceProducts.length === 0 ? (
                  <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                    {t('discover.emptyLane.market')}
                  </Text>
                ) : (
                  marketplaceProducts.map((item) => (
                    <ProductCard key={item.id} item={item} onOpen={() => openProduct(item)} />
                  ))
                )}
              </HubLane>
            )}

            {(activeSection === 'all' || activeSection === 'shops') && (
              <HubLane title={t('discover.lanes.shops')} empty={t('discover.emptyLane.shops')}>
                {hub.shops.map((shop) => (
                  <ShopCard key={shop.id} shop={shop} onOpen={() => openShop(shop)} />
                ))}
              </HubLane>
            )}

            {(activeSection === 'all' || activeSection === 'communities') && (
              <HubLane
                title={t('discover.lanes.communities')}
                empty={t('discover.emptyLane.communities')}
              >
                {hub.communities.map((community) => (
                  <CommunityCard
                    key={community.id}
                    community={community}
                    joined={joinedServerIds.has(community.id)}
                    pending={joinMutation.isPending}
                    onEnter={() => router.push(`/(main)/servers/${community.slug ?? community.id}`)}
                    onJoin={() => joinMutation.mutate({ inviteCode: community.inviteCode })}
                  />
                ))}
              </HubLane>
            )}
          </View>
        )}
      </PageScroll>
    </BackgroundSurface>
  )
}

function MarketplaceCategoryChips({
  categories,
  selectedTag,
  onSelect,
}: {
  categories: MarketplaceCategory[]
  selectedTag: string
  onSelect: (tag: string) => void
}) {
  const colors = useColors()
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.heroCategories}
    >
      {categories.slice(0, 8).map((category, index) => {
        const Icon = CATEGORY_ICON_POOL[index % CATEGORY_ICON_POOL.length] ?? ShoppingBag
        const active = selectedTag === category.tag
        return (
          <Pressable
            key={category.tag}
            onPress={() => onSelect(category.tag)}
            style={[
              styles.heroCategory,
              {
                borderColor: active ? colors.primary : colors.border,
                backgroundColor: active ? colors.surfaceHover : colors.inputBackground,
              },
            ]}
          >
            <Icon size={14} color={active ? colors.primary : colors.textMuted} />
            <Text
              style={[
                styles.heroCategoryText,
                { color: active ? colors.primary : colors.textSecondary },
              ]}
              numberOfLines={1}
            >
              {category.title}
            </Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

function HubLane({
  title,
  empty,
  children,
}: {
  title: string
  empty: string
  children: ReactNode
}) {
  const colors = useColors()
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children)
  return (
    <GlassPanel style={styles.lane}>
      <Text style={[styles.laneTitle, { color: colors.text }]}>{title}</Text>
      <View style={styles.cardStack}>
        {hasChildren ? (
          children
        ) : (
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>{empty}</Text>
        )}
      </View>
    </GlassPanel>
  )
}

function MarketplaceAisleCards({
  categories,
  selectedTag,
  onSelect,
}: {
  categories: MarketplaceCategory[]
  selectedTag: string
  onSelect: (tag: string) => void
}) {
  const { t } = useTranslation()
  const colors = useColors()
  if (categories.length === 0) return null
  return (
    <View style={styles.aisleCards}>
      {categories.slice(0, 6).map((category, index) => {
        const Icon = CATEGORY_ICON_POOL[index % CATEGORY_ICON_POOL.length] ?? ShoppingBag
        const active = selectedTag === category.tag
        return (
          <Pressable
            key={category.tag}
            onPress={() => onSelect(category.tag)}
            style={[
              styles.aisleCard,
              {
                borderColor: active ? colors.primary : colors.border,
                backgroundColor: active ? colors.surfaceHover : colors.surface,
              },
            ]}
          >
            <View style={[styles.aisleIcon, { backgroundColor: colors.surfaceHover }]}>
              <Icon size={18} color={colors.primary} />
            </View>
            <View style={styles.aisleCopy}>
              <Text style={[styles.aisleTitle, { color: colors.text }]} numberOfLines={1}>
                {category.title}
              </Text>
              <Text style={[styles.aisleSubtitle, { color: colors.textMuted }]} numberOfLines={2}>
                {t('discover.supermarket.categoryProductCount', {
                  count: category.productCount,
                })}
              </Text>
            </View>
          </Pressable>
        )
      })}
    </View>
  )
}

function MarketplaceTagChips({
  categories,
  selectedTag,
  onSelect,
}: {
  categories: MarketplaceCategory[]
  selectedTag: string
  onSelect: (tag: string) => void
}) {
  const { t } = useTranslation()
  const colors = useColors()
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.tagChips}
    >
      <Pressable
        onPress={() => onSelect('')}
        style={[
          styles.tagChip,
          {
            borderColor: selectedTag ? colors.border : colors.primary,
            backgroundColor: selectedTag ? colors.inputBackground : colors.surfaceHover,
          },
        ]}
      >
        <Text
          style={[styles.tagChipText, { color: selectedTag ? colors.textMuted : colors.primary }]}
        >
          {t('discover.marketTags.all')}
        </Text>
      </Pressable>
      {categories.map((category) => {
        const active = selectedTag === category.tag
        return (
          <Pressable
            key={category.tag}
            onPress={() => onSelect(category.tag)}
            style={[
              styles.tagChip,
              {
                borderColor: active ? colors.primary : colors.border,
                backgroundColor: active ? colors.surfaceHover : colors.inputBackground,
              },
            ]}
          >
            <Text
              style={[styles.tagChipText, { color: active ? colors.primary : colors.textMuted }]}
            >
              {category.title}
            </Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

function categoriesFromProducts(products: HubProduct[]): MarketplaceCategory[] {
  const categoryMap = new Map<
    string,
    { productCount: number; salesCount: number; ratingCount: number; avgRating: number }
  >()
  for (const product of products) {
    const tags = [...new Set((product.tags ?? []).map((tag) => tag.trim()).filter(Boolean))]
    for (const tag of tags) {
      const current = categoryMap.get(tag) ?? {
        productCount: 0,
        salesCount: 0,
        ratingCount: 0,
        avgRating: 0,
      }
      current.productCount += 1
      current.salesCount += product.salesCount
      categoryMap.set(tag, current)
    }
  }
  return [...categoryMap.entries()]
    .map(([tag, value]) => ({
      tag,
      title: tag,
      productCount: value.productCount,
      salesCount: value.salesCount,
      ratingCount: value.ratingCount,
      avgRating: value.avgRating,
      score: value.productCount * 100 + value.salesCount * 8,
      href: `/app/shop/tags/${encodeURIComponent(tag)}`,
    }))
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
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

function BuddyCard({ item, onOpen }: { item: HubBuddy; onOpen: () => void }) {
  const { t } = useTranslation()
  const colors = useColors()
  const buddyName =
    item.buddy?.displayName ?? item.buddy?.username ?? item.owner?.displayName ?? item.title
  const ownerName = item.owner?.displayName ?? item.owner?.username ?? t('common.unknown')
  return (
    <GlassPanel style={styles.itemCard}>
      <View style={styles.row}>
        <Avatar imageUrl={item.buddy?.avatarUrl} icon={Bot} label={buddyName} />
        <View style={styles.titleBlock}>
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={[styles.cardMeta, { color: colors.textMuted }]} numberOfLines={1}>
            {ownerName}
          </Text>
        </View>
        <Badge variant="primary" size="xs">
          {t('discover.badges.buddy')}
        </Badge>
      </View>
      <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>
        {item.description || t('discover.noDescription')}
      </Text>
      <View style={styles.factRow}>
        <Fact icon={Coins} label={t('discover.facts.daily')} value={String(item.baseDailyRate)} />
        <Fact
          icon={ShieldCheck}
          label={t('discover.facts.rentals')}
          value={String(item.rentalCount)}
        />
      </View>
      <Button variant="glass" size="sm" onPress={onOpen}>
        {t('discover.openBuddy')}
      </Button>
    </GlassPanel>
  )
}

function ProductCard({ item, onOpen }: { item: HubProduct; onOpen: () => void }) {
  const { t } = useTranslation()
  const colors = useColors()
  return (
    <GlassPanel style={styles.itemCard}>
      <Visual imageUrl={item.imageUrl} icon={Package} label={item.name} />
      <View style={styles.row}>
        <View style={styles.titleBlock}>
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.cardMeta, { color: colors.primary }]} numberOfLines={1}>
            {item.shop.name}
          </Text>
        </View>
        <Text style={[styles.price, { color: colors.shrimpCoin }]}>{item.price}</Text>
      </View>
      <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>
        {item.summary || item.description || t('discover.noDescription')}
      </Text>
      <Button size="sm" onPress={onOpen}>
        {t('discover.openProduct')}
      </Button>
    </GlassPanel>
  )
}

function ShopCard({ shop, onOpen }: { shop: HubShop; onOpen: () => void }) {
  const { t } = useTranslation()
  const colors = useColors()
  const owner =
    shop.server?.name ?? shop.owner?.displayName ?? shop.owner?.username ?? t('common.unknown')
  return (
    <GlassPanel style={styles.itemCard}>
      <Visual imageUrl={shop.bannerUrl ?? shop.logoUrl} icon={Store} label={shop.name} />
      <View style={styles.row}>
        <Avatar imageUrl={shop.logoUrl} icon={Store} label={shop.name} />
        <View style={styles.titleBlock}>
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
            {shop.name}
          </Text>
          <Text style={[styles.cardMeta, { color: colors.textMuted }]} numberOfLines={1}>
            {owner}
          </Text>
        </View>
      </View>
      <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>
        {shop.description || t('discover.shopFallback')}
      </Text>
      <View style={styles.row}>
        <Text style={[styles.cardMeta, { color: colors.textMuted }]}>
          {t('discover.productCount', { count: shop.productCount })}
        </Text>
        <Button variant="glass" size="sm" onPress={onOpen}>
          {t('discover.openShop')}
        </Button>
      </View>
    </GlassPanel>
  )
}

function CommunityCard({
  community,
  joined,
  pending,
  onEnter,
  onJoin,
}: {
  community: HubCommunity
  joined: boolean
  pending: boolean
  onEnter: () => void
  onJoin: () => void
}) {
  const { t } = useTranslation()
  const colors = useColors()
  return (
    <GlassPanel style={styles.itemCard}>
      <Visual imageUrl={community.bannerUrl} icon={Server} label={community.name} />
      <View style={styles.row}>
        <Avatar imageUrl={community.iconUrl} icon={Server} label={community.name} />
        <View style={styles.titleBlock}>
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
            {community.name}
          </Text>
          <Text style={[styles.cardMeta, { color: colors.textMuted }]}>
            {t('discover.memberCount', { count: community.memberCount })}
          </Text>
        </View>
        <Badge variant={joined ? 'success' : 'neutral'} size="xs">
          {joined ? t('discover.joined') : t('discover.public')}
        </Badge>
      </View>
      <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>
        {community.description || t('discover.noDescription')}
      </Text>
      <Button
        variant={joined ? 'glass' : 'primary'}
        size="sm"
        onPress={joined ? onEnter : onJoin}
        disabled={pending}
      >
        {joined ? t('discover.enterButton') : t('discover.joinButton')}
      </Button>
    </GlassPanel>
  )
}

function Avatar({
  imageUrl,
  icon: Icon,
  label,
}: {
  imageUrl?: string | null
  icon: LucideIcon
  label: string
}) {
  const colors = useColors()
  return (
    <View
      style={[
        styles.avatar,
        { backgroundColor: colors.inputBackground, borderColor: colors.border },
      ]}
    >
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.avatarImage} accessibilityLabel={label} />
      ) : (
        <Icon size={iconSize.xl} color={colors.primary} />
      )}
    </View>
  )
}

function Visual({
  imageUrl,
  icon: Icon,
  label,
}: {
  imageUrl?: string | null
  icon: LucideIcon
  label: string
}) {
  const colors = useColors()
  return (
    <View style={[styles.visual, { backgroundColor: colors.inputBackground }]}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.visualImage} accessibilityLabel={label} />
      ) : (
        <Icon size={26} color={colors.primary} />
      )}
    </View>
  )
}

function Fact({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  const colors = useColors()
  return (
    <View style={[styles.fact, { backgroundColor: colors.inputBackground }]}>
      <Icon size={iconSize.sm} color={colors.primary} />
      <Text style={[styles.factText, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.factValue, { color: colors.text }]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    gap: spacing.md,
  },
  hero: {
    gap: spacing.sm,
    padding: spacing.md,
  },
  eyebrow: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
  },
  eyebrowText: {
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  heroTitle: {
    fontSize: fontSize.lg,
    fontWeight: '900',
  },
  heroSubtitle: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
  },
  searchBox: {
    marginTop: spacing.xs,
  },
  heroCategories: {
    gap: spacing.xs,
    paddingRight: spacing.md,
  },
  heroCategory: {
    height: size.controlSm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    borderWidth: border.hairline,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
  },
  heroCategoryText: {
    maxWidth: size.compactChipMaxWidth,
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  clearButton: {
    width: size.sectionCompactIcon,
    height: size.sectionCompactIcon,
  },
  tabs: {
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  tab: {
    minWidth: size.navSide,
    height: size.iconBubble,
    borderWidth: border.hairline,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  tabText: {
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  tabCount: {
    marginLeft: 'auto',
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  centerContainer: {
    paddingVertical: spacing['3xl'],
    alignItems: 'center',
  },
  lanes: {
    gap: spacing.md,
  },
  lane: {
    gap: spacing.sm,
  },
  laneTitle: {
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  cardStack: {
    gap: spacing.sm,
  },
  aisleCards: {
    gap: spacing.sm,
  },
  aisleCard: {
    minHeight: size.listItemLg,
    borderWidth: border.hairline,
    borderRadius: radius.lg,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  aisleIcon: {
    width: size.controlMd,
    height: size.controlMd,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aisleCopy: {
    flex: 1,
    minWidth: 0,
  },
  aisleTitle: {
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  aisleSubtitle: {
    marginTop: spacing.xxs,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    fontWeight: '700',
  },
  tagChips: {
    gap: spacing.xs,
    paddingRight: spacing.md,
  },
  tagChip: {
    height: size.controlSm,
    borderWidth: border.hairline,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagChipText: {
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  emptyText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  emptyPanel: {
    minHeight: size.mediaPlaceholderMinHeight,
    justifyContent: 'center',
  },
  itemCard: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  cardMeta: {
    marginTop: spacing.xxs,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  description: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  price: {
    fontSize: fontSize.lg,
    fontWeight: '900',
  },
  avatar: {
    width: size.controlMd,
    height: size.controlMd,
    borderWidth: border.hairline,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  visual: {
    height: size.actionTileMin,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  visualImage: {
    width: '100%',
    height: '100%',
  },
  factRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  fact: {
    flex: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.xxs,
  },
  factText: {
    fontSize: fontSize.micro,
    fontWeight: '800',
  },
  factValue: {
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
})
