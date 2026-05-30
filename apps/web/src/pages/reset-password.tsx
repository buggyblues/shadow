import { Alert, AlertDescription, Button, Input } from '@shadowob/ui'
import { Link, useSearch } from '@tanstack/react-router'
import { KeyRound } from 'lucide-react'
import type React from 'react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStatus } from '../hooks/use-app-status'
import { fetchApi } from '../lib/api'
import { getApiErrorMessage } from '../lib/api-errors'

export function ResetPasswordPage() {
  const { t } = useTranslation()
  const search = useSearch({ strict: false }) as { token?: string }
  const token = useMemo(() => search.token?.trim() ?? '', [search.token])
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  useAppStatus({ title: t('passwordReset.title'), variant: 'auth' })

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')

    if (!token) {
      setError(t('passwordReset.invalidLink'))
      return
    }
    if (newPassword.length < 8) {
      setError(t('passwordReset.passwordTooShort'))
      return
    }
    if (newPassword !== confirmPassword) {
      setError(t('passwordReset.passwordMismatch'))
      return
    }

    setLoading(true)
    try {
      await fetchApi('/api/auth/password-reset/complete', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword, confirmPassword }),
      })
      setDone(true)
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(getApiErrorMessage(err, t, 'passwordReset.failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg-primary px-4 py-8 text-text-primary sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[460px] items-center justify-center">
        <section className="w-full rounded-[28px] border border-border-subtle bg-bg-primary px-5 py-7 shadow-[0_20px_80px_rgba(15,23,42,0.08)] sm:px-8 sm:py-8">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <KeyRound size={26} strokeWidth={2.5} aria-hidden="true" />
            </div>
            <h1 className="text-[28px] font-black leading-tight tracking-normal">
              {done ? t('passwordReset.doneTitle') : t('passwordReset.title')}
            </h1>
            <p className="mt-2 text-[15px] font-bold leading-6 text-text-muted">
              {done ? t('passwordReset.doneDesc') : t('passwordReset.subtitle')}
            </p>
          </div>

          {done ? (
            <Button asChild size="lg" className="w-full">
              <Link to="/login">{t('passwordReset.backToLogin')}</Link>
            </Button>
          ) : (
            <form className="space-y-4" onSubmit={submit}>
              {error ? (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <Input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                label={t('passwordReset.newPassword')}
                placeholder={t('passwordReset.newPasswordPlaceholder')}
                required
                minLength={8}
              />
              <Input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                label={t('passwordReset.confirmPassword')}
                placeholder={t('passwordReset.confirmPasswordPlaceholder')}
                required
                minLength={8}
              />
              <Button
                type="submit"
                size="lg"
                loading={loading}
                disabled={!newPassword || !confirmPassword || loading}
                className="w-full"
              >
                {loading ? t('passwordReset.submitting') : t('passwordReset.submit')}
              </Button>
            </form>
          )}
        </section>
      </div>
    </div>
  )
}
