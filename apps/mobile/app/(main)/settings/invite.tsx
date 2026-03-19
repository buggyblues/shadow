import { useQuery } from '@tanstack/react-query'
import * as Clipboard from 'expo-clipboard'
import { Check, Copy, Link2, Plus, Trash2, X } from 'lucide-react-native'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { LoadingScreen } from '../../../src/components/common/loading-screen'
import { SettingsHeader } from '../../../src/components/common/settings-header'
import { PriceCompact } from '../../../src/components/common/price-display'
import { fetchApi } from '../../../src/lib/api'
import { fontSize, radius, spacing, useColors } from '../../../src/theme'

export default function InviteSettingsScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  // biome-ignore lint/suspicious/noExplicitAny: invite code shape varies
  const [codes, setCodes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [note, setNote] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const { data: referralSummary } = useQuery({
    queryKey: ['task-referral-summary'],
    queryFn: () =>
      fetchApi<{ campaignText: string; successfulInvites: number; totalInviteRewards: number }>(
        '/api/tasks/referral-summary',
      ),
  })

  const fetchCodes = useCallback(async () => {
    try {
      // biome-ignore lint/suspicious/noExplicitAny: invite code shape varies
      const data = await fetchApi<any[]>('/api/invite-codes')
      setCodes(data)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchCodes()
  }, [fetchCodes])

  const handleCreate = async () => {
    setCreating(true)
    try {
      await fetchApi('/api/invite-codes', {
        method: 'POST',
        body: JSON.stringify({ count: 1, note: note || undefined }),
      })
      setNote('')
      setShowForm(false)
      await fetchCodes()
    } catch {}
    setCreating(false)
  }

  const handleCopy = async (code: string, id: string) => {
    await Clipboard.setStringAsync(code)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleDeactivate = async (id: string) => {
    await fetchApi(`/api/invite-codes/${id}/deactivate`, { method: 'PATCH' }).catch(() => {})
    await fetchCodes()
  }

  const handleDelete = async (id: string) => {
    await fetchApi(`/api/invite-codes/${id}`, { method: 'DELETE' }).catch(() => {})
    await fetchCodes()
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SettingsHeader title={t('settings.tabInvite')} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        {/* Referral stats */}
        <View style={[styles.referralBanner, { backgroundColor: `${colors.primary}08` }]}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSize.sm }}>
            {referralSummary?.campaignText ?? '邀请好友完成注册登录，你和好友均可获得 500 虾币'}
          </Text>
          <View style={styles.referralStatsRow}>
            <View style={styles.referralStat}>
              <Text style={{ color: colors.primary, fontSize: fontSize.lg, fontWeight: '800' }}>
                {referralSummary?.successfulInvites ?? 0}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 10 }}>已邀请</Text>
            </View>
            <View style={styles.referralStat}>
              <Text style={{ color: '#f0b132', fontSize: fontSize.lg, fontWeight: '800' }}>
                <PriceCompact amount={referralSummary?.totalInviteRewards ?? 0} size={17} />
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 10 }}>已获得</Text>
            </View>
          </View>
        </View>

        {/* Actions */}
        <Pressable
          style={[styles.createBtn, { backgroundColor: colors.primary }]}
          onPress={() => setShowForm(!showForm)}
        >
          {showForm ? <X size={14} color="#fff" /> : <Plus size={14} color="#fff" />}
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSize.sm }}>
            {showForm ? t('common.cancel') : t('settings.inviteCreate')}
          </Text>
        </Pressable>

        {showForm && (
          <View style={[styles.formCard, { backgroundColor: colors.surface }]}>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.inputBackground,
                  color: colors.text,
                  borderColor: colors.border,
                },
              ]}
              value={note}
              onChangeText={setNote}
              placeholder={t('settings.inviteNotePlaceholder')}
              placeholderTextColor={colors.textMuted}
            />
            <Pressable
              style={[
                styles.generateBtn,
                { backgroundColor: colors.primary, opacity: creating ? 0.6 : 1 },
              ]}
              onPress={handleCreate}
              disabled={creating}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSize.sm }}>
                {creating ? t('common.loading') : t('settings.inviteGenerate')}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Code list */}
        {loading ? (
          <LoadingScreen />
        ) : codes.length === 0 ? (
          <View style={styles.emptyState}>
            <Link2 size={40} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, fontSize: fontSize.sm, marginTop: spacing.sm }}>
              {t('settings.inviteEmpty')}
            </Text>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            {codes.map((code, idx) => {
              const isUsed = !!code.usedBy
              const isActive = code.isActive && !isUsed
              return (
                <View
                  key={code.id}
                  style={[
                    styles.codeRow,
                    { borderBottomColor: colors.border, opacity: isActive ? 1 : 0.5 },
                    idx === codes.length - 1 && { borderBottomWidth: 0 },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontFamily: 'monospace',
                        fontWeight: '700',
                        color: colors.text,
                        letterSpacing: 1.5,
                        fontSize: fontSize.sm,
                      }}
                    >
                      {code.code}
                    </Text>
                    {code.note && (
                      <Text
                        style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: 1 }}
                      >
                        {code.note}
                      </Text>
                    )}
                    {isUsed && code.usedByUser && (
                      <Text
                        style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: 1 }}
                      >
                        {t('settings.inviteUsedBy')}:{' '}
                        {code.usedByUser.displayName || code.usedByUser.username}
                      </Text>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    {isActive && (
                      <Pressable
                        onPress={() => handleCopy(code.code, code.id)}
                        style={styles.iconBtn}
                      >
                        {copiedId === code.id ? (
                          <Check size={14} color="#23a559" />
                        ) : (
                          <Copy size={14} color={colors.textMuted} />
                        )}
                      </Pressable>
                    )}
                    {isActive && (
                      <Pressable onPress={() => handleDeactivate(code.id)} style={styles.iconBtn}>
                        <X size={14} color={colors.textMuted} />
                      </Pressable>
                    )}
                    {!isActive && (
                      <Pressable onPress={() => handleDelete(code.id)} style={styles.iconBtn}>
                        <Trash2 size={14} color="#f23f43" />
                      </Pressable>
                    )}
                  </View>
                </View>
              )
            })}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  referralBanner: {
    padding: spacing.lg,
    borderRadius: radius.xl,
  },
  referralStatsRow: { flexDirection: 'row', gap: spacing.xl, marginTop: spacing.md },
  referralStat: { alignItems: 'center' },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: 48,
    borderRadius: radius.xl,
  },
  formCard: { padding: spacing.lg, borderRadius: radius.xl, gap: spacing.sm },
  input: {
    height: 44,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.md,
    borderWidth: 1,
  },
  generateBtn: {
    height: 40,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: { alignItems: 'center', paddingVertical: spacing.xl * 2 },
  card: { borderRadius: radius.xl, overflow: 'hidden' },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: { padding: 6 },
})
