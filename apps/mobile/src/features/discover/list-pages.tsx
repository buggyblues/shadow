import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import {
  AppWindow,
  Bot,
  ChevronRight,
  Cloud,
  Coins,
  type LucideIcon,
  Package,
  Play,
  Search,
  Server,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Users,
  X,
} from 'lucide-react-native'
import { Children, type ReactNode, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import {
  BackgroundSurface,
  Badge,
  EmptyState,
  IconButton,
  MobileBackButton,
  MobileNavigationBar,
  PageScroll,
  TextField,
} from '../../components/ui'
import { API_BASE, fetchApi } from '../../lib/api'
import { errorHaptic, selectionHaptic, successHaptic } from '../../lib/haptics'
import { serverChannelHref } from '../../lib/routes'
import { showToast } from '../../lib/toast'
import { useChatStore } from '../../stores/chat.store'
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
} from '../../theme'

export type DiscoverSearchState = {
  query: string
  setQuery: (value: string) => void
  effectiveQuery: string
}

export interface ServerEntry {
  server: { id: string; name: string; slug: string | null; iconUrl: string | null }
  member: { role: string }
}

export interface HubOwner {
  id: string
  username: string
  displayName: string | null
  avatarUrl: string | null
}

export interface HubServer {
  id: string
  name: string
  slug: string | null
  iconUrl: string | null
}

export interface HubBuddy {
  id: string
  title: string
  description: string | null
  baseDailyRate: number
  messageFee: number
  rentalCount: number
  viewCount?: number
  buddy: HubOwner | null
  owner: HubOwner | null
}

export interface HubProduct {
  id: string
  name: string
  summary: string | null
  description: string | null
  type: 'physical' | 'entitlement' | string
  billingMode?: string
  price: number
  currency?: string
  tags?: string[]
  imageUrl: string | null
  salesCount: number
  ratingCount?: number
  avgRating?: number
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

export interface HubShop {
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

export interface HubCommunity {
  id: string
  name: string
  slug: string | null
  description: string | null
  iconUrl: string | null
  bannerUrl: string | null
  memberCount: number
  inviteCode: string
  heatScore?: number
}

export type PlayAvailability = 'available' | 'gated' | 'coming_soon' | 'misconfigured'

export interface PlayCatalogItem {
  id: string
  image: string
  title: string
  titleEn: string
  desc: string
  descEn: string
  category: string
  categoryEn: string
  starts: string
  accentColor: string
  hot?: boolean
  status: PlayAvailability
}

export interface CloudTemplateSource {
  slug: string
  name: string
  description?: string | null
  source?: string | null
  tags?: string[] | null
  category?: string | null
  deployCount?: number | null
  content?: Record<string, unknown> | null
}

export interface ServerAppDirectoryEntry {
  id: string
  appKey: string
  name: string
  summary?: string | null
  description?: string | null
  tagline?: string | null
  iconUrl?: string | null
  coverImageUrl?: string | null
  categories?: string[] | null
  serverCount: number
  commandCount: number
  skillCount: number
}

export interface DiscoverCommerceResponse {
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

export interface MarketplaceProductsResponse {
  products: HubProduct[]
  total: number
  hasMore: boolean
}

export interface ServerAppDirectoryResponse {
  apps: ServerAppDirectoryEntry[]
  total: number
  hasMore: boolean
}

export function useDiscoverSearch(): DiscoverSearchState {
  const [query, setQuery] = useState('')
  const effectiveQuery = query.trim().length >= 2 ? query.trim() : ''
  return { query, setQuery, effectiveQuery }
}

export function DiscoverListScreen({
  title,
  search,
  searchPlaceholder,
  loading,
  empty,
  children,
}: {
  title: string
  search: DiscoverSearchState
  searchPlaceholder?: string
  loading: boolean
  empty?: { icon: LucideIcon; title: string; description: string }
  children: ReactNode
}) {
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()

  return (
    <BackgroundSurface>
      <MobileNavigationBar
        title={title}
        left={<MobileBackButton onPress={() => router.back()} />}
      />
      <PageScroll compact contentContainerStyle={styles.pageContent}>
        <TextField
          value={search.query}
          onChangeText={search.setQuery}
          placeholder={searchPlaceholder ?? t('discover.searchPlaceholder')}
          left={<Search size={iconSize.md} color={colors.textMuted} />}
          right={
            search.query.length > 0 ? (
              <IconButton
                icon={X}
                variant="ghost"
                iconColor={colors.textMuted}
                iconSize={iconSize.lg}
                style={styles.clearButton}
                onPress={() => search.setQuery('')}
              />
            ) : null
          }
          style={styles.searchBox}
          inputStyle={styles.searchInput}
        />
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : empty ? (
          <View style={[styles.emptyPanel, { borderColor: colors.border }]}>
            <EmptyState icon={empty.icon} title={empty.title} description={empty.description} />
          </View>
        ) : (
          children
        )}
      </PageScroll>
    </BackgroundSurface>
  )
}

export function DiscoverSection({
  title,
  description,
  empty,
  children,
}: {
  title: string
  description?: string
  empty?: string
  children: ReactNode
}) {
  const colors = useColors()
  const hasChildren = Children.count(children) > 0

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
        {description ? (
          <Text style={[styles.sectionDescription, { color: colors.textSecondary }]}>
            {description}
          </Text>
        ) : null}
      </View>
      {hasChildren ? (
        <View style={[styles.listGroup, { borderColor: colors.border }]}>{children}</View>
      ) : empty ? (
        <Text style={[styles.inlineEmpty, { color: colors.textMuted }]}>{empty}</Text>
      ) : null}
    </View>
  )
}

export function DiscoverRow({
  title,
  meta,
  description,
  coverImageUrl,
  imageUrl,
  icon,
  badge,
  chips,
  facts,
  actionLabel,
  onPress,
  disabled,
}: {
  title: string
  meta?: string | null
  description?: string | null
  coverImageUrl?: string | null
  imageUrl?: string | null
  icon: LucideIcon
  badge?: string | null
  chips?: string[]
  facts?: Array<{ icon: LucideIcon; label: string; value: string }>
  actionLabel?: string
  onPress: () => void
  disabled?: boolean
}) {
  const colors = useColors()
  const hasCover = coverImageUrl !== undefined
  const hasFooter = Boolean(chips?.length || facts?.length || actionLabel)

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.discoverRow,
        {
          backgroundColor: pressed ? colors.messageHover : colors.surface,
          borderColor: colors.frostedBorder,
          shadowColor: colors.shadowSoft,
          opacity: disabled ? 0.62 : 1,
        },
        pressed ? styles.discoverRowPressed : null,
      ]}
    >
      {hasCover ? <DiscoverCardCover imageUrl={coverImageUrl} icon={icon} label={title} /> : null}
      <View style={styles.rowContent}>
        <View style={styles.rowHead}>
          <DiscoverThumb imageUrl={imageUrl} icon={icon} label={title} />
          <View style={styles.rowBody}>
            <View style={styles.rowTitleLine}>
              <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={2}>
                {title}
              </Text>
              {badge ? (
                <Badge
                  variant="neutral"
                  size="xs"
                  style={styles.rowBadge}
                  textStyle={styles.rowBadgeText}
                >
                  {badge}
                </Badge>
              ) : null}
            </View>
            {meta ? (
              <Text style={[styles.rowMeta, { color: colors.textMuted }]} numberOfLines={1}>
                {meta}
              </Text>
            ) : null}
          </View>
        </View>
        {description ? (
          <Text style={[styles.rowDescription, { color: colors.textSecondary }]} numberOfLines={2}>
            {description}
          </Text>
        ) : null}
        {hasFooter ? (
          <View style={[styles.rowFooter, { borderTopColor: colors.frostedBorder }]}>
            <View style={styles.rowFooterMeta}>
              {chips?.map((chip) => (
                <DiscoverChip key={chip} label={chip} />
              ))}
              {facts?.map((fact) => (
                <DiscoverFact key={`${fact.label}:${fact.value}`} {...fact} />
              ))}
            </View>
            {actionLabel ? (
              <View style={styles.rowAction}>
                <Text style={[styles.rowActionText, { color: colors.primary }]} numberOfLines={1}>
                  {actionLabel}
                </Text>
                <ChevronRight size={iconSize.sm} color={colors.primary} strokeWidth={2.4} />
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  )
}

export function useCommerceData(effectiveQuery: string) {
  return useQuery({
    queryKey: ['discover-commerce', effectiveQuery],
    queryFn: () =>
      fetchApi<DiscoverCommerceResponse>(
        `/api/discover/business?limit=72${effectiveQuery ? `&q=${encodeURIComponent(effectiveQuery)}` : ''}`,
      ),
  })
}

export function useJoinedServerIds() {
  const { data: myServers = [] } = useQuery({
    queryKey: ['servers'],
    queryFn: () => fetchApi<ServerEntry[]>('/api/servers'),
  })
  return useMemo(() => new Set(myServers.map((entry) => entry.server.id)), [myServers])
}

export function useCommunityJoin() {
  const { t } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()
  const setActiveServer = useChatStore((s) => s.setActiveServer)

  return useMutation({
    mutationFn: ({ inviteCode }: { inviteCode: string }) =>
      fetchApi<{ id: string; slug?: string | null }>('/api/servers/_/join', {
        method: 'POST',
        body: JSON.stringify({ inviteCode }),
      }),
    onSuccess: (server) => {
      successHaptic()
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      setActiveServer(server.id)
      router.push('/(main)' as never)
    },
    onError: (err: { message?: string }) => {
      errorHaptic()
      showToast(err?.message || t('common.error'), 'error')
    },
  })
}

export function useDiscoverActions() {
  const { t } = useTranslation()
  const router = useRouter()
  const setActiveServer = useChatStore((s) => s.setActiveServer)

  const openSeller = (owner: HubOwner | null) => {
    if (!owner?.id) return
    selectionHaptic()
    router.push(`/(main)/profile/${owner.id}` as never)
  }

  const openShop = (shop: HubShop | HubProduct['shop']) => {
    if (shop.server) {
      selectionHaptic()
      router.push(`/(main)/servers/${shop.server.slug ?? shop.server.id}/shop` as never)
      return
    }
    openSeller(shop.owner)
  }

  return {
    openBuddy(item: HubBuddy) {
      openSeller(item.buddy ?? item.owner)
    },
    openProduct(product: HubProduct) {
      if (product.shop.server) {
        selectionHaptic()
        const serverSlug = product.shop.server.slug ?? product.shop.server.id
        router.push(`/(main)/servers/${serverSlug}/shop?productId=${product.id}` as never)
        return
      }
      openSeller(product.shop.owner)
    },
    openShop,
    openPlay(play: PlayCatalogItem, title: string) {
      selectionHaptic()
      router.push({
        pathname: '/(main)/webview-preview',
        params: {
          url: encodeURIComponent(`${API_BASE}/play/launch?play=${encodeURIComponent(play.id)}`),
          title,
        },
      } as never)
    },
    openCloudTemplate(template: CloudTemplateSource) {
      selectionHaptic()
      const slug = encodeURIComponent(template.slug || template.name)
      router.push({
        pathname: '/(main)/webview-preview',
        params: {
          url: encodeURIComponent(`${API_BASE}/cloud/store/${slug}/deploy`),
          title: template.name || template.slug,
        },
      } as never)
    },
    openCloudCashback() {
      selectionHaptic()
      router.push({
        pathname: '/(main)/webview-preview',
        params: {
          url: encodeURIComponent(`${API_BASE}/cloud/diy`),
          title: t('discover.cashbackTitle'),
        },
      } as never)
    },
    openServerApp(app: ServerAppDirectoryEntry) {
      selectionHaptic()
      router.push({
        pathname: '/(main)/webview-preview',
        params: {
          url: encodeURIComponent(
            `${API_BASE}/app/discover/apps/${encodeURIComponent(app.appKey)}`,
          ),
          title: app.name,
        },
      } as never)
    },
    openCommunity(community: HubCommunity) {
      selectionHaptic()
      setActiveServer(community.id)
      router.push('/(main)' as never)
    },
    openCommunityChannel(community: HubCommunity, channelId: string) {
      selectionHaptic()
      setActiveServer(community.id)
      router.push(serverChannelHref(community.slug ?? community.id, channelId) as never)
    },
  }
}

export function formatCompact(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`
  return String(value)
}

export function filterPlays(plays: PlayCatalogItem[], query: string) {
  const normalized = query.trim().toLowerCase()
  const visible = plays.filter((play) => play.status !== 'misconfigured')
  if (!normalized) return visible
  return visible.filter((play) =>
    [play.title, play.titleEn, play.desc, play.descEn, play.category, play.categoryEn]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(normalized)),
  )
}

export function sortPlays(plays: PlayCatalogItem[]) {
  const statusRank: Record<PlayAvailability, number> = {
    available: 0,
    gated: 1,
    coming_soon: 2,
    misconfigured: 3,
  }
  return [...plays].sort((a, b) => {
    const statusDelta = statusRank[a.status] - statusRank[b.status]
    if (statusDelta !== 0) return statusDelta
    if (a.hot !== b.hot) return a.hot ? -1 : 1
    return a.title.localeCompare(b.title)
  })
}

export function sortBuddies(buddies: HubBuddy[]) {
  return [...buddies].sort(
    (a, b) =>
      b.rentalCount * 6 + (b.viewCount ?? 0) - (a.rentalCount * 6 + (a.viewCount ?? 0)) ||
      b.messageFee - a.messageFee ||
      a.title.localeCompare(b.title),
  )
}

export function sortProducts(products: HubProduct[]) {
  return [...products].sort(
    (a, b) =>
      b.salesCount * 6 +
        (b.ratingCount ?? 0) * 2 +
        (b.avgRating ?? 0) -
        (a.salesCount * 6 + (a.ratingCount ?? 0) * 2 + (a.avgRating ?? 0)) ||
      a.name.localeCompare(b.name),
  )
}

export function sortShops(shops: HubShop[]) {
  return [...shops].sort(
    (a, b) => (b.productCount ?? 0) - (a.productCount ?? 0) || a.name.localeCompare(b.name),
  )
}

export function sortServerApps(apps: ServerAppDirectoryEntry[]) {
  return [...apps].sort(
    (a, b) =>
      b.serverCount * 8 +
        b.commandCount * 2 +
        b.skillCount -
        (a.serverCount * 8 + a.commandCount * 2 + a.skillCount) || a.name.localeCompare(b.name),
  )
}

export function sortCommunities(communities: HubCommunity[]) {
  return [...communities].sort(
    (a, b) =>
      (b.heatScore ?? 0) - (a.heatScore ?? 0) ||
      b.memberCount - a.memberCount ||
      a.name.localeCompare(b.name),
  )
}

export function sortCloudTemplates(templates: CloudTemplateSource[]) {
  return [...templates].sort((a, b) => {
    const officialDelta = Number(b.source === 'official') - Number(a.source === 'official')
    if (officialDelta !== 0) return officialDelta
    return (b.deployCount ?? 0) - (a.deployCount ?? 0) || a.name.localeCompare(b.name)
  })
}

export function getTemplateMeta(template: CloudTemplateSource) {
  const agents = Array.isArray(template.content?.agents) ? template.content.agents : []
  return { agentCount: agents.length }
}

function DiscoverCardCover({
  imageUrl,
  icon: Icon,
  label,
}: {
  imageUrl?: string | null
  icon: LucideIcon
  label: string
}) {
  const colors = useColors()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setFailed(false)
  }, [imageUrl])

  return (
    <View
      style={[
        styles.cardCover,
        { backgroundColor: colors.inputBackground, borderBottomColor: colors.frostedBorder },
      ]}
    >
      {imageUrl && !failed ? (
        <Image
          source={{ uri: imageUrl }}
          style={styles.cardCoverImage}
          accessibilityLabel={label}
          onError={() => setFailed(true)}
        />
      ) : (
        <View style={styles.cardCoverFallback}>
          <Icon size={iconSize['2xl']} color={colors.primary} />
        </View>
      )}
    </View>
  )
}

function DiscoverThumb({
  imageUrl,
  icon: Icon,
  label,
}: {
  imageUrl?: string | null
  icon: LucideIcon
  label: string
}) {
  const colors = useColors()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setFailed(false)
  }, [imageUrl])

  return (
    <View
      style={[
        styles.thumb,
        { backgroundColor: colors.inputBackground, borderColor: colors.border },
      ]}
    >
      {imageUrl && !failed ? (
        <Image
          source={{ uri: imageUrl }}
          style={styles.thumbImage}
          accessibilityLabel={label}
          onError={() => setFailed(true)}
        />
      ) : (
        <Icon size={iconSize.lg} color={colors.primary} />
      )}
    </View>
  )
}

function DiscoverChip({ label }: { label: string }) {
  const colors = useColors()
  return (
    <View style={[styles.chip, { backgroundColor: colors.inputBackground }]}>
      <Text style={[styles.chipText, { color: colors.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

function DiscoverFact({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon
  label: string
  value: string
}) {
  const colors = useColors()
  return (
    <View style={[styles.fact, { backgroundColor: colors.inputBackground }]}>
      <Icon size={iconSize.xs} color={colors.primary} />
      <Text style={[styles.factText, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.factValue, { color: colors.text }]}>{value}</Text>
    </View>
  )
}

export const DiscoverIcons = {
  AppWindow,
  Bot,
  Cloud,
  Coins,
  Package,
  Play,
  Server,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Users,
}

export const discoverPalette = palette

const styles = StyleSheet.create({
  pageContent: {
    paddingTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: size.tabBar + spacing['6xl'],
    gap: spacing.lg,
  },
  searchBox: {
    minHeight: size.controlMd,
    borderRadius: radius.full,
  },
  searchInput: {
    minHeight: size.controlMd,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  clearButton: {
    width: size.iconButtonSm,
    height: size.iconButtonSm,
  },
  centerContainer: {
    minHeight: size.mediaViewportMaxHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyPanel: {
    borderWidth: border.hairline,
    borderRadius: radius.lg,
    paddingVertical: spacing['3xl'],
  },
  section: {
    gap: spacing.sm,
  },
  sectionHeader: {
    paddingHorizontal: spacing.xs,
    gap: spacing.xxs,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontWeight: '800',
  },
  sectionDescription: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
  },
  listGroup: {
    gap: spacing.sm,
  },
  inlineEmpty: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.md,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  discoverRow: {
    minHeight: size.listItemLg,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    overflow: 'hidden',
    shadowOffset: { width: spacing.none, height: spacing.xs },
    shadowOpacity: 0.035,
    shadowRadius: 8,
    elevation: 0,
  },
  discoverRowPressed: {
    transform: [{ scale: 0.99 }],
  },
  cardCover: {
    height: size.navSide,
    borderBottomWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  cardCoverImage: {
    width: '100%',
    height: '100%',
  },
  cardCoverFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  thumb: {
    width: size.controlLg,
    height: size.controlLg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  rowTitleLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  rowTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: '800',
  },
  rowBadge: {
    maxWidth: size.navSide,
  },
  rowBadgeText: {
    fontSize: fontSize.micro,
  },
  rowMeta: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    fontWeight: '700',
  },
  rowDescription: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
  },
  rowFooter: {
    minHeight: size.controlXs,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rowFooterMeta: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  rowAction: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  rowActionText: {
    maxWidth: size.actionTileMin,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    fontWeight: '900',
  },
  chip: {
    maxWidth: size.keyValueLabel,
    minHeight: size.badgeLg,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
  },
  chipText: {
    fontSize: fontSize.micro,
    lineHeight: lineHeight.micro,
    fontWeight: '800',
  },
  fact: {
    minHeight: size.badgeLg,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  factText: {
    fontSize: fontSize.micro,
    fontWeight: '700',
  },
  factValue: {
    fontSize: fontSize.micro,
    fontWeight: '900',
  },
})
