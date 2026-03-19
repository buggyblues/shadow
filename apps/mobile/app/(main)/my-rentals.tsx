import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import {
  ChevronDown,
  ChevronLeft,
  Clock,
  Edit,
  Eye,
  Package,
  Pause,
  Play,
  Plus,
  Trash2,
  Users,
} from 'lucide-react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { PriceCompact } from '../../src/components/common/price-display'
import { fetchApi } from '../../src/lib/api'
import { showToast } from '../../src/lib/toast'
import { fontSize, radius, spacing, useColors } from '../../src/theme'

interface Contract {
  id: string
  contractNo: string
  status: 'pending' | 'active' | 'completed' | 'cancelled' | 'violated' | 'disputed'
  startsAt: string | null
  expiresAt: string | null
  hourlyRate: number
  totalCost: number
  listing?: { title: string; deviceTier: string; osType: string } | null
  createdAt: string
}

interface MyListing {
  id: string
  title: string
  listingStatus: 'draft' | 'active' | 'paused' | 'expired' | 'closed'
  isListed: boolean
  deviceTier: string
  osType: string
  hourlyRate: number
  viewCount: number
  rentalCount: number
  agent?: { status: string; lastHeartbeat: string | null; totalOnlineSeconds: number } | null
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: '#fef9c3', text: '#a16207' },
  active: { bg: '#dcfce7', text: '#15803d' },
  completed: { bg: '#f3f4f6', text: '#4b5563' },
  cancelled: { bg: '#f3f4f6', text: '#6b7280' },
  violated: { bg: '#fee2e2', text: '#b91c1c' },
  disputed: { bg: '#ffedd5', text: '#c2410c' },
}

function isAgentOnline(agent?: MyListing['agent']): boolean {
  if (!agent || agent.status !== 'running' || !agent.lastHeartbeat) return false
  return Date.now() - new Date(agent.lastHeartbeat).getTime() < 90_000
}

export default function MyRentalsScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [mainTab, setMainTab] = useState<'renting' | 'renting-out'>('renting')
  const [subTab, setSubTab] = useState<'contracts' | 'listings'>('contracts')
  const [showOffline, setShowOffline] = useState(false)

  const { data: rentingData, isLoading: loadRenting } = useQuery({
    queryKey: ['marketplace', 'contracts', 'tenant'],
    queryFn: () => fetchApi<{ contracts: Contract[] }>('/api/marketplace/contracts?role=tenant'),
  })
  const { data: ownerData, isLoading: loadOwner } = useQuery({
    queryKey: ['marketplace', 'contracts', 'owner'],
    queryFn: () => fetchApi<{ contracts: Contract[] }>('/api/marketplace/contracts?role=owner'),
  })
  const { data: listingsData, isLoading: loadListings } = useQuery({
    queryKey: ['marketplace', 'my-listings'],
    queryFn: () => fetchApi<{ listings: MyListing[] }>('/api/marketplace/my-listings'),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, listingStatus }: { id: string; listingStatus: string }) =>
      fetchApi(`/api/marketplace/listings/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingStatus }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace'] })
      showToast(t('marketplace.statusUpdated', '状态已更新'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/marketplace/listings/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace'] })
      showToast(t('marketplace.listingDeleted', '挂单已删除'))
    },
  })

  const contracts = mainTab === 'renting' ? rentingData?.contracts : ownerData?.contracts
  const isLoadingContracts = mainTab === 'renting' ? loadRenting : loadOwner

  const renderContract = ({ item: c }: { item: Contract }) => {
    const st = STATUS_COLORS[c.status] ?? STATUS_COLORS.pending!
    const duration =
      c.startsAt && c.expiresAt
        ? `${Math.round((new Date(c.expiresAt).getTime() - new Date(c.startsAt).getTime()) / 3600000)}h`
        : t('marketplace.unlimited', '不限时')
    return (
      <Pressable
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
        onPress={() => router.push(`/(main)/contract-detail/${c.id}` as never)}
      >
        <View style={styles.cardHeader}>
          <View>
            <View style={styles.row}>
              <View style={[styles.badge, { backgroundColor: st.bg }]}>
                <Text style={[styles.badgeText, { color: st.text }]}>{c.status}</Text>
              </View>
              <Text style={[styles.contractNo, { color: colors.textMuted }]}>#{c.contractNo}</Text>
            </View>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              {c.listing?.title || t('marketplace.unknownListing', '未知挂单')}
            </Text>
            <View style={styles.row}>
              <Clock size={12} color={colors.textMuted} />
              <Text style={[styles.meta, { color: colors.textMuted }]}>{duration}</Text>
              <Text style={[styles.meta, { color: colors.textMuted }]}><PriceCompact amount={c.hourlyRate} size={12} /></Text>
            </View>
          </View>
          <View style={styles.cardRight}>
            <Text style={[styles.totalCost, { color: colors.primary }]}><PriceCompact amount={c.totalCost} size={14} /></Text>
            <Text style={[styles.meta, { color: colors.textMuted }]}>
              {new Date(c.createdAt).toLocaleDateString()}
            </Text>
          </View>
        </View>
      </Pressable>
    )
  }

  const listings = listingsData?.listings ?? []
  const onlineListings = listings.filter((l) => isAgentOnline(l.agent))
  const offlineListings = listings.filter((l) => !isAgentOnline(l.agent))

  const renderListing = ({ item: l }: { item: MyListing }) => {
    const online = isAgentOnline(l.agent)
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <View style={styles.row}>
              <View
                style={[styles.onlineDot, { backgroundColor: online ? '#22c55e' : '#d1d5db' }]}
              />
              <Text style={[styles.onlineLabel, { color: online ? '#16a34a' : colors.textMuted }]}>
                {online ? '在线' : '离线'}
              </Text>
              <Text style={[styles.meta, { color: colors.textMuted }]}>
                {l.deviceTier} · {l.osType}
              </Text>
            </View>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{l.title}</Text>
            <View style={styles.row}>
              <Text style={[styles.meta, { color: colors.textMuted }]}><PriceCompact amount={l.hourlyRate} size={12} /></Text>
              <Eye size={12} color={colors.textMuted} />
              <Text style={[styles.meta, { color: colors.textMuted }]}>{l.viewCount}</Text>
              <Users size={12} color={colors.textMuted} />
              <Text style={[styles.meta, { color: colors.textMuted }]}>{l.rentalCount}</Text>
            </View>
          </View>
          <View style={styles.actions}>
            {l.listingStatus === 'active' && (
              <Pressable
                onPress={() => toggleMutation.mutate({ id: l.id, listingStatus: 'paused' })}
                style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Pause size={16} color="#ca8a04" />
              </Pressable>
            )}
            {l.listingStatus === 'paused' && (
              <Pressable
                onPress={() => toggleMutation.mutate({ id: l.id, listingStatus: 'active' })}
                style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Play size={16} color="#16a34a" />
              </Pressable>
            )}
            <Pressable
              onPress={() => router.push(`/(main)/create-listing/${l.id}` as never)}
              style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Edit size={16} color={colors.textMuted} />
            </Pressable>
            {['draft', 'paused', 'closed'].includes(l.listingStatus) && (
              <Pressable
                onPress={() =>
                  Alert.alert(t('marketplace.confirmDelete', '确定删除此挂单？'), '', [
                    { text: t('common.cancel', '取消'), style: 'cancel' },
                    {
                      text: t('common.confirm', '确认'),
                      style: 'destructive',
                      onPress: () => deleteMutation.mutate(l.id),
                    },
                  ])
                }
                style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Trash2 size={16} color="#ef4444" />
              </Pressable>
            )}
          </View>
        </View>
      </View>
    )
  }

  const showContracts = mainTab === 'renting' || subTab === 'contracts'
  const showListings = mainTab === 'renting-out' && subTab === 'listings'

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.7 : 1 }]}
        >
          <ChevronLeft size={20} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>
          {t('marketplace.myRentals', '我的租赁')}
        </Text>
        <Pressable
          style={({ pressed }) => [
            styles.createBtn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 },
          ]}
          onPress={() => router.push('/(main)/create-listing' as never)}
        >
          <Plus size={16} color="#fff" />
          <Text style={styles.createBtnText}>{t('marketplace.createListing', '创建挂单')}</Text>
        </Pressable>
      </View>

      {/* Main Tabs */}
      <View style={styles.tabRow}>
        {(['renting', 'renting-out'] as const).map((tab) => (
          <Pressable
            key={tab}
            style={({ pressed }) => [
              styles.tab,
              {
                backgroundColor: mainTab === tab ? colors.surface : 'transparent',
                borderColor: mainTab === tab ? colors.primary : 'transparent',
                opacity: pressed ? 0.7 : 1,
              },
            ]}
            onPress={() => setMainTab(tab)}
          >
            <Text
              style={[
                styles.tabText,
                { color: mainTab === tab ? colors.primary : colors.textMuted },
              ]}
            >
              {tab === 'renting'
                ? t('marketplace.renting', '我的租入')
                : t('marketplace.rentingOut', '我的出租')}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Sub Tabs for renting-out */}
      {mainTab === 'renting-out' && (
        <View style={[styles.tabRow, { paddingTop: 0 }]}>
          {(['contracts', 'listings'] as const).map((st) => (
            <Pressable
              key={st}
              style={({ pressed }) => [
                styles.subTab,
                {
                  backgroundColor: subTab === st ? colors.primaryLight : 'transparent',
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
              onPress={() => setSubTab(st)}
            >
              <Text
                style={[
                  styles.subTabText,
                  { color: subTab === st ? colors.primary : colors.textMuted },
                ]}
              >
                {st === 'contracts'
                  ? t('marketplace.outContracts', '租赁合同')
                  : t('marketplace.myListings', '我的挂单')}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Content */}
      {showContracts &&
        (isLoadingContracts ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        ) : !contracts?.length ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 40 }}>📋</Text>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              {t('marketplace.noContracts', '暂无租赁合同')}
            </Text>
          </View>
        ) : (
          <FlatList
            data={contracts}
            keyExtractor={(c) => c.id}
            renderItem={renderContract}
            contentContainerStyle={styles.list}
          />
        ))}

      {showListings &&
        (loadListings ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        ) : !listings.length ? (
          <View style={styles.empty}>
            <Package size={40} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              {t('marketplace.noListings', '还没有挂单')}
            </Text>
          </View>
        ) : (
          <FlatList
            data={[...onlineListings, ...(showOffline ? offlineListings : [])]}
            keyExtractor={(l) => l.id}
            renderItem={renderListing}
            contentContainerStyle={styles.list}
            ListFooterComponent={
              offlineListings.length > 0 ? (
                <Pressable
                  style={({ pressed }) => [styles.offlineToggle, { opacity: pressed ? 0.7 : 1 }]}
                  onPress={() => setShowOffline(!showOffline)}
                >
                  <ChevronDown
                    size={14}
                    color={colors.textMuted}
                    style={showOffline ? { transform: [{ rotate: '180deg' }] } : undefined}
                  />
                  <Text style={[styles.meta, { color: colors.textMuted }]}>
                    {t('marketplace.offlineListings', '离线 Buddy')} ({offlineListings.length})
                  </Text>
                </Pressable>
              ) : null
            }
          />
        ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  backBtn: { padding: spacing.xs },
  title: { flex: 1, fontSize: fontSize.xl, fontWeight: '700', marginLeft: spacing.sm },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: fontSize.sm },
  tabRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 2,
  },
  tabText: { fontWeight: '700', fontSize: fontSize.sm },
  subTab: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.md },
  subTabText: { fontWeight: '700', fontSize: fontSize.sm },
  list: { padding: spacing.md, gap: spacing.sm },
  card: { borderRadius: radius.xl, borderWidth: 1, padding: spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  cardRight: { alignItems: 'flex-end' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full },
  badgeText: { fontSize: fontSize.xs, fontWeight: '700' },
  contractNo: { fontSize: fontSize.xs, fontFamily: 'monospace' },
  cardTitle: { fontSize: fontSize.md, fontWeight: '700', marginBottom: 4 },
  meta: { fontSize: fontSize.xs },
  totalCost: { fontSize: fontSize.lg, fontWeight: '700' },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },
  onlineLabel: { fontSize: fontSize.xs, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 4 },
  iconBtn: { padding: 8 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { marginTop: spacing.md, fontWeight: '700' },
  offlineToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: spacing.md },
})
