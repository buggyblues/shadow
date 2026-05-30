import { generateRandomCatConfig, renderCatSvg } from '@shadowob/shared'
import * as ImagePicker from 'expo-image-picker'
import { Dices, Upload } from 'lucide-react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { fetchApi } from '../../lib/api'
import { showToast } from '../../lib/toast'
import { border, radius, spacing, useColors } from '../../theme'
import { Button } from '../ui'

interface AvatarEditorProps {
  value: string | null | undefined
  userId?: string
  onChange: (url: string) => void
}

export function AvatarEditor({ onChange }: AvatarEditorProps) {
  const { t } = useTranslation()
  const colors = useColors()
  const [uploading, setUploading] = useState(false)

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

      const data = await fetchApi<{ url: string; signedUrl?: string }>('/api/media/upload', {
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
      <Button
        variant="glass"
        size="sm"
        icon={Dices}
        containerStyle={styles.actionCell}
        onPress={handleRandomize}
      >
        {t('agentMgmt.presetAvatar')}
      </Button>
      <Button
        variant="glass"
        size="sm"
        icon={Upload}
        containerStyle={styles.actionCell}
        loading={uploading}
        onPress={handleUpload}
        disabled={uploading}
      >
        {t('agentMgmt.uploadAvatar')}
      </Button>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: radius.lg,
    borderWidth: border.hairline,
    padding: spacing.md,
    gap: spacing.md,
  },
  actionCell: {
    flex: 1,
  },
})
