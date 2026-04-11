import { generateRandomCatConfig, getCatAvatarByUserId, renderCatSvg } from '@shadowob/shared'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { Dices, Upload } from 'lucide-react-native'
import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { fetchApi, getImageUrl } from '../../lib/api'
import { showToast } from '../../lib/toast'
import { fontSize, radius, spacing, useColors } from '../../theme'

interface AvatarEditorProps {
  value: string | null | undefined
  userId?: string
  onChange: (url: string) => void
}

export function AvatarEditor({ value, userId, onChange }: AvatarEditorProps) {
  const { t } = useTranslation()
  const colors = useColors()
  const [uploading, setUploading] = useState(false)
  const [tab, setTab] = useState<'preset' | 'upload'>('preset')

  const resolvedSrc = getImageUrl(value) || (userId ? getCatAvatarByUserId(userId) : null)

  const handleRandomize = () => {
    const config = generateRandomCatConfig()
    const svgDataUri = renderCatSvg(config)
    onChange(svgDataUri)
  }

  const handleUpload = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })

    if (result.canceled || !result.assets[0]) return

    setUploading(true)
    try {
      const asset = result.assets[0]
      const formData = new FormData()
      formData.append('file', {
        uri: asset.uri,
        name: asset.fileName || 'avatar.jpg',
        type: asset.mimeType || 'image/jpeg',
      } as unknown as Blob)

      const data = await fetchApi<{ url: string }>('/api/media/upload', {
        method: 'POST',
        body: formData,
      })
      onChange(data.url)
      showToast(t('common.avatarUploaded'))
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('common.uploadFailed'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <View
      style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      {/* Preview */}
      <View style={styles.previewRow}>
        {resolvedSrc ? (
          <Image
            source={{ uri: resolvedSrc }}
            style={[styles.preview, { backgroundColor: colors.inputBackground }]}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[styles.preview, { backgroundColor: colors.inputBackground }]} />
        )}
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        <Pressable
          style={[
            styles.tab,
            tab === 'preset' && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
          ]}
          onPress={() => setTab('preset')}
        >
          <Text
            style={{
              color: tab === 'preset' ? colors.primary : colors.textMuted,
              fontSize: fontSize.sm,
              fontWeight: '600',
            }}
          >
            随机生成
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.tab,
            tab === 'upload' && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
          ]}
          onPress={() => setTab('upload')}
        >
          <Text
            style={{
              color: tab === 'upload' ? colors.primary : colors.textMuted,
              fontSize: fontSize.sm,
              fontWeight: '600',
            }}
          >
            上传图片
          </Text>
        </Pressable>
      </View>

      {/* Content */}
      {tab === 'preset' ? (
        <Pressable
          style={[styles.actionBtn, { backgroundColor: colors.primary }]}
          onPress={handleRandomize}
        >
          <Dices size={18} color="#fff" />
          <Text style={styles.actionBtnText}>随机生成头像</Text>
        </Pressable>
      ) : (
        <Pressable
          style={[
            styles.actionBtn,
            { backgroundColor: colors.primary, opacity: uploading ? 0.6 : 1 },
          ]}
          onPress={handleUpload}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Upload size={18} color="#fff" />
              <Text style={styles.actionBtnText}>选择图片</Text>
            </>
          )}
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.md,
  },
  previewRow: {
    alignItems: 'center',
  },
  preview: {
    width: 80,
    height: 80,
    borderRadius: 16,
  },
  tabBar: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  tab: {
    paddingBottom: spacing.xs,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  actionBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: fontSize.sm,
  },
})
