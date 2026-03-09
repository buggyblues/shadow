import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AvatarEditor } from '../components/common/avatar-editor'
import { useAppStatus } from '../hooks/use-app-status'
import { fetchApi } from '../lib/api'
import { generateRandomCatConfig, renderCatSvg } from '../lib/avatar-generator'
import { queryClient } from '../lib/query-client'
import { useAuthStore } from '../stores/auth.store'
import { useChatStore } from '../stores/chat.store'

export function RegisterPage() {
  const { t } = useTranslation()
  useAppStatus({ title: t('auth.registerTitle'), variant: 'auth' })
  const navigate = useNavigate()
  const searchParams = useSearch({ strict: false }) as { redirect?: string; code?: string }
  const setAuth = useAuthStore((s) => s.setAuth)
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState(searchParams.code ?? '')
  const [selectedAvatar, setSelectedAvatar] = useState(() => renderCatSvg(generateRandomCatConfig()))
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await fetchApi<{
        user: {
          id: string
          email: string
          username: string
          displayName: string | null
          avatarUrl: string | null
        }
        accessToken: string
        refreshToken: string
      }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          displayName: displayName || undefined,
          inviteCode,
        }),
      })

      // Set avatar after registration
      try {
        await fetchApi('/api/auth/me', {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${result.accessToken}` },
          body: JSON.stringify({ avatarUrl: selectedAvatar }),
        })
      } catch {
        // Non-critical, continue
      }

      setAuth(
        { ...result.user, avatarUrl: selectedAvatar },
        result.accessToken,
        result.refreshToken,
      )
      // Clear stale state from any previous session
      useChatStore.getState().setActiveServer(null)
      queryClient.removeQueries()
      queryClient.clear()
      const redirectTo = searchParams.redirect
      if (redirectTo && redirectTo.startsWith('/')) {
        navigate({ to: redirectTo })
      } else {
        navigate({ to: '/app' })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.registerFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1e1f22] p-4  bg-center">
      <div className="w-full max-w-[480px] bg-[#313338] rounded-[5px] p-8 shadow-[0_2px_10px_0_rgba(0,0,0,0.2)]">
        <div className="text-center mb-6">
          <img src="/Logo.svg" alt="Shadow" className="w-12 h-12 mx-auto mb-3" />
          <h1 className="text-2xl font-semibold text-white mb-2 tracking-wide">
            {t('auth.registerTitle')}
          </h1>
          <p className="text-[#b5bac1] text-[15px]">{t('auth.registerSubtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-[3px] p-3 text-[#fa777c] text-sm">
              {error}
            </div>
          )}

          {/* Avatar selection - unified AvatarEditor */}
          <AvatarEditor value={selectedAvatar} onChange={setSelectedAvatar} />

          <div>
            <label className="block text-[12px] font-bold uppercase text-[#b5bac1] mb-2 tracking-wide">
              {t('auth.emailLabel')} <span className="text-[#f23f43]">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full bg-[#1e1f22] text-[#dbdee1] rounded-[3px] px-3 py-2.5 outline-none focus:ring-0 transition"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-[12px] font-bold uppercase text-[#b5bac1] mb-2 tracking-wide">
              {t('auth.displayNameLabel')}{' '}
              <span className="text-[#949ba4] font-normal italic">{t('auth.optional')}</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="nickname"
              className="w-full bg-[#1e1f22] text-[#dbdee1] rounded-[3px] px-3 py-2.5 outline-none focus:ring-0 transition"
              placeholder={t('auth.displayNamePlaceholder')}
            />
          </div>

          <div>
            <label className="block text-[12px] font-bold uppercase text-[#b5bac1] mb-2 tracking-wide">
              {t('auth.passwordLabel')} <span className="text-[#f23f43]">*</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full bg-[#1e1f22] text-[#dbdee1] rounded-[3px] px-3 py-2.5 outline-none focus:ring-0 transition"
              placeholder={t('auth.passwordPlaceholder')}
            />
          </div>

          <div>
            <label className="block text-[12px] font-bold uppercase text-[#b5bac1] mb-2 tracking-wide">
              {t('auth.inviteCodeLabel')} <span className="text-[#f23f43]">*</span>
            </label>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              required
              className="w-full bg-[#1e1f22] text-[#dbdee1] rounded-[3px] px-3 py-2.5 outline-none focus:ring-0 transition font-mono tracking-wider"
              placeholder={t('auth.inviteCodePlaceholder')}
            />
            <p className="text-[11px] text-[#949ba4] mt-1.5">{t('auth.inviteCodeHint')}</p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#5865F2] hover:bg-[#4752c4] text-white font-medium py-2.5 rounded-[3px] transition mt-2 disabled:opacity-50 text-[15px]"
          >
            {loading ? t('auth.registerLoading') : t('auth.registerSubmit')}
          </button>
        </form>

        <p className="mt-4 text-[14px]">
          <span className="text-[#949ba4]">{t('auth.hasAccount')}</span>{' '}
          <Link to="/login" search={searchParams.redirect ? { redirect: searchParams.redirect } : {}} className="text-[#00a8fc] hover:underline">
            {t('auth.loginLink')}
          </Link>
        </p>
      </div>
    </div>
  )
}
