import { useSearch } from '@tanstack/react-router'
import { useEffect, useMemo, useRef } from 'react'
import {
  ensureAuthenticatedSession,
  hasStoredAuthSession,
  isAuthSessionUnavailableError,
} from '../lib/auth-session'

const AUTH_STATUS_MESSAGE = 'shadow.auth.status'

type AuthStatusSearch = {
  origin?: string
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

export function AuthStatusPage() {
  const search = useSearch({ strict: false }) as AuthStatusSearch
  const postedRef = useRef(false)
  const parentOrigin = useMemo(
    () => safeOrigin(search.origin) ?? fallbackParentOrigin(),
    [search.origin],
  )

  useEffect(() => {
    let cancelled = false
    const postStatus = (input: {
      authenticated: boolean
      user: {
        id: string
        username: string
        displayName: string | null
        avatarUrl: string | null
      } | null
    }) => {
      if (cancelled || postedRef.current || typeof window === 'undefined') return
      postedRef.current = true
      window.parent.postMessage({ type: AUTH_STATUS_MESSAGE, ...input }, parentOrigin)
    }
    void ensureAuthenticatedSession()
      .then((user) => {
        postStatus({
          authenticated: Boolean(user),
          user: user
            ? {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                avatarUrl: user.avatarUrl,
              }
            : null,
        })
      })
      .catch((error) => {
        if (isAuthSessionUnavailableError(error) && hasStoredAuthSession()) {
          postStatus({ authenticated: true, user: null })
          return
        }
        postStatus({ authenticated: false, user: null })
      })
    return () => {
      cancelled = true
    }
  }, [parentOrigin])

  return <div className="min-h-screen bg-transparent" />
}
