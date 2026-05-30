import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigation } from 'expo-router'
import { Bot, ChevronRight, Lock, Plus, Share2, Trash2, X } from 'lucide-react-native'
import { pinyin } from 'pinyin-pro'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Reanimated, { FadeIn, FadeInUp } from 'react-native-reanimated'
import { Avatar } from '../../src/components/common/avatar'
import { HeaderButton, HeaderButtonGroup } from '../../src/components/common/header-button'
import { OnlineRank } from '../../src/components/common/online-rank'
import {
  AppText,
  BackgroundSurface,
  Button,
  CardPressable,
  EmptyState,
  IconButton,
  MobileNavigationBar,
  Spinner,
  SwitchRow,
  TextField,
  ToolbarButton,
} from '../../src/components/ui'
import { fetchApi } from '../../src/lib/api'
import { showToast } from '../../src/lib/toast'
import {
  border,
  fontSize,
  iconSize,
  letterSpacing,
  lineHeight,
  palette,
  radius,
  size,
  spacing,
  useColors,
} from '../../src/theme'

interface Agent {
  id: string
  name: string | null
  status: string
  lastHeartbeat: string | null
  totalOnlineSeconds: number
  activeContractId?: string | null
  config?: {
    buddyMode?: 'private' | 'shareable'
    allowedServerIds?: string[]
    [key: string]: unknown
  }
  botUser?: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
  } | null
  createdAt: string
}

type BuddyMode = 'private' | 'shareable'

interface ServerEntry {
  server: {
    id: string
    name: string
  }
}

function getBuddyMode(agent: Agent | null): BuddyMode {
  return agent?.config?.buddyMode === 'shareable' ? 'shareable' : 'private'
}

function getAllowedServerIds(agent: Agent | null): string[] {
  return Array.isArray(agent?.config?.allowedServerIds) ? agent.config.allowedServerIds : []
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

function withRandomSuffix(username: string) {
  const base =
    username
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '')
      .trim() || 'buddy'
  const suffix = Math.random().toString(36).slice(2, 6)
  return `${base.slice(0, 27)}_${suffix}`
}

function deriveBuddyUsername(name: string) {
  const username = name
    .trim()
    .replace(/[\u3400-\u9fff]+/g, (chunk) =>
      pinyin(chunk, { toneType: 'none', separator: '-', v: true }),
    )
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
  return username || 'buddy'
}

function BuddyAccessEditor({
  mode,
  colors,
  t,
  onModeChange,
  showTitle = true,
}: {
  mode: BuddyMode
  colors: ReturnType<typeof useColors>
  t: ReturnType<typeof useTranslation>['t']
  onModeChange: (mode: BuddyMode) => void
  showTitle?: boolean
}) {
  return (
    <View style={styles.accessBlock}>
      {showTitle && (
        <Text style={[styles.formSectionTitle, { color: colors.textMuted }]}>
          {t('agentMgmt.accessSection')}
        </Text>
      )}
      <SwitchRow
        icon={mode === 'shareable' ? Share2 : Lock}
        title={mode === 'shareable' ? t('agentMgmt.modeShareable') : t('agentMgmt.modePrivate')}
        subtitle={
          mode === 'shareable' ? t('agentMgmt.modeShareableDesc') : t('agentMgmt.modePrivateDesc')
        }
        value={mode === 'shareable'}
        onValueChange={(value) => onModeChange(value ? 'shareable' : 'private')}
      />
    </View>
  )
}

export default function BuddyManagementScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const navigation = useNavigation()
  const queryClient = useQueryClient()

  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createUsername, setCreateUsername] = useState('')
  const [createUsernameTouched, setCreateUsernameTouched] = useState(false)
  const [createDescription, setCreateDescription] = useState('')
  const [createBuddyMode, setCreateBuddyMode] = useState<BuddyMode>('private')
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => fetchApi<Agent[]>('/api/agents'),
  })
  const { data: servers = [] } = useQuery({
    queryKey: ['servers', 'buddy-access'],
    queryFn: () => fetchApi<ServerEntry[]>('/api/servers'),
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

  const resetCreateForm = () => {
    setShowCreate(false)
    setCreateName('')
    setCreateUsername('')
    setCreateUsernameTouched(false)
    setCreateDescription('')
    setCreateBuddyMode('private')
  }

  const handleCreateNameChange = (value: string) => {
    setCreateName(value)
    if (!createUsernameTouched) {
      setCreateUsername(deriveBuddyUsername(value))
    }
  }

  const handleCreateUsernameChange = (value: string) => {
    setCreateUsernameTouched(true)
    setCreateUsername(
      value
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '')
        .slice(0, 32),
    )
  }

  const createMutation = useMutation({
    mutationFn: (data: {
      name: string
      username: string
      description?: string
      buddyMode: BuddyMode
      allowedServerIds: string[]
    }) => {
      return fetchApi<Agent>('/api/agents', {
        method: 'POST',
        body: JSON.stringify({
          name: data.name.trim(),
          username: data.username.trim(),
          description: data.description,
          kernelType: 'openclaw',
          config: {},
          buddyMode: data.buddyMode,
          allowedServerIds: data.allowedServerIds,
        }),
      })
    },
    onSuccess: (agent) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      resetCreateForm()
      showToast(t('agentMgmt.createSuccess'))
      setSelectedAgent(agent)
    },
    onError: (err: Error) => {
      if (err.message?.toLowerCase().includes('username already taken')) {
        setCreateUsername((prev) => withRandomSuffix(prev))
        setCreateUsernameTouched(true)
        showToast(t('agentMgmt.usernameTaken'))
      } else {
        showToast(err.message)
      }
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/agents/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      setSelectedAgent(null)
      showToast(t('buddyMgmt.deleted', 'Buddy 已删除'))
    },
    onError: (err: Error) => showToast(err.message),
  })

  const updateAccessMutation = useMutation({
    mutationFn: (data: { agentId: string; buddyMode: BuddyMode; allowedServerIds: string[] }) =>
      fetchApi<Agent>(`/api/agents/${data.agentId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          buddyMode: data.buddyMode,
          allowedServerIds: data.allowedServerIds,
        }),
      }),
    onSuccess: (agent) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      setSelectedAgent(agent)
      showToast(t('agentMgmt.editSuccess'))
    },
    onError: (err: Error) => showToast(err.message),
  })

  const updateSelectedAccess = (buddyMode: BuddyMode, allowedServerIds: string[]) => {
    if (!selectedAgent) return
    const privateAllowedServerIds =
      allowedServerIds.length > 0 ? allowedServerIds : servers.map((entry) => entry.server.id)
    updateAccessMutation.mutate({
      agentId: selectedAgent.id,
      buddyMode,
      allowedServerIds: buddyMode === 'private' ? privateAllowedServerIds : [],
    })
  }

  const renderAgent = ({ item: agent }: { item: Agent }) => {
    const online = isOnline(agent)
    const name = agent.botUser?.displayName ?? agent.name ?? agent.id.slice(0, 8)
    return (
      <CardPressable
        variant="glassCard"
        style={styles.agentCard}
        onPress={() => {
          setSelectedAgent(agent)
        }}
      >
        <Avatar
          uri={agent.botUser?.avatarUrl}
          name={name}
          size={44}
          userId={agent.botUser?.id}
          status={online ? 'online' : 'offline'}
          showStatus
        />
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <AppText variant="bodyStrong" style={styles.agentName}>
            {name}
          </AppText>
          <View style={styles.row}>
            {agent.totalOnlineSeconds > 0 && (
              <AppText variant="label" tone="secondary">
                {formatDuration(agent.totalOnlineSeconds)}
              </AppText>
            )}
            {agent.totalOnlineSeconds > 0 && <OnlineRank totalSeconds={agent.totalOnlineSeconds} />}
            <AppText variant="label" tone="secondary">
              {getBuddyMode(agent) === 'shareable'
                ? t('agentMgmt.modeShareable')
                : t('agentMgmt.modePrivate')}
            </AppText>
          </View>
        </View>
        <ChevronRight size={iconSize.xl} color={colors.textMuted} />
      </CardPressable>
    )
  }

  return (
    <BackgroundSurface style={styles.container}>
      {isLoading ? (
        <View style={styles.loading}>
          <Spinner />
        </View>
      ) : agents.length === 0 ? (
        <EmptyState
          icon={Bot}
          title={t('buddyMgmt.noBuddies', '还没有 Buddy')}
          description={t('buddyMgmt.createHint', '点击右上角 + 创建你的第一个 Buddy')}
        />
      ) : (
        <FlatList
          data={agents}
          keyExtractor={(a) => a.id}
          renderItem={renderAgent}
          contentContainerStyle={styles.list}
        />
      )}

      {/* Create Dialog - With KeyboardAvoidingView */}
      <Modal visible={showCreate} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoidingContainer}
        >
          <View style={[styles.modalOverlay, { backgroundColor: palette.black }]}>
            <Reanimated.View
              entering={FadeInUp.duration(300)}
              style={[
                styles.createModal,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              {/* Header */}
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  {t('agentMgmt.createTitle')}
                </Text>
                <IconButton
                  icon={X}
                  variant="ghost"
                  iconColor={colors.textMuted}
                  iconSize={24}
                  onPress={() => {
                    resetCreateForm()
                  }}
                  style={styles.closeBtn}
                />
              </View>

              <ScrollView
                style={styles.createForm}
                contentContainerStyle={styles.createFormContent}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={[styles.formIntro, { color: colors.textSecondary }]}>
                  {t('agentMgmt.createIntro')}
                </Text>

                <Text style={[styles.formSectionTitle, { color: colors.textMuted }]}>
                  {t('agentMgmt.identitySection')}
                </Text>

                <TextField
                  label={t('agentMgmt.nameLabel')}
                  placeholder={t('agentMgmt.namePlaceholder')}
                  value={createName}
                  onChangeText={handleCreateNameChange}
                  maxLength={64}
                  containerStyle={styles.formField}
                />

                <View style={styles.formField}>
                  <TextField
                    label={t('agentMgmt.usernameLabel')}
                    placeholder={t('agentMgmt.usernamePlaceholder')}
                    value={createUsername}
                    onChangeText={handleCreateUsernameChange}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={32}
                  />
                  <Text style={[styles.fieldHint, { color: colors.textMuted }]}>
                    {t('agentMgmt.usernameHint')}
                  </Text>
                </View>

                <Text style={[styles.formSectionTitle, { color: colors.textMuted }]}>
                  {t('agentMgmt.profileSection')}
                </Text>

                <View style={styles.formField}>
                  <TextField
                    label={t('agentMgmt.descLabel')}
                    placeholder={t('agentMgmt.descPlaceholder')}
                    value={createDescription}
                    onChangeText={setCreateDescription}
                    multiline
                    maxLength={500}
                    inputStyle={styles.textArea}
                  />
                  <Text style={[styles.fieldHint, { color: colors.textMuted }]}>
                    {t('agentMgmt.descriptionHint')}
                  </Text>
                </View>

                <BuddyAccessEditor
                  mode={createBuddyMode}
                  colors={colors}
                  t={t}
                  onModeChange={setCreateBuddyMode}
                />

                <View style={styles.formSpacer} />
              </ScrollView>

              {/* Footer Buttons */}
              <View style={[styles.modalFooter, { borderTopColor: colors.border }]}>
                <Button
                  variant="glass"
                  size="md"
                  containerStyle={styles.footerButtonCell}
                  style={styles.footerButton}
                  onPress={() => {
                    resetCreateForm()
                  }}
                >
                  {t('common.cancel', '取消')}
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  containerStyle={styles.footerButtonCell}
                  style={styles.footerButton}
                  onPress={() =>
                    createName.trim() &&
                    createUsername.trim() &&
                    createMutation.mutate({
                      name: createName,
                      username: createUsername,
                      description: createDescription.trim() || undefined,
                      buddyMode: createBuddyMode,
                      allowedServerIds:
                        createBuddyMode === 'private'
                          ? servers.map((entry) => entry.server.id)
                          : [],
                    })
                  }
                  disabled={
                    !createName.trim() || !createUsername.trim() || createMutation.isPending
                  }
                  loading={createMutation.isPending}
                >
                  {t('common.create', '创建')}
                </Button>
              </View>
            </Reanimated.View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Agent Detail Modal */}
      <Modal visible={!!selectedAgent} transparent animationType="slide">
        <View style={[styles.modalOverlay, { backgroundColor: palette.black }]}>
          <Reanimated.View
            entering={FadeIn.duration(300)}
            style={[
              styles.detailModal,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            {selectedAgent && (
              <>
                <MobileNavigationBar
                  title={
                    selectedAgent.botUser?.displayName ??
                    selectedAgent.name ??
                    selectedAgent.id.slice(0, 8)
                  }
                  right={
                    <ToolbarButton
                      icon={X}
                      variant="ghost"
                      iconColor={colors.textMuted}
                      onPress={() => {
                        setSelectedAgent(null)
                      }}
                    />
                  }
                />

                <ScrollView
                  style={styles.detailContent}
                  contentContainerStyle={styles.detailContentInner}
                  showsVerticalScrollIndicator={false}
                >
                  <View style={styles.detailHero}>
                    <Avatar
                      uri={selectedAgent.botUser?.avatarUrl}
                      name={
                        selectedAgent.botUser?.displayName ??
                        selectedAgent.name ??
                        selectedAgent.id.slice(0, 8)
                      }
                      size={iconSize.hero}
                      userId={selectedAgent.botUser?.id}
                      status={isOnline(selectedAgent) ? 'online' : 'offline'}
                      showStatus
                    />
                    <View style={styles.detailHeroText}>
                      <Text style={[styles.detailName, { color: colors.text }]}>
                        {selectedAgent.botUser?.displayName ??
                          selectedAgent.name ??
                          selectedAgent.id.slice(0, 8)}
                      </Text>
                      {selectedAgent.botUser?.username && (
                        <Text style={[styles.detailUsername, { color: colors.textMuted }]}>
                          @{selectedAgent.botUser.username}
                        </Text>
                      )}
                    </View>
                  </View>
                  <View
                    style={[
                      styles.section,
                      { backgroundColor: colors.background, borderColor: colors.border },
                    ]}
                  >
                    <View style={styles.sectionHeader}>
                      {getBuddyMode(selectedAgent) === 'shareable' ? (
                        <Share2 size={iconSize.md} color={colors.primary} />
                      ) : (
                        <Lock size={iconSize.md} color={colors.primary} />
                      )}
                      <Text style={[styles.sectionTitle, { color: colors.text }]}>
                        {t('agentMgmt.accessSection')}
                      </Text>
                    </View>
                    <BuddyAccessEditor
                      mode={getBuddyMode(selectedAgent)}
                      colors={colors}
                      t={t}
                      showTitle={false}
                      onModeChange={(mode) =>
                        updateSelectedAccess(mode, getAllowedServerIds(selectedAgent))
                      }
                    />
                  </View>

                  {/* Info Section */}
                  <View
                    style={[
                      styles.section,
                      { backgroundColor: colors.background, borderColor: colors.border },
                    ]}
                  >
                    <View style={styles.sectionHeader}>
                      <Bot size={iconSize.md} color={colors.primary} />
                      <Text style={[styles.sectionTitle, { color: colors.text }]}>
                        {t('buddyMgmt.infoTitle', 'Buddy 信息')}
                      </Text>
                    </View>

                    <View style={styles.infoGrid}>
                      <View style={styles.infoItem}>
                        <Text style={[styles.infoLabel, { color: colors.textMuted }]}>
                          {t('buddyMgmt.onlineTime', '在线时长')}
                        </Text>
                        <View style={styles.row}>
                          <Text style={[styles.infoValue, { color: colors.text }]}>
                            {formatDuration(selectedAgent.totalOnlineSeconds)}
                          </Text>
                          <OnlineRank totalSeconds={selectedAgent.totalOnlineSeconds} />
                        </View>
                      </View>

                      <View style={styles.infoItem}>
                        <Text style={[styles.infoLabel, { color: colors.textMuted }]}>
                          {t('buddyMgmt.createdAt', '创建时间')}
                        </Text>
                        <Text style={[styles.infoValue, { color: colors.text }]}>
                          {new Date(selectedAgent.createdAt).toLocaleDateString()}
                        </Text>
                      </View>

                      <View style={styles.infoItem}>
                        <Text style={[styles.infoLabel, { color: colors.textMuted }]}>ID</Text>
                        <Text
                          style={[styles.infoValue, { color: colors.text }]}
                          numberOfLines={1}
                          ellipsizeMode="middle"
                        >
                          {selectedAgent.id}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Delete Button */}
                  <Button
                    variant="danger"
                    size="md"
                    icon={Trash2}
                    style={styles.deleteBtn}
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
                    {t('buddyMgmt.deleteBuddy', '删除 Buddy')}
                  </Button>

                  {/* Bottom Spacer */}
                  <View style={{ height: size.iconButtonLg }} />
                </ScrollView>
              </>
            )}
          </Reanimated.View>
        </View>
      </Modal>
    </BackgroundSurface>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl * 2 },
  agentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.xl,
    borderWidth: border.hairline,
    padding: spacing.md,
  },
  agentName: { fontSize: fontSize.md, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },

  // Keyboard avoiding
  keyboardAvoidingContainer: { flex: 1 },

  // Modal overlay
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Create Modal
  createModal: {
    width: '90%',
    maxHeight: '80%',
    borderRadius: radius.xl,
    borderWidth: border.hairline,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  modalTitle: { fontSize: fontSize.xl, fontWeight: '700' },
  closeBtn: { width: size.iconButtonMd, height: size.iconButtonMd },
  createForm: { flex: 1 },
  createFormContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  formIntro: { fontSize: fontSize.sm, lineHeight: lineHeight.sm, marginBottom: spacing.lg },
  formSectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    letterSpacing: letterSpacing.none,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  formField: { marginBottom: spacing.md },
  fieldLabel: { fontSize: fontSize.sm, fontWeight: '600', marginBottom: spacing.xs },
  fieldHint: { fontSize: fontSize.xs, marginTop: spacing.xs },
  accessBlock: { gap: spacing.sm, marginBottom: spacing.md },
  formSpacer: {
    height: size.listItemLg,
  },
  textArea: {
    minHeight: size.navSide,
    textAlignVertical: 'top',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.lg,
    borderTopWidth: border.hairline,
  },
  footerButtonCell: {
    flex: 1,
  },
  footerButton: {
    width: '100%',
  },

  // Detail Modal
  detailModal: {
    width: '100%',
    height: '100%',
    borderRadius: radius.none,
  },
  detailHero: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  detailHeroText: { flex: 1, minWidth: 0 },
  detailName: { fontSize: fontSize.lg, fontWeight: '700' },
  detailUsername: { fontSize: fontSize.sm, marginTop: spacing.xxs },
  detailContent: { flex: 1 },
  detailContentInner: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl * 2 },

  // Sections
  section: {
    borderRadius: radius.xl,
    borderWidth: border.hairline,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  sectionTitle: { fontSize: fontSize.sm, fontWeight: '700' },

  // Info Grid
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  infoItem: {
    width: '47%',
    gap: spacing.xs,
  },
  infoLabel: { fontSize: fontSize.xs, fontWeight: '700' },
  infoValue: { fontSize: fontSize.sm, fontWeight: '600' },

  // Delete
  deleteBtn: {
    marginTop: spacing.sm,
    width: '100%',
  },
})
