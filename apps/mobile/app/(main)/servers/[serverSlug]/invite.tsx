import { useQuery } from '@tanstack/react-query'
import * as Clipboard from 'expo-clipboard'
import { useLocalSearchParams } from 'expo-router'
import { Check, Copy, Link2, Plus, Share2, Trash2, X } from 'lucide-react-native'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { LoadingScreen } from '../../../../src/components/common/loading-screen'
import { fetchApi } from '../../../../src/lib/api'
import { fontSize, radius, spacing, useColors } from '../../../../src/theme'

export default function ServerInviteScreen() {
  const { serverSlug } = useLocalSearchParams<{ serverSlug: string }>()
  const { t } = useTranslation()
  const colors = useColors()
  // biome-ignore lint/suspicious/noExplicitAny: invite code shape varies
  const [codes, setCodes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [note, setNote] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const { data: server } = useQuery({
    queryKey: ['server', serverSlug],
    queryFn: () => fetchApi<{ id: string; name: string }>(`/api/servers/${serverSlug}`),
    enabled: !!serverSlug,
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

  const handleShare = async (code: string) => {
    const serverName = server?.name ?? ''
    const message = t('members.inviteShareText', {
      serverName,
      code,
      defaultValue: `加入 ${serverName}！邀请码: ${code}`,
    })
    try {
      await Share.share(Platform.OS === 'ios' ? { message } : { message, title: serverName })
    } catch {}
  }

  const handleDeactivate = async (id: string) => {
    await fetchApi(`/api/invite-codes/${id}/deactivate`, { method: 'PATCH' }).catch(() => {})
    await fetchCodes()
  }

  const handleDelete = async (id: string) => {
    Alert.alert(
      t('common.confirm', '确认'),
      t('members.inviteDeleteConfirm', '确定删除此邀请码？'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete', '删除'),
          style: 'destructive',
          onPress: async () => {
            await fetchApi(`/api/invite-codes/${id}`, { method: 'DELETE' }).catch(() => {})
            await fetchCodes()
          },
        },
      ],
    )
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      {/* Create invite code */}
      <Pressable
        style={[styles.createBtn, { backgroundColor: colors.primary }]}
        onPress={() => setShowForm(!showForm)}
      >
        {showForm ? <X size={14} color="#fff" /> : <Plus size={14} color="#fff" />}
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSize.md }}>
          {showForm ? t('common.cancel') : t('members.inviteCreate', '生成邀请码')}
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
            placeholder={t('settings.inviteNotePlaceholder', '备注（可选）')}
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
              {creating ? t('common.loading') : t('settings.inviteGenerate', '生成')}
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
            {t('members.inviteEmpty', '暂无邀请码，点击上方按钮生成')}
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
                    <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: 1 }}>
                      {code.note}
                    </Text>
                  )}
                  {isUsed && code.usedByUser && (
                    <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: 1 }}>
                      {t('settings.inviteUsedBy', '已使用')}:{' '}
                      {code.usedByUser.displayName || code.usedByUser.username}
                    </Text>
                  )}
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {isActive && (
                    <>
                      <Pressable
                        onPress={() => handleCopy(code.code, code.id)}
                        style={styles.iconBtn}
                      >
                        {copiedId === code.id ? (
                          <Check size={16} color="#23a559" />
                        ) : (
                          <Copy size={16} color={colors.textMuted} />
                        )}
                      </Pressable>
                      <Pressable onPress={() => handleShare(code.code)} style={styles.iconBtn}>
                        <Share2 size={16} color={colors.textMuted} />
                      </Pressable>
                      <Pressable onPress={() => handleDeactivate(code.id)} style={styles.iconBtn}>
                        <X size={16} color={colors.textMuted} />
                      </Pressable>
                    </>
                  )}
                  {!isActive && (
                    <Pressable onPress={() => handleDelete(code.id)} style={styles.iconBtn}>
                      <Trash2 size={16} color={colors.error} />
                    </Pressable>
                  )}
                </View>
              </View>
            )
          })}
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
  },
  formCard: {
    padding: spacing.md,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.sm,
  },
  generateBtn: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['3xl'],
  },
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    gap: spacing.sm,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
