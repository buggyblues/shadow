import type { Page } from '@playwright/test'

export type E2EUserCredentials = {
  email: string
  password: string
  accessToken?: string
  refreshToken?: string
}

type AuthSession = {
  accessToken: string
  refreshToken: string
}

export async function apiPasswordLogin(
  origin: string,
  user: E2EUserCredentials,
): Promise<AuthSession> {
  const res = await fetch(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: user.password }),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`E2E login failed for ${user.email}: ${res.status} - ${text}`)
  }
  return JSON.parse(text) as AuthSession
}

export async function loginWithStoredTokens(
  page: Page,
  origin: string,
  user: E2EUserCredentials,
  redirect = '/app/discover',
) {
  const session =
    user.accessToken && user.refreshToken
      ? { accessToken: user.accessToken, refreshToken: user.refreshToken }
      : await apiPasswordLogin(origin, user)

  await page.addInitScript((auth: AuthSession) => {
    localStorage.setItem('accessToken', auth.accessToken)
    localStorage.setItem('refreshToken', auth.refreshToken)
  }, session)

  await page.goto(redirect)
  await page.waitForFunction(() => Boolean(localStorage.getItem('accessToken')))
  await page.waitForURL((url) => url.pathname.startsWith('/app/') && url.pathname !== '/app/login')
}
