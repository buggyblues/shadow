import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as Clipboard from 'expo-clipboard'
import { useNavigation } from 'expo-router'
import {
  BookOpen,
  Bot,
  ChevronRight,
  Copy,
  Key,
  MessageSquare,
  Plus,
  RefreshCw,
  Terminal,
  Trash2,
  X,
} from 'lucide-react-native'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Reanimated, { FadeIn, FadeInUp } from 'react-native-reanimated'
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

function withRandomSuffix(username: string) {
  const base = username.replace(/[^a-zA-Z0-9_-]/g, '').trim()
  const suffix = Math.random().toString(36).slice(2, 6)
  return `${base.slice(0, 27)}_${suffix}`
}

// Generate OpenClaw config commands
function generateConfigCommands(token: string, serverUrl: string) {
  return {
    // One-liner bash command
    bash: `openclaw plugins install @shadowob/openclaw-shadowob && openclaw config set channels.shadowob.token "${token}" && openclaw config set channels.shadowob.serverUrl "${serverUrl}" && openclaw gateway restart`,
    // Individual commands
    install: 'openclaw plugins install @shadowob/openclaw-shadowob',
    setToken: `openclaw config set channels.shadowob.token "${token}"`,
    setServer: `openclaw config set channels.shadowob.serverUrl "${serverUrl}"`,
    restart: 'openclaw gateway restart',
    // Config JSON
    configJson: JSON.stringify(
      {
        channels: {
          shadowob: {
            token: token,
            serverUrl: serverUrl,
          },
        },
      },
      null,
      2,
    ),
    // AI prompt for chat-based setup
    aiPrompt: `请帮我安装和配置 ShadowOwnBuddy 插件，连接到 Shadow 服务器。

配置信息：
- 插件名称：@shadowob/openclaw
- 服务器地址：${serverUrl}
- Token: ${token}

请执行以下步骤：
1. 安装插件：openclaw plugins install @shadowob/openclaw
2. 配置 Token：openclaw config set channels.shadowob.token "${token}"
3. 配置服务器地址：openclaw config set channels.shadowob.serverUrl "${serverUrl}"
4. 重启网关：openclaw gateway restart

请依次执行这些命令，并确认每个步骤是否成功。`,
  }
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
  const [configTab, setConfigTab] = useState<'manual' | 'chat'>('manual')

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
          username: withRandomSuffix(data.username),
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
    onError: (err: Error) => {
      if (err.message?.toLowerCase().includes('username already taken')) {
        setCreateUsername((prev) => withRandomSuffix(prev))
        showToast(
          t('buddyMgmt.usernameTaken', 'Username already taken, a new one has been suggested'),
        )
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

  const copyToClipboard = async (text: string, message?: string) => {
    await Clipboard.setStringAsync(text)
    showToast(message || t('common.copied', '已复制'))
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
          setConfigTab('manual')
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
        <ChevronRight size={20} color={colors.textMuted} />
      </Pressable>
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
                  {t('buddyMgmt.createBuddy', '创建 Buddy')}
                </Text>
                <Pressable
                  onPress={() => {
                    setShowCreate(false)
                    setCreateName('')
                    setCreateUsername('')
                  }}
                  style={styles.closeBtn}
                >
                  <X size={24} color={colors.textMuted} />
                </Pressable>
              </View>

              <ScrollView
                style={styles.createForm}
                contentContainerStyle={styles.createFormContent}
                keyboardShouldPersistTaps="handled"
              >
                {/* Name Input */}
                <View style={styles.formField}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                    {t('buddyMgmt.nameLabel', '名称')}
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
                    maxLength={64}
                  />
                </View>

                {/* Username Input */}
                <View style={styles.formField}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                    {t('buddyMgmt.usernameLabel', '用户名')}
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
                    placeholder={t('buddyMgmt.usernamePlaceholder', '用户名（字母、数字、下划线）')}
                    placeholderTextColor={colors.textMuted}
                    value={createUsername}
                    onChangeText={(text) => setCreateUsername(text.replace(/[^a-zA-Z0-9_-]/g, ''))}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={32}
                  />
                  <Text style={[styles.fieldHint, { color: colors.textMuted }]}>
                    将自动添加随机后缀避免重复
                  </Text>
                </View>

                {/* Spacer for keyboard */}
                <View style={{ height: 100 }} />
              </ScrollView>

              {/* Footer Buttons */}
              <View style={[styles.modalFooter, { borderTopColor: colors.border }]}>
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
                  disabled={
                    !createName.trim() || !createUsername.trim() || createMutation.isPending
                  }
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
                  <Pressable
                    onPress={() => {
                      setSelectedAgent(null)
                      setGeneratedToken(null)
                    }}
                    style={styles.closeBtn}
                  >
                    <X size={24} color={colors.textMuted} />
                  </Pressable>
                </View>

                <ScrollView
                  style={styles.detailContent}
                  contentContainerStyle={styles.detailContentInner}
                  showsVerticalScrollIndicator={false}
                >
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
                        const commands = generateConfigCommands(displayToken, serverUrl)
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
                              <Pressable
                                style={({ pressed }) => [
                                  styles.tokenActionBtn,
                                  { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                                ]}
                                onPress={() => copyToClipboard(displayToken, 'Token 已复制')}
                              >
                                <Copy size={14} color={colors.textSecondary} />
                                <Text
                                  style={[styles.tokenActionText, { color: colors.textSecondary }]}
                                >
                                  {t('common.copy', '复制 Token')}
                                </Text>
                              </Pressable>
                              <Pressable
                                style={({ pressed }) => [
                                  styles.tokenActionBtn,
                                  { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                                ]}
                                onPress={() => regenTokenMutation.mutate(selectedAgent.id)}
                                disabled={regenTokenMutation.isPending}
                              >
                                <RefreshCw
                                  size={14}
                                  color={colors.textSecondary}
                                  style={
                                    regenTokenMutation.isPending ? { opacity: 0.5 } : undefined
                                  }
                                />
                                <Text
                                  style={[styles.tokenActionText, { color: colors.textSecondary }]}
                                >
                                  {t('buddyMgmt.regenerate', '重新生成')}
                                </Text>
                              </Pressable>
                            </View>

                            {/* Config Tabs */}
                            <View style={styles.configTabs}>
                              <Pressable
                                style={[
                                  styles.configTab,
                                  configTab === 'manual' && {
                                    backgroundColor: colors.surface,
                                    borderColor: colors.border,
                                  },
                                ]}
                                onPress={() => setConfigTab('manual')}
                              >
                                <Terminal
                                  size={12}
                                  color={configTab === 'manual' ? colors.text : colors.textMuted}
                                />
                                <Text
                                  style={[
                                    styles.configTabText,
                                    {
                                      color:
                                        configTab === 'manual' ? colors.text : colors.textMuted,
                                    },
                                  ]}
                                >
                                  手动配置
                                </Text>
                              </Pressable>
                              <Pressable
                                style={[
                                  styles.configTab,
                                  configTab === 'chat' && {
                                    backgroundColor: colors.surface,
                                    borderColor: colors.border,
                                  },
                                ]}
                                onPress={() => setConfigTab('chat')}
                              >
                                <MessageSquare
                                  size={12}
                                  color={configTab === 'chat' ? colors.text : colors.textMuted}
                                />
                                <Text
                                  style={[
                                    styles.configTabText,
                                    {
                                      color: configTab === 'chat' ? colors.text : colors.textMuted,
                                    },
                                  ]}
                                >
                                  AI 对话配置
                                </Text>
                              </Pressable>
                            </View>

                            {/* Config Content */}
                            {configTab === 'manual' ? (
                              <View style={styles.configContent}>
                                {/* Quick Command */}
                                <View style={styles.configBlock}>
                                  <View style={styles.configBlockHeader}>
                                    <Text
                                      style={[styles.configBlockLabel, { color: colors.textMuted }]}
                                    >
                                      一键配置命令
                                    </Text>
                                    <Pressable
                                      style={({ pressed }) => [
                                        styles.copySmallBtn,
                                        { opacity: pressed ? 0.7 : 1 },
                                      ]}
                                      onPress={() =>
                                        copyToClipboard(commands.bash, '配置命令已复制')
                                      }
                                    >
                                      <Copy size={12} color={colors.primary} />
                                      <Text
                                        style={[styles.copySmallText, { color: colors.primary }]}
                                      >
                                        复制
                                      </Text>
                                    </Pressable>
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
                                      {commands.bash}
                                    </Text>
                                  </View>
                                </View>

                                {/* Config JSON */}
                                <View style={styles.configBlock}>
                                  <View style={styles.configBlockHeader}>
                                    <Text
                                      style={[styles.configBlockLabel, { color: colors.textMuted }]}
                                    >
                                      配置文件
                                    </Text>
                                    <Pressable
                                      style={({ pressed }) => [
                                        styles.copySmallBtn,
                                        { opacity: pressed ? 0.7 : 1 },
                                      ]}
                                      onPress={() =>
                                        copyToClipboard(commands.configJson, '配置已复制')
                                      }
                                    >
                                      <Copy size={12} color={colors.primary} />
                                      <Text
                                        style={[styles.copySmallText, { color: colors.primary }]}
                                      >
                                        复制
                                      </Text>
                                    </Pressable>
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
                                      numberOfLines={6}
                                    >
                                      {commands.configJson}
                                    </Text>
                                  </View>
                                </View>
                              </View>
                            ) : (
                              <View style={styles.configContent}>
                                <View style={styles.configBlock}>
                                  <View style={styles.configBlockHeader}>
                                    <Text
                                      style={[styles.configBlockLabel, { color: colors.textMuted }]}
                                    >
                                      发送给 AI 助手的提示词
                                    </Text>
                                    <Pressable
                                      style={({ pressed }) => [
                                        styles.copySmallBtn,
                                        { opacity: pressed ? 0.7 : 1 },
                                      ]}
                                      onPress={() =>
                                        copyToClipboard(commands.aiPrompt, '提示词已复制')
                                      }
                                    >
                                      <Copy size={12} color={colors.primary} />
                                      <Text
                                        style={[styles.copySmallText, { color: colors.primary }]}
                                      >
                                        复制
                                      </Text>
                                    </Pressable>
                                  </View>
                                  <Text
                                    style={[styles.aiPromptText, { color: colors.textSecondary }]}
                                  >
                                    复制上方提示词发送给你的 AI 助手（如 Claude、ChatGPT
                                    等），它会帮你完成配置。
                                  </Text>
                                </View>
                              </View>
                            )}

                            {/* Docs Link */}
                            <Pressable style={styles.docsLink}>
                              <BookOpen size={14} color={colors.primary} />
                              <Text style={[styles.docsLinkText, { color: colors.primary }]}>
                                查看完整配置文档
                              </Text>
                            </Pressable>
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
                          <Key size={16} color="#fff" />
                          <Text style={styles.generateBtnText}>
                            {regenTokenMutation.isPending
                              ? t('buddyMgmt.generating', '生成中...')
                              : t('buddyMgmt.generateToken', '生成 Token')}
                          </Text>
                        </Pressable>
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
                    <Trash2 size={18} color="#ef4444" />
                    <Text style={styles.deleteBtnText}>
                      {t('buddyMgmt.deleteBuddy', '删除 Buddy')}
                    </Text>
                  </Pressable>

                  {/* Bottom Spacer */}
                  <View style={{ height: 40 }} />
                </ScrollView>
              </>
            )}
          </Reanimated.View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  dot: { width: 8, height: 8, borderRadius: 4 },
  meta: { fontSize: fontSize.xs },
  listedBadge: { fontSize: fontSize.xs, fontWeight: '700' },
  rentedBadge: { fontSize: fontSize.xs, fontWeight: '700', color: '#ea580c' },
  empty: { alignItems: 'center', paddingTop: 80, gap: spacing.sm },
  emptyText: { fontSize: fontSize.lg, fontWeight: '700' },
  emptyHint: { fontSize: fontSize.sm },

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
  closeBtn: { padding: spacing.xs },
  createForm: { flex: 1 },
  createFormContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  formField: { marginBottom: spacing.md },
  fieldLabel: { fontSize: fontSize.sm, fontWeight: '600', marginBottom: spacing.xs },
  fieldHint: { fontSize: fontSize.xs, marginTop: spacing.xs },
  input: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: fontSize.md,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.lg,
    borderTopWidth: 1,
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
  tokenActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
  },
  tokenActionText: { fontSize: fontSize.xs, fontWeight: '700' },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: radius.lg,
  },
  generateBtnText: { color: '#fff', fontWeight: '700', fontSize: fontSize.md },

  // Config Tabs
  configTabs: {
    flexDirection: 'row',
    gap: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: radius.lg,
    padding: spacing.xs,
  },
  configTab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  configTabText: { fontSize: fontSize.xs, fontWeight: '700' },

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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
  },
  copySmallText: { fontSize: fontSize.xs, fontWeight: '700' },
  codeBlock: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  codeText: { fontSize: fontSize.xs, fontFamily: 'monospace' },
  aiPromptText: { fontSize: fontSize.sm, lineHeight: 20 },

  // Docs Link
  docsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  docsLinkText: { fontSize: fontSize.sm, fontWeight: '700' },

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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    backgroundColor: '#fef2f2',
    borderRadius: radius.lg,
    marginTop: spacing.sm,
  },
  deleteBtnText: { color: '#ef4444', fontWeight: '700', fontSize: fontSize.md },
})
