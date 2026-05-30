import { Button, Card, Spinner } from '@shadowob/ui'
import { useMutation } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStatus } from '../hooks/use-app-status'
import { fetchApi } from '../lib/api'
import { useAuthStore } from '../stores/auth.store'

interface ServerInfo {
  id: string
  name: string
  slug?: string | null
  iconUrl: string | null
  memberCount?: number
}

export function InvitePage() {
  const { t } = useTranslation()
  useAppStatus({ title: t('invite.acceptInvite'), variant: 'auth' })
  const navigate = useNavigate()
  const { code } = useParams({ strict: false })
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Fetch server info by invite code
  useEffect(() => {
    if (!code) return
    setLoading(true)
    fetchApi<ServerInfo>(`/api/servers/invite/${code}`)
      .then((info) => {
        setServerInfo(info)
        setError(null)
      })
      .catch(() => {
        setError(t('invite.invalidCode'))
      })
      .finally(() => setLoading(false))
  }, [code, t])

  const joinMutation = useMutation({
    mutationFn: () =>
      fetchApi<{ id: string }>('/api/servers/_/join', {
        method: 'POST',
        body: JSON.stringify({ inviteCode: code }),
      }),
    onSuccess: (data) => {
      navigate({
        to: '/servers/$serverSlug',
        params: { serverSlug: (data as { slug?: string; id: string }).slug ?? data.id },
      })
    },
    onError: (err: unknown) => {
      const status = (err as { status?: number })?.status
      if (status === 409 && serverInfo) {
        // Already a member, just navigate to the server
        navigate({
          to: '/servers/$serverSlug',
          params: { serverSlug: serverInfo.slug ?? serverInfo.id },
        })
      } else if (status === 401) {
        navigate({ to: '/login' })
      } else {
        setError(t('invite.joinFailed'))
      }
    },
  })

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-bg-tertiary flex items-center justify-center">
        <Card variant="glass" className="p-8 w-[480px] text-center">
          <img src="/Logo.svg" alt="Shadow" className="w-16 h-16 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-text-primary mb-2">{t('invite.title')}</h2>
          <p className="text-text-secondary text-sm mb-6">{t('invite.loginRequired')}</p>
          <Button
            variant="primary"
            className="w-full"
            onClick={() => navigate({ to: '/login', search: { redirect: `/invite/${code}` } })}
          >
            {t('auth.loginSubmit')}
          </Button>
        </Card>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-tertiary flex items-center justify-center">
        <Spinner size="md" />
      </div>
    )
  }

  if (error || !serverInfo) {
    return (
      <div className="min-h-screen bg-bg-tertiary flex items-center justify-center">
        <Card variant="glass" className="p-8 w-[480px] text-center">
          <img src="/Logo.svg" alt="Shadow" className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <h2 className="text-xl font-bold text-text-primary mb-2">{t('invite.title')}</h2>
          <p className="text-danger text-sm mb-4">{error ?? t('invite.invalidCode')}</p>
          <Button variant="glass" onClick={() => navigate({ to: '/' })}>
            {t('common.back')}
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg-tertiary flex items-center justify-center">
      <Card variant="glass" className="p-8 w-[480px] text-center">
        <img src="/Logo.svg" alt="Shadow" className="w-16 h-16 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-text-primary mb-1">{t('invite.title')}</h2>
        <p className="text-text-secondary text-sm mb-6">{t('invite.youAreInvited')}</p>

        <div className="bg-bg-secondary/50 backdrop-blur-sm rounded-[24px] p-4 mb-6">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-primary/20 flex items-center justify-center text-2xl font-bold text-primary mb-2">
            {serverInfo.name.charAt(0).toUpperCase()}
          </div>
          <h3 className="text-lg font-bold text-text-primary">{serverInfo.name}</h3>
        </div>

        <Button
          variant="primary"
          className="w-full"
          onClick={() => joinMutation.mutate()}
          disabled={joinMutation.isPending}
          loading={joinMutation.isPending}
        >
          {joinMutation.isPending ? t('common.loading') : t('invite.acceptInvite')}
        </Button>
      </Card>
    </div>
  )
}
