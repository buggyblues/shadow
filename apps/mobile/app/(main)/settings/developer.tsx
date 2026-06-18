import { useRouter } from 'expo-router'
import { ExternalLink } from 'lucide-react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, StyleSheet, View } from 'react-native'
import { SettingsHeader } from '../../../src/components/common/settings-header'
import {
  AppSwitch,
  AppText,
  BackgroundSurface,
  Button,
  PageScroll,
  Section,
  StatusNotice,
  TextField,
} from '../../../src/components/ui'
import { encodeMobileNavigationParam } from '../../../src/lib/server-app-mobile'
import { spacing } from '../../../src/theme'

declare const __DEV__: boolean

const defaultDeveloperUrl = 'http://127.0.0.1:4211/shadow/server'

function normalizeDebugUrl(input: string) {
  const trimmed = input.trim()
  if (!trimmed) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString()
  } catch {
    return null
  }
}

export default function DeveloperSettingsScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const available = Platform.OS === 'ios' && __DEV__
  const [url, setUrl] = useState(defaultDeveloperUrl)
  const [immersiveNavigation, setImmersiveNavigation] = useState(true)
  const [error, setError] = useState('')

  const openPreview = () => {
    const normalizedUrl = normalizeDebugUrl(url)
    if (!normalizedUrl) {
      setError(t('settings.developerInvalidUrl'))
      return
    }
    setError('')
    const params: {
      mobileNavigation?: string
      title: string
      url: string
    } = {
      url: encodeURIComponent(normalizedUrl),
      title: t('settings.tabDeveloper'),
    }
    if (immersiveNavigation) {
      params.mobileNavigation = encodeMobileNavigationParam({
        navigation: { mode: 'immersive' },
      })
    }
    router.push({
      pathname: '/(main)/webview-preview',
      params,
    })
  }

  return (
    <BackgroundSurface>
      <SettingsHeader title={t('settings.tabDeveloper')} />
      <PageScroll compact>
        {available ? (
          <Section title={t('settings.developerGroup')} padded cardStyle={styles.panel}>
            <AppText variant="body" tone="secondary">
              {t('settings.developerDesc')}
            </AppText>
            <TextField
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              label={t('settings.developerUrlLabel')}
              placeholder={t('settings.developerUrlPlaceholder')}
              value={url}
              onChangeText={setUrl}
            />
            <View style={styles.switchRow}>
              <View style={styles.switchCopy}>
                <AppText variant="bodyStrong">{t('settings.developerImmersiveTitle')}</AppText>
                <AppText variant="label" tone="secondary">
                  {t('settings.developerImmersiveDesc')}
                </AppText>
              </View>
              <AppSwitch value={immersiveNavigation} onValueChange={setImmersiveNavigation} />
            </View>
            {error ? (
              <StatusNotice tone="danger">{error}</StatusNotice>
            ) : (
              <StatusNotice tone="primary">{t('settings.developerHint')}</StatusNotice>
            )}
            <Button icon={ExternalLink} size="lg" onPress={openPreview}>
              {t('settings.developerOpen')}
            </Button>
          </Section>
        ) : (
          <Section padded cardStyle={styles.panel}>
            <StatusNotice tone="warning">{t('settings.developerUnavailable')}</StatusNotice>
          </Section>
        )}
      </PageScroll>
    </BackgroundSurface>
  )
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.md,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  switchCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
})
