import {
  type ConnectorPlan,
  createConnectorPlans,
  type ShadowConnectorTarget,
} from '@shadowob/connector'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as Clipboard from 'expo-clipboard'
import { useNavigation } from 'expo-router'
import {
  BookOpen,
  Bot,
  Check,
  ChevronRight,
  Copy,
  Key,
  Lock,
  MessageSquare,
  PlugZap,
  Plus,
  RefreshCw,
  Share2,
  Terminal,
  Trash2,
  X,
} from 'lucide-react-native'
import { pinyin } from 'pinyin-pro'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
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
  Badge,
  Button,
  CardPressable,
  ChipButton,
  EmptyState,
  IconButton,
  Spinner,
  SwitchRow,
  TextField,
} from '../../src/components/ui'
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
  activeContractId?: string | null
  config?: {
    lastToken?: string
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

const connectorTargets: ShadowConnectorTarget[] = ['openclaw', 'hermes', 'cc-connect']

function getConnectorLabel(
  target: ShadowConnectorTarget,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  if (target === 'hermes') return t('agentMgmt.connectorHermes')
  if (target === 'cc-connect') return t('agentMgmt.connectorCcConnect')
  return t('agentMgmt.connectorOpenClaw')
}

function getConnectorIcon(target: ShadowConnectorTarget) {
  if (target === 'hermes') return Bot
  if (target === 'cc-connect') return PlugZap
  return Terminal
}

function BuddyAccessEditor({
  mode,
  allowedServerIds,
  servers,
  colors,
  t,
  onModeChange,
  onAllowedServerIdsChange,
  compactModeControl = false,
}: {
  mode: BuddyMode
  allowedServerIds: string[]
  servers: ServerEntry[]
  colors: ReturnType<typeof useColors>
  t: ReturnType<typeof useTranslation>['t']
  onModeChange: (mode: BuddyMode) => void
  onAllowedServerIdsChange: (ids: string[]) => void
  compactModeControl?: boolean
}) {
  const toggleServer = (serverId: string) => {
    onAllowedServerIdsChange(
      allowedServerIds.includes(serverId)
        ? allowedServerIds.filter((id) => id !== serverId)
        : [...allowedServerIds, serverId],
    )
  }

  return (
    <View style={styles.accessBlock}>
      <Text style={[styles.formSectionTitle, { color: colors.textMuted }]}>
        {t('agentMgmt.accessSection')}
      </Text>
      {compactModeControl ? (
        <SwitchRow
          icon={mode === 'shareable' ? Share2 : Lock}
          title={mode === 'shareable' ? t('agentMgmt.modeShareable') : t('agentMgmt.modePrivate')}
          subtitle={
            mode === 'shareable' ? t('agentMgmt.modeShareableDesc') : t('agentMgmt.modePrivateDesc')
          }
          value={mode === 'shareable'}
          onValueChange={(value) => onModeChange(value ? 'shareable' : 'private')}
        />
      ) : (
        <View style={styles.modeRow}>
          <CardPressable
            variant="glassCard"
            active={mode === 'private'}
            padded={false}
            style={[
              styles.modeOption,
              {
                backgroundColor: mode === 'private' ? `${colors.primary}1A` : colors.glassSoft,
              },
            ]}
            onPress={() => onModeChange('private')}
          >
            <Lock size={16} color={mode === 'private' ? colors.primary : colors.textMuted} />
            <Text style={[styles.modeTitle, { color: colors.text }]}>
              {t('agentMgmt.modePrivate')}
            </Text>
            <Text style={[styles.modeDesc, { color: colors.textMuted }]}>
              {t('agentMgmt.modePrivateDesc')}
            </Text>
          </CardPressable>
          <CardPressable
            variant="glassCard"
            active={mode === 'shareable'}
            padded={false}
            style={[
              styles.modeOption,
              {
                backgroundColor: mode === 'shareable' ? `${colors.primary}1A` : colors.glassSoft,
              },
            ]}
            onPress={() => onModeChange('shareable')}
          >
            <Share2 size={16} color={mode === 'shareable' ? colors.primary : colors.textMuted} />
            <Text style={[styles.modeTitle, { color: colors.text }]}>
              {t('agentMgmt.modeShareable')}
            </Text>
            <Text style={[styles.modeDesc, { color: colors.textMuted }]}>
              {t('agentMgmt.modeShareableDesc')}
            </Text>
          </CardPressable>
        </View>
      )}
      <View style={[styles.policyNote, { backgroundColor: colors.background }]}>
        <Text style={[styles.policyTitle, { color: colors.text }]}>
          {t('agentMgmt.defaultReplyPolicy')}
        </Text>
        <Text style={[styles.policyDesc, { color: colors.textMuted }]}>
          {t('agentMgmt.defaultReplyPolicyDesc')}
        </Text>
      </View>
      {mode === 'private' && (
        <View style={styles.serverList}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
            {t('agentMgmt.allowedServersLabel')}
          </Text>
          {servers.length === 0 ? (
            <Text style={[styles.fieldHint, { color: colors.textMuted }]}>
              {t('agentMgmt.allowedServersEmpty')}
            </Text>
          ) : (
            servers.map((entry) => (
              <CardPressable
                key={entry.server.id}
                variant="glass"
                active={allowedServerIds.includes(entry.server.id)}
                padded={false}
                style={styles.serverOption}
                onPress={() => toggleServer(entry.server.id)}
              >
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor: allowedServerIds.includes(entry.server.id)
                        ? colors.primary
                        : colors.border,
                      backgroundColor: allowedServerIds.includes(entry.server.id)
                        ? colors.primary
                        : 'transparent',
                    },
                  ]}
                />
                <Text style={[styles.serverName, { color: colors.text }]} numberOfLines={1}>
                  {entry.server.name}
                </Text>
              </CardPressable>
            ))
          )}
        </View>
      )}
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
  const [createAllowedServerIds, setCreateAllowedServerIds] = useState<string[]>([])
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [generatedToken, setGeneratedToken] = useState<string | null>(null)
  const [configTab, setConfigTab] = useState<'manual' | 'chat'>('manual')
  const [connectorTarget, setConnectorTarget] = useState<ShadowConnectorTarget>('openclaw')

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
    setCreateAllowedServerIds([])
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
    }) =>
      fetchApi<Agent>('/api/agents', {
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
      }),
    onSuccess: async (agent) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      resetCreateForm()
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

  const copyToClipboard = async (text: string, message?: string) => {
    await Clipboard.setStringAsync(text)
    showToast(message || t('common.copied', '已复制'))
  }

  const updateSelectedAccess = (buddyMode: BuddyMode, allowedServerIds: string[]) => {
    if (!selectedAgent) return
    updateAccessMutation.mutate({
      agentId: selectedAgent.id,
      buddyMode,
      allowedServerIds: buddyMode === 'private' ? allowedServerIds : [],
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
          setGeneratedToken(null)
          setConfigTab('manual')
          setConnectorTarget('openclaw')
        }}
      >
        <Avatar uri={agent.botUser?.avatarUrl} name={name} size={44} userId={agent.botUser?.id} />
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <View style={styles.row}>
            <AppText variant="bodyStrong" style={styles.agentName}>
              {name}
            </AppText>
            <Badge variant={online ? 'success' : 'neutral'} size="xs">
              {online ? t('member.online') : t('member.offline')}
            </Badge>
          </View>
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
        <ChevronRight size={20} color={colors.textMuted} />
      </CardPressable>
    )
  }

  // Get display token
  const getDisplayToken = useCallback(() => {
    if (!selectedAgent) return null
    return (
      generatedToken ??
      selectedAgent.token ??
      (selectedAgent.config?.lastToken as string | undefined) ??
      null
    )
  }, [generatedToken, selectedAgent])

  // Get server URL
  const serverUrl = 'https://shadowob.com'
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
          <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
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
                  allowedServerIds={createAllowedServerIds}
                  servers={servers}
                  colors={colors}
                  t={t}
                  onModeChange={setCreateBuddyMode}
                  onAllowedServerIdsChange={setCreateAllowedServerIds}
                  compactModeControl
                />

                <View style={{ height: 72 }} />
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
                      allowedServerIds: createBuddyMode === 'private' ? createAllowedServerIds : [],
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
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
          <Reanimated.View
            entering={FadeIn.duration(300)}
            style={[
              styles.detailModal,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            {selectedAgent && (
              <>
                {/* Header */}
                <View style={styles.detailHeader}>
                  <View style={styles.detailHeaderLeft}>
                    <Avatar
                      uri={selectedAgent.botUser?.avatarUrl}
                      name={
                        selectedAgent.botUser?.displayName ??
                        selectedAgent.name ??
                        selectedAgent.id.slice(0, 8)
                      }
                      size={48}
                      userId={selectedAgent.botUser?.id}
                    />
                    <View style={{ marginLeft: spacing.md }}>
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
                  <IconButton
                    icon={X}
                    variant="ghost"
                    iconColor={colors.textMuted}
                    iconSize={24}
                    onPress={() => {
                      setSelectedAgent(null)
                      setGeneratedToken(null)
                    }}
                    style={styles.closeBtn}
                  />
                </View>

                <ScrollView
                  style={styles.detailContent}
                  contentContainerStyle={styles.detailContentInner}
                  showsVerticalScrollIndicator={false}
                >
                  <View
                    style={[
                      styles.section,
                      { backgroundColor: colors.background, borderColor: colors.border },
                    ]}
                  >
                    <View style={styles.sectionHeader}>
                      {getBuddyMode(selectedAgent) === 'shareable' ? (
                        <Share2 size={16} color={colors.primary} />
                      ) : (
                        <Lock size={16} color={colors.primary} />
                      )}
                      <Text style={[styles.sectionTitle, { color: colors.text }]}>
                        {t('agentMgmt.accessSection')}
                      </Text>
                    </View>
                    <BuddyAccessEditor
                      mode={getBuddyMode(selectedAgent)}
                      allowedServerIds={getAllowedServerIds(selectedAgent)}
                      servers={servers}
                      colors={colors}
                      t={t}
                      onModeChange={(mode) =>
                        updateSelectedAccess(mode, getAllowedServerIds(selectedAgent))
                      }
                      onAllowedServerIdsChange={(ids) =>
                        updateSelectedAccess(getBuddyMode(selectedAgent), ids)
                      }
                    />
                  </View>

                  {/* Token Section */}
                  <View
                    style={[
                      styles.section,
                      { backgroundColor: colors.background, borderColor: colors.border },
                    ]}
                  >
                    <View style={styles.sectionHeader}>
                      <Key size={16} color={colors.primary} />
                      <Text style={[styles.sectionTitle, { color: colors.text }]}>
                        {t('buddyMgmt.tokenTitle', '连接配置')}
                      </Text>
                    </View>

                    {(() => {
                      const displayToken = getDisplayToken()
                      if (displayToken) {
                        const plans = createConnectorPlans({
                          serverUrl,
                          token: displayToken,
                          projectName:
                            selectedAgent.botUser?.username ??
                            selectedAgent.name ??
                            selectedAgent.id,
                          workDir: '.',
                        })
                        const activePlan =
                          plans.find((plan) => plan.target === connectorTarget) ??
                          (plans[0] as ConnectorPlan)
                        const openDocs = () => {
                          const docsUrl = activePlan.docsUrl.startsWith('/')
                            ? `${serverUrl}${activePlan.docsUrl}`
                            : activePlan.docsUrl
                          Linking.openURL(docsUrl).catch(() => undefined)
                        }
                        return (
                          <View style={styles.tokenContainer}>
                            {/* Token Display */}
                            <View
                              style={[
                                styles.tokenBox,
                                { backgroundColor: colors.surface, borderColor: colors.border },
                              ]}
                            >
                              <Text
                                style={[styles.tokenValue, { color: colors.text }]}
                                numberOfLines={1}
                                ellipsizeMode="middle"
                              >
                                {displayToken}
                              </Text>
                            </View>

                            {/* Token Actions */}
                            <View style={styles.tokenActions}>
                              <Button
                                variant="glass"
                                size="sm"
                                icon={Copy}
                                containerStyle={styles.tokenActionCell}
                                style={styles.tokenActionBtn}
                                onPress={() => copyToClipboard(displayToken, t('common.copied'))}
                              >
                                {t('common.copy')}
                              </Button>
                              <Button
                                variant="glass"
                                size="sm"
                                icon={RefreshCw}
                                containerStyle={styles.tokenActionCell}
                                style={styles.tokenActionBtn}
                                onPress={() => regenTokenMutation.mutate(selectedAgent.id)}
                                disabled={regenTokenMutation.isPending}
                                loading={regenTokenMutation.isPending}
                              >
                                {t('buddyMgmt.regenerate', '重新生成')}
                              </Button>
                            </View>

                            <Text style={[styles.connectorGuideDesc, { color: colors.textMuted }]}>
                              {t('agentMgmt.connectorGuideDesc')}
                            </Text>

                            <View style={styles.connectorTargets}>
                              {connectorTargets.map((target) => {
                                const Icon = getConnectorIcon(target)
                                const active = target === connectorTarget
                                return (
                                  <ChipButton
                                    key={target}
                                    label={getConnectorLabel(target, t)}
                                    icon={Icon}
                                    active={active}
                                    containerStyle={styles.connectorTargetCell}
                                    style={styles.connectorTarget}
                                    onPress={() => setConnectorTarget(target)}
                                  />
                                )
                              })}
                            </View>

                            {/* Config Tabs */}
                            <View style={styles.configTabs}>
                              <ChipButton
                                label={t('agentMgmt.setupManual')}
                                icon={Terminal}
                                active={configTab === 'manual'}
                                containerStyle={styles.configTabCell}
                                style={styles.configTab}
                                onPress={() => setConfigTab('manual')}
                              />
                              <ChipButton
                                label={t('agentMgmt.setupChat')}
                                icon={MessageSquare}
                                active={configTab === 'chat'}
                                containerStyle={styles.configTabCell}
                                style={styles.configTab}
                                onPress={() => setConfigTab('chat')}
                              />
                            </View>

                            {/* Config Content */}
                            {configTab === 'manual' ? (
                              <View style={styles.configContent}>
                                <View style={styles.configBlock}>
                                  <View style={styles.configBlockHeader}>
                                    <Text
                                      style={[styles.configBlockLabel, { color: colors.textMuted }]}
                                    >
                                      {t('agentMgmt.connectorCliTitle')}
                                    </Text>
                                    <Button
                                      variant="ghost"
                                      size="xs"
                                      icon={Copy}
                                      iconColor={colors.primary}
                                      style={styles.copySmallBtn}
                                      onPress={() => copyToClipboard(activePlan.connectCommand)}
                                    >
                                      {t('common.copy')}
                                    </Button>
                                  </View>
                                  <View
                                    style={[
                                      styles.codeBlock,
                                      {
                                        backgroundColor: colors.surface,
                                        borderColor: colors.border,
                                      },
                                    ]}
                                  >
                                    <Text
                                      style={[styles.codeText, { color: colors.textSecondary }]}
                                      numberOfLines={5}
                                    >
                                      {activePlan.connectCommand}
                                    </Text>
                                  </View>
                                </View>

                                {activePlan.commands.map((command, index) => (
                                  <View
                                    key={`${activePlan.target}-${command.label}`}
                                    style={styles.configBlock}
                                  >
                                    <View style={styles.configBlockHeader}>
                                      <Text
                                        style={[
                                          styles.configBlockLabel,
                                          { color: colors.textMuted },
                                        ]}
                                      >
                                        {index + 1}. {t('agentMgmt.connectorStepCommand')}
                                      </Text>
                                      <Button
                                        variant="ghost"
                                        size="xs"
                                        icon={Copy}
                                        iconColor={colors.primary}
                                        style={styles.copySmallBtn}
                                        onPress={() => copyToClipboard(command.command)}
                                      >
                                        {t('common.copy')}
                                      </Button>
                                    </View>
                                    <View
                                      style={[
                                        styles.codeBlock,
                                        {
                                          backgroundColor: colors.surface,
                                          borderColor: colors.border,
                                        },
                                      ]}
                                    >
                                      <Text
                                        style={[styles.codeText, { color: colors.textSecondary }]}
                                        numberOfLines={3}
                                      >
                                        {command.command}
                                      </Text>
                                    </View>
                                  </View>
                                ))}

                                {activePlan.configBlocks.map((block) => (
                                  <View
                                    key={`${activePlan.target}-${block.label}`}
                                    style={styles.configBlock}
                                  >
                                    <View style={styles.configBlockHeader}>
                                      <Text
                                        style={[
                                          styles.configBlockLabel,
                                          { color: colors.textMuted },
                                        ]}
                                      >
                                        {block.label}
                                      </Text>
                                      <Button
                                        variant="ghost"
                                        size="xs"
                                        icon={Copy}
                                        iconColor={colors.primary}
                                        style={styles.copySmallBtn}
                                        onPress={() => copyToClipboard(block.content)}
                                      >
                                        {t('common.copy')}
                                      </Button>
                                    </View>
                                    <View
                                      style={[
                                        styles.codeBlock,
                                        {
                                          backgroundColor: colors.surface,
                                          borderColor: colors.border,
                                        },
                                      ]}
                                    >
                                      <Text
                                        style={[styles.codeText, { color: colors.textSecondary }]}
                                        numberOfLines={8}
                                      >
                                        {block.content}
                                      </Text>
                                    </View>
                                  </View>
                                ))}
                              </View>
                            ) : (
                              <View style={styles.configContent}>
                                <View style={styles.configBlock}>
                                  <View style={styles.configBlockHeader}>
                                    <Text
                                      style={[styles.configBlockLabel, { color: colors.textMuted }]}
                                    >
                                      {t('agentMgmt.setupChat')}
                                    </Text>
                                    <Button
                                      variant="ghost"
                                      size="xs"
                                      icon={Copy}
                                      iconColor={colors.primary}
                                      style={styles.copySmallBtn}
                                      onPress={() => copyToClipboard(activePlan.aiPrompt)}
                                    >
                                      {t('common.copy')}
                                    </Button>
                                  </View>
                                  <Text
                                    style={[styles.aiPromptText, { color: colors.textSecondary }]}
                                  >
                                    {t('agentMgmt.setupChatDesc')}
                                  </Text>
                                  <View
                                    style={[
                                      styles.codeBlock,
                                      {
                                        backgroundColor: colors.surface,
                                        borderColor: colors.border,
                                      },
                                    ]}
                                  >
                                    <Text
                                      style={[styles.codeText, { color: colors.textSecondary }]}
                                      numberOfLines={8}
                                    >
                                      {activePlan.aiPrompt}
                                    </Text>
                                  </View>
                                </View>
                              </View>
                            )}

                            <View style={styles.capabilityGrid}>
                              {activePlan.capabilities.map((cap) => (
                                <View
                                  key={`${activePlan.target}-${cap}`}
                                  style={[
                                    styles.capabilityPill,
                                    {
                                      backgroundColor: colors.surface,
                                      borderColor: colors.border,
                                    },
                                  ]}
                                >
                                  <Check size={12} color={colors.primary} />
                                  <Text
                                    style={[styles.capabilityText, { color: colors.textSecondary }]}
                                    numberOfLines={1}
                                  >
                                    {t(`agentMgmt.connectorCap_${cap}`)}
                                  </Text>
                                </View>
                              ))}
                            </View>

                            {/* Docs Link */}
                            <Button
                              variant="outline"
                              size="sm"
                              icon={BookOpen}
                              style={styles.docsLink}
                              onPress={openDocs}
                            >
                              {t('agentMgmt.openclawFullDocs')}
                            </Button>
                          </View>
                        )
                      }
                      return (
                        <Button
                          variant="primary"
                          size="md"
                          icon={Key}
                          style={styles.generateBtn}
                          onPress={() => regenTokenMutation.mutate(selectedAgent.id)}
                          disabled={regenTokenMutation.isPending}
                          loading={regenTokenMutation.isPending}
                        >
                          {regenTokenMutation.isPending
                            ? t('buddyMgmt.generating', '生成中...')
                            : t('buddyMgmt.generateToken', '生成 Token')}
                        </Button>
                      )
                    })()}
                  </View>

                  {/* Info Section */}
                  <View
                    style={[
                      styles.section,
                      { backgroundColor: colors.background, borderColor: colors.border },
                    ]}
                  >
                    <View style={styles.sectionHeader}>
                      <Bot size={16} color={colors.primary} />
                      <Text style={[styles.sectionTitle, { color: colors.text }]}>
                        {t('buddyMgmt.infoTitle', 'Buddy 信息')}
                      </Text>
                    </View>

                    <View style={styles.infoGrid}>
                      <View style={styles.infoItem}>
                        <Text style={[styles.infoLabel, { color: colors.textMuted }]}>
                          {t('buddyMgmt.status', '状态')}
                        </Text>
                        <View style={styles.row}>
                          <View
                            style={[
                              styles.statusDot,
                              {
                                backgroundColor: isOnline(selectedAgent) ? '#22c55e' : '#d1d5db',
                              },
                            ]}
                          />
                          <Text style={[styles.infoValue, { color: colors.text }]}>
                            {isOnline(selectedAgent) ? '在线' : '离线'}
                          </Text>
                        </View>
                      </View>

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
                  <View style={{ height: 40 }} />
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
    borderWidth: 1,
    padding: spacing.md,
  },
  agentName: { fontSize: fontSize.md, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },

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
    borderWidth: 1,
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
  closeBtn: { width: 36, height: 36 },
  createForm: { flex: 1 },
  createFormContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  formIntro: { fontSize: fontSize.sm, lineHeight: 21, marginBottom: spacing.lg },
  formSectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  formField: { marginBottom: spacing.md },
  fieldLabel: { fontSize: fontSize.sm, fontWeight: '600', marginBottom: spacing.xs },
  fieldHint: { fontSize: fontSize.xs, marginTop: spacing.xs },
  accessBlock: { gap: spacing.sm, marginBottom: spacing.md },
  modeRow: { flexDirection: 'row', gap: spacing.sm },
  modeOption: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 6,
  },
  modeTitle: { fontSize: fontSize.sm, fontWeight: '800' },
  modeDesc: { fontSize: fontSize.xs, lineHeight: 17 },
  policyNote: { borderRadius: radius.lg, padding: spacing.md, gap: 4 },
  policyTitle: { fontSize: fontSize.sm, fontWeight: '800' },
  policyDesc: { fontSize: fontSize.xs, lineHeight: 18 },
  serverList: { gap: spacing.xs },
  serverOption: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8 },
  checkbox: { width: 16, height: 16, borderRadius: 4, borderWidth: 1 },
  serverName: { flex: 1, fontSize: fontSize.sm, fontWeight: '600' },
  textArea: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.lg,
    borderTopWidth: 1,
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
    borderRadius: 0,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  detailHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  detailName: { fontSize: fontSize.lg, fontWeight: '700' },
  detailUsername: { fontSize: fontSize.sm, marginTop: 2 },
  detailContent: { flex: 1 },
  detailContentInner: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl * 2 },

  // Sections
  section: {
    borderRadius: radius.xl,
    borderWidth: 1,
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

  // Token
  tokenContainer: { gap: spacing.md },
  tokenBox: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  tokenValue: { fontSize: fontSize.sm, fontFamily: 'monospace' },
  tokenActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  connectorGuideDesc: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  connectorTargets: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  connectorTargetCell: {
    flex: 1,
  },
  connectorTarget: {
    minHeight: 48,
    width: '100%',
    paddingHorizontal: spacing.xs,
  },
  tokenActionCell: { flex: 1 },
  tokenActionBtn: {
    width: '100%',
  },
  generateBtn: {
    width: '100%',
  },

  // Config Tabs
  configTabs: {
    flexDirection: 'row',
    gap: spacing.xs,
    borderRadius: radius.lg,
    padding: spacing.xs,
  },
  configTabCell: {
    flex: 1,
  },
  configTab: {
    width: '100%',
  },

  // Config Content
  configContent: { gap: spacing.md },
  configBlock: { gap: spacing.xs },
  configBlockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  configBlockLabel: { fontSize: fontSize.xs, fontWeight: '700' },
  copySmallBtn: {
    minHeight: 28,
    paddingHorizontal: spacing.sm,
  },
  codeBlock: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  codeText: { fontSize: fontSize.xs, fontFamily: 'monospace' },
  aiPromptText: { fontSize: fontSize.sm, lineHeight: 20 },
  capabilityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  capabilityPill: {
    width: '48%',
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.xs,
  },
  capabilityText: {
    flex: 1,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },

  // Docs Link
  docsLink: {
    width: '100%',
  },

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
  statusDot: { width: 8, height: 8, borderRadius: 4 },

  // Delete
  deleteBtn: {
    marginTop: spacing.sm,
    width: '100%',
  },
})
