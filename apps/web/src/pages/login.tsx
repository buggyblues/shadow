import { useSearch } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { LoginPanel } from '../components/auth/login-panel'
import { useAppStatus } from '../hooks/use-app-status'

type DesktopLoginBridge = {
  isDesktop?: boolean
  openCommunityLogin?: (redirect?: string) => Promise<boolean>
}

function desktopLoginBridge(): DesktopLoginBridge | null {
  if (typeof window === 'undefined') return null
  return (window as Window & { desktopAPI?: DesktopLoginBridge }).desktopAPI ?? null
}

export function LoginPage() {
  const { t } = useTranslation()
  const searchParams = useSearch({ strict: false }) as { redirect?: string }
  const desktopAPI = desktopLoginBridge()
  const isDesktopLogin = Boolean(desktopAPI?.isDesktop && desktopAPI.openCommunityLogin)
  const openedDesktopLoginRef = useRef<string | null>(null)
  useAppStatus({ title: t('auth.loginTitle'), variant: 'auth' })

  useEffect(() => {
    if (!isDesktopLogin) return
    const key = searchParams.redirect ?? ''
    if (openedDesktopLoginRef.current === key) return
    openedDesktopLoginRef.current = key
    void desktopAPI?.openCommunityLogin?.(searchParams.redirect)
  }, [desktopAPI, isDesktopLogin, searchParams.redirect])

  if (isDesktopLogin) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-bg-deep px-6 text-center text-text-primary">
        <div className="max-w-sm space-y-4">
          <div>
            <h1 className="text-xl font-bold">{t('desktop.browserLoginTitle')}</h1>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              {t('desktop.browserLoginDesc')}
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-primary/50 bg-primary/15 px-4 py-2 text-sm font-bold text-primary transition hover:bg-primary/20"
            onClick={() => void desktopAPI?.openCommunityLogin?.(searchParams.redirect)}
          >
            {t('desktop.browserLoginAction')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-bg-deep px-4 py-8 text-text-primary sm:px-6">
      <div
        className="pointer-events-none absolute -left-24 -top-28 h-[520px] w-[520px] rounded-full bg-primary/25 blur-[120px]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-32 -right-24 h-[560px] w-[560px] rounded-full bg-danger/20 blur-[130px]"
        aria-hidden="true"
      />
      <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-[580px] items-center justify-center">
        <LoginPanel variant="page" redirect={searchParams.redirect} />
      </div>
    </div>
  )
}
