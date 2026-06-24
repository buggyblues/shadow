import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio'
import * as Clipboard from 'expo-clipboard'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import {
  Bookmark,
  FileArchive,
  FileCode,
  FileText,
  Heart,
  type LucideIcon,
  MessageCircle,
  Pause,
  Repeat2,
  Rss,
  Send,
  Volume2,
} from 'lucide-react-native'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  type TextInput,
  View,
} from 'react-native'
import WebView from 'react-native-webview'
import { MarkdownRenderer } from '../../../src/components/chat/markdown-renderer'
import { Avatar } from '../../../src/components/common/avatar'
import { EmptyState } from '../../../src/components/common/empty-state'
import { LoadingScreen } from '../../../src/components/common/loading-screen'
import {
  ActionButton,
  AppText,
  BackgroundSurface,
  MobileBackButton,
  MobileNavigationBar,
  TextField,
} from '../../../src/components/ui'
import { useSocketEvent } from '../../../src/hooks/use-socket'
import { API_BASE, fetchApi, getImageUrl } from '../../../src/lib/api'
import { selectionHaptic } from '../../../src/lib/haptics'
import { serverChannelHref } from '../../../src/lib/routes'
import {
  encodeMobileNavigationParam,
  type ServerAppMobileConfig,
} from '../../../src/lib/server-app-mobile'
import { showToast } from '../../../src/lib/toast'
import { useChatStore } from '../../../src/stores/chat.store'
import {
  border,
  fontSize,
  iconSize,
  lineHeight,
  palette,
  radius,
  size,
  spacing,
  useColors,
} from '../../../src/theme'

type ContentKind = 'image' | 'html' | 'pdf' | 'file' | 'voice' | 'card'
type ReadState = 'unread' | 'seen' | 'opened' | 'saved' | 'hidden' | 'dismissed'
const DOCUMENT_PREVIEW_WIDTH = 720
const DOCUMENT_PREVIEW_MIN_SCALE = 0.34

interface ContentFeedPage {
  items: ContentFeedItem[]
  hasMore: boolean
  nextCursor: string | null
}

interface ContentFeedItem {
  id: string
  messageId: string
  channelId: string
  serverId: string
  title: string
  summary: string | null
  contentKinds: ContentKind[]
  primaryAttachmentId: string | null
  primaryAttachmentContentType: string | null
  primaryAttachmentSize: number | null
  primaryAttachmentDurationMs?: number | null
  attachmentIds: string[]
  cardRefs: ServerAppCardRef[]
  readState: ReadState
  publishedAt: string
  channel: {
    id: string
    name: string
    type: string
  }
  server: {
    id: string
    name: string
    slug?: string | null
    iconUrl?: string | null
  }
  author: {
    id: string
    username: string
    displayName?: string | null
    avatarUrl?: string | null
    isBot?: boolean
  }
  interactions?: {
    likeCount: number
    viewerLiked: boolean
    commentCount: number
    viewerSaved: boolean
  }
}

interface MessageThread {
  id: string
  name: string
  channelId: string
  parentMessageId: string
  creatorId?: string
  isArchived?: boolean
  createdAt: string
  updatedAt?: string
}

interface MessageThreadMessage {
  id: string
  content: string
  channelId: string
  authorId: string
  replyToId: string | null
  createdAt: string
  updatedAt: string
  author: {
    id: string
    username: string
    displayName?: string | null
    avatarUrl?: string | null
    isBot?: boolean
  } | null
}

interface ServerAppCardRef {
  kind?: string | null
  appKey?: string | null
  title?: string | null
  description?: string | null
  action?: {
    mode?: string | null
    path?: string | null
  } | null
}

interface LaunchContext {
  iframeEntry: string | null
  launchToken: string
  eventStreamPath: string
  mobile?: ServerAppMobileConfig | null
}

function withLaunchParams(entry: string, launch: LaunchContext, appPath?: string | null) {
  const url = new URL(entry)
  url.searchParams.set('shadow_launch', launch.launchToken)
  if (launch.eventStreamPath) {
    url.searchParams.set(
      'shadow_event_stream',
      `${API_BASE}${launch.eventStreamPath.startsWith('/') ? '' : '/'}${launch.eventStreamPath}`,
    )
  }
  if (appPath?.startsWith('/') && !appPath.startsWith('//')) url.hash = appPath
  return url.toString()
}

function formatTimeAgo(dateStr: string, t: (key: string, fallback: string) => string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return t('time.justNow', '刚刚')
  if (mins < 60) return `${mins}${t('time.minutesAgo', '分钟前')}`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}${t('time.hoursAgo', '小时前')}`
  const days = Math.floor(hours / 24)
  return `${days}${t('time.daysAgo', '天前')}`
}

export default function SubscriptionsScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const queryClient = useQueryClient()
  const setActiveServer = useChatStore((s) => s.setActiveServer)

  const { data, isLoading, isRefetching, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['content-feed'],
      queryFn: ({ pageParam }) => {
        const params = new URLSearchParams({ limit: '30', sort: 'latest' })
        if (typeof pageParam === 'string' && pageParam) params.set('cursor', pageParam)
        return fetchApi<ContentFeedPage>(`/api/content-feed?${params}`)
      },
      initialPageParam: '',
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      staleTime: 30_000,
    })

  useSocketEvent('content_feed:new', () => {
    queryClient.invalidateQueries({ queryKey: ['content-feed'] })
  })

  useSocketEvent('reaction:updated', () => {
    queryClient.invalidateQueries({ queryKey: ['content-feed'] })
  })

  useSocketEvent<{ threadId?: string | null }>('message:new', (message) => {
    if (!message.threadId) return
    queryClient.invalidateQueries({ queryKey: ['content-feed'] })
    queryClient.invalidateQueries({ queryKey: ['thread-messages', message.threadId] })
  })

  const recordOpened = useMutation({
    mutationFn: (feedItemId: string) =>
      fetchApi(`/api/content-feed/${feedItemId}/events`, {
        method: 'POST',
        body: JSON.stringify({ state: 'opened' }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['content-feed'] }),
  })

  const openItem = useCallback(
    async (item: ContentFeedItem) => {
      selectionHaptic()
      recordOpened.mutate(item.id)
      try {
        const appCard = item.cardRefs.find(
          (card) => card.kind === 'server_app' && typeof card.appKey === 'string',
        )
        if (appCard?.appKey) {
          const serverSlug = item.server.slug ?? item.server.id
          const launch = await fetchApi<LaunchContext>(
            `/api/servers/${serverSlug}/apps/${appCard.appKey}/launch`,
            { method: 'POST' },
          )
          if (!launch.iframeEntry) throw new Error(t('serverApps.noIframe'))
          const mobileNavigation = encodeMobileNavigationParam(launch.mobile)
          router.push({
            pathname: '/(main)/webview-preview',
            params: {
              url: encodeURIComponent(
                withLaunchParams(launch.iframeEntry, launch, appCard.action?.path),
              ),
              title: appCard.title ?? item.title,
              serverSlug,
              appKey: appCard.appKey,
              ...(appCard.action?.path ? { appPath: appCard.action.path } : {}),
              ...(mobileNavigation ? { mobileNavigation } : {}),
            },
          } as never)
          return
        }

        if (item.primaryAttachmentId) {
          const media = await fetchApi<{ url: string }>(
            `/api/attachments/${item.primaryAttachmentId}/media-url?disposition=attachment`,
          )
          router.push({
            pathname: '/(main)/media-preview',
            params: {
              url: getImageUrl(media.url) ?? media.url,
              filename: item.title,
              contentType: item.primaryAttachmentContentType ?? 'application/octet-stream',
            },
          } as never)
          return
        }

        router.push(
          serverChannelHref(item.server.slug ?? item.server.id, item.channelId, {
            messageId: item.messageId,
          }) as never,
        )
      } catch (error) {
        showToast(error instanceof Error ? error.message : t('contentFeed.openFailed'), 'error')
      }
    },
    [recordOpened, router, t],
  )

  const items = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data?.pages])

  const loadNextPage = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage()
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])

  if (isLoading) return <LoadingScreen />

  return (
    <BackgroundSurface>
      <MobileNavigationBar
        title={t('contentFeed.title')}
        left={<MobileBackButton onPress={() => router.back()} />}
      />
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={items.length === 0 ? styles.emptyContainer : styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon={Rss}
            title={t('contentFeed.empty')}
            description={t('contentFeed.emptyDesc')}
          />
        }
        onEndReached={loadNextPage}
        onEndReachedThreshold={0.35}
        renderItem={({ item }) => (
          <FeedRow
            item={item}
            timeLabel={formatTimeAgo(item.publishedAt, t)}
            onOpenServer={() => {
              setActiveServer(item.server.id)
              router.push('/(main)' as never)
            }}
            onOpenChannel={() =>
              router.push(
                serverChannelHref(item.server.slug ?? item.server.id, item.channelId, {
                  messageId: item.messageId,
                }) as never,
              )
            }
            onPress={() => openItem(item)}
          />
        )}
      />
    </BackgroundSurface>
  )
}

const CONTENT_FEED_LIKE_EMOJI = '❤️'

function FeedRow({
  item,
  timeLabel,
  onOpenServer,
  onOpenChannel,
  onPress,
}: {
  item: ContentFeedItem
  timeLabel: string
  onOpenServer: () => void
  onOpenChannel: () => void
  onPress: () => void
}) {
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [commentOpen, setCommentOpen] = useState(false)
  const [commentText, setCommentText] = useState('')
  const commentInputRef = useRef<TextInput>(null)
  const interactions = item.interactions ?? {
    likeCount: 0,
    viewerLiked: false,
    commentCount: 0,
    viewerSaved: item.readState === 'saved',
  }
  const appCard = firstServerAppCard(item)
  const hasPayload = hasContentFeedPayload(item)
  const showTitle = Boolean(appCard) || !hasPayload
  const summaryText = normalizeFeedText(item.summary)
  const displayText = summaryText || (hasPayload ? getContentFeedPlaceholderText(t, item) : '')
  const hasTextContent = showTitle || Boolean(displayText)

  const threadQuery = useQuery({
    queryKey: ['message-thread', item.messageId],
    enabled: commentOpen,
    staleTime: 15_000,
    queryFn: () =>
      fetchApi<MessageThread>(`/api/messages/${item.messageId}/thread`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
  })

  const threadMessagesQuery = useQuery({
    queryKey: ['thread-messages', threadQuery.data?.id],
    enabled: commentOpen && Boolean(threadQuery.data?.id),
    staleTime: 15_000,
    queryFn: () =>
      fetchApi<MessageThreadMessage[]>(`/api/threads/${threadQuery.data!.id}/messages?limit=20`),
  })

  const invalidateFeed = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['content-feed'] }),
    [queryClient],
  )

  const likeMutation = useMutation({
    mutationFn: () =>
      interactions.viewerLiked
        ? fetchApi(
            `/api/messages/${item.messageId}/reactions/${encodeURIComponent(CONTENT_FEED_LIKE_EMOJI)}`,
            { method: 'DELETE' },
          )
        : fetchApi(`/api/messages/${item.messageId}/reactions`, {
            method: 'POST',
            body: JSON.stringify({ emoji: CONTENT_FEED_LIKE_EMOJI }),
          }),
    onSuccess: invalidateFeed,
    onError: (error) =>
      showToast(error instanceof Error ? error.message : t('contentFeed.likeFailed'), 'error'),
  })

  const saveMutation = useMutation({
    mutationFn: () =>
      fetchApi(`/api/content-feed/${item.id}/events`, {
        method: 'POST',
        body: JSON.stringify({ state: interactions.viewerSaved ? 'seen' : 'saved' }),
      }),
    onSuccess: invalidateFeed,
    onError: (error) =>
      showToast(error instanceof Error ? error.message : t('contentFeed.saveFailed'), 'error'),
  })

  const commentMutation = useMutation({
    mutationFn: async (content: string) => {
      const thread =
        threadQuery.data ??
        (await fetchApi<MessageThread>(`/api/messages/${item.messageId}/thread`, {
          method: 'POST',
          body: JSON.stringify({}),
        }))
      const message = await fetchApi<MessageThreadMessage>(`/api/threads/${thread.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      })
      return { message, thread }
    },
    onSuccess: ({ thread }) => {
      setCommentText('')
      setCommentOpen(true)
      queryClient.setQueryData(['message-thread', item.messageId], thread)
      void queryClient.invalidateQueries({ queryKey: ['thread-messages', thread.id] })
      void invalidateFeed()
    },
    onError: (error) =>
      showToast(error instanceof Error ? error.message : t('contentFeed.commentFailed'), 'error'),
  })

  const shareItem = useCallback(async () => {
    const url = contentFeedMessageUrl(item)
    try {
      await Share.share({ message: url, url })
    } catch {
      await Clipboard.setStringAsync(url)
      showToast(t('contentFeed.shareCopied'), 'info')
    }
  }, [item, t])

  const submitComment = useCallback(() => {
    const content = commentText.trim()
    if (!content) return
    commentMutation.mutate(content)
  }, [commentMutation, commentText])

  const openAuthor = useCallback(() => {
    selectionHaptic()
    router.push(`/(main)/profile/${item.author.id}` as never)
  }, [item.author.id, router])

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? colors.messageHover : colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <SourceAvatar item={item} onOpen={onOpenServer} />
      <View style={styles.rowBody}>
        <View style={[styles.rowMeta, !hasTextContent ? styles.rowMetaCentered : null]}>
          <View style={styles.sourceLinks}>
            <Pressable
              onPress={(event) => {
                event.stopPropagation()
                selectionHaptic()
                onOpenServer()
              }}
              accessibilityRole="link"
              style={styles.sourceButton}
            >
              <AppText
                variant="label"
                numberOfLines={1}
                style={[styles.source, { color: colors.text }]}
              >
                {item.server.name}
              </AppText>
            </Pressable>
            <AppText variant="label" style={{ color: colors.textMuted }}>
              /
            </AppText>
            <Pressable
              onPress={(event) => {
                event.stopPropagation()
                selectionHaptic()
                onOpenChannel()
              }}
              accessibilityRole="link"
              style={styles.sourceButton}
            >
              <AppText
                variant="label"
                numberOfLines={1}
                style={[styles.source, { color: colors.textSecondary }]}
              >
                #{item.channel.name}
              </AppText>
            </Pressable>
          </View>
          <AppText
            variant="label"
            numberOfLines={1}
            style={[styles.timeLabel, { color: colors.textMuted }]}
          >
            {timeLabel}
          </AppText>
        </View>
        {showTitle ? (
          <AppText
            variant="bodyStrong"
            numberOfLines={3}
            style={[styles.title, { color: colors.text }]}
          >
            {appCard?.title ?? item.title}
          </AppText>
        ) : null}
        {displayText ? (
          <AppText
            numberOfLines={5}
            style={[
              styles.summary,
              !showTitle ? styles.summaryStandalone : null,
              { color: colors.textSecondary },
            ]}
          >
            {displayText}
          </AppText>
        ) : null}
        <FeedAttachmentPreview item={item} onOpen={onPress} />
        <View style={styles.interactionRow}>
          <View style={styles.actionButtonGroup}>
            <TimelineActionButton
              icon={Heart}
              active={interactions.viewerLiked}
              count={interactions.likeCount}
              label={t('contentFeed.like')}
              onPress={() => {
                selectionHaptic()
                likeMutation.mutate()
              }}
            />
            <TimelineActionButton
              icon={MessageCircle}
              active={commentOpen}
              count={interactions.commentCount}
              label={t('contentFeed.comment')}
              onPress={() => {
                selectionHaptic()
                if (!commentOpen) requestAnimationFrame(() => commentInputRef.current?.focus())
                setCommentOpen((value) => !value)
              }}
            />
            <TimelineActionButton
              icon={Bookmark}
              active={interactions.viewerSaved}
              label={t('contentFeed.save')}
              onPress={() => {
                selectionHaptic()
                saveMutation.mutate()
              }}
            />
            <TimelineActionButton
              icon={Repeat2}
              label={t('contentFeed.share')}
              onPress={() => {
                selectionHaptic()
                void shareItem()
              }}
            />
          </View>
          <FeedAuthorBadge item={item} onOpen={openAuthor} />
        </View>
        {commentOpen ? (
          <View style={styles.commentPanel}>
            <FeedReplies
              replies={threadMessagesQuery.data ?? []}
              isLoading={threadQuery.isLoading || threadMessagesQuery.isLoading}
            />
            <View style={styles.commentBox}>
              <TextField
                ref={commentInputRef}
                value={commentText}
                onChangeText={setCommentText}
                placeholder={t('contentFeed.commentPlaceholder')}
                containerStyle={styles.commentField}
                inputStyle={styles.commentInput}
                returnKeyType="send"
                onSubmitEditing={submitComment}
                right={
                  <ActionButton
                    label={t('contentFeed.sendComment')}
                    icon={Send}
                    tone={commentText.trim() ? 'primary' : 'glass'}
                    size="xs"
                    loading={commentMutation.isPending}
                    disabled={!commentText.trim() || commentMutation.isPending}
                    onPress={(event) => {
                      event.stopPropagation()
                      submitComment()
                    }}
                  />
                }
              />
            </View>
          </View>
        ) : null}
      </View>
    </Pressable>
  )
}

function FeedAuthorBadge({ item, onOpen }: { item: ContentFeedItem; onOpen: () => void }) {
  const authorName =
    item.author.displayName?.trim() || item.author.username?.trim() || item.author.id

  return (
    <Pressable
      onPress={(event) => {
        event.stopPropagation()
        onOpen()
      }}
      accessibilityRole="link"
      accessibilityLabel={authorName}
      style={({ pressed }) => [styles.creatorAvatarButton, { opacity: pressed ? 0.72 : 1 }]}
    >
      <Avatar
        uri={item.author.avatarUrl}
        name={authorName}
        userId={item.author.id}
        size={size.avatarSm}
      />
    </Pressable>
  )
}

function FeedReplies({
  replies,
  isLoading,
}: {
  replies: MessageThreadMessage[]
  isLoading: boolean
}) {
  const colors = useColors()
  if (isLoading || replies.length === 0) return null

  return (
    <View style={styles.commentList}>
      {replies.map((reply) => {
        const name = reply.author?.displayName || reply.author?.username || reply.authorId
        const avatarUrl = getImageUrl(reply.author?.avatarUrl ?? null)
        const initial = name.trim().slice(0, 1) || '?'
        return (
          <View key={reply.id} style={styles.commentRow}>
            <View
              style={[
                styles.commentAvatar,
                { backgroundColor: colors.inputBackground, borderColor: colors.border },
              ]}
            >
              {avatarUrl ? (
                <Image
                  source={{ uri: avatarUrl }}
                  contentFit="cover"
                  style={styles.commentAvatarImage}
                />
              ) : (
                <AppText
                  variant="label"
                  style={[styles.commentAvatarText, { color: colors.textSecondary }]}
                >
                  {initial.toUpperCase()}
                </AppText>
              )}
            </View>
            <View style={[styles.commentBubble, { backgroundColor: colors.inputBackground }]}>
              <AppText
                variant="label"
                numberOfLines={1}
                style={[styles.commentAuthor, { color: colors.text }]}
              >
                {name}
              </AppText>
              <AppText style={[styles.commentContent, { color: colors.textSecondary }]}>
                {reply.content}
              </AppText>
            </View>
          </View>
        )
      })}
    </View>
  )
}

function SourceAvatar({ item, onOpen }: { item: ContentFeedItem; onOpen: () => void }) {
  return (
    <Pressable
      onPress={(event) => {
        event.stopPropagation()
        selectionHaptic()
        onOpen()
      }}
      accessibilityRole="link"
      style={styles.avatar}
    >
      <Avatar
        uri={item.server.iconUrl}
        name={item.server.name}
        userId={item.server.id}
        size={size.avatarLg}
        shape="server"
      />
    </Pressable>
  )
}

function TimelineActionButton({
  icon: Icon,
  active,
  count,
  label,
  onPress,
}: {
  icon: LucideIcon
  active?: boolean
  count?: number
  label: string
  onPress: () => void
}) {
  const colors = useColors()
  const color = active ? colors.primary : colors.textMuted

  return (
    <Pressable
      onPress={(event) => {
        event.stopPropagation()
        onPress()
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.actionButton,
        {
          backgroundColor: active
            ? colors.surfaceHover
            : pressed
              ? colors.inputBackground
              : 'transparent',
          opacity: pressed ? 0.78 : 1,
        },
      ]}
    >
      <Icon size={18} color={color} fill={active ? color : 'none'} />
      {typeof count === 'number' && count > 0 ? (
        <AppText variant="label" style={[styles.actionCount, { color }]}>
          {count}
        </AppText>
      ) : null}
    </Pressable>
  )
}

type FeedPreviewKind = 'image' | 'video' | 'audio' | 'markdown' | 'html' | 'app' | 'file'

function FeedAttachmentPreview({ item, onOpen }: { item: ContentFeedItem; onOpen: () => void }) {
  const colors = useColors()
  const previewKind = getFeedPreviewKind(item)
  const [htmlPreviewFailed, setHtmlPreviewFailed] = useState(false)
  const [htmlPreviewWidth, setHtmlPreviewWidth] = useState<number>(size.contentMaxWidth)
  const needsMedia = needsInlineMediaUrl(previewKind)
  const mediaQuery = useQuery({
    queryKey: ['content-feed-attachment-media', item.primaryAttachmentId, previewKind],
    enabled: Boolean(item.primaryAttachmentId) && needsMedia,
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    queryFn: async () => {
      if (!item.primaryAttachmentId) throw new Error('missing attachment')
      return resolveInlineMediaUrl(item.primaryAttachmentId, previewKind)
    },
  })
  const mediaUrl = getImageUrl(mediaQuery.data?.url) ?? mediaQuery.data?.url ?? null
  useEffect(() => {
    setHtmlPreviewFailed(false)
  }, [mediaUrl])
  const markdownQuery = useQuery({
    queryKey: ['content-feed-markdown-preview', mediaUrl],
    enabled: previewKind === 'markdown' && Boolean(mediaUrl),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    queryFn: async () => {
      const response = await fetch(mediaUrl as string)
      if (!response.ok) throw new Error('failed to load markdown preview')
      return (await response.text()).slice(0, 1600)
    },
  })
  const htmlQuery = useQuery({
    queryKey: ['content-feed-html-preview', mediaUrl],
    enabled: previewKind === 'html' && Boolean(mediaUrl),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    queryFn: async () => {
      const response = await fetch(mediaUrl as string)
      if (!response.ok) throw new Error('failed to load html preview')
      return (await response.text()).slice(0, 120_000)
    },
  })
  const isMobileHtmlPreview = htmlQuery.data ? isMobileOptimizedHtml(htmlQuery.data) : false
  const htmlPreviewInjectedStyle = useMemo(
    () => buildHtmlPreviewInjectedStyle(htmlQuery.data ?? '', htmlPreviewWidth),
    [htmlQuery.data, htmlPreviewWidth],
  )

  if (previewKind === 'app') return <ServerAppPreview item={item} />
  if (needsMedia && !mediaUrl) {
    return <View style={[styles.previewSkeleton, { backgroundColor: colors.inputBackground }]} />
  }
  if (previewKind === 'image' && mediaUrl) {
    return (
      <Image
        source={{ uri: mediaUrl }}
        contentFit="cover"
        transition={120}
        style={[styles.mediaPreview, { backgroundColor: colors.inputBackground }]}
      />
    )
  }
  if (previewKind === 'video' && mediaUrl) {
    return (
      <View
        pointerEvents="none"
        style={[
          styles.mediaPreview,
          styles.webPreviewFrame,
          { backgroundColor: colors.inputBackground },
        ]}
      >
        <WebView
          scrollEnabled={false}
          bounces={false}
          source={{ html: buildVideoPreviewHtml(mediaUrl, colors.inputBackground) }}
          style={styles.webPreview}
        />
        <View style={styles.playOverlay}>
          <View style={[styles.playButton, { backgroundColor: colors.overlay }]} />
          <View style={[styles.playTriangle, { borderLeftColor: colors.background }]} />
        </View>
      </View>
    )
  }
  if (previewKind === 'audio' && mediaUrl) {
    return (
      <AudioTimelinePlayer
        seed={item.id}
        mediaUrl={mediaUrl}
        durationMs={item.primaryAttachmentDurationMs}
      />
    )
  }
  if (previewKind === 'html' && mediaUrl) {
    if (htmlPreviewFailed || htmlQuery.isError) return <FeedFileCard item={item} onOpen={onOpen} />
    return (
      <Pressable
        onPress={(event) => {
          event.stopPropagation()
          selectionHaptic()
          onOpen()
        }}
        style={({ pressed }) => [
          styles.htmlPreviewFrame,
          isMobileHtmlPreview ? styles.htmlMobilePreviewFrame : null,
          {
            backgroundColor: colors.surface,
            borderColor: pressed ? colors.primary : colors.border,
          },
        ]}
        onLayout={(event) => {
          const nextWidth = Math.round(event.nativeEvent.layout.width)
          if (nextWidth > 0 && Math.abs(nextWidth - htmlPreviewWidth) > 1) {
            setHtmlPreviewWidth(nextWidth)
          }
        }}
      >
        {htmlQuery.isLoading || !htmlQuery.data ? (
          <View style={[styles.webPreviewLoading, { backgroundColor: colors.inputBackground }]}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : (
          <WebView
            pointerEvents="none"
            key={`${item.primaryAttachmentId ?? item.id}:${mediaUrl}:${htmlPreviewWidth}`}
            source={{
              html: buildHtmlPreviewDocument(htmlQuery.data, mediaUrl, htmlPreviewWidth),
              baseUrl: mediaUrl,
            }}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            scrollEnabled={false}
            bounces={false}
            startInLoadingState
            injectedJavaScript={htmlPreviewInjectedStyle}
            renderLoading={() => (
              <View style={[styles.webPreviewLoading, { backgroundColor: colors.inputBackground }]}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            )}
            onError={() => setHtmlPreviewFailed(true)}
            onHttpError={() => setHtmlPreviewFailed(true)}
            style={styles.webPreview}
          />
        )}
      </Pressable>
    )
  }
  if (previewKind === 'markdown') {
    const text = markdownQuery.data ?? item.summary ?? ''
    return text ? <MarkdownSnippet text={text} /> : null
  }
  if (item.primaryAttachmentId) return <FeedFileCard item={item} onOpen={onOpen} />
  return null
}

function ServerAppPreview({ item }: { item: ContentFeedItem }) {
  const colors = useColors()
  const appCard = firstServerAppCard(item)
  if (!appCard) return null

  return (
    <View
      style={[
        styles.fileCard,
        { borderColor: colors.border, backgroundColor: colors.inputBackground },
      ]}
    >
      <AppText variant="bodyStrong" numberOfLines={2} style={{ color: colors.text }}>
        {appCard.title ?? item.title}
      </AppText>
      {appCard.description ? (
        <AppText
          variant="label"
          numberOfLines={3}
          style={[styles.previewMeta, { color: colors.textMuted }]}
        >
          {appCard.description}
        </AppText>
      ) : null}
    </View>
  )
}

function MarkdownSnippet({ text }: { text: string }) {
  const colors = useColors()
  return (
    <View
      style={[
        styles.fileCard,
        styles.markdownPreviewCard,
        { borderColor: colors.border, backgroundColor: colors.inputBackground },
      ]}
    >
      <MarkdownRenderer content={text} selectable={false} />
    </View>
  )
}

function AudioTimelinePlayer({
  seed,
  mediaUrl,
  durationMs,
}: {
  seed: string
  mediaUrl: string
  durationMs?: number | null
}) {
  const colors = useColors()
  const playerRef = useRef<AudioPlayer | null>(null)
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const bars = waveformBars(seed)
  const activeIndex = Math.floor(progress * bars.length)

  useEffect(() => {
    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current)
      playerRef.current?.pause()
      playerRef.current = null
    }
  }, [])

  const clearProgressTimer = useCallback(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current)
      progressTimerRef.current = null
    }
  }, [])

  const startProgressTimer = useCallback(
    (player: AudioPlayer) => {
      clearProgressTimer()
      progressTimerRef.current = setInterval(() => {
        const total = player.duration || (durationMs ?? 0) / 1000 || 1
        const ratio = Math.min(1, player.currentTime / total)
        setProgress(ratio)
        if (ratio >= 0.98 && total > 0) {
          clearProgressTimer()
          setPlaying(false)
          setProgress(1)
        }
      }, 180)
    },
    [clearProgressTimer, durationMs],
  )

  const togglePlayback = useCallback(async () => {
    let player = playerRef.current
    if (!player) {
      player = createAudioPlayer(mediaUrl)
      playerRef.current = player
    }
    if (playing) {
      player.pause()
      setPlaying(false)
      clearProgressTimer()
      return
    }
    await setAudioModeAsync({ playsInSilentMode: true })
    player.play()
    setPlaying(true)
    startProgressTimer(player)
  }, [clearProgressTimer, mediaUrl, playing, startProgressTimer])

  return (
    <View style={styles.voiceAttachmentBlock}>
      <Pressable
        onPress={() => {
          selectionHaptic()
          void togglePlayback()
        }}
        style={({ pressed }) => [
          styles.voiceBubble,
          {
            backgroundColor: pressed ? colors.surfaceHover : colors.inputBackground,
            borderColor: playing ? colors.primary : colors.border,
          },
        ]}
      >
        <AppText variant="label" style={[styles.voiceDuration, { color: colors.text }]}>
          {formatAudioTime((durationMs ?? 0) / 1000)}
        </AppText>
        <View style={styles.voiceWaveform}>
          {bars.slice(0, 28).map((height, index) => {
            const isActive = index <= activeIndex
            return (
              <View
                key={`${seed}-${index}`}
                style={[
                  styles.voiceWaveformBar,
                  {
                    height: Math.max(6, Math.round(height * 0.2)),
                    backgroundColor: isActive ? colors.primary : colors.textMuted,
                  },
                ]}
              />
            )
          })}
        </View>
        <View style={[styles.voicePlayButton, { backgroundColor: colors.primary }]}>
          {playing ? (
            <Pause size={iconSize.md} color={palette.foundation} fill={palette.foundation} />
          ) : (
            <Volume2 size={iconSize.lg} color={palette.foundation} />
          )}
        </View>
      </Pressable>
    </View>
  )
}

function FeedFileCard({ item, onOpen }: { item: ContentFeedItem; onOpen: () => void }) {
  const colors = useColors()
  const contentType = item.primaryAttachmentContentType ?? 'application/octet-stream'
  const FileIcon = getFeedFileIcon(contentType)
  const accentColor = getFeedFileAccentColor(contentType, colors.primary)
  const ext = getFileExtension(item.title)

  return (
    <Pressable
      onPress={(event) => {
        event.stopPropagation()
        selectionHaptic()
        onOpen()
      }}
      style={({ pressed }) => [
        styles.fileAttachmentCard,
        {
          borderColor: colors.border,
          backgroundColor: pressed ? colors.surfaceHover : colors.surface,
        },
      ]}
    >
      <View style={[styles.fileIconWrap, { backgroundColor: colors.inputBackground }]}>
        <FileIcon size={iconSize.xl} color={accentColor} />
      </View>
      <View style={styles.fileInfo}>
        <AppText
          variant="bodyStrong"
          numberOfLines={1}
          style={[styles.fileName, { color: colors.text }]}
        >
          {item.title}
        </AppText>
        <View style={styles.fileMetaRow}>
          {ext ? (
            <AppText variant="label" style={[styles.fileExt, { color: accentColor }]}>
              {ext}
            </AppText>
          ) : null}
          {item.primaryAttachmentSize ? (
            <AppText variant="label" style={[styles.fileMeta, { color: colors.textMuted }]}>
              {formatFileSize(item.primaryAttachmentSize)}
            </AppText>
          ) : null}
        </View>
      </View>
    </Pressable>
  )
}

function firstServerAppCard(item: ContentFeedItem) {
  return item.cardRefs.find(
    (card) => card.kind === 'server_app' && typeof card.appKey === 'string' && card.appKey,
  )
}

function getFeedPreviewKind(item: ContentFeedItem): FeedPreviewKind {
  const contentType = (item.primaryAttachmentContentType ?? '').toLowerCase()
  const title = item.title.toLowerCase()
  if (contentType.startsWith('image/') || item.contentKinds.includes('image')) return 'image'
  if (contentType.startsWith('video/')) return 'video'
  if (contentType.startsWith('audio/') || item.contentKinds.includes('voice')) return 'audio'
  if (contentType.includes('html') || title.endsWith('.html') || title.endsWith('.htm'))
    return 'html'
  if (
    contentType.includes('markdown') ||
    title.endsWith('.md') ||
    title.endsWith('.markdown') ||
    title.endsWith('.mdown')
  ) {
    return 'markdown'
  }
  if (firstServerAppCard(item)) return 'app'
  return 'file'
}

function normalizeFeedText(value?: string | null) {
  return (value ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasContentFeedPayload(item: ContentFeedItem) {
  return Boolean(
    item.primaryAttachmentId ||
      item.attachmentIds.length > 0 ||
      item.cardRefs.length > 0 ||
      item.contentKinds.length > 0,
  )
}

function getContentFeedPlaceholderText(t: (key: string) => string, item: ContentFeedItem) {
  const kind = getFeedPreviewKind(item)
  if (kind === 'image') return t('contentFeed.placeholderImage')
  if (kind === 'video') return t('contentFeed.placeholderVideo')
  if (kind === 'audio') return t('contentFeed.placeholderAudio')
  if (kind === 'html') return t('contentFeed.placeholderHtml')
  if (kind === 'markdown') return t('contentFeed.placeholderMarkdown')
  if (kind === 'app') return t('contentFeed.placeholderApp')
  const contentType = (item.primaryAttachmentContentType ?? '').toLowerCase()
  if (contentType.includes('pdf') || item.contentKinds.includes('pdf')) {
    return t('contentFeed.placeholderPdf')
  }
  return t('contentFeed.placeholderFile')
}

function needsInlineMediaUrl(kind: FeedPreviewKind) {
  return (
    kind === 'image' ||
    kind === 'video' ||
    kind === 'audio' ||
    kind === 'markdown' ||
    kind === 'html'
  )
}

async function resolveInlineMediaUrl(attachmentId: string, kind: FeedPreviewKind) {
  if (kind === 'image') {
    try {
      return await fetchApi<{ url: string }>(
        `/api/attachments/${attachmentId}/media-url?disposition=inline&variant=preview`,
      )
    } catch {
      return fetchApi<{ url: string }>(
        `/api/attachments/${attachmentId}/media-url?disposition=inline`,
      )
    }
  }
  return fetchApi<{ url: string }>(`/api/attachments/${attachmentId}/media-url?disposition=inline`)
}

function buildVideoPreviewHtml(url: string, backgroundColor: string) {
  const src = escapeHtmlAttribute(url)
  const fillRule = 'width:' + '100%;height:' + '100%;'
  const resetRule = 'margin:' + '0;'
  const style = `${fillRule}background:${backgroundColor};overflow:hidden`
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{${resetRule}${style}}video{${fillRule}object-fit:cover;background:${backgroundColor}}</style></head><body><video src="${src}" muted playsinline preload="metadata"></video></body></html>`
}

function isMobileOptimizedHtml(html: string) {
  const viewportTag = html
    .match(/<meta\b[^>]*>/gi)
    ?.find((tag) => /\bname\s*=\s*["']viewport["']/i.test(tag))
  if (!viewportTag) return false
  return /\bcontent\s*=\s*["'][^"']*\bwidth\s*=\s*device-width\b/i.test(viewportTag)
}

function getHtmlPreviewLayout(html: string, frameWidth: number) {
  const width = Math.max(1, Math.round(frameWidth || size.contentMaxWidth))
  if (isMobileOptimizedHtml(html)) {
    return {
      documentHeight: Math.ceil(width * (4 / 3)),
      documentWidth: width,
      isMobile: true,
      scale: 1,
    }
  }
  const scale = Math.min(1, Math.max(DOCUMENT_PREVIEW_MIN_SCALE, width / DOCUMENT_PREVIEW_WIDTH))
  const frameHeight = width * (4 / 3)
  const documentHeight = Math.max(960, Math.ceil(frameHeight / scale))
  return {
    documentHeight,
    documentWidth: DOCUMENT_PREVIEW_WIDTH,
    isMobile: false,
    scale,
  }
}

function buildHtmlPreviewInjectedStyle(html: string, frameWidth: number) {
  const { documentHeight, documentWidth, isMobile, scale } = getHtmlPreviewLayout(html, frameWidth)
  if (isMobile) {
    return `document.documentElement.style.overflow='hidden';document.body.style.margin='0';document.body.style.overflow='hidden';document.body.style.width='100%';document.body.style.minWidth='0';document.body.style.minHeight='${documentHeight}px';true;`
  }
  return `document.documentElement.style.overflow='hidden';document.body.style.margin='0';document.body.style.overflow='hidden';document.body.style.transform='scale(${scale})';document.body.style.transformOrigin='top left';document.body.style.width='${documentWidth}px';document.body.style.minWidth='${documentWidth}px';document.body.style.minHeight='${documentHeight}px';true;`
}

function buildHtmlPreviewDocument(html: string, baseUrl: string, frameWidth: number) {
  const { documentHeight, documentWidth, isMobile, scale } = getHtmlPreviewLayout(html, frameWidth)
  const headMarkup = [
    '<meta charset="utf-8">',
    `<meta name="viewport" content="${isMobile ? 'width=device-width' : `width=${documentWidth}`}, initial-scale=1">`,
    `<base href="${escapeHtmlAttribute(baseUrl)}">`,
    '<style id="shadow-mobile-html-preview-scale">',
    'html{margin:calc(0px)!important;overflow:hidden!important;background:white!important;}',
    isMobile
      ? `body{margin:calc(0px)!important;overflow:hidden!important;background:white!important;width:calc(100%)!important;min-width:calc(0px)!important;min-height:${documentHeight}px!important;}`
      : `body{margin:calc(0px)!important;overflow:hidden!important;background:white!important;transform:scale(${scale});transform-origin:top left;width:${documentWidth}px!important;min-width:${documentWidth}px!important;min-height:${documentHeight}px!important;}`,
    '*{box-sizing:border-box;}',
    'img,video,canvas,svg{max-width:calc(100%);height:auto;}',
    'iframe{max-width:calc(100%);}',
    '</style>',
  ].join('')
  const trimmed = html.trim()
  const sanitized = trimmed.replace(/<meta\b(?=[^>]*\bname\s*=\s*["']viewport["'])[^>]*>/gi, '')
  if (!sanitized) return `<!doctype html><html><head>${headMarkup}</head><body></body></html>`

  if (/<head\b[^>]*>/i.test(sanitized)) {
    return sanitized.replace(/<head\b([^>]*)>/i, `<head$1>${headMarkup}`)
  }
  if (/<html\b[^>]*>/i.test(sanitized)) {
    return sanitized.replace(/<html\b([^>]*)>/i, `<html$1><head>${headMarkup}</head>`)
  }
  return `<!doctype html><html><head>${headMarkup}</head><body>${sanitized}</body></html>`
}

function escapeHtmlAttribute(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function getFeedFileIcon(contentType: string) {
  if (
    contentType.includes('zip') ||
    contentType.includes('archive') ||
    contentType.includes('tar') ||
    contentType.includes('rar')
  ) {
    return FileArchive
  }
  if (
    contentType.includes('json') ||
    contentType.includes('javascript') ||
    contentType.includes('typescript') ||
    contentType.includes('xml') ||
    contentType.includes('html') ||
    contentType.includes('css') ||
    contentType.includes('python') ||
    contentType.includes('java') ||
    contentType.includes('ruby') ||
    contentType.includes('go') ||
    contentType.includes('rust') ||
    contentType.includes('swift') ||
    contentType.includes('kotlin')
  ) {
    return FileCode
  }
  return FileText
}

function getFeedFileAccentColor(contentType: string, fallback: string) {
  if (
    contentType.includes('zip') ||
    contentType.includes('archive') ||
    contentType.includes('tar') ||
    contentType.includes('rar')
  ) {
    return fallback
  }
  if (contentType.includes('pdf')) return palette.crimson
  if (
    contentType.includes('json') ||
    contentType.includes('javascript') ||
    contentType.includes('typescript') ||
    contentType.includes('xml') ||
    contentType.includes('html') ||
    contentType.includes('css') ||
    contentType.includes('python') ||
    contentType.includes('java')
  ) {
    return palette.cyan
  }
  if (
    contentType.includes('word') ||
    contentType.includes('document') ||
    contentType.includes('text/')
  ) {
    return palette.indigo
  }
  if (contentType.includes('spreadsheet') || contentType.includes('excel')) return palette.emerald
  return fallback
}

function getFileExtension(filename: string) {
  const parts = filename.split('.')
  return parts.length > 1 ? parts[parts.length - 1]!.toUpperCase() : ''
}

function waveformBars(seed: string) {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 9973
  }
  return Array.from({ length: 30 }, (_, index) => {
    hash = (hash * 37 + index * 17 + 23) % 9973
    return 18 + (hash % 72)
  })
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function formatAudioTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const total = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(total / 60)
  const remainder = total % 60
  return `${minutes}:${remainder.toString().padStart(2, '0')}`
}

function contentFeedMessageUrl(item: ContentFeedItem) {
  const serverSlug = item.server.slug ?? item.server.id
  return `${API_BASE}/servers/${encodeURIComponent(serverSlug)}/channels/${encodeURIComponent(item.channelId)}?msg=${encodeURIComponent(item.messageId)}`
}

const styles = StyleSheet.create({
  list: {
    paddingTop: spacing.xs,
    paddingBottom: size.tabBar + spacing['6xl'],
  },
  emptyContainer: {
    flexGrow: 1,
    paddingBottom: size.tabBar + spacing['6xl'],
  },
  row: {
    borderBottomWidth: border.hairline,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    gap: spacing.md,
  },
  avatar: {
    width: size.avatarLg,
    height: size.avatarLg,
    borderRadius: radius['2lg'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.xxs,
  },
  rowMetaCentered: {
    minHeight: size.avatarLg,
    alignItems: 'center',
  },
  timeLabel: {
    fontSize: fontSize.xs,
    flexShrink: 0,
  },
  title: {
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontWeight: '800',
  },
  summary: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    fontWeight: '600',
    lineHeight: lineHeight.md,
  },
  summaryStandalone: {
    marginTop: spacing.none,
  },
  source: {
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  sourceLinks: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sourceButton: {
    flexShrink: 1,
    minWidth: 0,
  },
  interactionRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  actionButtonGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    flexShrink: 0,
  },
  creatorAvatarButton: {
    maxWidth: size.chipMaxWidth,
    flexShrink: 1,
    minWidth: 0,
    minHeight: size.controlXs,
    paddingLeft: spacing.xxs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  actionButton: {
    minWidth: size.iconButtonMd,
    minHeight: size.iconButtonSm,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
  },
  actionCount: {
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  commentBox: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  commentField: {
    flex: 1,
  },
  commentPanel: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  commentList: {
    gap: spacing.sm,
  },
  commentRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'flex-start',
  },
  commentAvatar: {
    width: size.avatarXs,
    height: size.avatarXs,
    borderRadius: radius.full,
    borderWidth: border.hairline,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAvatarImage: {
    width: '100%',
    height: '100%',
  },
  commentAvatarText: {
    fontSize: fontSize.micro,
    fontWeight: '900',
  },
  commentBubble: {
    flex: 1,
    minWidth: 0,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  commentAuthor: {
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  commentContent: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  commentInput: {
    flex: 1,
    minHeight: size.iconTile,
    fontSize: fontSize.sm,
  },
  mediaPreview: {
    width: '100%',
    height: size.contentMaxWidth / 2 + spacing.sm,
    borderRadius: radius.lg,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  webPreviewFrame: {
    position: 'relative',
  },
  htmlPreviewFrame: {
    width: '100%',
    maxWidth: size.contentMaxWidth,
    aspectRatio: 3 / 4,
    borderRadius: radius.lg,
    borderWidth: border.hairline,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  htmlMobilePreviewFrame: {
    aspectRatio: 1,
  },
  webPreview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  webPreviewLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: size.controlLg,
    height: size.controlLg,
    borderRadius: radius.full,
  },
  playTriangle: {
    position: 'absolute',
    width: spacing.none,
    height: spacing.none,
    borderTopWidth: spacing.md,
    borderBottomWidth: spacing.md,
    borderLeftWidth: spacing.lg,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    marginLeft: spacing.xs,
  },
  voiceAttachmentBlock: {
    marginTop: spacing.md,
    maxWidth: size.dialogMaxWidth,
  },
  voiceBubble: {
    minHeight: size.controlMd,
    minWidth: size.metricMinWidth,
    borderRadius: radius.lg,
    borderWidth: border.hairline,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  voicePlayButton: {
    width: size.controlSm,
    height: size.controlSm,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceWaveform: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    flex: 1,
    minWidth: size.listItemLg,
  },
  voiceWaveformBar: {
    width: size.dividerAccent,
    borderRadius: radius.full,
  },
  voiceDuration: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    minWidth: size.iconBubble,
  },
  fileCard: {
    borderWidth: border.hairline,
    borderRadius: radius.lg,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  fileAttachmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: border.hairline,
    borderRadius: radius.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  fileIconWrap: {
    width: size.controlLg,
    height: size.controlLg,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileInfo: {
    flex: 1,
    minWidth: 0,
  },
  fileName: {
    fontWeight: '800',
  },
  fileMetaRow: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  fileExt: {
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  fileMeta: {
    fontSize: fontSize.xs,
  },
  previewMeta: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
  },
  markdownPreviewCard: {
    maxHeight: size.mediaViewportMaxHeight,
    overflow: 'hidden',
  },
  previewSkeleton: {
    height: size.avatarXl + spacing['6xl'] + spacing['3xl'],
    borderRadius: radius.lg,
    marginTop: spacing.md,
  },
})
