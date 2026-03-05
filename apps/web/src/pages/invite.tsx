import { useMutation } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../lib/api'
import { useAuthStore } from '../stores/auth.store'

interface ServerInfo {
  id: string
  name: string
  iconUrl: string | null
  memberCount?: number
}

export function InvitePage() {
  const { t } = useTranslation()
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
      fetchApi('/api/servers/_/join', {
        method: 'POST',
        body: JSON.stringify({ inviteCode: code }),
      }),
    onSuccess: (data: { id: string }) => {
      navigate({ to: '/app/servers/$serverId', params: { serverId: data.id } })
    },
    onError: (err: Error & { status?: number }) => {
      if (err?.status === 409) {
        // Already a member, just navigate
        if (serverInfo) {
          navigate({ to: '/app/servers/$serverId', params: { serverId: serverInfo.id } })
        }
      } else {
        setError(t('invite.joinFailed'))
      }
    },
  })

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <div className="bg-bg-secondary rounded-xl p-8 w-96 border border-white/5 text-center">
          <img src="/Logo.svg" alt="Shadow" className="w-16 h-16 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-text-primary mb-2">{t('invite.title')}</h2>
          <p className="text-text-muted text-sm mb-6">{t('invite.loginRequired')}</p>
          <button
            type="button"
            onClick={() => navigate({ to: '/login' })}
            className="w-full px-4 py-3 bg-primary hover:bg-primary-hover text-white rounded-lg transition font-bold"
          >
            {t('auth.loginSubmit')}
          </button>
          <button
            type="button"
            onClick={() => navigate({ to: '/register' })}
            className="w-full mt-3 px-4 py-3 bg-bg-tertiary hover:bg-white/10 text-text-secondary rounded-lg transition"
          >
            {t('auth.registerSubmit')}
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !serverInfo) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <div className="bg-bg-secondary rounded-xl p-8 w-96 border border-white/5 text-center">
          <img src="/Logo.svg" alt="Shadow" className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <h2 className="text-xl font-bold text-text-primary mb-2">{t('invite.title')}</h2>
          <p className="text-danger text-sm mb-4">{error ?? t('invite.invalidCode')}</p>
          <button
            type="button"
            onClick={() => navigate({ to: '/app' })}
            className="px-4 py-2 bg-bg-tertiary hover:bg-white/10 text-text-secondary rounded-lg transition"
          >
            {t('common.back')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center">
      <div className="bg-bg-secondary rounded-xl p-8 w-96 border border-white/5 text-center">
        <img src="/Logo.svg" alt="Shadow" className="w-16 h-16 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-text-primary mb-1">{t('invite.title')}</h2>
        <p className="text-text-muted text-sm mb-6">{t('invite.youAreInvited')}</p>

        <div className="bg-bg-tertiary rounded-lg p-4 mb-6">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-primary/20 flex items-center justify-center text-2xl font-bold text-primary mb-2">
            {serverInfo.name.charAt(0).toUpperCase()}
          </div>
          <h3 className="text-lg font-bold text-text-primary">{serverInfo.name}</h3>
        </div>

        <button
          type="button"
          onClick={() => joinMutation.mutate()}
          disabled={joinMutation.isPending}
          className="w-full px-4 py-3 bg-primary hover:bg-primary-hover text-white rounded-lg transition font-bold disabled:opacity-50"
        >
          {joinMutation.isPending ? t('common.loading') : t('invite.acceptInvite')}
        </button>
      </div>
    </div>
  )
}
