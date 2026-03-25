import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as Clipboard from 'expo-clipboard'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { Camera, ChevronLeft, Copy, LogOut, Save, Share2, Trash2 } from 'lucide-react-native'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import Reanimated, { FadeIn, FadeInDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Avatar } from '../../../../src/components/common/avatar'
import { LoadingScreen } from '../../../../src/components/common/loading-screen'
import { fetchApi, getImageUrl } from '../../../../src/lib/api'
import { showToast } from '../../../../src/lib/toast'
import { useAuthStore } from '../../../../src/stores/auth.store'
import { fontSize, radius, spacing, useColors } from '../../../../src/theme'

interface ServerData {
  id: string
  name: string
  slug: string | null
  description: string | null
  iconUrl: string | null
  bannerUrl: string | null
  ownerId: string
  isPublic: boolean
  inviteCode: string
}

export default function ServerSettingsScreen() {
  const { serverSlug } = useLocalSearchParams<{ serverSlug: string }>()
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const navigation = useNavigation()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const insets = useSafeAreaInsets()

  useEffect(() => {
    navigation.setOptions({ headerShown: false })
  }, [navigation])

  const { data: server, isLoading } = useQuery({
    queryKey: ['server', serverSlug],
    queryFn: () => fetchApi<ServerData>(`/api/servers/${serverSlug}`),
    enabled: !!serverSlug,
  })

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [iconUrl, setIconUrl] = useState<string | null>(null)
  const [bannerUrl, setBannerUrl] = useState<string | null>(null)
  const [isPublic, setIsPublic] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadingIcon, setUploadingIcon] = useState(false)
  const [uploadingBanner, setUploadingBanner] = useState(false)

  // Track if there are unsaved changes (excluding images which are saved immediately)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  React.useEffect(() => {
    if (server) {
      setName(server.name)
      setSlug(server.slug ?? '')
      setDescription(server.description ?? '')
      setIconUrl(server.iconUrl)
      setBannerUrl(server.bannerUrl)
      setIsPublic(server.isPublic ?? false)
      setHasUnsavedChanges(false)
    }
  }, [server])

  const isOwner = server?.ownerId === user?.id

  const handleShareInvite = useCallback(async () => {
    if (!server) return
    const inviteLink = `https://shadowob.com/app/invite/${server.inviteCode}`
    await Share.share({
      message: t('settings.inviteMessage', {
        serverName: server.name,
        defaultValue: `Join "{{serverName}}" on Shadow! ${inviteLink}`,
      }),
    })
  }, [server, t])

  // Save image immediately after upload
  const saveImageImmediately = async (field: 'iconUrl' | 'bannerUrl', url: string) => {
    if (!server) return

    try {
      await fetchApi(`/api/servers/${server.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ [field]: url }),
      })

      // Update local state
      if (field === 'iconUrl') {
        setIconUrl(url)
      } else {
        setBannerUrl(url)
      }

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['server', serverSlug] })
      queryClient.invalidateQueries({ queryKey: ['servers'] })

      showToast(t('common.saveSuccess'), 'success')
    } catch (err) {
      showToast((err as Error).message, 'error')
    }
  }

  const pickAndUploadImage = async (
    aspect: [number, number],
    setUploading: (v: boolean) => void,
    field: 'iconUrl' | 'bannerUrl',
  ) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect,
      quality: 0.8,
    })
    if (result.canceled || !result.assets[0]) return
    setUploading(true)
    try {
      const asset = result.assets[0]
      const formData = new FormData()
      formData.append('file', {
        uri: asset.uri,
        name: asset.fileName || 'image.jpg',
        type: asset.mimeType || 'image/jpeg',
      } as unknown as Blob)
      const data = await fetchApi<{ url: string }>('/api/media/upload', {
        method: 'POST',
        body: formData,
      })

      // Save immediately after upload
      await saveImageImmediately(field, data.url)
    } catch (err) {
      showToast((err as Error).message, 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    if (!server) return
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name,
        description: description || undefined,
        isPublic,
      }

      // Only include slug if it's changed and valid
      const trimmedSlug = slug.trim()
      if (trimmedSlug && trimmedSlug !== server.slug) {
        payload.slug = trimmedSlug
      }

      await fetchApi(`/api/servers/${server.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })

      queryClient.invalidateQueries({ queryKey: ['server', serverSlug] })
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      setHasUnsavedChanges(false)
      showToast(t('common.saveSuccess'), 'success')

      // Navigate to new slug if it changed
      if (trimmedSlug && trimmedSlug !== serverSlug) {
        router.replace(`/servers/${trimmedSlug}/server-settings`)
      }
    } catch (err) {
      showToast((err as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  // Track changes for unsaved indicator
  const checkForChanges = useCallback(() => {
    if (!server) return false
    return (
      name !== server.name ||
      slug !== (server.slug ?? '') ||
      description !== (server.description ?? '') ||
      isPublic !== server.isPublic
    )
  }, [server, name, slug, description, isPublic])

  useEffect(() => {
    setHasUnsavedChanges(checkForChanges())
  }, [checkForChanges])

  const leaveMutation = useMutation({
    mutationFn: () => fetchApi(`/api/servers/${server!.id}/leave`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      router.replace('/(main)')
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => fetchApi(`/api/servers/${server!.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      router.replace('/(main)')
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  const handleLeave = () => {
    Alert.alert(t('server.leaveTitle'), t('server.leaveConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('server.leave'), style: 'destructive', onPress: () => leaveMutation.mutate() },
    ])
  }

  const handleDeleteServer = () => {
    Alert.alert(t('server.deleteTitle'), t('server.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => deleteMutation.mutate() },
    ])
  }

  if (isLoading || !server) return <LoadingScreen />

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Custom header */}
      <Reanimated.View
        entering={FadeIn.duration(300)}
        style={[styles.customHeader, { backgroundColor: colors.surface, paddingTop: insets.top }]}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.5 }]}
        >
          <ChevronLeft size={26} color={colors.text} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
            服务器设置
          </Text>
          {hasUnsavedChanges && isOwner && (
            <Text style={[styles.unsavedBadge, { color: colors.textMuted }]}>未保存</Text>
          )}
        </View>
        {isOwner ? (
          <Pressable
            onPress={handleSave}
            disabled={saving || !hasUnsavedChanges}
            hitSlop={8}
            style={({ pressed }) => [
              styles.headerBtn,
              pressed && { opacity: 0.5 },
              !hasUnsavedChanges && { opacity: 0.4 },
            ]}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Save size={22} color={colors.primary} />
            )}
          </Pressable>
        ) : (
          <View style={styles.headerBtn} />
        )}
      </Reanimated.View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Banner + Icon Hero Area */}
        <Reanimated.View entering={FadeInDown.delay(100).springify()} style={styles.heroSection}>
          {isOwner ? (
            <Pressable
              onPress={() => pickAndUploadImage([3, 1], setUploadingBanner, 'bannerUrl')}
              style={[styles.bannerWrap, { backgroundColor: colors.inputBackground }]}
            >
              {bannerUrl ? (
                <Image
                  source={{ uri: getImageUrl(bannerUrl) ?? undefined }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                />
              ) : null}
              <View style={styles.bannerOverlay}>
                {uploadingBanner ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Camera size={18} color="#fff" />
                    <Text style={styles.bannerOverlayText}>
                      {bannerUrl ? '更换横幅' : '添加横幅'}
                    </Text>
                  </>
                )}
              </View>
            </Pressable>
          ) : bannerUrl ? (
            <View style={[styles.bannerWrap, { backgroundColor: colors.inputBackground }]}>
              <Image
                source={{ uri: getImageUrl(bannerUrl) ?? undefined }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
            </View>
          ) : (
            <View style={[styles.bannerWrap, { backgroundColor: `${colors.primary}15` }]} />
          )}

          {/* Avatar overlay */}
          <View style={styles.avatarSection}>
            {isOwner ? (
              <Pressable
                onPress={() => pickAndUploadImage([1, 1], setUploadingIcon, 'iconUrl')}
                style={styles.avatarWrap}
              >
                <View style={[styles.avatarBorder, { borderColor: colors.background }]}>
                  <Avatar uri={iconUrl} name={name} size={72} userId={server.id} />
                </View>
                <View style={styles.avatarOverlay}>
                  {uploadingIcon ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Camera size={14} color="#fff" />
                  )}
                </View>
              </Pressable>
            ) : (
              <View style={[styles.avatarBorder, { borderColor: colors.background }]}>
                <Avatar uri={iconUrl} name={name} size={72} userId={server.id} />
              </View>
            )}
            <View style={styles.nameMeta}>
              <Text style={[styles.serverDisplayName, { color: colors.text }]} numberOfLines={1}>
                {server.name}
              </Text>
              <Text style={[styles.slugText, { color: colors.textMuted }]}>
                {server.slug ? `@${server.slug}` : `ID: ${server.id.slice(0, 8)}`}
              </Text>
            </View>
          </View>
        </Reanimated.View>

        {/* Edit Section */}
        {isOwner && (
          <Reanimated.View
            entering={FadeInDown.delay(200).springify()}
            style={[
              styles.section,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>基本信息</Text>
            <View style={styles.fieldRow}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>名称</Text>
              <TextInput
                style={[
                  styles.fieldInput,
                  { color: colors.text, borderBottomColor: colors.border },
                ]}
                value={name}
                onChangeText={setName}
                placeholder="服务器名称"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <View style={styles.fieldRow}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>别名 (Slug)</Text>
              <TextInput
                style={[
                  styles.fieldInput,
                  { color: colors.text, borderBottomColor: colors.border },
                ]}
                value={slug}
                onChangeText={setSlug}
                placeholder="自定义 URL 别名 (可选)"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={[styles.fieldHint, { color: colors.textMuted }]}>
                设置后可通过 /servers/{'{'}slug{'}'} 访问
              </Text>
            </View>
            <View style={styles.fieldRow}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>描述</Text>
              <TextInput
                style={[
                  styles.fieldInput,
                  styles.descInput,
                  { color: colors.text, borderBottomColor: colors.border },
                ]}
                value={description}
                onChangeText={setDescription}
                multiline
                placeholder="添加服务器描述..."
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </Reanimated.View>
        )}

        {/* Visibility Toggle */}
        {isOwner && (
          <Reanimated.View
            entering={FadeInDown.delay(300).springify()}
            style={[
              styles.section,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Pressable style={styles.settingRow} onPress={() => setIsPublic(!isPublic)}>
              <View style={styles.settingInfo}>
                <Text style={[styles.settingLabel, { color: colors.text }]}>公开服务器</Text>
                <Text style={[styles.settingHint, { color: colors.textMuted }]}>
                  允许所有人发现并加入
                </Text>
              </View>
              <Switch
                value={isPublic}
                onValueChange={setIsPublic}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#fff"
              />
            </Pressable>
          </Reanimated.View>
        )}

        {/* Server Info */}
        <Reanimated.View
          entering={FadeInDown.delay(400).springify()}
          style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>服务器信息</Text>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>服务器 ID</Text>
            <Text style={[styles.infoValue, { color: colors.textMuted }]}>
              {server.id.slice(0, 12)}...
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>别名</Text>
            <Text
              style={[styles.infoValue, { color: server.slug ? colors.text : colors.textMuted }]}
            >
              {server.slug || '未设置'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>可见性</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>
              {server.isPublic ? '公开' : '私密'}
            </Text>
          </View>
          <Pressable
            style={styles.infoRow}
            onPress={() => {
              Clipboard.setStringAsync(server.inviteCode)
              showToast('已复制邀请码', 'success')
            }}
          >
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>邀请码</Text>
            <View style={styles.inviteCodeRow}>
              <Text style={[styles.codeText, { color: colors.primary }]}>{server.inviteCode}</Text>
              <Copy size={14} color={colors.textMuted} />
            </View>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.infoRow, pressed && { opacity: 0.6 }]}
            onPress={handleShareInvite}
          >
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
              {t('settings.shareInvite', '分享邀请链接')}
            </Text>
            <Share2 size={16} color={colors.primary} />
          </Pressable>
        </Reanimated.View>

        {/* Actions */}
        <Reanimated.View
          entering={FadeInDown.delay(500).springify()}
          style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          {!isOwner && (
            <Pressable
              style={({ pressed }) => [styles.actionRow, pressed && { opacity: 0.6 }]}
              onPress={handleLeave}
            >
              <LogOut size={18} color="#f23f43" />
              <Text style={styles.dangerText}>退出服务器</Text>
            </Pressable>
          )}
          {isOwner && (
            <Pressable
              style={({ pressed }) => [styles.actionRow, pressed && { opacity: 0.6 }]}
              onPress={handleDeleteServer}
            >
              <Trash2 size={18} color="#f23f43" />
              <Text style={styles.dangerText}>删除服务器</Text>
            </Pressable>
          )}
        </Reanimated.View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Custom header
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  unsavedBadge: {
    fontSize: fontSize.xs,
    fontWeight: '500',
  },

  content: { paddingBottom: spacing['3xl'] },

  // Hero
  heroSection: {
    marginBottom: spacing.lg,
  },
  bannerWrap: {
    height: 140,
    position: 'relative',
    overflow: 'hidden',
  },
  bannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  bannerOverlayText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  avatarSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    marginTop: -36,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatarBorder: {
    borderRadius: 40,
    borderWidth: 3,
  },
  avatarOverlay: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameMeta: {
    flex: 1,
    marginTop: 36,
    gap: 2,
  },
  serverDisplayName: {
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  slugText: {
    fontSize: fontSize.xs,
  },

  // Sections
  section: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },

  // Form fields
  fieldRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  fieldLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    marginBottom: 4,
  },
  fieldHint: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  fieldInput: {
    fontSize: fontSize.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  descInput: {
    minHeight: 60,
    textAlignVertical: 'top',
  },

  // Settings
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
  },
  settingInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  settingLabel: {
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  settingHint: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },

  // Info rows
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  infoLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  infoValue: {
    fontSize: fontSize.sm,
    fontFamily: 'monospace',
  },
  inviteCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  codeText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    fontFamily: 'monospace',
  },

  // Actions
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  dangerText: {
    color: '#f23f43',
    fontSize: fontSize.md,
    fontWeight: '700',
  },
})
