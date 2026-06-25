import { generateRandomCatConfig, getCatAvatarByUserId, renderCatSvg } from '@shadowob/shared'
import * as ImagePicker from 'expo-image-picker'
import { Camera, Dices, Upload } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { fetchApi } from '../../lib/api'
import { showToast } from '../../lib/toast'
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
} from '../../theme'
import { Button, Sheet } from '../ui'
import { Avatar } from './avatar'

interface AvatarEditorProps {
  value: string | null | undefined
  userId?: string
  name?: string
  onChange: (url: string) => void
}

type DraftKind = 'existing' | 'generated' | 'uploaded'

type UploadDraft = {
  uri: string
  name: string
  type: string
}

export function AvatarEditor({ value, userId, name, onChange }: AvatarEditorProps) {
  const { t } = useTranslation()
  const colors = useColors()
  const displayName = name?.trim() || t('settings.avatarLabel')
  const [initialSvg] = useState(() =>
    userId ? getCatAvatarByUserId(userId) : renderCatSvg(generateRandomCatConfig()),
  )
  const committedValueRef = useRef<string | null | undefined>(value)

  const [previewOverride, setPreviewOverride] = useState<string | null>(null)
  const [sheetVisible, setSheetVisible] = useState(false)
  const [draftValue, setDraftValue] = useState(value || initialSvg)
  const [draftKind, setDraftKind] = useState<DraftKind>('existing')
  const [uploadDraft, setUploadDraft] = useState<UploadDraft | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (value !== committedValueRef.current) {
      committedValueRef.current = value
      setPreviewOverride(null)
    }
  }, [value])

  const displayValue = previewOverride || value || initialSvg

  const openSheet = () => {
    setDraftValue(displayValue)
    setDraftKind('existing')
    setUploadDraft(null)
    setSheetVisible(true)
  }

  const handleRandomize = () => {
    setDraftValue(renderCatSvg(generateRandomCatConfig()))
    setDraftKind('generated')
    setUploadDraft(null)
  }

  const handleUpload = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    })

    if (result.canceled || !result.assets[0]) return

    const asset = result.assets[0]
    const upload = {
      uri: asset.uri,
      name: asset.fileName || 'avatar.png',
      type: asset.mimeType || 'image/png',
    }
    setDraftValue(asset.uri)
    setDraftKind('uploaded')
    setUploadDraft(upload)
  }

  const uploadSelectedAvatar = async (draft: UploadDraft) => {
    const formData = new FormData()
    formData.append('file', draft as unknown as Blob)
    formData.append('kind', 'avatar')
    return fetchApi<{ url: string; avatarUrl?: string }>('/api/media/upload', {
      method: 'POST',
      body: formData,
    })
  }

  const handleSave = async () => {
    const unchanged = draftKind === 'existing' && Boolean(value) && draftValue === displayValue
    if (unchanged) {
      setSheetVisible(false)
      return
    }

    setSaving(true)
    try {
      if (draftKind === 'uploaded' && uploadDraft) {
        const data = await uploadSelectedAvatar(uploadDraft)
        committedValueRef.current = data.url
        setPreviewOverride(data.avatarUrl ?? data.url)
        onChange(data.url)
      } else {
        committedValueRef.current = draftValue
        setPreviewOverride(draftValue)
        onChange(draftValue)
      }
      setSheetVisible(false)
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('common.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <View style={styles.entry}>
        <Pressable
          onPress={openSheet}
          accessibilityRole="button"
          accessibilityLabel={t('settings.avatarLabel')}
          style={({ pressed }) => [
            styles.avatarButton,
            {
              borderColor: colors.border,
              opacity: pressed ? 0.72 : 1,
            },
          ]}
        >
          <Avatar
            uri={displayValue}
            name={displayName}
            size={size.avatarXl + spacing.lg}
            userId={userId}
          />
          <View style={[styles.editBadge, { backgroundColor: colors.overlay }]}>
            <Camera size={iconSize.sm} color={palette.white} />
            <Text style={styles.editBadgeText}>{t('common.edit')}</Text>
          </View>
        </Pressable>
      </View>

      <Sheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        title={t('settings.avatarLabel')}
        action={
          <Button
            variant="primary"
            size="sm"
            loading={saving}
            disabled={saving}
            onPress={handleSave}
          >
            {t('common.save')}
          </Button>
        }
      >
        <View style={styles.sheetContent}>
          <View
            style={[
              styles.previewShell,
              { backgroundColor: colors.inputBackground, borderColor: colors.border },
            ]}
          >
            <Avatar
              uri={draftValue}
              name={displayName}
              size={size.avatarXl + spacing['6xl']}
              userId={userId}
            />
          </View>

          <View style={styles.actions}>
            <Button
              variant="secondary"
              size="md"
              icon={Dices}
              containerStyle={styles.action}
              onPress={handleRandomize}
            >
              {t('agentMgmt.generateBtn')}
            </Button>
            <Button
              variant="glass"
              size="md"
              icon={Upload}
              containerStyle={styles.action}
              onPress={handleUpload}
            >
              {t('agentMgmt.uploadAvatar')}
            </Button>
          </View>
          <Button variant="ghost" size="md" onPress={() => setSheetVisible(false)}>
            {t('common.cancel')}
          </Button>
        </View>
      </Sheet>
    </>
  )
}

const styles = StyleSheet.create({
  entry: {
    alignItems: 'center',
  },
  avatarButton: {
    position: 'relative',
    borderRadius: radius.full,
    borderWidth: border.active,
  },
  editBadge: {
    position: 'absolute',
    right: -spacing.xs,
    bottom: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  editBadgeText: {
    color: palette.white,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    fontWeight: '800',
  },
  sheetContent: {
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  previewShell: {
    alignSelf: 'center',
    borderRadius: radius.full,
    borderWidth: border.active,
    padding: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  action: {
    flex: 1,
  },
})
