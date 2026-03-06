import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../lib/api'
import { useAuthStore } from '../stores/auth.store'

export function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })

      setAuth(result.user, result.accessToken, result.refreshToken)
      navigate({ to: '/app' })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.loginFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1e1f22] p-4  bg-center">
      <div className="w-full max-w-[480px] bg-[#313338] rounded-md p-8 shadow-[0_2px_10px_0_rgba(0,0,0,0.2)]">
        <div className="text-center mb-8">
          <img src="/Logo.svg" alt="Shadow" className="w-12 h-12 mx-auto mb-3" />
          <h1 className="text-2xl font-semibold text-white mb-2 tracking-wide">{t('auth.loginTitle')}</h1>
          <p className="text-[#b5bac1] text-[15px]">{t('auth.loginSubtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-[3px] p-3 text-[#fa777c] text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-[12px] font-bold uppercase text-[#b5bac1] mb-2 tracking-wide">
              {t('auth.emailLabel')} <span className="text-[#f23f43]">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-[#1e1f22] text-[#dbdee1] rounded-[3px] px-3 py-2.5 outline-none focus:ring-0 transition"
              placeholder="you@example.com"
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
              className="w-full bg-[#1e1f22] text-[#dbdee1] rounded-[3px] px-3 py-2.5 outline-none focus:ring-0 transition"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#5865F2] hover:bg-[#4752c4] text-white font-medium py-2.5 rounded-[3px] transition mt-2 disabled:opacity-50 text-[15px]"
          >
            {loading ? t('auth.loginLoading') : t('auth.loginSubmit')}
          </button>
        </form>

        <p className="mt-4 text-[14px]">
          <span className="text-[#949ba4]">{t('auth.noAccount')}</span>{' '}
          <Link to="/register" className="text-[#00a8fc] hover:underline">
            {t('auth.registerLink')}
          </Link>
        </p>
      </div>
    </div>
  )
}
