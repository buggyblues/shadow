import { useSearch } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LoginPanel } from '../components/auth/login-panel'
import {
  authenticatedRouterPathFromRedirect,
  webRedirectFromRouterPath,
} from '../lib/auth-redirect'
import { ensureAuthenticatedSession } from '../lib/auth-session'

const AUTH_MODAL_COMPLETED_MESSAGE = 'shadow.auth.completed'
const AUTH_MODAL_CANCELLED_MESSAGE = 'shadow.auth.cancelled'

type AuthModalSearch = {
  redirect?: string
  origin?: string
  lang?: string
}

function safeOrigin(value?: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.origin
  } catch {
    return null
  }
}

function fallbackParentOrigin(): string {
  if (typeof window === 'undefined') return ''
  const referrerOrigin = safeOrigin(document.referrer)
  return referrerOrigin ?? window.location.origin
}

function normalizeLanguage(value?: string): string | null {
  if (!value) return null
  if (value === 'zh') return 'zh-CN'
  if (value === 'en' || value === 'ja' || value === 'ko') return value
  if (value === 'zh-CN' || value === 'zh-TW') return value
  return null
}

function authModalRedirect({
  redirect,
  origin,
  lang,
}: {
  redirect: string
  origin: string
  lang?: string | null
}) {
  const params = new URLSearchParams({ redirect, origin })
  if (lang) params.set('lang', lang)
  return `/app/auth/modal?${params.toString()}`
}

export function AuthModalPage() {
  const { i18n } = useTranslation()
  const search = useSearch({ strict: false }) as AuthModalSearch
  const [showLogin, setShowLogin] = useState(false)
  const postedRef = useRef(false)
  const targetRedirect = useMemo(
    () => webRedirectFromRouterPath(authenticatedRouterPathFromRedirect(search.redirect)),
    [search.redirect],
  )
  const parentOrigin = useMemo(
    () => safeOrigin(search.origin) ?? fallbackParentOrigin(),
    [search.origin],
  )
  const language = useMemo(() => normalizeLanguage(search.lang), [search.lang])
  const oauthRedirect = useMemo(
    () => authModalRedirect({ redirect: targetRedirect, origin: parentOrigin, lang: language }),
    [language, parentOrigin, targetRedirect],
  )

  useEffect(() => {
    if (language && i18n.language !== language) {
      void i18n.changeLanguage(language)
    }
  }, [i18n, language])

  const postParent = useCallback(
    (type: typeof AUTH_MODAL_COMPLETED_MESSAGE | typeof AUTH_MODAL_CANCELLED_MESSAGE) => {
      if (typeof window === 'undefined' || window.parent === window) return
      if (type === AUTH_MODAL_COMPLETED_MESSAGE) {
        if (postedRef.current) return
        postedRef.current = true
      }
      window.parent.postMessage({ type, redirect: targetRedirect }, parentOrigin)
    },
    [parentOrigin, targetRedirect],
  )

  useEffect(() => {
    let cancelled = false
    void ensureAuthenticatedSession().then((user) => {
      if (cancelled) return
      if (user) {
        postParent(AUTH_MODAL_COMPLETED_MESSAGE)
        return
      }
      setShowLogin(true)
    })
    return () => {
      cancelled = true
    }
  }, [postParent])

  if (!showLogin) {
    return <div className="min-h-screen bg-transparent" />
  }

  return (
    <div className="min-h-screen bg-transparent text-text-primary">
      <LoginPanel
        variant="modal"
        redirect={targetRedirect}
        oauthRedirect={oauthRedirect}
        completionMode="notify"
        onComplete={() => postParent(AUTH_MODAL_COMPLETED_MESSAGE)}
        onClose={() => postParent(AUTH_MODAL_CANCELLED_MESSAGE)}
      />
    </div>
  )
}
