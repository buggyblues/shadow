import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as Clipboard from 'expo-clipboard'
import { useNavigation } from 'expo-router'
import { Bot, Copy, Key, Plus, RefreshCw, Trash2 } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Avatar } from '../../src/components/common/avatar'
import { HeaderButton, HeaderButtonGroup } from '../../src/components/common/header-button'
import { OnlineRank } from '../../src/components/common/online-rank'
import { fetchApi } from '../../src/lib/api'
import { showToast } from '../../src/lib/toast'
import { fontSize, radius, spacing, useColors } from '../../src/theme'

interface Agent {
  id: string
  name: string | null
  token?: string
  status: string
  lastHeartbeat: string | null
  totalOnlineSeconds: number
  isListed?: boolean
  isRented?: boolean
  config?: { lastToken?: string; [key: string]: unknown }
  botUser?: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
  } | null
  createdAt: string
}

function isOnline(agent: Agent): boolean {
  if (agent.status !== 'running' || !agent.lastHeartbeat) return false
  return Date.now() - new Date(agent.lastHeartbeat).getTime() < 90_000
}

function formatDuration(seconds: number): string {
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`
}

export default function BuddyManagementScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const navigation = useNavigation()
  const queryClient = useQueryClient()

  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createUsername, setCreateUsername] = useState('')
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [generatedToken, setGeneratedToken] = useState<string | null>(null)

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => fetchApi<Agent[]>('/api/agents'),
  })

  useEffect(() => {
    navigation.setOptions({
      title: t('buddyMgmt.title', 'Buddy 管理'),
      headerRight: () => (
        <HeaderButtonGroup>
          <HeaderButton icon={Plus} onPress={() => setShowCreate(true)} />
        </HeaderButtonGroup>
      ),
    })
  }, [navigation, t])

  const createMutation = useMutation({
    mutationFn: (data: { name: string; username: string }) =>
      fetchApi<Agent>('/api/agents', {
        method: 'POST',
        body: JSON.stringify({
          name: data.name.trim(),
          username: data.username.trim(),
          kernelType: 'openclaw',
          config: {},
        }),
      }),
    onSuccess: async (agent) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      setShowCreate(false)
      setCreateName('')
      setCreateUsername('')
      showToast(t('buddyMgmt.created', 'Buddy 已创建'))
      setSelectedAgent(agent)
      // Auto-generate token after creation
      try {
        const tokenData = await fetchApi<{ token: string }>(`/api/agents/${agent.id}/token`, {
          method: 'POST',
        })
        setGeneratedToken(tokenData.token)
        queryClient.invalidateQueries({ queryKey: ['agents'] })
      } catch {}
    },
    onError: (err: Error) => showToast(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/agents/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      setSelectedAgent(null)
      setGeneratedToken(null)
      showToast(t('buddyMgmt.deleted', 'Buddy 已删除'))
    },
    onError: (err: Error) => showToast(err.message),
  })

  const regenTokenMutation = useMutation({
    mutationFn: (id: string) =>
      fetchApi<{ token: string }>(`/api/agents/${id}/token`, { method: 'POST' }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      setGeneratedToken(data.token)
      if (selectedAgent) {
        setSelectedAgent({ ...selectedAgent, token: data.token })
      }
      showToast(t('buddyMgmt.tokenRegenerated', 'Token 已重新生成'))
    },
    onError: (err: Error) => showToast(err.message),
  })

  const copyToken = async (token: string) => {
    await Clipboard.setStringAsync(token)
    showToast(t('common.copied', '已复制'))
  }

  const renderAgent = ({ item: agent }: { item: Agent }) => {
    const online = isOnline(agent)
    const name = agent.botUser?.displayName ?? agent.name ?? agent.id.slice(0, 8)
    return (
      <Pressable
        style={({ pressed }) => [
          styles.agentCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
        onPress={() => {
          setSelectedAgent(agent)
          setGeneratedToken(null)
        }}
      >
        <Avatar uri={agent.botUser?.avatarUrl} name={name} size={44} userId={agent.botUser?.id} />
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <View style={styles.row}>
            <Text style={[styles.agentName, { color: colors.text }]}>{name}</Text>
            <View style={[styles.dot, { backgroundColor: online ? '#22c55e' : '#d1d5db' }]} />
          </View>
          <View style={styles.row}>
            <Text style={[styles.meta, { color: colors.textMuted }]}>
              {online ? '在线' : '离线'}
            </Text>
            {agent.totalOnlineSeconds > 0 && (
              <Text style={[styles.meta, { color: colors.textMuted }]}>
                · 累计 {formatDuration(agent.totalOnlineSeconds)}
              </Text>
            )}
            {agent.totalOnlineSeconds > 0 && <OnlineRank totalSeconds={agent.totalOnlineSeconds} />}
            {agent.isListed && (
              <Text style={[styles.listedBadge, { color: colors.primary }]}> · 已上架</Text>
            )}
            {agent.isRented && <Text style={styles.rentedBadge}> · 租赁中</Text>}
          </View>
        </View>
      </Pressable>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : agents.length === 0 ? (
        <View style={styles.empty}>
          <Bot size={48} color={colors.textMuted} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            {t('buddyMgmt.noBuddies', '还没有 Buddy')}
          </Text>
          <Text style={[styles.emptyHint, { color: colors.textMuted }]}>
            {t('buddyMgmt.createHint', '点击右上角 + 创建你的第一个 Buddy')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={agents}
          keyExtractor={(a) => a.id}
          renderItem={renderAgent}
          contentContainerStyle={styles.list}
        />
      )}

      {/* Create Dialog */}
      <Modal visible={showCreate} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View
            style={[styles.modal, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {t('buddyMgmt.createBuddy', '创建 Buddy')}
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
              placeholder={t('buddyMgmt.namePlaceholder', 'Buddy 名称')}
              placeholderTextColor={colors.textMuted}
              value={createName}
              onChangeText={setCreateName}
            />
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  color: colors.text,
                  marginTop: spacing.sm,
                },
              ]}
              placeholder={t('buddyMgmt.usernamePlaceholder', '用户名（字母、数字、下划线）')}
              placeholderTextColor={colors.textMuted}
              value={createUsername}
              onChangeText={(text) => setCreateUsername(text.replace(/[^a-zA-Z0-9_-]/g, ''))}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={32}
            />
            <View style={[styles.row, { gap: spacing.sm, marginTop: spacing.md }]}>
              <Pressable
                style={({ pressed }) => [
                  styles.cancelBtn,
                  { backgroundColor: colors.background, opacity: pressed ? 0.7 : 1 },
                ]}
                onPress={() => {
                  setShowCreate(false)
                  setCreateName('')
                  setCreateUsername('')
                }}
              >
                <Text style={{ color: colors.textSecondary, fontWeight: '700' }}>
                  {t('common.cancel', '取消')}
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.confirmBtn,
                  { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 },
                ]}
                onPress={() =>
                  createName.trim() &&
                  createUsername.trim() &&
                  createMutation.mutate({ name: createName, username: createUsername })
                }
                disabled={!createName.trim() || !createUsername.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    {t('common.create', '创建')}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Agent Detail Modal */}
      <Modal visible={!!selectedAgent} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.detailModal,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            {selectedAgent && (
              <>
                <View style={styles.detailHeader}>
                  <Avatar
                    uri={selectedAgent.botUser?.avatarUrl}
                    name={
                      selectedAgent.botUser?.displayName ??
                      selectedAgent.name ??
                      selectedAgent.id.slice(0, 8)
                    }
                    size={56}
                    userId={selectedAgent.botUser?.id}
                  />
                  <View style={{ flex: 1, marginLeft: spacing.md }}>
                    <Text style={[styles.detailName, { color: colors.text }]}>
                      {selectedAgent.botUser?.displayName ??
                        selectedAgent.name ??
                        selectedAgent.id.slice(0, 8)}
                    </Text>
                    <View style={styles.row}>
                      <View
                        style={[
                          styles.dot,
                          {
                            backgroundColor: isOnline(selectedAgent) ? '#22c55e' : '#d1d5db',
                          },
                        ]}
                      />
                      <Text style={[styles.meta, { color: colors.textMuted }]}>
                        {isOnline(selectedAgent) ? '在线' : '离线'}
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    onPress={() => {
                      setSelectedAgent(null)
                      setGeneratedToken(null)
                    }}
                    style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                  >
                    <Text style={{ color: colors.textMuted, fontSize: 20 }}>✕</Text>
                  </Pressable>
                </View>

                {/* Token */}
                {(() => {
                  const displayToken =
                    generatedToken ??
                    selectedAgent.token ??
                    (selectedAgent.config?.lastToken as string | undefined) ??
                    null
                  if (displayToken) {
                    return (
                      <View style={[styles.tokenBox, { backgroundColor: colors.background }]}>
                        <Text style={[styles.tokenLabel, { color: colors.textMuted }]}>Token</Text>
                        <Text
                          style={[styles.tokenValue, { color: colors.text }]}
                          numberOfLines={1}
                          ellipsizeMode="middle"
                        >
                          {displayToken}
                        </Text>
                        <View style={[styles.row, { gap: spacing.sm, marginTop: spacing.sm }]}>
                          <Pressable
                            style={({ pressed }) => [
                              styles.tokenBtn,
                              { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                            ]}
                            onPress={() => copyToken(displayToken)}
                          >
                            <Copy size={14} color={colors.textSecondary} />
                            <Text style={[styles.tokenBtnText, { color: colors.textSecondary }]}>
                              {t('common.copy', '复制')}
                            </Text>
                          </Pressable>
                          <Pressable
                            style={({ pressed }) => [
                              styles.tokenBtn,
                              { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                            ]}
                            onPress={() => regenTokenMutation.mutate(selectedAgent.id)}
                            disabled={regenTokenMutation.isPending}
                          >
                            <RefreshCw size={14} color={colors.textSecondary} />
                            <Text style={[styles.tokenBtnText, { color: colors.textSecondary }]}>
                              {t('buddyMgmt.regenerate', '重新生成')}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    )
                  }
                  return (
                    <Pressable
                      style={({ pressed }) => [
                        styles.generateBtn,
                        { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 },
                      ]}
                      onPress={() => regenTokenMutation.mutate(selectedAgent.id)}
                      disabled={regenTokenMutation.isPending}
                    >
                      <Key size={14} color="#fff" />
                      <Text style={styles.generateBtnText}>
                        {regenTokenMutation.isPending
                          ? t('buddyMgmt.generating', '生成中...')
                          : t('buddyMgmt.generateToken', '生成 Token')}
                      </Text>
                    </Pressable>
                  )
                })()}

                {/* Info */}
                <View style={styles.infoSection}>
                  <View style={styles.infoRow}>
                    <Text style={[styles.infoLabel, { color: colors.textMuted }]}>ID</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]} selectable>
                      {selectedAgent.id}
                    </Text>
                  </View>
                  {selectedAgent.botUser?.username && (
                    <View style={styles.infoRow}>
                      <Text style={[styles.infoLabel, { color: colors.textMuted }]}>
                        {t('buddyMgmt.username', '用户名')}
                      </Text>
                      <Text style={[styles.infoValue, { color: colors.text }]}>
                        {selectedAgent.botUser.username}
                      </Text>
                    </View>
                  )}
                  <View style={styles.infoRow}>
                    <Text style={[styles.infoLabel, { color: colors.textMuted }]}>
                      {t('buddyMgmt.onlineTime', '在线时长')}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.infoValue, { color: colors.text }]}>
                        {formatDuration(selectedAgent.totalOnlineSeconds)}
                      </Text>
                      <OnlineRank totalSeconds={selectedAgent.totalOnlineSeconds} />
                    </View>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={[styles.infoLabel, { color: colors.textMuted }]}>
                      {t('buddyMgmt.createdAt', '创建时间')}
                    </Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>
                      {new Date(selectedAgent.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                </View>

                {/* Actions */}
                <View style={[styles.row, { gap: spacing.sm, marginTop: spacing.lg }]}>
                  <Pressable
                    style={({ pressed }) => [styles.deleteBtn, { opacity: pressed ? 0.7 : 1 }]}
                    onPress={() =>
                      Alert.alert(
                        t('buddyMgmt.confirmDelete', '确定删除此 Buddy？'),
                        t('buddyMgmt.deleteWarning', '删除后不可恢复'),
                        [
                          { text: t('common.cancel', '取消'), style: 'cancel' },
                          {
                            text: t('common.delete', '删除'),
                            style: 'destructive',
                            onPress: () => deleteMutation.mutate(selectedAgent.id),
                          },
                        ],
                      )
                    }
                  >
                    <Trash2 size={16} color="#ef4444" />
                    <Text style={styles.deleteBtnText}>
                      {t('buddyMgmt.deleteBuddy', '删除 Buddy')}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
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
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: { padding: spacing.md, gap: spacing.sm },
  agentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.md,
  },
  agentName: { fontSize: fontSize.md, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  meta: { fontSize: fontSize.xs },
  listedBadge: { fontSize: fontSize.xs, fontWeight: '700' },
  rentedBadge: { fontSize: fontSize.xs, fontWeight: '700', color: '#ea580c' },
  empty: { alignItems: 'center', paddingTop: 80, gap: spacing.sm },
  emptyText: { fontSize: fontSize.lg, fontWeight: '700' },
  emptyHint: { fontSize: fontSize.sm },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    width: '85%',
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.lg,
  },
  modalTitle: { fontSize: fontSize.lg, fontWeight: '700', marginBottom: spacing.md },
  input: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: fontSize.md,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  detailModal: {
    width: '90%',
    maxHeight: '80%',
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.lg,
  },
  detailHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  detailName: { fontSize: fontSize.xl, fontWeight: '700' },
  tokenBox: { borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  tokenLabel: { fontSize: fontSize.xs, fontWeight: '700', marginBottom: 4 },
  tokenValue: { fontSize: fontSize.sm, fontFamily: 'monospace' },
  tokenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  tokenBtnText: { fontSize: fontSize.xs, fontWeight: '700' },
  infoSection: { gap: spacing.sm },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: { fontSize: fontSize.sm, fontWeight: '700' },
  infoValue: { fontSize: fontSize.sm },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: '#fef2f2',
    borderRadius: radius.lg,
  },
  deleteBtnText: { color: '#ef4444', fontWeight: '700' },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
  },
  generateBtnText: { color: '#fff', fontWeight: '700', fontSize: fontSize.sm },
})
