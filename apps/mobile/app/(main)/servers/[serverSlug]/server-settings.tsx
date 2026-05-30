import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as Clipboard from 'expo-clipboard'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { Camera, Copy, LogOut, Save, Share2, Trash2 } from 'lucide-react-native'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Alert, Pressable, Share, StyleSheet, View } from 'react-native'
import { Avatar } from '../../../../src/components/common/avatar'
import { LoadingScreen } from '../../../../src/components/common/loading-screen'
import { SettingsHeader } from '../../../../src/components/common/settings-header'
import {
  AppText,
  BackgroundSurface,
  Button,
  IconButton,
  KeyValueRow,
  MenuItem,
  PageScroll,
  Section,
  SwitchRow,
  TextField,
} from '../../../../src/components/ui'
import { fetchApi, getImageUrl } from '../../../../src/lib/api'
import { showToast } from '../../../../src/lib/toast'
import { useAuthStore } from '../../../../src/stores/auth.store'
import {
  fontSize,
  iconSize,
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
  const router = useRouter()
  const navigation = useNavigation()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)

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
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  React.useEffect(() => {
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
        router.replace(`/servers/${trimmedSlug}/server-settings`)
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
    <BackgroundSurface style={styles.container}>
      <SettingsHeader
        title={t('channel.serverSettings')}
        right={
          isOwner ? (
            <IconButton
              icon={Save}
              variant="ghost"
              iconColor={colors.primary}
              disabled={saving || !hasUnsavedChanges}
              loading={saving}
              onPress={handleSave}
            />
          ) : null
        }
      />

      <PageScroll compact>
        <Section>
          <View style={styles.identityRow}>
            <Pressable
              disabled={!isOwner || uploadingIcon}
              onPress={() => pickAndUploadImage([1, 1], setUploadingIcon, 'iconUrl')}
              style={styles.avatarAction}
            >
              <Avatar
                uri={iconUrl}
                name={name || server.name}
                size={iconSize.hero}
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
            <View style={styles.identityText}>
              <AppText variant="title" style={styles.serverName} numberOfLines={1}>
                {server.name}
              </AppText>
              <AppText variant="label" tone="secondary" numberOfLines={1}>
                {server.slug ? `@${server.slug}` : server.id.slice(0, 8)}
              </AppText>
            </View>
          </View>

          {bannerUrl ? (
            <View style={styles.bannerPreview}>
              <Image
                source={{ uri: getImageUrl(bannerUrl) ?? undefined }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
            </View>
          ) : null}

          {isOwner ? (
            <Button
              variant="glass"
              size="sm"
              icon={Camera}
              style={styles.bannerButton}
              disabled={uploadingBanner}
              loading={uploadingBanner}
              onPress={() => pickAndUploadImage([3, 1], setUploadingBanner, 'bannerUrl')}
            >
              {bannerUrl ? t('server.changeBanner') : t('server.addBanner')}
            </Button>
          ) : null}
        </Section>

        {isOwner ? (
          <Section title={t('server.serverInfo')}>
            <View style={styles.formStack}>
              <TextField
                label={t('server.nameLabel')}
                placeholder={t('server.namePlaceholder')}
                value={name}
                onChangeText={setName}
                maxLength={64}
              />
              <TextField
                label={t('channel.serverSlug')}
                placeholder={t('channel.slugPlaceholder')}
                value={slug}
                onChangeText={setSlug}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TextField
                label={t('server.descriptionLabel')}
                placeholder={t('server.descriptionPlaceholder')}
                value={description}
                onChangeText={setDescription}
                multiline
                maxLength={500}
                inputStyle={styles.descriptionInput}
              />
            </View>
          </Section>
        ) : null}

        {isOwner ? (
          <Section>
            <SwitchRow
              icon={Share2}
              title={t('server.publicServer')}
              subtitle={t('server.publicServerDesc')}
              value={isPublic}
              onValueChange={setIsPublic}
            />
          </Section>
        ) : null}

        <Section title={t('channel.inviteCode')}>
          <KeyValueRow
            label={t('channel.inviteCode')}
            value={
              <Pressable style={styles.inviteCodeRow} onPress={copyInviteCode}>
                <AppText variant="bodyStrong" tone="primary" numberOfLines={1}>
                  {server.inviteCode}
                </AppText>
                <Copy size={15} color={colors.textMuted} />
              </Pressable>
            }
          />
          <MenuItem icon={Share2} title={t('settings.shareInvite')} onPress={handleShareInvite} />
        </Section>

        <Section>
          {isOwner ? (
            <MenuItem
              icon={Trash2}
              tone="danger"
              title={t('server.delete')}
              onPress={handleDeleteServer}
            />
          ) : (
            <MenuItem icon={LogOut} tone="danger" title={t('server.leave')} onPress={handleLeave} />
          )}
        </Section>
      </PageScroll>
    </BackgroundSurface>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
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
  identityText: {
    flex: 1,
    gap: spacing.xxs,
  },
  serverName: {
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  bannerPreview: {
    height: size.navSide - spacing.xs,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  bannerButton: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  formStack: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  descriptionInput: {
    minHeight: size.listItemLg + spacing.xxs,
    textAlignVertical: 'top',
  },
  inviteCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: size.compactChipMaxWidth,
  },
})
