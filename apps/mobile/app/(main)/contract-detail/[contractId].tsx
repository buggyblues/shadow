import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { AlertTriangle, ChevronLeft, Clock, DollarSign, Shield } from 'lucide-react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { PriceCompact } from '../../../src/components/common/price-display'
import { fetchApi } from '../../../src/lib/api'
import { showToast } from '../../../src/lib/toast'
import { useAuthStore } from '../../../src/stores/auth.store'
import { fontSize, radius, spacing, useColors } from '../../../src/theme'

interface ContractDetail {
  id: string
  contractNo: string
  ownerId: string
  tenantId: string
  status: 'pending' | 'active' | 'completed' | 'cancelled' | 'violated' | 'disputed'
  startsAt: string | null
  expiresAt: string | null
  hourlyRate: number
  depositAmount: number
  totalCost: number
  listing?: { title: string; deviceTier: string; osType: string } | null
  createdAt: string
}

interface UsageRecord {
  id: string
  sessionStart: string
  sessionEnd: string
  tokenCost: number
  electricityCost: number
  rentalCost: number
  platformFee: number
  totalCost: number
}

const STATUS_MAP: Record<string, { label: string; bg: string; text: string }> = {
  pending: { label: '待生效', bg: '#fef9c3', text: '#a16207' },
  active: { label: '租赁中', bg: '#dcfce7', text: '#15803d' },
  completed: { label: '已完成', bg: '#f3f4f6', text: '#4b5563' },
  cancelled: { label: '已取消', bg: '#f3f4f6', text: '#6b7280' },
  violated: { label: '已违约', bg: '#fee2e2', text: '#b91c1c' },
  disputed: { label: '争议中', bg: '#ffedd5', text: '#c2410c' },
}

export default function ContractDetailScreen() {
  const { contractId } = useLocalSearchParams<{ contractId: string }>()
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const queryClient = useQueryClient()
  const userId = useAuthStore((s) => s.user?.id)

  const [showTerminate, setShowTerminate] = useState(false)
  const [terminateReason, setTerminateReason] = useState('')

  const { data: contract, isLoading } = useQuery({
    queryKey: ['marketplace', 'contract', contractId],
    queryFn: () => fetchApi<ContractDetail>(`/api/marketplace/contracts/${contractId}`),
    enabled: !!contractId,
  })

  const { data: usageData } = useQuery({
    queryKey: ['marketplace', 'contract', contractId, 'usage'],
    queryFn: () =>
      fetchApi<{ records: UsageRecord[] }>(`/api/marketplace/contracts/${contractId}/usage`),
    enabled: !!contractId,
  })

  const terminateMutation = useMutation({
    mutationFn: () =>
      fetchApi(`/api/marketplace/contracts/${contractId}/terminate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: terminateReason }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace'] })
      showToast(t('marketplace.contractTerminated', '合同已终止'))
      setShowTerminate(false)
    },
  })

  if (isLoading || !contract) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    )
  }

  const st = STATUS_MAP[contract.status] ?? STATUS_MAP.pending!
  const isOwner = userId === contract.ownerId
  const isTenant = userId === contract.tenantId
  const canTerminate =
    (contract.status === 'active' || contract.status === 'pending') && (isOwner || isTenant)
  const usageRecords = usageData?.records ?? []

  const duration =
    contract.startsAt && contract.expiresAt
      ? `${Math.round((new Date(contract.expiresAt).getTime() - new Date(contract.startsAt).getTime()) / 3600000)}h`
      : t('marketplace.unlimited', '不限时')

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Back */}
      <Pressable
        style={({ pressed }) => [styles.backRow, { opacity: pressed ? 0.7 : 1 }]}
        onPress={() => router.back()}
      >
        <ChevronLeft size={20} color={colors.textMuted} />
        <Text style={[styles.backText, { color: colors.textMuted }]}>
          {t('marketplace.backToRentals', '返回我的租赁')}
        </Text>
      </Pressable>

      {/* Contract Header Card */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <View style={styles.row}>
              <View style={[styles.badge, { backgroundColor: st.bg }]}>
                <Text style={[styles.badgeText, { color: st.text }]}>{st.label}</Text>
              </View>
              <Text style={[styles.contractNo, { color: colors.textMuted }]}>
                #{contract.contractNo}
              </Text>
            </View>
            <Text style={[styles.titleText, { color: colors.text }]}>
              {contract.listing?.title || t('marketplace.unknownListing', '未知挂单')}
            </Text>
            <Text style={[styles.roleText, { color: colors.textMuted }]}>
              {isOwner
                ? t('marketplace.youAreOwner', '你是出租方')
                : t('marketplace.youAreTenant', '你是使用方')}
            </Text>
          </View>
          <View style={styles.costCol}>
            <Text style={[styles.totalCost, { color: colors.primary }]}>
              <PriceCompact amount={contract.totalCost} size={14} />
            </Text>
            <Text style={[styles.costLabel, { color: colors.textMuted }]}>
              {t('marketplace.totalSpent', '累计费用')}
            </Text>
          </View>
        </View>

        {/* Info Grid */}
        <View style={styles.grid}>
          <View style={[styles.gridItem, { backgroundColor: colors.background }]}>
            <View style={styles.row}>
              <Clock size={12} color={colors.textMuted} />
              <Text style={[styles.gridLabel, { color: colors.textMuted }]}>
                {t('marketplace.duration', '时长')}
              </Text>
            </View>
            <Text style={[styles.gridValue, { color: colors.text }]}>{duration}</Text>
          </View>
          <View style={[styles.gridItem, { backgroundColor: colors.background }]}>
            <View style={styles.row}>
              <DollarSign size={12} color={colors.textMuted} />
              <Text style={[styles.gridLabel, { color: colors.textMuted }]}>
                {t('marketplace.rate', '费率')}
              </Text>
            </View>
            <Text style={[styles.gridValue, { color: colors.text }]}>
              <PriceCompact amount={contract.hourlyRate} size={14} />
            </Text>
          </View>
          <View style={[styles.gridItem, { backgroundColor: colors.background }]}>
            <View style={styles.row}>
              <Shield size={12} color={colors.textMuted} />
              <Text style={[styles.gridLabel, { color: colors.textMuted }]}>
                {t('marketplace.deposit', '押金')}
              </Text>
            </View>
            <Text style={[styles.gridValue, { color: colors.text }]}>
              <PriceCompact amount={contract.depositAmount} size={14} />
            </Text>
          </View>
          <View style={[styles.gridItem, { backgroundColor: colors.background }]}>
            <Text style={[styles.gridLabel, { color: colors.textMuted }]}>
              {t('marketplace.startDate', '开始日期')}
            </Text>
            <Text style={[styles.gridValue, { color: colors.text }]}>
              {contract.startsAt ? new Date(contract.startsAt).toLocaleDateString() : '-'}
            </Text>
          </View>
        </View>
      </View>

      {/* Usage Records */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {t('marketplace.usageRecords', '使用记录')}
        </Text>
        {usageRecords.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            {t('marketplace.noUsage', '暂无使用记录')}
          </Text>
        ) : (
          usageRecords.map((r) => (
            <View key={r.id} style={[styles.usageRow, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.usageDate, { color: colors.text }]}>
                  {new Date(r.sessionStart).toLocaleString()}
                </Text>
                <Text style={[styles.usageSub, { color: colors.textMuted }]}>
                  → {new Date(r.sessionEnd).toLocaleString()}
                </Text>
              </View>
              <Text style={[styles.usageCost, { color: colors.primary }]}><PriceCompact amount={r.totalCost} size={12} /></Text>
            </View>
          ))
        )}
      </View>

      {/* Terminate */}
      {canTerminate && (
        <View
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <View style={styles.row}>
            <AlertTriangle size={16} color="#ef4444" />
            <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>
              {t('marketplace.actions', '操作')}
            </Text>
          </View>
          {!showTerminate ? (
            <Pressable
              style={({ pressed }) => [
                styles.dangerBtn,
                { marginTop: spacing.md, opacity: pressed ? 0.7 : 1 },
              ]}
              onPress={() => setShowTerminate(true)}
            >
              <Text style={styles.dangerBtnText}>
                {t('marketplace.terminateContract', '提前终止合同')}
              </Text>
            </Pressable>
          ) : (
            <View style={{ marginTop: spacing.md }}>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
                placeholder={t('marketplace.terminateReason', '请输入终止原因...')}
                placeholderTextColor={colors.textMuted}
                value={terminateReason}
                onChangeText={setTerminateReason}
                multiline
                numberOfLines={3}
              />
              <View style={[styles.row, { marginTop: spacing.sm, gap: spacing.sm }]}>
                <Pressable
                  style={({ pressed }) => [styles.confirmTermBtn, { opacity: pressed ? 0.7 : 1 }]}
                  onPress={() => terminateMutation.mutate()}
                  disabled={terminateMutation.isPending}
                >
                  <Text style={styles.confirmTermText}>
                    {terminateMutation.isPending
                      ? t('common.loading', '处理中...')
                      : t('marketplace.confirmTerminate', '确认终止')}
                  </Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.cancelBtn,
                    { backgroundColor: colors.background, opacity: pressed ? 0.7 : 1 },
                  ]}
                  onPress={() => setShowTerminate(false)}
                >
                  <Text style={{ color: colors.textSecondary, fontWeight: '700' }}>
                    {t('common.cancel', '取消')}
                  </Text>
                </Pressable>
              </View>
              <Text style={styles.warningText}>
                {t(
                  'marketplace.terminateWarning',
                  '⚠️ 终止后，已产生的费用不予退还。押金将在终止后退回。',
                )}
              </Text>
            </View>
          )}
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  backText: { fontWeight: '700', fontSize: fontSize.sm },
  card: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.lg,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.full },
  badgeText: { fontSize: fontSize.xs, fontWeight: '700' },
  contractNo: { fontSize: fontSize.xs, fontFamily: 'monospace' },
  titleText: { fontSize: fontSize.xl, fontWeight: '700', marginTop: 4, marginBottom: 4 },
  roleText: { fontSize: fontSize.sm },
  costCol: { alignItems: 'flex-end' },
  totalCost: { fontSize: fontSize.xl, fontWeight: '700' },
  costLabel: { fontSize: fontSize.xs, marginTop: 2 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  gridItem: {
    width: '47%',
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  gridLabel: { fontSize: fontSize.xs, fontWeight: '700' },
  gridValue: { fontSize: fontSize.md, fontWeight: '700', marginTop: 2 },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '700', marginBottom: spacing.md },
  emptyText: { textAlign: 'center', paddingVertical: spacing.xl },
  usageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  usageDate: { fontSize: fontSize.sm, fontWeight: '500' },
  usageSub: { fontSize: fontSize.xs },
  usageCost: { fontWeight: '700', fontSize: fontSize.md },
  dangerBtn: {
    backgroundColor: '#fef2f2',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    alignSelf: 'flex-start',
  },
  dangerBtnText: { color: '#b91c1c', fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  confirmTermBtn: {
    backgroundColor: '#ef4444',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
  confirmTermText: { color: '#fff', fontWeight: '700' },
  cancelBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
  warningText: { color: '#f87171', fontSize: fontSize.xs, marginTop: spacing.sm },
})
