import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as Clipboard from 'expo-clipboard'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { Camera, Copy, Save, Trash2 } from 'lucide-react-native'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Avatar } from '../../../../src/components/common/avatar'
import { DottedBackground } from '../../../../src/components/common/dotted-background'
import { LoadingScreen } from '../../../../src/components/common/loading-screen'
import { fetchApi, getImageUrl } from '../../../../src/lib/api'
import { showToast } from '../../../../src/lib/toast'
import { useAuthStore } from '../../../../src/stores/auth.store'
import { fontSize, radius, spacing, useColors } from '../../../../src/theme'

export default function ServerSettingsScreen() {
  const { serverSlug } = useLocalSearchParams<{ serverSlug: string }>()
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const navigation = useNavigation()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)

  const { data: server, isLoading } = useQuery({
    queryKey: ['server', serverSlug],
    queryFn: () =>
      fetchApi<{
        id: string
        name: string
        slug: string | null
        description: string | null
        iconUrl: string | null
        bannerUrl: string | null
        ownerId: string
        isPublic: boolean
        inviteCode: string
      }>(`/api/servers/${serverSlug}`),
    enabled: !!serverSlug,
  })

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [iconUrl, setIconUrl] = useState<string | null>(null)
  const [bannerUrl, setBannerUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadingIcon, setUploadingIcon] = useState(false)
  const [uploadingBanner, setUploadingBanner] = useState(false)

  React.useEffect(() => {
    if (server) {
      setName(server.name)
      setDescription(server.description ?? '')
      setIconUrl(server.iconUrl)
      setBannerUrl(server.bannerUrl)
    }
  }, [server])

  const isOwner = server?.ownerId === user?.id

  // biome-ignore lint/correctness/useExhaustiveDependencies: handleSave reads state directly
  useEffect(() => {
    if (isOwner) {
      navigation.setOptions({
        headerRight: () => (
          <Pressable onPress={handleSave} disabled={saving} hitSlop={8}>
            {saving ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Save size={22} color={colors.primary} />
            )}
          </Pressable>
        ),
      })
    }
  }, [navigation, isOwner, saving, colors.primary, name, description, iconUrl, bannerUrl])

  const pickAndUploadImage = async (
    aspect: [number, number],
    setUploading: (v: boolean) => void,
    onSuccess: (url: string) => void,
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
      } as any)
      const data = await fetchApi<{ url: string }>('/api/media/upload', {
        method: 'POST',
        body: formData,
      })
      onSuccess(data.url)
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
      await fetchApi(`/api/servers/${server.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name,
          description: description || undefined,
          iconUrl,
          bannerUrl,
        }),
      })
      queryClient.invalidateQueries({ queryKey: ['server', serverSlug] })
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      showToast(t('common.saveSuccess'), 'success')
    } catch (err) {
      showToast((err as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

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

  const glassCardStyle = {
    backgroundColor: `${colors.surface}E6`,
    borderColor: colors.border,
    borderWidth: 2,
    borderRadius: 24,
  }

  return (
    <DottedBackground>
      <ScrollView style={[styles.container]} contentContainerStyle={styles.content}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('server.settings')}</Text>

        {/* Banner */}
        {isOwner && (
          <View style={[styles.bannerSection, glassCardStyle, { overflow: 'hidden', padding: 0 }]}>
            <Pressable
              onPress={() => pickAndUploadImage([3, 1], setUploadingBanner, setBannerUrl)}
              style={[styles.bannerWrap, { backgroundColor: colors.inputBackground }]}
            >
              {bannerUrl ? (
                <Image
                  source={{ uri: getImageUrl(bannerUrl) ?? undefined }}
                  style={styles.bannerImage}
                  contentFit="cover"
                />
              ) : null}
              <View style={styles.bannerOverlay}>
                {uploadingBanner ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Camera size={20} color="#fff" />
                    <Text style={styles.bannerOverlayText}>
                      {bannerUrl ? t('server.changeBanner') : t('server.addBanner')}
                    </Text>
                  </>
                )}
              </View>
            </Pressable>
          </View>
        )}

        {/* Icon */}
        {isOwner && (
          <View style={styles.iconSection}>
            <Pressable
              onPress={() => pickAndUploadImage([1, 1], setUploadingIcon, setIconUrl)}
              style={styles.iconWrap}
            >
              <Avatar uri={iconUrl} name={name} size={72} userId={server.id} />
              <View style={styles.iconOverlay}>
                {uploadingIcon ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Camera size={16} color="#fff" />
                )}
              </View>
            </Pressable>
            <Text style={[styles.iconHint, { color: colors.textMuted }]}>
              {t('server.changeIcon')}
            </Text>
          </View>
        )}

        <Text style={[styles.label, { color: colors.textSecondary }]}>{t('server.nameLabel')}</Text>
        <TextInput
          style={[
            styles.input,
            glassCardStyle,
            {
              backgroundColor: colors.inputBackground,
              color: colors.text,
              borderColor: colors.border,
            },
          ]}
          value={name}
          onChangeText={setName}
          editable={isOwner}
        />

        <Text style={[styles.label, { color: colors.textSecondary }]}>
          {t('server.descriptionLabel')}
        </Text>
        <TextInput
          style={[
            styles.input,
            styles.textArea,
            glassCardStyle,
            {
              backgroundColor: colors.inputBackground,
              color: colors.text,
              borderColor: colors.border,
            },
          ]}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          editable={isOwner}
          placeholder={t('server.descriptionPlaceholder')}
          placeholderTextColor={colors.textMuted}
        />

        {/* Server info */}
        <View style={[styles.infoCard, glassCardStyle, { backgroundColor: colors.surface }]}>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
              {t('server.idLabel')}
            </Text>
            <Text
              style={{ color: colors.textMuted, fontSize: fontSize.xs, fontFamily: 'monospace' }}
            >
              {server.id}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
              {t('server.slugLabel')}
            </Text>
            <Text style={{ color: colors.text }}>{server.slug ?? '-'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
              {t('server.publicStatus')}
            </Text>
            <Text style={{ color: colors.text }}>
              {server.isPublic ? t('common.yes') : t('common.no')}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
              {t('server.inviteCode')}
            </Text>
            <Pressable
              style={styles.inviteCodeRow}
              onPress={() => {
                Clipboard.setStringAsync(server.inviteCode)
                showToast(t('common.copied'), 'success')
              }}
            >
              <Text
                style={{
                  color: colors.text,
                  fontSize: fontSize.sm,
                  fontFamily: 'monospace',
                  fontWeight: '600',
                }}
              >
                {server.inviteCode}
              </Text>
              <Copy size={14} color={colors.textMuted} />
            </Pressable>
          </View>
        </View>

        {/* Danger zone */}
        <View style={[styles.dangerZone, { borderColor: '#f23f43' + '30' }]}>
          {!isOwner && (
            <Pressable style={styles.dangerBtn} onPress={handleLeave}>
              <Text style={{ color: '#f23f43', fontWeight: '700' }}>{t('server.leave')}</Text>
            </Pressable>
          )}
          {isOwner && (
            <Pressable style={styles.dangerBtn} onPress={handleDeleteServer}>
              <Trash2 size={16} color="#f23f43" />
              <Text style={{ color: '#f23f43', fontWeight: '700' }}>{t('server.delete')}</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </DottedBackground>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg },
  sectionTitle: { fontSize: fontSize.xl, fontWeight: '800', marginBottom: spacing.lg },
  bannerSection: { marginBottom: spacing.lg },
  bannerWrap: {
    height: 120,
    borderRadius: radius.xl,
    overflow: 'hidden',
    position: 'relative',
  },
  bannerImage: {
    ...StyleSheet.absoluteFillObject,
  },
  bannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  bannerOverlayText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  iconSection: {
    alignItems: 'center',
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  iconWrap: {
    position: 'relative',
  },
  iconOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconHint: {
    fontSize: fontSize.xs,
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  input: {
    height: 44,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.md,
    borderWidth: 1,
  },
  textArea: { height: 100, paddingTop: spacing.md, textAlignVertical: 'top' },
  infoCard: { padding: spacing.lg, borderRadius: radius.xl, marginTop: spacing.xl },
  infoRow: { marginBottom: spacing.md },
  infoLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  inviteCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dangerZone: {
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginTop: spacing.xl,
  },
  dangerBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
})
