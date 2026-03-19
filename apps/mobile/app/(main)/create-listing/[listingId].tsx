import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft, Plus, Save } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import { fetchApi } from '../../../src/lib/api'
import { showToast } from '../../../src/lib/toast'
import { fontSize, radius, spacing, useColors } from '../../../src/theme'

interface ListingForm {
  agentId: string
  title: string
  description: string
  skills: string
  guidelines: string
  deviceTier: 'high_end' | 'mid_range' | 'low_end'
  osType: 'macos' | 'windows' | 'linux'
  deviceModel: string
  deviceCpu: string
  deviceRam: string
  deviceStorage: string
  deviceGpu: string
  softwareTools: string
  hourlyRate: number
  dailyRate: number
  monthlyRate: number
  premiumMarkup: number
  depositAmount: number
  tokenFeePassthrough: boolean
}

const INITIAL: ListingForm = {
  agentId: '',
  title: '',
  description: '',
  skills: '',
  guidelines: '',
  deviceTier: 'mid_range',
  osType: 'macos',
  deviceModel: '',
  deviceCpu: '',
  deviceRam: '',
  deviceStorage: '',
  deviceGpu: '',
  softwareTools: '',
  hourlyRate: 10,
  dailyRate: 200,
  monthlyRate: 5000,
  premiumMarkup: 0,
  depositAmount: 100,
  tokenFeePassthrough: true,
}

const DEVICE_TIERS = [
  { value: 'high_end', label: '🔥 高端' },
  { value: 'mid_range', label: '⚡ 中端' },
  { value: 'low_end', label: '💡 低端' },
] as const

const OS_TYPES = [
  { value: 'macos', label: 'macOS' },
  { value: 'windows', label: 'Windows' },
  { value: 'linux', label: 'Linux' },
] as const

export default function CreateListingScreen() {
  const { listingId } = useLocalSearchParams<{ listingId?: string }>()
  const isEdit = !!listingId
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [form, setForm] = useState<ListingForm>(INITIAL)

  const { data: existing } = useQuery({
    queryKey: ['marketplace', 'listing', listingId],
    queryFn: () => fetchApi<Record<string, unknown>>(`/api/marketplace/listings/${listingId}`),
    enabled: isEdit,
  })

  useEffect(() => {
    if (existing && isEdit) {
      const e = existing
      const di = (e.deviceInfo || {}) as Record<string, string>
      setForm({
        agentId: (e.agentId as string) || '',
        title: (e.title as string) || '',
        description: (e.description as string) || '',
        skills: ((e.skills as string[]) || []).join(', '),
        guidelines: (e.guidelines as string) || '',
        deviceTier: (e.deviceTier as ListingForm['deviceTier']) || 'mid_range',
        osType: (e.osType as ListingForm['osType']) || 'macos',
        deviceModel: di.model || '',
        deviceCpu: di.cpu || '',
        deviceRam: di.ram || '',
        deviceStorage: di.storage || '',
        deviceGpu: di.gpu || '',
        softwareTools: ((e.softwareTools as string[]) || []).join(', '),
        hourlyRate: (e.hourlyRate as number) || 10,
        dailyRate: (e.dailyRate as number) || 200,
        monthlyRate: (e.monthlyRate as number) || 5000,
        premiumMarkup: (e.premiumMarkup as number) || 0,
        depositAmount: (e.depositAmount as number) || 100,
        tokenFeePassthrough: (e.tokenFeePassthrough as boolean) ?? true,
      })
    }
  }, [existing, isEdit])

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => {
      if (isEdit) {
        return fetchApi(`/api/marketplace/listings/${listingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
      }
      return fetchApi('/api/marketplace/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace'] })
      showToast(
        isEdit
          ? t('marketplace.listingUpdated', '挂单已更新')
          : t('marketplace.listingCreated', '挂单已创建'),
      )
      router.back()
    },
    onError: (err: Error) => showToast(err.message),
  })

  const submit = (status: 'draft' | 'active') => {
    mutation.mutate({
      agentId: form.agentId || undefined,
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      skills: form.skills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      guidelines: form.guidelines.trim() || undefined,
      deviceTier: form.deviceTier,
      osType: form.osType,
      deviceInfo: {
        model: form.deviceModel.trim() || undefined,
        cpu: form.deviceCpu.trim() || undefined,
        ram: form.deviceRam.trim() || undefined,
        storage: form.deviceStorage.trim() || undefined,
        gpu: form.deviceGpu.trim() || undefined,
      },
      softwareTools: form.softwareTools
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      hourlyRate: form.hourlyRate,
      dailyRate: form.dailyRate || undefined,
      monthlyRate: form.monthlyRate || undefined,
      premiumMarkup: form.premiumMarkup,
      depositAmount: form.depositAmount,
      tokenFeePassthrough: form.tokenFeePassthrough,
      listingStatus: status,
    })
  }

  const update = <K extends keyof ListingForm>(key: K, val: ListingForm[K]) =>
    setForm((f) => ({ ...f, [key]: val }))

  const inputStyle = [
    styles.input,
    {
      backgroundColor: colors.background,
      borderColor: colors.border,
      color: colors.text,
    },
  ]

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.7 : 1 }]}
        >
          <ChevronLeft size={20} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>
          {isEdit
            ? t('marketplace.editListing', '编辑挂单')
            : t('marketplace.newListing', '创建挂单')}
        </Text>
      </View>

      {/* Basic Info */}
      <View
        style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {t('marketplace.basicInfo', '基本信息')}
        </Text>

        <Text style={[styles.label, { color: colors.textMuted }]}>
          {t('marketplace.listingTitle', '标题')} *
        </Text>
        <TextInput
          style={inputStyle}
          value={form.title}
          onChangeText={(v) => update('title', v)}
          placeholder={t('marketplace.titlePlaceholder', '例：高配 Mac Studio 全栈开发环境')}
          placeholderTextColor={colors.textMuted}
          maxLength={100}
        />

        <Text style={[styles.label, { color: colors.textMuted }]}>
          {t('marketplace.listingDesc', '描述')}
        </Text>
        <TextInput
          style={[...inputStyle, styles.textarea]}
          value={form.description}
          onChangeText={(v) => update('description', v)}
          placeholder={t('marketplace.descPlaceholder', '介绍你的 Claw 可以做什么...')}
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={2000}
        />

        <Text style={[styles.label, { color: colors.textMuted }]}>
          {t('marketplace.skillTags', '技能标签')}
        </Text>
        <TextInput
          style={inputStyle}
          value={form.skills}
          onChangeText={(v) => update('skills', v)}
          placeholder={t('marketplace.skillsPlaceholder', 'Web 开发, Python, DevOps (逗号分隔)')}
          placeholderTextColor={colors.textMuted}
        />

        <Text style={[styles.label, { color: colors.textMuted }]}>
          {t('marketplace.usageGuidelines', '使用准则')}
        </Text>
        <TextInput
          style={[...inputStyle, styles.textarea]}
          value={form.guidelines}
          onChangeText={(v) => update('guidelines', v)}
          placeholder={t('marketplace.guidelinesPlaceholder', '对使用方的要求和限制...')}
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={5000}
        />
      </View>

      {/* Device Info */}
      <View
        style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {t('marketplace.deviceInfo', '设备信息')}
        </Text>

        <Text style={[styles.label, { color: colors.textMuted }]}>
          {t('marketplace.deviceTier', '设备档次')}
        </Text>
        <View style={styles.chipRow}>
          {DEVICE_TIERS.map((d) => (
            <Pressable
              key={d.value}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor:
                    form.deviceTier === d.value ? colors.primaryLight : colors.background,
                  borderColor: form.deviceTier === d.value ? colors.primary : colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
              onPress={() => update('deviceTier', d.value)}
            >
              <Text
                style={{
                  color: form.deviceTier === d.value ? colors.primary : colors.textSecondary,
                  fontWeight: '700',
                  fontSize: fontSize.sm,
                }}
              >
                {d.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.label, { color: colors.textMuted }]}>
          {t('marketplace.osType', '操作系统')}
        </Text>
        <View style={styles.chipRow}>
          {OS_TYPES.map((o) => (
            <Pressable
              key={o.value}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor:
                    form.osType === o.value ? colors.primaryLight : colors.background,
                  borderColor: form.osType === o.value ? colors.primary : colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
              onPress={() => update('osType', o.value)}
            >
              <Text
                style={{
                  color: form.osType === o.value ? colors.primary : colors.textSecondary,
                  fontWeight: '700',
                  fontSize: fontSize.sm,
                }}
              >
                {o.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.label, { color: colors.textMuted }]}>型号</Text>
        <TextInput
          style={inputStyle}
          value={form.deviceModel}
          onChangeText={(v) => update('deviceModel', v)}
          placeholder="Mac Studio M2 Ultra"
          placeholderTextColor={colors.textMuted}
        />

        <View style={styles.fieldRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.textMuted }]}>CPU</Text>
            <TextInput
              style={inputStyle}
              value={form.deviceCpu}
              onChangeText={(v) => update('deviceCpu', v)}
              placeholder="M2 Ultra 24-core"
              placeholderTextColor={colors.textMuted}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.textMuted }]}>RAM</Text>
            <TextInput
              style={inputStyle}
              value={form.deviceRam}
              onChangeText={(v) => update('deviceRam', v)}
              placeholder="192GB"
              placeholderTextColor={colors.textMuted}
            />
          </View>
        </View>

        <View style={styles.fieldRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.textMuted }]}>
              {t('marketplace.storage', '存储')}
            </Text>
            <TextInput
              style={inputStyle}
              value={form.deviceStorage}
              onChangeText={(v) => update('deviceStorage', v)}
              placeholder="2TB SSD"
              placeholderTextColor={colors.textMuted}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.textMuted }]}>GPU</Text>
            <TextInput
              style={inputStyle}
              value={form.deviceGpu}
              onChangeText={(v) => update('deviceGpu', v)}
              placeholder="76-core GPU"
              placeholderTextColor={colors.textMuted}
            />
          </View>
        </View>

        <Text style={[styles.label, { color: colors.textMuted }]}>
          {t('marketplace.softwareTools', '已安装工具')}
        </Text>
        <TextInput
          style={inputStyle}
          value={form.softwareTools}
          onChangeText={(v) => update('softwareTools', v)}
          placeholder="VS Code, Docker, Node.js (逗号分隔)"
          placeholderTextColor={colors.textMuted}
        />
      </View>

      {/* Pricing */}
      <View
        style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {t('marketplace.pricingSetup', '定价设置')}
        </Text>

        <View style={styles.fieldRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.textMuted }]}>
              {t('marketplace.hourlyRate', '时租')} (虾币/小时) *
            </Text>
            <TextInput
              style={inputStyle}
              value={String(form.hourlyRate)}
              onChangeText={(v) => update('hourlyRate', Number(v) || 0)}
              keyboardType="numeric"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.textMuted }]}>
              {t('marketplace.dailyRate', '日租')} (虾币/天)
            </Text>
            <TextInput
              style={inputStyle}
              value={String(form.dailyRate)}
              onChangeText={(v) => update('dailyRate', Number(v) || 0)}
              keyboardType="numeric"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.textMuted }]}>
              {t('marketplace.monthlyRate', '月租')} (虾币/月)
            </Text>
            <TextInput
              style={inputStyle}
              value={String(form.monthlyRate)}
              onChangeText={(v) => update('monthlyRate', Number(v) || 0)}
              keyboardType="numeric"
            />
          </View>
        </View>

        <View style={styles.fieldRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.textMuted }]}>
              {t('marketplace.premiumMarkup', '溢价比例')} (%)
            </Text>
            <TextInput
              style={inputStyle}
              value={String(form.premiumMarkup)}
              onChangeText={(v) => update('premiumMarkup', Number(v) || 0)}
              keyboardType="numeric"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.textMuted }]}>
              {t('marketplace.deposit', '押金')} (虾币)
            </Text>
            <TextInput
              style={inputStyle}
              value={String(form.depositAmount)}
              onChangeText={(v) => update('depositAmount', Number(v) || 0)}
              keyboardType="numeric"
            />
          </View>
        </View>

        <View style={[styles.switchRow, { marginTop: spacing.md }]}>
          <Text style={[styles.switchLabel, { color: colors.text }]}>
            {t('marketplace.tokenPassthrough', 'Token 费用由使用方承担')}
          </Text>
          <Switch
            value={form.tokenFeePassthrough}
            onValueChange={(v) => update('tokenFeePassthrough', v)}
            trackColor={{ true: colors.primary, false: colors.border }}
          />
        </View>
      </View>

      {/* Submit */}
      <View style={styles.submitRow}>
        <Pressable
          style={({ pressed }) => [
            styles.draftBtn,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
          onPress={() => submit('draft')}
          disabled={mutation.isPending || !form.title.trim()}
        >
          <Save size={16} color={colors.textSecondary} />
          <Text style={[styles.draftBtnText, { color: colors.textSecondary }]}>
            {t('marketplace.saveDraft', '保存草稿')}
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.publishBtn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 },
          ]}
          onPress={() => submit('active')}
          disabled={mutation.isPending || !form.title.trim()}
        >
          {mutation.isPending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Plus size={16} color="#fff" />
              <Text style={styles.publishBtnText}>
                {isEdit
                  ? t('marketplace.updateListing', '更新挂单')
                  : t('marketplace.publishListing', '发布挂单')}
              </Text>
            </>
          )}
        </Pressable>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
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
  section: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.lg,
  },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '700', marginBottom: spacing.md },
  label: { fontSize: fontSize.sm, fontWeight: '700', marginBottom: 4, marginTop: spacing.sm },
  input: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: fontSize.md,
  },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  fieldRow: { flexDirection: 'row', gap: spacing.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { fontWeight: '700', fontSize: fontSize.sm, flex: 1 },
  submitRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.lg,
  },
  draftBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  draftBtnText: { fontWeight: '700' },
  publishBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: radius.lg,
  },
  publishBtnText: { color: '#fff', fontWeight: '700' },
})
