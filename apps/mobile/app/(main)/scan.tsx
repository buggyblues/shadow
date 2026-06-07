import { CameraView, useCameraPermissions } from 'expo-camera'
import { useRouter } from 'expo-router'
import { Camera, QrCode } from 'lucide-react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { SettingsHeader } from '../../src/components/common/settings-header'
import {
  AppText,
  BackgroundSurface,
  Button,
  EmptyState,
  PageScroll,
  Section,
} from '../../src/components/ui'
import { fetchApi } from '../../src/lib/api'
import type { CloudBuddyAgent } from '../../src/lib/cloud-buddy'
import { serverChannelHref } from '../../src/lib/routes'
import { parseScannedShadowLink } from '../../src/lib/scan-links'
import { playScanSound } from '../../src/lib/sounds'
import { showToast } from '../../src/lib/toast'
import { border, radius, size, spacing, useColors } from '../../src/theme'

export default function ScanScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const [permission, requestPermission] = useCameraPermissions()
  const [scanned, setScanned] = useState(false)

  const handleScannedValue = async (value: string) => {
    const link = parseScannedShadowLink(value)
    if (!link) {
      showToast(t('scan.unsupported'), 'error')
      setScanned(false)
      return
    }

    if (link.type === 'channel') {
      await playScanSound()
      router.replace(
        serverChannelHref(link.serverSlug, link.channelId, { messageId: link.messageId }) as never,
      )
      return
    }

    if (link.type === 'invite') {
      await playScanSound()
      router.replace(`/invite/${link.code}` as never)
      return
    }

    if (link.type === 'profile') {
      await playScanSound()
      router.replace(`/(main)/profile/${link.userId}` as never)
      return
    }

    try {
      const agent = await fetchApi<CloudBuddyAgent>(`/api/agents/${link.buddyId}`)
      const buddyUserId = agent.botUser?.id
      if (!buddyUserId) throw new Error(t('scan.unsupported'))
      await playScanSound()
      router.replace(`/(main)/profile/${buddyUserId}` as never)
    } catch {
      showToast(t('scan.unsupported'), 'error')
      setScanned(false)
    }
  }

  return (
    <BackgroundSurface>
      <SettingsHeader title={t('scan.title')} />
      {!permission?.granted ? (
        <PageScroll compact>
          <EmptyState
            icon={Camera}
            title={t('scan.permissionTitle')}
            description={t('scan.permissionDesc')}
            action={
              <Button variant="primary" size="lg" onPress={requestPermission}>
                {t('scan.permissionAction')}
              </Button>
            }
          />
        </PageScroll>
      ) : (
        <View style={styles.content}>
          <Section
            title={t('scan.title')}
            subtitle={t('scan.description')}
            icon={QrCode}
            padded
            cardStyle={styles.scannerCard}
          >
            <View
              style={[
                styles.scannerFrame,
                { borderColor: colors.primary, backgroundColor: colors.background },
              ]}
            >
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={({ data }) => {
                  if (scanned) return
                  setScanned(true)
                  void handleScannedValue(data)
                }}
              />
              <View
                style={[styles.corner, styles.cornerTopLeft, { borderColor: colors.primary }]}
              />
              <View
                style={[styles.corner, styles.cornerTopRight, { borderColor: colors.primary }]}
              />
              <View
                style={[styles.corner, styles.cornerBottomLeft, { borderColor: colors.primary }]}
              />
              <View
                style={[styles.corner, styles.cornerBottomRight, { borderColor: colors.primary }]}
              />
            </View>
            <AppText variant="label" tone="secondary" style={styles.hint}>
              {t('scan.hint')}
            </AppText>
          </Section>
        </View>
      )}
    </BackgroundSurface>
  )
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    padding: spacing.lg,
  },
  scannerCard: {
    gap: spacing.lg,
  },
  scannerFrame: {
    aspectRatio: 1,
    overflow: 'hidden',
    borderRadius: radius['3xl'],
    borderWidth: border.active,
  },
  corner: {
    position: 'absolute',
    width: size.iconButtonLg,
    height: size.iconButtonLg,
    borderWidth: border.active,
  },
  cornerTopLeft: {
    top: spacing.md,
    left: spacing.md,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  cornerTopRight: {
    top: spacing.md,
    right: spacing.md,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  cornerBottomLeft: {
    bottom: spacing.md,
    left: spacing.md,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  cornerBottomRight: {
    right: spacing.md,
    bottom: spacing.md,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  hint: {
    textAlign: 'center',
  },
})
