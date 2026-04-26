import { Alert, AlertDescription, Button, Card, Divider, Input } from '@shadowob/ui'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStatus } from '../hooks/use-app-status'
import { fetchApi } from '../lib/api'
import { queryClient } from '../lib/query-client'
import { useAuthStore } from '../stores/auth.store'
import { useChatStore } from '../stores/chat.store'

export function LoginPage() {
  const { t } = useTranslation()
  useAppStatus({ title: t('auth.loginTitle'), variant: 'auth' })
  const navigate = useNavigate()
  const searchParams = useSearch({ strict: false }) as { redirect?: string }
  const setAuth = useAuthStore((s) => s.setAuth)
  const [email, setEmail] = useState('') // Can be email or username
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
      // Clear stale state from any previous session
      useChatStore.getState().setActiveServer(null)
      queryClient.removeQueries()
      queryClient.clear()
      const redirectTo = searchParams.redirect
      if (redirectTo && redirectTo.startsWith('/')) {
        navigate({ to: redirectTo })
      } else {
        navigate({ to: '/settings' })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.loginFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-deep p-4 relative overflow-hidden">
      {/* Atmosphere orbs */}
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-primary opacity-25 blur-[120px] animate-float" />
      <div className="absolute -bottom-40 -right-40 w-[400px] h-[400px] rounded-full bg-danger opacity-20 blur-[120px] animate-float" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-accent opacity-[0.03] blur-[100px]" />

      <Card variant="glass" className="max-w-md w-full p-10 relative z-10">
        {/* Logo & branding */}
        <div className="text-center mb-8">
          <img
            src="/Logo.svg"
            alt="Shadow"
            className="w-16 h-16 mx-auto mb-4 drop-shadow-[0_0_20px_rgba(0,243,255,0.4)]"
          />
          <h1 className="text-2xl font-bold text-white mb-2 tracking-wide">
            {t('auth.loginTitle')}
          </h1>
          <p className="text-white/50 text-[15px]">{t('auth.loginSubtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Input
            label={t('auth.emailOrUsernameLabel', '用户名或邮箱')}
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
            placeholder={t('auth.emailOrUsernamePlaceholder', '用户名或邮箱')}
          />

          <Input
            label={t('auth.passwordLabel')}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            data-1p-ignore
            data-lpignore="true"
            data-form-type="other"
            placeholder="••••••••"
          />

          <Button type="submit" size="lg" disabled={loading} className="w-full rounded-full">
            {loading ? t('auth.loginLoading') : t('auth.loginSubmit')}
          </Button>
        </form>

        <Divider label={t('auth.orContinueWith', 'OR')} className="my-6" />

        {/* OAuth login buttons */}
        <div className="flex flex-col gap-3">
          <Button variant="glass" asChild>
            <a
              href={`${import.meta.env.VITE_API_BASE ?? ''}/api/auth/oauth/google?redirect=${encodeURIComponent(searchParams.redirect ?? '/app/settings')}`}
            >
              <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" role="img" aria-label="Google">
                <title>Google</title>
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              {t('auth.continueWithGoogle', 'Continue with Google')}
            </a>
          </Button>
          <Button variant="glass" asChild>
            <a
              href={`${import.meta.env.VITE_API_BASE ?? ''}/api/auth/oauth/github?redirect=${encodeURIComponent(searchParams.redirect ?? '/app/settings')}`}
            >
              <svg
                className="w-[18px] h-[18px]"
                viewBox="0 0 24 24"
                fill="currentColor"
                role="img"
                aria-label="GitHub"
              >
                <title>GitHub</title>
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
              </svg>
              {t('auth.continueWithGitHub', 'Continue with GitHub')}
            </a>
          </Button>
        </div>

        <p className="text-center text-[14px] mt-6">
          <span className="text-white/40">{t('auth.noAccount')}</span>{' '}
          <Link
            to="/register"
            search={searchParams.redirect ? { redirect: searchParams.redirect } : {}}
            className="text-primary hover:text-primary/80 hover:underline transition-colors"
          >
            {t('auth.registerLink')}
          </Link>
        </p>
      </Card>
    </div>
  )
}
