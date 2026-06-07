import { type LoginSession, LoginView, type LoginViewText } from '@shadowob/views/login'
import { useMemo } from 'react'
import { useI18n } from 'rspress/runtime'
import { requestJson } from '../lib/shadow-api'

declare const __SHADOW_APP_BASE_URL__: string | undefined
declare const __SHADOW_GOOGLE_CLIENT_ID__: string | undefined

type LoginModalProps = {
  open: boolean
  lang: 'zh' | 'en'
  redirect: string
  onClose: () => void
}

function configuredAppBase() {
  return (typeof __SHADOW_APP_BASE_URL__ !== 'undefined' ? __SHADOW_APP_BASE_URL__ : '').replace(
    /\/$/,
    '',
  )
}

function configuredGoogleClientId() {
  return (
    typeof __SHADOW_GOOGLE_CLIENT_ID__ !== 'undefined' ? __SHADOW_GOOGLE_CLIENT_ID__ : ''
  ).trim()
}

function legalHref(kind: 'terms' | 'privacy', lang: 'zh' | 'en') {
  return `${lang === 'zh' ? '/zh' : ''}/${kind}`
}

function safeAppRedirect(value: string) {
  if (value.startsWith('//') || /[\r\n\\]/.test(value)) return '/app'
  if (
    value === '/app' ||
    value.startsWith('/app/') ||
    value.startsWith('/app?') ||
    value.startsWith('/app#')
  ) {
    return value
  }
  return '/app'
}

function formatI18n(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (match, key) => String(values[key] ?? match))
}

function loginText(t: (key: string) => string): LoginViewText {
  const text = (key: string) => t(`loginModal.${key}`)
  return {
    brand: text('brand'),
    close: text('close'),
    back: text('back'),
    welcomeTitle: text('welcomeTitle'),
    welcomeSubtitle: text('welcomeSubtitle'),
    google: text('google'),
    github: text('github'),
    passwordTab: text('passwordTab'),
    passwordSubtitle: text('passwordSubtitle'),
    emailLabel: text('emailLabel'),
    emailPlaceholder: text('emailPlaceholder'),
    emailOrUsernameLabel: text('emailOrUsernameLabel'),
    emailOrUsernamePlaceholder: text('emailOrUsernamePlaceholder'),
    passwordLabel: text('passwordLabel'),
    continueEmail: text('continueEmail'),
    continuingEmail: text('continuingEmail'),
    login: text('login'),
    loggingIn: text('loggingIn'),
    switchToPassword: text('switchToPassword'),
    switchToEmailCode: text('switchToEmailCode'),
    forgotPassword: text('forgotPassword'),
    passwordResetSent: text('passwordResetSent'),
    passwordResetEmailRequired: text('passwordResetEmailRequired'),
    checkEmailTitle: text('checkEmailTitle'),
    checkEmailMessage: text('checkEmailMessage'),
    codeDigit: (index) => formatI18n(text('codeDigit'), { index }),
    verifying: text('verifying'),
    resendIn: (seconds) => formatI18n(text('resendIn'), { seconds }),
    resend: text('resend'),
    codeSent: text('codeSent'),
    termsPrefix: text('termsPrefix'),
    terms: text('terms'),
    privacy: text('privacy'),
    termsJoiner: text('termsJoiner'),
    failed: text('failed'),
    or: text('or'),
  }
}

export function LoginModal({ open, lang, redirect, onClose }: LoginModalProps) {
  const t = useI18n()
  const text = useMemo(() => loginText(t), [t])
  const appBase = configuredAppBase()
  const apiBase = appBase || ''
  const googleClientId = configuredGoogleClientId()
  const target = safeAppRedirect(redirect)

  const completeAuth = async (session: LoginSession) => {
    const externalAppOrigin =
      appBase && new URL(appBase, window.location.origin).origin !== window.location.origin

    if (externalAppOrigin) {
      window.location.assign(
        `${appBase}/app/oauth-callback#access_token=${encodeURIComponent(
          session.accessToken,
        )}&refresh_token=${encodeURIComponent(session.refreshToken)}&redirect=${encodeURIComponent(
          target,
        )}`,
      )
      return
    }

    window.localStorage.setItem('accessToken', session.accessToken)
    window.localStorage.setItem('refreshToken', session.refreshToken)
    window.location.assign(target)
  }

  return (
    <LoginView
      variant="modal"
      open={open}
      lang={lang}
      redirect={target}
      oauthRedirect={target}
      googleClientId={googleClientId || undefined}
      apiBase={apiBase}
      logoSrc="/Logo.svg"
      brandSuffix="OwnBuddy"
      termsHref={legalHref('terms', lang)}
      privacyHref={legalHref('privacy', lang)}
      text={text}
      request={(path, init) => requestJson(apiBase, path, init)}
      getErrorMessage={(error, fallback) => (error instanceof Error ? error.message : fallback)}
      onAuthenticated={completeAuth}
      onClose={onClose}
    />
  )
}
