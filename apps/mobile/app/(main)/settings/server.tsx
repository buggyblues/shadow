import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { SettingsHeader } from '../../../src/components/common/settings-header'
import { ServerBaseUrlSettings } from '../../../src/components/settings/server-base-url-settings'
import { BackgroundSurface, PageScroll } from '../../../src/components/ui'
import { disconnectSocket } from '../../../src/lib/socket'
import { useAuthStore } from '../../../src/stores/auth.store'

export default function ServerSettingsScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const logout = useAuthStore((state) => state.logout)

  return (
    <BackgroundSurface>
      <SettingsHeader title={t('settings.serverUrlTitle')} />
      <PageScroll compact>
        <ServerBaseUrlSettings
          onSaved={({ changed }) => {
            if (!changed) return
            disconnectSocket()
            logout()
            router.replace('/(auth)/login')
          }}
        />
      </PageScroll>
    </BackgroundSurface>
  )
}
