import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../lib/api'
import { LoginPanel } from './login-panel'

const navigateMock = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (key: string) => {
      if (key === 'loginModal.codeDigit') return 'code digit {{index}}'
      return key
    },
  }),
}))

describe('LoginPanel email code flow', () => {
  beforeEach(() => {
    localStorage.clear()
    navigateMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as { __SHADOW_FETCH_API_MOCK__?: unknown }).__SHADOW_FETCH_API_MOCK__
  })

  it('does not retry the same completed code after verification fails', async () => {
    const fetchApiMock = vi.fn(async (path: string) => {
      if (path === '/api/auth/email/start') return { ok: true }
      if (path === '/api/auth/email/verify') {
        throw new ApiError('Too many requests', {
          status: 429,
          code: 'RATE_LIMITED',
        })
      }
      throw new Error(`Unexpected path: ${path}`)
    })
    ;(globalThis as { __SHADOW_FETCH_API_MOCK__?: unknown }).__SHADOW_FETCH_API_MOCK__ =
      fetchApiMock

    render(
      <React.StrictMode>
        <LoginPanel variant="page" redirect="/app/settings" />
      </React.StrictMode>,
    )

    await userEvent.type(screen.getByRole('textbox', { name: 'loginModal.emailLabel' }), 'a@b.com')
    await userEvent.click(screen.getByRole('button', { name: 'loginModal.continueEmail' }))

    const firstDigit = await screen.findByRole('textbox', { name: 'code digit 1' })
    fireEvent.change(firstDigit, { target: { value: '852494' } })

    await waitFor(() => {
      expect(fetchApiMock).toHaveBeenCalledTimes(2)
    })
    expect(fetchApiMock).toHaveBeenNthCalledWith(
      2,
      '/api/auth/email/verify',
      expect.objectContaining({
        method: 'POST',
      }),
    )

    await new Promise((resolve) => window.setTimeout(resolve, 50))

    expect(fetchApiMock).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('alert')).toBeTruthy()
  })
})
