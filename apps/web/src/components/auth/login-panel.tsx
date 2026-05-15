import { LoginView, type LoginViewText } from '@shadowob/views/login'
import { useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { getApiErrorMessage } from '../../lib/api-errors'
import {
  authenticatedRouterPathFromRedirect,
  currentAppRedirect,
  webRedirectFromRouterPath,
} from '../../lib/auth-redirect'
import { type AuthenticatedSession, applyAuthenticatedSession } from '../../lib/auth-session'

type LoginPanelProps = {
  variant: 'modal' | 'page'
  redirect?: string | null
  onClose?: () => void
  onComplete?: () => void
}

function legalHref(kind: 'terms' | 'privacy', language: string) {
  const prefix = language.startsWith('zh') ? '/zh' : ''
  return `${prefix}/${kind}`
}

function interpolate(template: string, values: Record<string, string | number>) {
  return template.replace(/\{\{(\w+)\}\}|\{(\w+)\}/g, (match, keyA, keyB) =>
    String(values[keyA ?? keyB] ?? match),
  )
}

function loginText(t: ReturnType<typeof useTranslation>['t']): LoginViewText {
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
    checkEmailTitle: text('checkEmailTitle'),
    checkEmailMessage: text('checkEmailMessage'),
    codeDigit: (index) => interpolate(text('codeDigit'), { index }),
    verifying: text('verifying'),
    resendIn: (seconds) => interpolate(text('resendIn'), { seconds }),
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

export function LoginPanel({ variant, redirect, onClose, onComplete }: LoginPanelProps) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const routerRedirect = useMemo(
    () => authenticatedRouterPathFromRedirect(redirect ?? currentAppRedirect()),
    [redirect],
  )
  const oauthRedirect = useMemo(() => webRedirectFromRouterPath(routerRedirect), [routerRedirect])
  const apiBase = import.meta.env.VITE_API_BASE ?? ''
  const text = useMemo(() => loginText(t), [t])

  return (
    <LoginView
      variant={variant}
      lang={i18n.language}
      redirect={routerRedirect}
      oauthRedirect={oauthRedirect}
      apiBase={apiBase}
      logoSrc="/Logo.svg"
      brandSuffix="OwnBuddy"
      termsHref={legalHref('terms', i18n.language)}
      privacyHref={legalHref('privacy', i18n.language)}
      text={text}
      request={fetchApi}
      getErrorMessage={(err) => getApiErrorMessage(err, t, 'loginModal.failed')}
      onAuthenticated={(session) => {
        applyAuthenticatedSession(session as AuthenticatedSession)
        onComplete?.()
        navigate({ to: routerRedirect })
      }}
      onClose={onClose}
    />
  )
}
