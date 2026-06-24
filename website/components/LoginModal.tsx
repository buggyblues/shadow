import { useEffect, useMemo } from 'react'
import { useI18n } from 'rspress/runtime'

declare const __SHADOW_APP_BASE_URL__: string | undefined

const AUTH_MODAL_COMPLETED_MESSAGE = 'shadow.auth.completed'
const AUTH_MODAL_CANCELLED_MESSAGE = 'shadow.auth.cancelled'

type LoginModalProps = {
  open: boolean
  lang: 'zh' | 'en'
  redirect: string
  onClose: () => void
}

type AuthModalMessage = {
  type?: unknown
  redirect?: unknown
}

function configuredAppBase() {
  return (typeof __SHADOW_APP_BASE_URL__ !== 'undefined' ? __SHADOW_APP_BASE_URL__ : '').replace(
    /\/$/,
    '',
  )
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

function configuredAppOrigin() {
  if (typeof window === 'undefined') return ''
  return new URL(configuredAppBase() || window.location.origin, window.location.origin).origin
}

function appUrl(path: string) {
  return new URL(path, configuredAppBase() || window.location.origin).toString()
}

function authModalUrl(target: string, lang: 'zh' | 'en') {
  const url = new URL('/app/auth/modal', configuredAppBase() || window.location.origin)
  url.searchParams.set('redirect', target)
  url.searchParams.set('origin', window.location.origin)
  url.searchParams.set('lang', lang === 'zh' ? 'zh-CN' : 'en')
  return url.toString()
}

function isAuthModalMessage(value: unknown): value is AuthModalMessage {
  return Boolean(value && typeof value === 'object' && 'type' in value)
}

export function LoginModal({ open, lang, redirect, onClose }: LoginModalProps) {
  const t = useI18n()
  const target = safeAppRedirect(redirect)
  const iframeSrc = useMemo(() => {
    if (!open || typeof window === 'undefined') return ''
    return authModalUrl(target, lang)
  }, [lang, open, target])

  useEffect(() => {
    if (!open || typeof window === 'undefined') return
    const expectedOrigin = configuredAppOrigin()
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== expectedOrigin || !isAuthModalMessage(event.data)) return
      if (event.data.type === AUTH_MODAL_CANCELLED_MESSAGE) {
        onClose()
        return
      }
      if (event.data.type !== AUTH_MODAL_COMPLETED_MESSAGE) return
      const completedRedirect =
        typeof event.data.redirect === 'string' ? safeAppRedirect(event.data.redirect) : target
      onClose()
      window.location.assign(appUrl(completedRedirect))
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [onClose, open, target])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('loginModal.welcomeTitle')}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
      }}
    >
      <iframe
        title={t('loginModal.welcomeTitle')}
        src={iframeSrc || 'about:blank'}
        style={{
          width: '100%',
          height: '100%',
          border: 0,
          display: 'block',
          background: 'transparent',
        }}
        referrerPolicy="strict-origin-when-cross-origin"
        allow="identity-credentials-get; publickey-credentials-get"
      />
    </div>
  )
}
