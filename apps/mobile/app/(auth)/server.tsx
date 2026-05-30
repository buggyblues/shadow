import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ServerBaseUrlSettings } from '../../src/components/settings/server-base-url-settings'
import {
  BackgroundSurface,
  MobileBackButton,
  MobileNavigationBar,
  PageScroll,
} from '../../src/components/ui'

export default function AuthServerSettingsScreen() {
  const { t } = useTranslation()
  const router = useRouter()

  return (
    <BackgroundSurface>
      <MobileNavigationBar
        title={t('settings.serverUrlTitle')}
        left={<MobileBackButton onPress={() => router.back()} />}
      />
      <PageScroll compact>
        <ServerBaseUrlSettings
          notice={t('settings.serverUrlLoginNotice')}
          onSaved={() => router.replace('/(auth)/login')}
        />
      </PageScroll>
    </BackgroundSurface>
  )
}
