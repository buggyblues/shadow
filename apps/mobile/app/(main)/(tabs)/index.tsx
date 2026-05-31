import AsyncStorage from '@react-native-async-storage/async-storage'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import {
  BookOpen,
  Bot,
  ChevronRight,
  Compass,
  Hash,
  Lock,
  MessageCircle,
  Plus,
  QrCode,
  Server,
  X,
} from 'lucide-react-native'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Reanimated, { FadeInDown, FadeInRight } from 'react-native-reanimated'
import { Avatar } from '../../../src/components/common/avatar'
import {
  ChannelCatSvg,
  HelpBuddySvg,
  HelpProductSvg,
  HelpStartSvg,
  WorkCatSvg,
} from '../../../src/components/common/cat-svg'
import { EmptyState } from '../../../src/components/common/empty-state'
import { LoadingScreen } from '../../../src/components/common/loading-screen'
import {
  AppSwitch,
  AppText,
  BackgroundSurface,
  Badge,
  Button,
  GlassPanel,
  IconBubble,
  IconButton,
  ListHeader,
  MobileNavigationBar,
  SurfaceList,
  SurfaceListItem,
  TextField,
} from '../../../src/components/ui'
import { fetchApi } from '../../../src/lib/api'
import { useAuthStore } from '../../../src/stores/auth.store'
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
} from '../../../src/theme'

interface ServerEntry {
  server: {
    id: string
    name: string
    slug: string | null
    iconUrl: string | null
    description?: string | null
    isPublic?: boolean
    memberCount?: number
    channelCount?: number
  }
  member: {
    role: string
  }
}

export default function ServersScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)

  const [showHelpTutorial, setShowHelpTutorial] = useState(false)
  const [showCreateMenu, setShowCreateMenu] = useState(false)
  const [hideHelpIcon, setHideHelpIcon] = useState(false)
  const [dontShowAgain, setDontShowAgain] = useState(false)
  const [tutorialPageIndex, setTutorialPageIndex] = useState(0)

  useEffect(() => {
    AsyncStorage.getItem('hideHomeHelpIcon').then((val) => {
      if (val === 'true') {
        setHideHelpIcon(true)
      }
    })
  }, [])

  const handleCloseTutorial = async () => {
    if (dontShowAgain) {
      await AsyncStorage.setItem('hideHomeHelpIcon', 'true')
      setHideHelpIcon(true)
    }
    setShowHelpTutorial(false)
  }

  const {
    data: servers = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['servers'],
    queryFn: () => fetchApi<ServerEntry[]>('/api/servers'),
  })

  const { data: pendingReceived = [] } = useQuery({
    queryKey: ['friends-pending'],
    queryFn: () => fetchApi<Array<{ friendshipId: string }>>('/api/friends/pending'),
  })

  const [refreshing, setRefreshing] = useState(false)

  const queryClient = useQueryClient()
  const [showCreateServer, setShowCreateServer] = useState(false)
  const [createName, setCreateName] = useState('')
  const [isPublic, setIsPublic] = useState(true)

  const createMutation = useMutation({
    mutationFn: () =>
      fetchApi<{ id: string; slug: string | null }>('/api/servers', {
        method: 'POST',
        body: JSON.stringify({ name: createName, isPublic }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      setShowCreateServer(false)
      setCreateName('')
      router.push(`/(main)/servers/${data.slug ?? data.id}`)
    },
  })

  // Group servers by role
  const sections = useMemo(() => {
    const owned = servers.filter((s) => s.member.role === 'owner')
    const others = servers.filter((s) => s.member.role !== 'owner')
    const result: { title: string; data: ServerEntry[] }[] = []
    if (owned.length > 0) result.push({ title: '我创建的', data: owned })
    if (others.length > 0) result.push({ title: '已加入', data: others })
    if (result.length === 0 && servers.length > 0) result.push({ title: '全部', data: servers })
    return result
  }, [servers])

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'owner':
        return '创建者'
      case 'admin':
        return '管理员'
      default:
        return '成员'
    }
  }

  if (isLoading) return <LoadingScreen />

  const { width: screenWidth } = Dimensions.get('window')
  const tutorialWidth = screenWidth * 0.85
  const tutorialInnerWidth = tutorialWidth - spacing.xl * 2
  const tutorialPages = [
    {
      key: 'positioning',
      title: '超萌可爱的界面下',
      desc: '隐藏着硬核的生产力工具！你可以在这里拥有自己的 AI 社区、店铺和工作区。',
      tags: ['产品定位', '超级社区', '协作空间'],
      renderIcon: () => <HelpProductSvg size={size.illustrationLg} color={colors.primary} />,
    },
    {
      key: 'server',
      title: '什么是服务器？',
      desc: '服务器是你的社区“主空间”，承载成员、频道、规则和资源。可公开，也可私密。',
      tags: ['成员管理', '公开/私密', '社区中枢'],
      renderIcon: () => <WorkCatSvg width={88} height={88} />,
    },
    {
      key: 'channel',
      title: '什么是频道？',
      desc: '频道是服务器里的话题房间。你可以按讨论主题拆分，让信息更清晰不混乱。',
      tags: ['话题分区', '信息沉淀', '高效沟通'],
      renderIcon: () => <ChannelCatSvg width={88} height={88} />,
    },
    {
      key: 'buddy',
      title: '什么是 Buddy？',
      desc: 'Buddy 是黑猫打工仔：能写代码、审方案、查资料，24 小时在线协作。',
      tags: ['多 Agent', '自动协作', '持续产出'],
      renderIcon: () => <HelpBuddySvg size={size.illustrationLg} color={colors.primary} />,
    },
    {
      key: 'start',
      title: '开始奇妙之旅',
      desc: '点击右上角 + 创建服务器，接着建频道、邀请成员，再召唤 Buddy 开始协作。',
      tags: ['创建服务器', '搭建频道', '召唤 Buddy'],
      renderIcon: () => <HelpStartSvg size={size.illustrationLg} color={palette.indigo} />,
    },
  ]
  const listSections: Array<{ title: string; data: ServerEntry[] }> = sections

  return (
    <BackgroundSurface>
      <MobileNavigationBar
        title={t('server.home')}
        left={
          <Pressable
            onPress={() => {
              router.push('/(main)/dashboard' as never)
            }}
            hitSlop={spacing.sm}
          >
            <Avatar
              uri={user?.avatarUrl}
              name={user?.displayName || user?.username || ''}
              size={size.controlLg}
              userId={user?.id || ''}
              status="online"
              showStatus
            />
          </Pressable>
        }
        right={
          <View style={styles.navActions}>
            {!hideHelpIcon && (
              <IconButton
                icon={BookOpen}
                variant="glass"
                size="icon"
                iconColor={colors.textSecondary}
                onPress={() => setShowHelpTutorial(true)}
                hitSlop={spacing.sm}
                style={styles.navBtn}
              />
            )}
            <IconButton
              variant="primary"
              size="icon"
              icon={Plus}
              iconSize={iconSize.xl}
              onPress={() => setShowCreateMenu(true)}
              style={styles.navBtn}
            />
          </View>
        }
      />

      {servers.length === 0 ? (
        <EmptyState
          icon={MessageCircle}
          title="暂无服务器"
          description="点击右上角 + 创建或加入一个服务器"
        />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true)
                await refetch()
                setRefreshing(false)
              }}
              tintColor={colors.textMuted}
            />
          }
          contentContainerStyle={styles.listContent}
        >
          <View style={styles.quickEntryWrapper}>
            <SurfaceList style={styles.edgeList}>
              <SurfaceListItem
                onPress={() => router.push('/(main)/friends' as never)}
                style={styles.quickEntryCard}
              >
                <IconBubble
                  icon={MessageCircle}
                  tone="primary"
                  size={iconSize.xl}
                  style={styles.actionBubbleGlow}
                />
                <View style={styles.quickEntryInfo}>
                  <AppText variant="bodyStrong">好友与私信</AppText>
                  <AppText variant="label" tone="secondary">
                    查看好友、请求与私信会话
                  </AppText>
                </View>
                {pendingReceived.length > 0 && (
                  <Badge variant="danger" size="xs">
                    {pendingReceived.length}
                  </Badge>
                )}
                <ChevronRight size={iconSize.md} color={colors.textMuted} />
              </SurfaceListItem>

              <SurfaceListItem
                last
                onPress={() => router.push('/(main)/discover' as never)}
                style={styles.quickEntryCard}
              >
                <IconBubble
                  icon={Compass}
                  tone="primary"
                  size={iconSize.xl}
                  style={styles.actionBubbleGlow}
                />
                <View style={styles.quickEntryInfo}>
                  <AppText variant="bodyStrong">探索服务器</AppText>
                  <AppText variant="label" tone="secondary">
                    发现公开服务器并快速加入
                  </AppText>
                </View>
                <ChevronRight size={iconSize.md} color={colors.textMuted} />
              </SurfaceListItem>
            </SurfaceList>
          </View>

          {listSections.map((section) => (
            <View key={section.title} style={styles.serverSection}>
              <ListHeader
                title={section.title}
                count={section.data.length}
                style={styles.sectionHeader}
              />
              <SurfaceList style={styles.serverList}>
                {section.data.map((item, index) => {
                  const isPublicResult = item.member.role === '_public'
                  const desc = isPublicResult
                    ? item.server.description || '公开服务器'
                    : item.server.description || getRoleLabel(item.member.role)
                  const isLast = index === section.data.length - 1
                  return (
                    <Reanimated.View
                      key={item.server.id}
                      entering={FadeInRight.delay(index * 40).springify()}
                    >
                      <SurfaceListItem
                        last={isLast}
                        style={styles.serverCard}
                        onPress={() => {
                          if (isPublicResult) {
                            router.push('/(main)/discover' as never)
                          } else {
                            router.push(`/(main)/servers/${item.server.slug ?? item.server.id}`)
                          }
                        }}
                      >
                        <Avatar
                          uri={item.server.iconUrl}
                          name={item.server.name}
                          size={size.controlLg}
                          userId={item.server.id}
                          shape="server"
                        />
                        <View style={styles.serverInfo}>
                          <View style={styles.serverTopRow}>
                            <Text
                              style={[styles.serverName, { color: colors.text }]}
                              numberOfLines={1}
                            >
                              {item.server.isPublic === false && (
                                <Lock size={iconSize.xs} color={colors.textMuted} />
                              )}
                              {item.server.isPublic === false ? ' ' : ''}
                              {item.server.name}
                            </Text>
                          </View>
                          {!isPublicResult && (
                            <View style={styles.serverMetaRow}>
                              <Hash size={iconSize.xs} color={colors.textMuted} />
                              <Text style={[styles.serverMeta, { color: colors.textMuted }]}>
                                {item.server.channelCount ?? 0}
                              </Text>
                            </View>
                          )}
                          {isPublicResult && (
                            <Text
                              style={[styles.serverDesc, { color: colors.textMuted }]}
                              numberOfLines={1}
                            >
                              {desc}
                            </Text>
                          )}
                        </View>
                        <ChevronRight size={iconSize.md} color={colors.textMuted} />
                      </SurfaceListItem>
                    </Reanimated.View>
                  )
                })}
              </SurfaceList>
            </View>
          ))}
        </ScrollView>
      )}

      {showCreateMenu ? (
        <View style={styles.popoverLayer} pointerEvents="box-none">
          <Pressable style={styles.popoverDismiss} onPress={() => setShowCreateMenu(false)} />
          <Reanimated.View
            entering={FadeInDown.duration(160)}
            style={[
              styles.actionPopover,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <SurfaceList style={styles.edgeList}>
              <SurfaceListItem
                onPress={() => {
                  setShowCreateMenu(false)
                  setShowCreateServer(true)
                }}
                style={styles.menuItem}
              >
                <IconBubble icon={Server} tone="primary" size={iconSize.xl} />
                <AppText variant="bodyStrong" style={styles.menuLabel}>
                  {t('home.createServerAction')}
                </AppText>
                <ChevronRight size={iconSize.md} color={colors.textMuted} />
              </SurfaceListItem>
              <SurfaceListItem
                onPress={() => {
                  setShowCreateMenu(false)
                  router.push('/(main)/create-buddy' as never)
                }}
                style={styles.menuItem}
              >
                <IconBubble icon={Bot} tone="primary" size={iconSize.xl} />
                <AppText variant="bodyStrong" style={styles.menuLabel}>
                  {t('home.createBuddyAction')}
                </AppText>
                <ChevronRight size={iconSize.md} color={colors.textMuted} />
              </SurfaceListItem>
              <SurfaceListItem
                last
                onPress={() => {
                  setShowCreateMenu(false)
                  router.push('/(main)/scan' as never)
                }}
                style={styles.menuItem}
              >
                <IconBubble icon={QrCode} tone="success" size={iconSize.xl} />
                <AppText variant="bodyStrong" style={styles.menuLabel}>
                  {t('home.scanAction')}
                </AppText>
                <ChevronRight size={iconSize.md} color={colors.textMuted} />
              </SurfaceListItem>
            </SurfaceList>
          </Reanimated.View>
        </View>
      ) : null}

      {/* Create Server Modal — Compact like channel creation */}
      <Modal
        visible={showCreateServer}
        animationType="fade"
        transparent
        onRequestClose={() => setShowCreateServer(false)}
      >
        <KeyboardAvoidingView
          style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <Pressable style={styles.modalDismiss} onPress={() => setShowCreateServer(false)} />
          <Reanimated.View entering={FadeInDown.duration(250)} style={styles.modalShell}>
            <GlassPanel style={styles.modalContent}>
              {/* Header */}
              <View style={styles.modalHeader}>
                <AppText variant="title">{t('server.createTitle')}</AppText>
                <IconButton
                  icon={X}
                  variant="glass"
                  size="icon"
                  onPress={() => setShowCreateServer(false)}
                />
              </View>

              {/* Name input */}
              <TextField
                label={t('server.nameLabel')}
                style={styles.input}
                value={createName}
                onChangeText={setCreateName}
                placeholder={t('server.namePlaceholder')}
                autoFocus
              />

              {/* Public toggle inline */}
              <Pressable style={styles.switchRow} onPress={() => setIsPublic(!isPublic)}>
                <AppText variant="bodyStrong">{t('server.publicServer')}</AppText>
                <AppSwitch value={isPublic} onValueChange={setIsPublic} />
              </Pressable>

              {/* Create button */}
              <Button
                variant="primary"
                size="lg"
                onPress={() => createMutation.mutate()}
                disabled={!createName.trim() || createMutation.isPending}
                loading={createMutation.isPending}
              >
                {t('server.create')}
              </Button>
            </GlassPanel>
          </Reanimated.View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Product Tutorial Modal */}
      <Modal
        visible={showHelpTutorial}
        animationType="fade"
        transparent
        onRequestClose={handleCloseTutorial}
      >
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <Reanimated.View entering={FadeInDown.duration(250)} style={styles.tutorialShell}>
            <GlassPanel style={styles.tutorialContent}>
              <View style={styles.tutorialHeader}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>新手帮助指南</Text>
                <Pressable onPress={handleCloseTutorial} hitSlop={spacing.sm}>
                  <X size={iconSize['2xl']} color={colors.textMuted} />
                </Pressable>
              </View>

              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(event) => {
                  const next = Math.round(event.nativeEvent.contentOffset.x / tutorialInnerWidth)
                  setTutorialPageIndex(Math.max(0, Math.min(next, tutorialPages.length - 1)))
                }}
                style={{
                  width: tutorialInnerWidth,
                  height: tutorialInnerWidth,
                  maxHeight: size.tutorialMaxHeight,
                  borderRadius: radius['2xl'],
                  backgroundColor: colors.background,
                }}
              >
                {tutorialPages.map((page) => (
                  <View key={page.key} style={[styles.tutorialPage, { width: tutorialInnerWidth }]}>
                    {page.renderIcon()}
                    <Text style={[styles.tutorialPageTitle, { color: colors.text }]}>
                      {page.title}
                    </Text>
                    <Text style={[styles.tutorialPageDesc, { color: colors.textMuted }]}>
                      {page.desc}
                    </Text>
                    <View style={styles.tutorialTagRow}>
                      {page.tags.map((tag) => (
                        <View
                          key={`${page.key}-${tag}`}
                          style={[styles.tutorialTag, { backgroundColor: colors.inputBackground }]}
                        >
                          <Text style={[styles.tutorialTagText, { color: colors.primary }]}>
                            {tag}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </ScrollView>

              <View style={styles.tutorialIndicatorRow}>
                {tutorialPages.map((page, idx) => (
                  <View
                    key={`dot-${page.key}`}
                    style={[
                      styles.tutorialIndicatorDot,
                      {
                        backgroundColor: idx === tutorialPageIndex ? colors.primary : colors.border,
                        width: idx === tutorialPageIndex ? 16 : 7,
                      },
                    ]}
                  />
                ))}
              </View>

              <Pressable style={styles.switchRow} onPress={() => setDontShowAgain(!dontShowAgain)}>
                <Text style={[styles.switchLabel, { color: colors.text, fontSize: fontSize.sm }]}>
                  不再显示
                </Text>
                <AppSwitch value={dontShowAgain} onValueChange={setDontShowAgain} />
              </Pressable>

              <Button variant="primary" size="lg" onPress={handleCloseTutorial}>
                我明白啦
              </Button>
            </GlassPanel>
          </Reanimated.View>
        </View>
      </Modal>
    </BackgroundSurface>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  navActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  navBtn: {
    width: size.controlLg,
    height: size.controlLg,
    borderRadius: radius.full,
  },

  listContent: {
    paddingBottom: size.tabBar + spacing['4xl'],
  },

  quickEntryWrapper: {
    paddingVertical: spacing.sm,
  },
  edgeList: {
    width: '100%',
  },
  quickEntryCard: {
    minHeight: size.listItemLg + spacing.xxs,
  },
  actionBubbleGlow: {
    width: size.controlLg,
    height: size.controlLg,
    borderRadius: radius.xl,
  },
  quickEntryInfo: {
    flex: 1,
  },
  quickEntryTitle: {
    fontSize: fontSize.md,
    fontWeight: '800', // Making it bolder
  },
  quickEntryDesc: {
    fontSize: fontSize.xs,
    marginTop: spacing.px,
  },
  // Section headers
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: letterSpacing.none,
  },
  sectionCount: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },

  // Server list item
  serverSection: {
    paddingHorizontal: spacing.none,
  },
  serverList: {
    marginBottom: spacing.xs,
  },
  serverCard: {
    minHeight: size.avatarXl,
    paddingVertical: spacing.sm,
  },
  serverInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.xxs,
  },
  serverTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  serverName: {
    fontSize: fontSize.md,
    fontWeight: '800',
    flex: 1,
  },
  serverDesc: {
    fontSize: fontSize.sm,
    marginTop: spacing.px,
  },
  serverMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    marginTop: spacing.xxs,
  },
  serverMeta: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  groupGap: {
    height: spacing.md,
  },

  // Modal — compact
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalDismiss: {
    ...StyleSheet.absoluteFillObject,
  },
  modalShell: {
    width: '88%',
    maxWidth: size.contentMaxWidth,
  },
  popoverLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
  popoverDismiss: {
    ...StyleSheet.absoluteFillObject,
  },
  actionPopover: {
    position: 'absolute',
    top: size.navBar + spacing['5xl'],
    right: spacing.lg,
    width: size.floatingCallWidth,
    borderWidth: border.hairline,
    borderRadius: radius['2xl'],
    overflow: 'hidden',
  },
  menuItem: {
    minHeight: size.listItemLg,
  },
  menuLabel: {
    flex: 1,
  },
  modalContent: {
    borderRadius: radius['3xl'], // Bubbly modal
    padding: spacing.xl,
    gap: spacing.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
  },
  fieldLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  input: {
    height: size.controlLg,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    fontSize: fontSize.md,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  switchLabel: {
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  createBtn: {
    height: size.controlLg,
    borderRadius: radius['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  tutorialShell: {
    width: '85%',
  },
  tutorialContent: {
    borderRadius: radius['3xl'],
    padding: spacing.xl,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  tutorialHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  tutorialPage: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  tutorialPageTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    marginTop: spacing.sm,
  },
  tutorialPageDesc: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: lineHeight.sm,
  },
  tutorialTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  tutorialTag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  tutorialTagText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  tutorialIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.tight,
    marginTop: spacing.sm,
  },
  tutorialIndicatorDot: {
    height: size.dotMd,
    borderRadius: radius.full,
  },
})
