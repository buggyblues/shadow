import {
  Alert,
  AlertDescription,
  Button,
  Card,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Divider,
  Input,
} from '@shadowob/ui'
import { ChevronLeft, Github, KeyRound, Mail, X } from 'lucide-react'
import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'

const CODE_LENGTH = 6
const RESEND_SECONDS = 60

export type LoginSession = {
  user: unknown
  accessToken: string
  refreshToken: string
}

export type LoginRequest = <T>(path: string, init?: RequestInit) => Promise<T>

export type LoginViewText = {
  brand: string
  close: string
  back: string
  welcomeTitle: string
  welcomeSubtitle: string
  google: string
  github: string
  passwordTab: string
  passwordSubtitle: string
  emailLabel: string
  emailPlaceholder: string
  emailOrUsernameLabel: string
  emailOrUsernamePlaceholder: string
  passwordLabel: string
  continueEmail: string
  continuingEmail: string
  login: string
  loggingIn: string
  switchToPassword: string
  switchToEmailCode: string
  checkEmailTitle: string
  checkEmailMessage: string
  codeDigit: (index: number) => string
  verifying: string
  resendIn: (seconds: number) => string
  resend: string
  codeSent: string
  termsPrefix: string
  terms: string
  privacy: string
  termsJoiner: string
  failed: string
  or: string
}

export type LoginViewProps = {
  variant: 'modal' | 'page'
  open?: boolean
  lang: string
  redirect: string
  oauthRedirect: string
  apiBase?: string
  logoSrc: string
  brandSuffix?: string
  termsHref: string
  privacyHref: string
  text: LoginViewText
  request: LoginRequest
  getErrorMessage?: (error: unknown, fallback: string) => string
  onAuthenticated: (session: LoginSession) => void | Promise<void>
  onClose?: () => void
}

function sanitizeDigits(value: string) {
  return value.replace(/\D/g, '').slice(0, CODE_LENGTH)
}

function formatLocale(lang: string) {
  return lang.startsWith('zh') ? 'zh-CN' : lang
}

function GoogleIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" aria-hidden="true">
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
  )
}

function oauthHref(apiBase: string, provider: 'google' | 'github', redirect: string) {
  const params = new URLSearchParams({ redirect })
  return `${apiBase}/api/auth/oauth/${provider}?${params.toString()}`
}

function FormTitle({
  modal,
  title,
  description,
}: {
  modal: boolean
  title: string
  description?: React.ReactNode
}) {
  if (modal) {
    return (
      <>
        <DialogTitle className="text-[26px] normal-case leading-tight tracking-normal sm:text-[34px]">
          {title}
        </DialogTitle>
        {description ? (
          <DialogDescription className="mt-3 text-[15px] not-italic leading-6">
            {description}
          </DialogDescription>
        ) : null}
      </>
    )
  }

  return (
    <>
      <h1 className="text-[32px] font-black leading-tight tracking-normal text-text-primary sm:text-[36px]">
        {title}
      </h1>
      {description ? (
        <p className="mt-5 text-[15px] font-bold leading-7 text-text-muted">{description}</p>
      ) : null}
    </>
  )
}

export function LoginView({
  variant,
  open = true,
  lang,
  redirect,
  oauthRedirect,
  apiBase = '',
  logoSrc,
  brandSuffix,
  termsHref,
  privacyHref,
  text,
  request,
  getErrorMessage,
  onAuthenticated,
  onClose,
}: LoginViewProps) {
  const isModal = variant === 'modal'
  const digitRefs = useRef<Array<HTMLInputElement | null>>([])
  const emailInputRef = useRef<HTMLInputElement | null>(null)
  const passwordIdentifierRef = useRef<HTMLInputElement | null>(null)
  const lastSubmittedCodeRef = useRef('')
  const verificationInFlightRef = useRef(false)
  const passwordOriginRef = useRef<'choose' | 'code'>('choose')

  const [step, setStep] = useState<'choose' | 'code' | 'password'>('choose')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [digits, setDigits] = useState<string[]>(() => Array(CODE_LENGTH).fill(''))
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [resendSeconds, setResendSeconds] = useState(0)

  const code = digits.join('')
  const trimmedEmail = email.trim()
  const oauthTarget = useMemo(() => oauthRedirect || redirect, [oauthRedirect, redirect])
  const errorText = (err: unknown) => getErrorMessage?.(err, text.failed) ?? text.failed

  useEffect(() => {
    if (variant !== 'modal' || open) return
    setStep('choose')
    setError('')
    setDigits(Array(CODE_LENGTH).fill(''))
    setPassword('')
    lastSubmittedCodeRef.current = ''
    passwordOriginRef.current = 'choose'
  }, [open, variant])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      if (step === 'choose') {
        emailInputRef.current?.focus()
      } else if (step === 'password') {
        passwordIdentifierRef.current?.focus()
      }
    }, 80)
    return () => window.clearTimeout(timer)
  }, [open, step])

  useEffect(() => {
    if (resendSeconds <= 0) return
    const timer = window.setTimeout(() => setResendSeconds((seconds) => seconds - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [resendSeconds])

  useEffect(() => {
    if (code.length < CODE_LENGTH) {
      lastSubmittedCodeRef.current = ''
      return
    }
    if (step !== 'code' || !trimmedEmail || code.length !== CODE_LENGTH) return
    const submissionKey = `${trimmedEmail}:${code}`
    if (verificationInFlightRef.current || lastSubmittedCodeRef.current === submissionKey) return
    lastSubmittedCodeRef.current = submissionKey
    void verifyCode({ email: trimmedEmail, code })
  }, [code, step, trimmedEmail])

  const startEmailLogin = async (event?: React.FormEvent) => {
    event?.preventDefault()
    if (!trimmedEmail || sending) return
    setError('')
    setSending(true)
    try {
      await request('/api/auth/email/start', {
        method: 'POST',
        body: JSON.stringify({ email: trimmedEmail, locale: formatLocale(lang) }),
      })
      setDigits(Array(CODE_LENGTH).fill(''))
      lastSubmittedCodeRef.current = ''
      setStep('code')
      setResendSeconds(RESEND_SECONDS)
      window.setTimeout(() => digitRefs.current[0]?.focus(), 80)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setSending(false)
    }
  }

  const loginWithPassword = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!trimmedEmail || !password || verifying) return
    setError('')
    setVerifying(true)
    try {
      const session = await request<LoginSession>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: trimmedEmail, password }),
      })
      await onAuthenticated(session)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setVerifying(false)
    }
  }

  async function verifyCode(input: { email: string; code: string }) {
    const nextCode = input.code.trim()
    if (!input.email || nextCode.length !== CODE_LENGTH || verificationInFlightRef.current) return
    setError('')
    verificationInFlightRef.current = true
    setVerifying(true)
    try {
      const session = await request<LoginSession>('/api/auth/email/verify', {
        method: 'POST',
        body: JSON.stringify({ email: input.email, code: nextCode }),
      })
      await onAuthenticated(session)
    } catch (err) {
      setError(errorText(err))
    } finally {
      verificationInFlightRef.current = false
      setVerifying(false)
    }
  }

  const updateDigit = (index: number, value: string) => {
    const cleaned = sanitizeDigits(value)
    if (!cleaned) {
      setDigits((current) =>
        current.map((digit, digitIndex) => (digitIndex === index ? '' : digit)),
      )
      return
    }
    setDigits((current) => {
      const next = [...current]
      for (let offset = 0; offset < cleaned.length && index + offset < CODE_LENGTH; offset += 1) {
        next[index + offset] = cleaned[offset] ?? ''
      }
      return next
    })
    window.setTimeout(
      () => digitRefs.current[Math.min(index + cleaned.length, CODE_LENGTH - 1)]?.focus(),
      0,
    )
  }

  const handleDigitKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      digitRefs.current[index - 1]?.focus()
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault()
      digitRefs.current[index - 1]?.focus()
    }
    if (event.key === 'ArrowRight' && index < CODE_LENGTH - 1) {
      event.preventDefault()
      digitRefs.current[index + 1]?.focus()
    }
  }

  const goBack = () => {
    setError('')
    if (step === 'password') {
      setPassword('')
      setStep(passwordOriginRef.current)
      return
    }
    setDigits(Array(CODE_LENGTH).fill(''))
    lastSubmittedCodeRef.current = ''
    setStep('choose')
  }

  const showPasswordLogin = () => {
    setError('')
    setPassword('')
    passwordOriginRef.current = step === 'code' ? 'code' : 'choose'
    setStep('password')
  }

  const showEmailCode = () => {
    setError('')
    setPassword('')
    setStep(trimmedEmail ? 'code' : 'choose')
    if (trimmedEmail) window.setTimeout(() => digitRefs.current[0]?.focus(), 80)
  }

  const content = (
    <div className="relative z-10 mx-auto flex w-full max-w-[440px] flex-col items-center">
      <div
        className={cn(
          'flex max-w-full items-center gap-2 py-2 font-black tracking-normal text-text-primary',
          isModal ? 'mb-4 text-[20px] sm:mb-6 sm:py-3 sm:text-[22px]' : 'mb-10 text-[24px]',
        )}
      >
        <img src={logoSrc} alt={text.brand} className="h-7 w-7 rounded-full sm:h-8 sm:w-8" />
        <span className="min-w-0 truncate">
          {text.brand}
          {brandSuffix ? <strong> {brandSuffix}</strong> : null}
        </span>
      </div>

      {step === 'choose' ? (
        <>
          <div className={cn('text-center', isModal ? 'mb-4 sm:mb-5' : 'mb-8')}>
            <FormTitle
              modal={isModal}
              title={text.welcomeTitle}
              description={text.welcomeSubtitle}
            />
          </div>

          <div className="flex w-full flex-col gap-2.5">
            <Button
              asChild
              variant="glass"
              size="lg"
              className="w-full normal-case tracking-normal"
            >
              <a href={oauthHref(apiBase, 'google', oauthTarget)}>
                <GoogleIcon />
                {text.google}
              </a>
            </Button>
            <Button
              asChild
              variant="glass"
              size="lg"
              className="w-full normal-case tracking-normal"
            >
              <a href={oauthHref(apiBase, 'github', oauthTarget)}>
                <Github size={20} fill="currentColor" strokeWidth={0} aria-hidden="true" />
                {text.github}
              </a>
            </Button>
          </div>

          <Divider label={text.or} className={cn('w-full', isModal ? 'my-3 sm:my-4' : '')} />

          <form
            className={cn('w-full', isModal ? 'space-y-3' : 'space-y-4')}
            onSubmit={startEmailLogin}
          >
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Input
              ref={emailInputRef}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={text.emailPlaceholder}
              autoComplete="email"
              name="email"
              required
              icon={Mail}
              label={text.emailLabel}
            />
            <Button
              type="submit"
              size={isModal ? 'lg' : 'xl'}
              className="w-full"
              loading={sending}
              disabled={!trimmedEmail || sending}
            >
              {sending ? text.continuingEmail : text.continueEmail}
            </Button>
          </form>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-3 normal-case tracking-normal text-text-muted"
            onClick={showPasswordLogin}
          >
            {text.switchToPassword}
          </Button>

          <p
            className={cn(
              'max-w-[430px] text-center text-[12px] font-bold leading-5 text-text-muted',
              isModal ? 'mt-4 sm:mt-5' : 'mt-7',
            )}
          >
            {text.termsPrefix}{' '}
            <a className="text-primary hover:underline" href={termsHref}>
              {text.terms}
            </a>
            {` ${text.termsJoiner} `}
            <a className="text-primary hover:underline" href={privacyHref}>
              {text.privacy}
            </a>
          </p>
        </>
      ) : step === 'code' ? (
        <>
          <div className={cn('text-center', isModal ? 'mb-5 sm:mb-6' : 'mb-9')}>
            <FormTitle
              modal={isModal}
              title={text.checkEmailTitle}
              description={
                <>
                  {text.checkEmailMessage}
                  <br />
                  <span className="text-text-secondary">{trimmedEmail}</span>
                </>
              }
            />
          </div>

          {error ? (
            <Alert variant="destructive" className="mb-5 w-full">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid w-full grid-cols-6 gap-2 sm:gap-3">
            {digits.map((digit, index) => (
              <input
                key={`code-${index}`}
                ref={(node) => {
                  digitRefs.current[index] = node
                }}
                type="text"
                inputMode="numeric"
                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                value={digit}
                maxLength={CODE_LENGTH}
                onChange={(event) => updateDigit(index, event.target.value)}
                onFocus={(event) => event.target.select()}
                onKeyDown={(event) => handleDigitKeyDown(index, event)}
                aria-label={text.codeDigit(index + 1)}
                className={cn(
                  'min-w-0 rounded-2xl border border-border-subtle/60 bg-bg-primary/50 text-center font-black text-text-primary outline-none transition-all focus:border-primary/70 focus:shadow-[0_0_0_4px_rgba(0,198,209,0.12)]',
                  isModal ? 'h-14 text-[22px]' : 'h-16 text-[24px]',
                )}
              />
            ))}
          </div>

          <div className={cn('min-h-8 text-center', isModal ? 'mt-5' : 'mt-8')}>
            {verifying ? (
              <div className="inline-flex items-center gap-2 text-[15px] font-black text-text-muted">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                {text.verifying}
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                disabled={sending || resendSeconds > 0}
                onClick={() => startEmailLogin()}
              >
                {resendSeconds > 0 ? text.resendIn(resendSeconds) : text.resend}
              </Button>
            )}
          </div>

          <div
            className={cn(
              'inline-flex items-center gap-2 text-[13px] font-bold text-text-muted',
              isModal ? 'mt-5' : 'mt-6',
            )}
          >
            <Mail size={15} aria-hidden="true" />
            {text.codeSent}
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-3 normal-case tracking-normal text-text-muted"
            onClick={showPasswordLogin}
          >
            {text.switchToPassword}
          </Button>
        </>
      ) : (
        <>
          <div className={cn('text-center', isModal ? 'mb-5 sm:mb-6' : 'mb-9')}>
            <FormTitle
              modal={isModal}
              title={text.passwordTab}
              description={text.passwordSubtitle}
            />
          </div>

          <form
            className={cn('w-full', isModal ? 'space-y-3' : 'space-y-4')}
            onSubmit={loginWithPassword}
          >
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Input
              ref={passwordIdentifierRef}
              type="text"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={text.emailOrUsernamePlaceholder}
              autoComplete="username"
              name="username"
              required
              icon={Mail}
              label={text.emailOrUsernameLabel}
            />
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={text.passwordLabel}
              autoComplete="current-password"
              name="password"
              required
              icon={KeyRound}
              label={text.passwordLabel}
            />
            <Button
              type="submit"
              size={isModal ? 'lg' : 'xl'}
              className="w-full"
              loading={verifying}
              disabled={!trimmedEmail || !password || verifying}
            >
              {verifying ? text.loggingIn : text.login}
            </Button>
          </form>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-3 normal-case tracking-normal text-text-muted"
            onClick={showEmailCode}
          >
            {text.switchToEmailCode}
          </Button>
        </>
      )}
    </div>
  )

  if (isModal) {
    return (
      <Dialog isOpen={open} onClose={onClose}>
        <DialogContent
          hideCloseButton
          maxWidth="max-w-[560px]"
          className="max-h-[calc(80dvh+80px)] w-[calc(100vw-24px)] overflow-y-auto overscroll-contain rounded-[28px] border-white/70 px-4 py-5 sm:max-h-[calc(78dvh+80px)] sm:w-full sm:rounded-[40px] sm:px-9 sm:py-7"
        >
          {step !== 'choose' ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute left-5 top-5 z-20"
              onClick={goBack}
              aria-label={text.back}
            >
              <ChevronLeft size={22} />
            </Button>
          ) : null}
          {onClose ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-5 top-5 z-20"
              onClick={onClose}
              aria-label={text.close}
            >
              <X size={22} />
            </Button>
          ) : null}
          {content}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Card
      variant="glass"
      className={cn(
        'relative w-full overflow-hidden px-5 py-8 text-text-primary sm:px-10 sm:py-10',
        'rounded-[40px] border-white/70 dark:border-white/10',
        'shadow-[0_28px_90px_rgba(0,0,0,0.28)]',
      )}
    >
      {step !== 'choose' ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute left-5 top-5 z-10"
          onClick={goBack}
          aria-label={text.back}
        >
          <ChevronLeft size={22} strokeWidth={2.5} />
        </Button>
      ) : null}
      {onClose ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-5 top-5 z-10"
          onClick={onClose}
          aria-label={text.close}
        >
          <X size={22} strokeWidth={2.5} />
        </Button>
      ) : null}
      {content}
    </Card>
  )
}
