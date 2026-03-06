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
      fetchApi<{ id: string }>('/api/servers/_/join', {
        method: 'POST',
        body: JSON.stringify({ inviteCode: code }),
      }),
    onSuccess: (data) => {
      navigate({ to: '/app/servers/$serverId', params: { serverId: data.id } })
    },
    onError: (err: unknown) => {
      const status = (err as { status?: number })?.status
      if (status === 409 && serverInfo) {
        // Already a member, just navigate to the server
        navigate({ to: '/app/servers/$serverId', params: { serverId: serverInfo.id } })
      } else if (status === 401) {
        navigate({ to: '/login' })
      } else {
        setError(t('invite.joinFailed'))
      }
    },
  })

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#1e1f22]  flex items-center justify-center">
        <div className="bg-[#313338] rounded-[5px] p-8 w-[480px] shadow-[0_2px_10px_0_rgba(0,0,0,0.2)] text-center">
          <img src="/Logo.svg" alt="Shadow" className="w-16 h-16 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-[#f2f3f5] mb-2">{t('invite.title')}</h2>
          <p className="text-[#b5bac1] text-sm mb-6">{t('invite.loginRequired')}</p>
          <button
            type="button"
            onClick={() => navigate({ to: '/login' })}
            className="w-full px-4 py-3 bg-[#5865F2] hover:bg-[#4752C4] text-white rounded-lg transition font-bold"
          >
            {t('auth.loginSubmit')}
          </button>
          <button
            type="button"
            onClick={() => navigate({ to: '/register' })}
            className="w-full mt-3 px-4 py-3 bg-[#2b2d31] hover:bg-[#3f4147] text-[#dbdee1] rounded-lg transition"
          >
            {t('auth.registerSubmit')}
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1e1f22]  flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#5865F2]" />
      </div>
    )
  }

  if (error || !serverInfo) {
    return (
      <div className="min-h-screen bg-[#1e1f22]  flex items-center justify-center">
        <div className="bg-[#313338] rounded-[5px] p-8 w-[480px] shadow-[0_2px_10px_0_rgba(0,0,0,0.2)] text-center">
          <img src="/Logo.svg" alt="Shadow" className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <h2 className="text-xl font-bold text-[#f2f3f5] mb-2">{t('invite.title')}</h2>
          <p className="text-[#f23f43] text-sm mb-4">{error ?? t('invite.invalidCode')}</p>
          <button
            type="button"
            onClick={() => navigate({ to: '/app' })}
            className="px-4 py-2 bg-[#2b2d31] hover:bg-[#3f4147] text-[#dbdee1] rounded-lg transition"
          >
            {t('common.back')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#1e1f22]  flex items-center justify-center">
      <div className="bg-[#313338] rounded-[5px] p-8 w-[480px] shadow-[0_2px_10px_0_rgba(0,0,0,0.2)] text-center">
        <img src="/Logo.svg" alt="Shadow" className="w-16 h-16 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-[#f2f3f5] mb-1">{t('invite.title')}</h2>
        <p className="text-[#b5bac1] text-sm mb-6">{t('invite.youAreInvited')}</p>

        <div className="bg-[#2b2d31] rounded-lg p-4 mb-6">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-[#5865F2]/20 flex items-center justify-center text-2xl font-bold text-[#5865F2] mb-2">
            {serverInfo.name.charAt(0).toUpperCase()}
          </div>
          <h3 className="text-lg font-bold text-[#f2f3f5]">{serverInfo.name}</h3>
        </div>

        <button
          type="button"
          onClick={() => joinMutation.mutate()}
          disabled={joinMutation.isPending}
          className="w-full px-4 py-3 bg-[#5865F2] hover:bg-[#4752C4] text-white rounded-lg transition font-bold disabled:opacity-50"
        >
          {joinMutation.isPending ? t('common.loading') : t('invite.acceptInvite')}
        </button>
      </div>
    </div>
  )
}
