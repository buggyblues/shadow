import { useQuery } from '@tanstack/react-query'
import * as Clipboard from 'expo-clipboard'
import { Check, Copy, Link2, Plus, Trash2, UserPlus, X } from 'lucide-react-native'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Avatar } from '../../../src/components/common/avatar'
import { LoadingScreen } from '../../../src/components/common/loading-screen'
import { PriceCompact } from '../../../src/components/common/price-display'
import { SettingsHeader } from '../../../src/components/common/settings-header'
import {
  AppText,
  BackgroundSurface,
  Button,
  EmptyState,
  IconButton,
  PageScroll,
  Section,
  TextField,
} from '../../../src/components/ui'
import { fetchApi } from '../../../src/lib/api'
import { border, iconSize, letterSpacing, size, spacing, useColors } from '../../../src/theme'

export default function InviteSettingsScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const [codes, setCodes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [note, setNote] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [friendSent, setFriendSent] = useState<Set<string>>(new Set())

  const { data: referralSummary } = useQuery({
    queryKey: ['task-referral-summary'],
    queryFn: () =>
      fetchApi<{ campaignText: string; successfulInvites: number; totalInviteRewards: number }>(
        '/api/tasks/referral-summary',
      ),
  })

  const fetchCodes = useCallback(async () => {
    try {
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

  const handleAddFriend = async (username: string, userId: string) => {
    try {
      await fetchApi('/api/friends/request', {
        method: 'POST',
        body: JSON.stringify({ username }),
      })
      setFriendSent((prev) => new Set(prev).add(userId))
    } catch {}
  }

  return (
    <BackgroundSurface style={styles.container}>
      <SettingsHeader title={t('settings.tabInvite')} />
      <PageScroll compact>
        <Section padded cardStyle={styles.referralBanner}>
          <AppText variant="bodyStrong">
            {referralSummary?.campaignText ?? t('settings.inviteDefaultCampaign')}
          </AppText>
          <View style={styles.referralStatsRow}>
            <View style={styles.referralStat}>
              <AppText variant="headline" tone="primary">
                {referralSummary?.successfulInvites ?? 0}
              </AppText>
              <AppText variant="label" tone="secondary">
                {t('settings.inviteSuccessful')}
              </AppText>
            </View>
            <View style={styles.referralStat}>
              <AppText variant="headline" style={{ color: colors.primary }}>
                <PriceCompact amount={referralSummary?.totalInviteRewards ?? 0} size={17} />
              </AppText>
              <AppText variant="label" tone="secondary">
                {t('settings.inviteRewards')}
              </AppText>
            </View>
          </View>
        </Section>

        <Button
          variant={showForm ? 'glass' : 'primary'}
          size="lg"
          icon={showForm ? X : Plus}
          onPress={() => setShowForm(!showForm)}
        >
          {showForm ? t('common.cancel') : t('settings.inviteCreate')}
        </Button>

        {showForm ? (
          <Section padded cardStyle={styles.formCard}>
            <TextField
              value={note}
              onChangeText={setNote}
              placeholder={t('settings.inviteNotePlaceholder')}
            />
            <Button
              variant="primary"
              size="md"
              onPress={handleCreate}
              disabled={creating}
              loading={creating}
            >
              {t('settings.inviteGenerate')}
            </Button>
          </Section>
        ) : null}

        {loading ? (
          <LoadingScreen />
        ) : codes.length === 0 ? (
          <EmptyState icon={Link2} title={t('settings.inviteEmpty')} style={styles.emptyState} />
        ) : (
          <Section title={t('settings.tabInvite')}>
            {codes.map((code, index) => {
              const isUsed = !!code.usedBy
              const isActive = code.isActive && !isUsed
              return (
                <View
                  key={code.id}
                  style={[
                    styles.codeRow,
                    {
                      borderBottomColor: colors.border,
                      backgroundColor: isActive ? colors.surface : colors.background,
                    },
                    index === codes.length - 1 && { borderBottomWidth: border.none },
                  ]}
                >
                  <View style={styles.codeInfo}>
                    <AppText variant="bodyStrong" style={styles.codeText}>
                      {code.code}
                    </AppText>
                    {code.note ? (
                      <AppText variant="label" tone="secondary" numberOfLines={1}>
                        {code.note}
                      </AppText>
                    ) : null}
                    {isUsed && code.usedByUser ? (
                      <View style={styles.usedByRow}>
                        <Avatar
                          uri={code.usedByUser.avatarUrl}
                          name={code.usedByUser.displayName || code.usedByUser.username}
                          userId={code.usedByUser.id}
                          size={iconSize['2xl']}
                        />
                        <AppText variant="label" tone="secondary" style={styles.usedByText}>
                          {t('settings.inviteUsedBy')}:{' '}
                          {code.usedByUser.displayName || code.usedByUser.username}
                        </AppText>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.iconRow}>
                    {isUsed && code.usedByUser && !friendSent.has(code.usedByUser.id) ? (
                      <IconButton
                        icon={UserPlus}
                        variant="glass"
                        style={styles.iconBtn}
                        iconColor={colors.primary}
                        onPress={() =>
                          handleAddFriend(code.usedByUser.username, code.usedByUser.id)
                        }
                      />
                    ) : null}
                    {isUsed && code.usedByUser && friendSent.has(code.usedByUser.id) ? (
                      <IconButton
                        icon={Check}
                        variant="glass"
                        style={styles.iconBtn}
                        iconColor={colors.success}
                      />
                    ) : null}
                    {isActive ? (
                      <IconButton
                        icon={copiedId === code.id ? Check : Copy}
                        variant="glass"
                        style={styles.iconBtn}
                        iconColor={copiedId === code.id ? colors.success : colors.textMuted}
                        onPress={() => handleCopy(code.code, code.id)}
                      />
                    ) : null}
                    {isActive ? (
                      <IconButton
                        icon={X}
                        variant="glass"
                        style={styles.iconBtn}
                        iconColor={colors.textMuted}
                        onPress={() => handleDeactivate(code.id)}
                      />
                    ) : (
                      <IconButton
                        icon={Trash2}
                        variant="glass"
                        style={styles.iconBtn}
                        iconColor={colors.error}
                        onPress={() => handleDelete(code.id)}
                      />
                    )}
                  </View>
                </View>
              )
            })}
          </Section>
        )}
      </PageScroll>
    </BackgroundSurface>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  referralBanner: {
    gap: spacing.lg,
  },
  referralStatsRow: { flexDirection: 'row', gap: spacing.xl },
  referralStat: { alignItems: 'center', flex: 1 },
  formCard: { gap: spacing.md },
  emptyState: { paddingVertical: spacing.xl * 2 },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  codeInfo: { flex: 1, minWidth: 0 },
  codeText: {
    fontFamily: 'monospace',
    letterSpacing: letterSpacing.none,
  },
  usedByRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  usedByText: { flex: 1, minWidth: 0 },
  iconRow: { flexDirection: 'row', gap: spacing.xs },
  iconBtn: { width: size.iconBubble, height: size.iconBubble },
})
