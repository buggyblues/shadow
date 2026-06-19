import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as Clipboard from 'expo-clipboard'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  Camera,
  ChevronRight,
  Copy,
  Globe2,
  LogOut,
  type LucideIcon,
  Save,
  Share2,
  Trash2,
} from 'lucide-react-native'
import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Avatar } from '../../../../src/components/common/avatar'
import { LoadingScreen } from '../../../../src/components/common/loading-screen'
import {
  AppSwitch,
  AppText,
  BackgroundSurface,
  Button,
  MobileBackButton,
  MobileNavigationBar,
  TextField,
} from '../../../../src/components/ui'
import { fetchApi, getImageUrl } from '../../../../src/lib/api'
import { selectionHaptic } from '../../../../src/lib/haptics'
import { showToast } from '../../../../src/lib/toast'
import { useAuthStore } from '../../../../src/stores/auth.store'
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
} from '../../../../src/theme'

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
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)

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
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  useEffect(() => {
    if (!server) return
    setName(server.name)
    setSlug(server.slug ?? '')
    setDescription(server.description ?? '')
    setIconUrl(server.iconUrl)
    setBannerUrl(server.bannerUrl)
    setIsPublic(server.isPublic ?? false)
    setHasUnsavedChanges(false)
  }, [server])

  const isOwner = server?.ownerId === user?.id
  const displaySlug = slug.trim() || server?.slug || server?.id.slice(0, 8) || ''
  const bannerImageUrl = getImageUrl(bannerUrl)

  const handleShareInvite = useCallback(async () => {
    if (!server) return
    const inviteLink = `https://shadowob.com/app/invite/${server.inviteCode}`
    await Share.share({
      message: t('settings.inviteMessage', {
        serverName: server.name,
        inviteLink,
      }),
    })
  }, [server, t])

  const saveImageImmediately = async (field: 'iconUrl' | 'bannerUrl', url: string) => {
    if (!server) return
    try {
      await fetchApi(`/api/servers/${server.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ [field]: url }),
      })
      if (field === 'iconUrl') setIconUrl(url)
      else setBannerUrl(url)
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
      const trimmedSlug = slug.trim()
      const payload: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || undefined,
        isPublic,
      }
      if (trimmedSlug && trimmedSlug !== server.slug) payload.slug = trimmedSlug

      await fetchApi(`/api/servers/${server.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })

      queryClient.invalidateQueries({ queryKey: ['server', serverSlug] })
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      setHasUnsavedChanges(false)
      showToast(t('common.saveSuccess'), 'success')

      if (trimmedSlug && trimmedSlug !== serverSlug) {
        router.replace(`/(main)/servers/${trimmedSlug}/server-settings` as never)
      }
    } catch (err) {
      showToast((err as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

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
    Alert.alert(t('server.leaveTitle'), t('server.leaveConfirm', { name: server?.name ?? '' }), [
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

  const copyInviteCode = async () => {
    if (!server) return
    await Clipboard.setStringAsync(server.inviteCode)
    showToast(t('common.copied'), 'success')
  }

  if (isLoading || !server) return <LoadingScreen />

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <BackgroundSurface style={styles.container}>
        <MobileNavigationBar
          title={t('channel.serverSettings')}
          left={<MobileBackButton onPress={() => router.back()} />}
        />

        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.content,
            {
              paddingBottom: isOwner
                ? insets.bottom + size.navBar + spacing['4xl']
                : spacing['4xl'],
            },
          ]}
        >
          <View style={[styles.summaryCard, { borderColor: colors.frostedBorder }]}>
            <Pressable
              disabled={!isOwner || uploadingIcon}
              onPress={() => pickAndUploadImage([1, 1], setUploadingIcon, 'iconUrl')}
              style={styles.avatarAction}
            >
              <Avatar
                uri={iconUrl}
                name={name || server.name}
                size={size.avatarLg}
                userId={server.id}
              />
              {isOwner ? (
                <View style={[styles.avatarEdit, { backgroundColor: colors.primary }]}>
                  {uploadingIcon ? (
                    <ActivityIndicator size="small" color={palette.white} />
                  ) : (
                    <Camera size={iconSize.sm} color={palette.white} />
                  )}
                </View>
              ) : null}
            </Pressable>
            <View style={styles.summaryText}>
              <AppText variant="title" numberOfLines={1}>
                {name || server.name}
              </AppText>
              <AppText variant="label" tone="secondary" numberOfLines={1}>
                @{displaySlug}
              </AppText>
            </View>
          </View>

          {isOwner ? (
            <View style={styles.section}>
              <SettingRow
                icon={Camera}
                title={t('server.changeIcon')}
                subtitle={t('server.nameLabel')}
                loading={uploadingIcon}
                onPress={() => pickAndUploadImage([1, 1], setUploadingIcon, 'iconUrl')}
              />
              <SettingRow
                icon={Camera}
                title={bannerUrl ? t('server.changeBanner') : t('server.addBanner')}
                subtitle={bannerUrl ? server.name : t('server.publicServerDesc')}
                loading={uploadingBanner}
                right={
                  bannerImageUrl ? (
                    <Image
                      source={{ uri: bannerImageUrl }}
                      style={styles.bannerThumb}
                      contentFit="cover"
                    />
                  ) : null
                }
                onPress={() => pickAndUploadImage([3, 1], setUploadingBanner, 'bannerUrl')}
              />
            </View>
          ) : null}

          {isOwner ? (
            <View style={styles.formSection}>
              <AppText variant="label" tone="secondary" style={styles.sectionTitle}>
                {t('server.serverInfo')}
              </AppText>
              <TextField
                label={t('server.nameLabel')}
                placeholder={t('server.namePlaceholder')}
                value={name}
                onChangeText={setName}
                maxLength={64}
                editable={!saving}
              />
              <TextField
                label={t('channel.serverSlug')}
                placeholder={t('channel.slugPlaceholder')}
                value={slug}
                onChangeText={setSlug}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!saving}
              />
              <TextField
                label={t('server.descriptionLabel')}
                placeholder={t('server.descriptionPlaceholder')}
                value={description}
                onChangeText={setDescription}
                multiline
                maxLength={500}
                style={styles.descriptionField}
                inputStyle={styles.descriptionInput}
                editable={!saving}
              />
            </View>
          ) : null}

          {isOwner ? (
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: isPublic }}
              onPress={() => {
                selectionHaptic()
                setIsPublic((value) => !value)
              }}
              style={({ pressed }) => [
                styles.switchCard,
                {
                  backgroundColor: pressed ? colors.surfaceHover : colors.frostedPanel,
                  borderColor: colors.frostedBorder,
                },
              ]}
            >
              <View style={[styles.rowIcon, { backgroundColor: colors.activePill }]}>
                <Globe2 size={iconSize.lg} color={colors.primary} />
              </View>
              <View style={styles.rowText}>
                <AppText variant="bodyStrong">{t('server.publicServer')}</AppText>
                <AppText variant="label" tone="secondary" numberOfLines={2}>
                  {t('server.publicServerDesc')}
                </AppText>
              </View>
              <View pointerEvents="none">
                <AppSwitch value={isPublic} onValueChange={setIsPublic} />
              </View>
            </Pressable>
          ) : null}

          <View style={styles.formSection}>
            <AppText variant="label" tone="secondary" style={styles.sectionTitle}>
              {t('channel.inviteCode')}
            </AppText>
            <SettingRow
              icon={Copy}
              title={server.inviteCode}
              subtitle={t('channel.copyInviteCode')}
              onPress={copyInviteCode}
            />
            <SettingRow
              icon={Share2}
              title={t('settings.shareInvite')}
              subtitle={server.name}
              onPress={handleShareInvite}
            />
          </View>

          <View style={styles.formSection}>
            <SettingRow
              icon={isOwner ? Trash2 : LogOut}
              title={isOwner ? t('server.delete') : t('server.leave')}
              subtitle={isOwner ? t('server.deleteTitle') : t('server.leaveTitle')}
              danger
              onPress={isOwner ? handleDeleteServer : handleLeave}
            />
          </View>
        </ScrollView>

        {isOwner ? (
          <View
            style={[
              styles.bottomBar,
              {
                paddingBottom: insets.bottom + spacing.md,
                backgroundColor: colors.frostedPanelStrong,
                borderTopColor: colors.frostedBorder,
              },
            ]}
          >
            <Button
              variant="primary"
              size="lg"
              icon={Save}
              containerStyle={styles.fullWidth}
              style={styles.fullWidth}
              disabled={saving || !hasUnsavedChanges || !name.trim()}
              loading={saving}
              onPress={handleSave}
            >
              {t('common.saveChanges')}
            </Button>
          </View>
        ) : null}
      </BackgroundSurface>
    </KeyboardAvoidingView>
  )
}

function SettingRow({
  icon: Icon,
  title,
  subtitle,
  right,
  loading,
  danger,
  onPress,
}: {
  icon: LucideIcon
  title: string
  subtitle?: string
  right?: ReactNode
  loading?: boolean
  danger?: boolean
  onPress: () => void
}) {
  const colors = useColors()
  const iconColor = danger ? colors.error : colors.primary

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        selectionHaptic()
        onPress()
      }}
      style={({ pressed }) => [
        styles.settingRow,
        {
          backgroundColor: pressed ? colors.surfaceHover : colors.frostedPanel,
          borderColor: colors.frostedBorder,
        },
      ]}
    >
      <View
        style={[
          styles.rowIcon,
          { backgroundColor: danger ? colors.toneDangerSurface : colors.activePill },
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={iconColor} />
        ) : (
          <Icon size={iconSize.lg} color={iconColor} />
        )}
      </View>
      <View style={styles.rowText}>
        {danger ? (
          <AppText variant="bodyStrong" tone="danger" numberOfLines={1}>
            {title}
          </AppText>
        ) : (
          <AppText variant="bodyStrong" numberOfLines={1}>
            {title}
          </AppText>
        )}
        {subtitle ? (
          <AppText variant="label" tone="secondary" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right ?? <ChevronRight size={iconSize.lg} color={colors.textMuted} />}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  summaryCard: {
    minHeight: size.settingsRowMinHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: border.hairline,
    borderRadius: radius['2xl'],
    padding: spacing.md,
  },
  avatarAction: {
    position: 'relative',
  },
  avatarEdit: {
    position: 'absolute',
    right: -spacing.xxs,
    bottom: -spacing.xxs,
    width: size.avatarXs,
    height: size.avatarXs,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryText: {
    flex: 1,
    minWidth: 0,
  },
  section: {
    gap: spacing.sm,
  },
  formSection: {
    gap: spacing.md,
  },
  sectionTitle: {
    paddingHorizontal: spacing.xs,
    fontWeight: '900',
  },
  settingRow: {
    minHeight: size.settingsRowMinHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: border.hairline,
    borderRadius: radius['2xl'],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowIcon: {
    width: size.iconTile,
    height: size.iconTile,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  bannerThumb: {
    width: size.thumbnailMd,
    height: size.iconTile,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  descriptionField: {
    minHeight: size.textareaMin,
    alignItems: 'flex-start',
  },
  descriptionInput: {
    minHeight: size.textareaMin - spacing.lg,
    textAlignVertical: 'top',
  },
  switchCard: {
    minHeight: size.settingsRowMinHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: border.hairline,
    borderRadius: radius['2xl'],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bottomBar: {
    borderTopWidth: border.hairline,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  fullWidth: {
    alignSelf: 'stretch',
    width: '100%',
  },
})
