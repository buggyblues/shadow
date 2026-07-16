import { useQuery } from '@tanstack/react-query'
import { type ReactNode, useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TravelOAuthSessionStatus } from '../services/auth-api.js'
import {
  authorizeTravelOAuth,
  getTravelOAuthSession,
  selectTravelSpace,
} from '../services/auth-api.js'
import { setTravelServerScope } from '../services/shadow-host.js'
import { Button } from './button.js'
import { Lock, Route } from './icons.js'

export function hasTravelAccess(session?: TravelOAuthSessionStatus) {
  return Boolean(session?.authenticated)
}

export function TravelAuthGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [authorizing, setAuthorizing] = useState(false)
  const authorizationInFlight = useRef(false)
  const session = useQuery({
    queryKey: ['travel', 'oauth-session'],
    queryFn: getTravelOAuthSession,
    refetchOnWindowFocus: false,
    retry: 1,
  })
  setTravelServerScope(session.data?.serverId)
  const accessGranted = hasTravelAccess(session.data)

  const startAuthorization = useCallback(async () => {
    const authorizeUrl = session.data?.authorizeUrl
    if (!authorizeUrl || authorizationInFlight.current) return
    authorizationInFlight.current = true
    setAuthorizing(true)
    try {
      await authorizeTravelOAuth(authorizeUrl)
      await session.refetch()
    } finally {
      authorizationInFlight.current = false
      setAuthorizing(false)
    }
  }, [session.data?.authorizeUrl, session.refetch])

  if (accessGranted) return children

  return (
    <main className="grid min-h-dvh place-items-center bg-app p-5">
      <section className="w-full max-w-md rounded-[28px] border border-line bg-white p-6 shadow-[0_24px_80px_rgba(37,35,30,0.14)]">
        <span className="grid size-12 place-items-center rounded-2xl bg-sage text-olive">
          {session.data?.configured === false ? <Route size={24} /> : <Lock size={24} />}
        </span>
        <div className="mt-5 text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
          {t('auth.eyebrow')}
        </div>
        <h1 className="mt-2 font-serif text-[30px] leading-9">
          {session.data?.reason === 'space_required'
            ? t('auth.spaceTitle')
            : session.data?.configured === false
              ? t('auth.configureTitle')
              : t('auth.title')}
        </h1>
        <p className="mt-3 text-[14px] leading-6 text-muted">
          {session.data?.reason === 'space_required'
            ? t('auth.spaceDescription')
            : session.data?.reason === 'oauth_identity_mismatch'
              ? t('auth.mismatch')
              : session.data?.configured === false
                ? t('auth.configureDescription')
                : t('auth.description')}
        </p>
        {session.isError ? (
          <p className="mt-4 rounded-xl bg-coral/10 p-3 text-[13px] text-coral">
            {t('auth.error')}
          </p>
        ) : null}
        {session.data?.reason === 'space_required' ? (
          <div className="mt-6 grid gap-2">
            {session.data.spaces.map((space) => (
              <Button
                key={space.id}
                className="w-full justify-start"
                disabled={authorizing}
                onClick={() => {
                  setAuthorizing(true)
                  void selectTravelSpace(space.id)
                    .then(() => session.refetch())
                    .finally(() => setAuthorizing(false))
                }}
                size="lg"
                variant="secondary"
              >
                {space.name}
              </Button>
            ))}
          </div>
        ) : (
          <Button
            className="mt-6 w-full"
            disabled={!session.data?.authorizeUrl || authorizing || session.isLoading}
            onClick={() => void startAuthorization()}
            size="lg"
            variant="action"
          >
            {authorizing ? t('auth.waiting') : t('auth.connect')}
          </Button>
        )}
      </section>
    </main>
  )
}
