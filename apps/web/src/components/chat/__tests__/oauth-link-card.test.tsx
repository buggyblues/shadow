import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { OAuthLinkCardView, OAuthLinkPreviewPanel } from '../oauth-link-card'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'chat.oauthLinkCardLabel': 'External app',
        'chat.oauthLinkPreviewAria': `Open ${params?.title}`,
        'chat.oauthLinkOpenExternal': 'Open externally',
        'chat.oauthLinkConnected': 'Connected',
        'chat.oauthLinkWaiting': 'Waiting for app',
        'chat.oauthLinkFallback': 'If this site cannot be embedded, open it externally.',
        'common.close': 'Close',
      }
      if (key === 'chat.oauthLinkFrameTitle') return `${params?.title} card`
      return translations[key] ?? key
    },
  }),
}))

vi.mock('../../../stores/ui.store', () => ({
  useUIStore: () => vi.fn(),
}))

const card = {
  id: 'card-1',
  kind: 'oauth_link' as const,
  appId: '11111111-1111-4111-8111-111111111111',
  clientId: 'shadow_client',
  title: 'OAuth Demo',
  description: 'Launch the embedded OAuth demo',
  iconUrl: null,
  meta: {
    appName: 'Demo App',
    avatarUrl: 'https://app.example.com/avatar.png',
    iconUrl: 'https://app.example.com/avatar.png',
    coverUrl: null,
    origin: 'https://app.example.com',
  },
  url: 'https://app.example.com/card',
  embedUrl: 'https://app.example.com/embed',
  fallbackUrl: 'https://app.example.com',
  scopes: ['user:read'],
  action: { mode: 'open_iframe' as const },
}

describe('OAuthLinkCardView', () => {
  it('renders as a clickable external app card and delegates preview opening', async () => {
    const onPreview = vi.fn()
    render(<OAuthLinkCardView card={card} messageId="m1" channelId="ch1" onPreview={onPreview} />)

    expect(screen.getByText('External app')).toBeTruthy()
    expect(screen.getByText('OAuth Demo')).toBeTruthy()
    expect(screen.getByText('Launch the embedded OAuth demo')).toBeTruthy()
    expect(screen.getByText('https://app.example.com')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Open externally/i })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Open OAuth Demo' }))

    expect(onPreview).toHaveBeenCalledWith({ card, messageId: 'm1', channelId: 'ch1' })
  })

  it('opens the sandboxed iframe in the right-side preview panel', async () => {
    render(
      <OAuthLinkPreviewPanel
        preview={{ card, messageId: 'm1', channelId: 'ch1' }}
        onClose={vi.fn()}
      />,
    )

    const iframe = screen.getByTitle('OAuth Demo card')
    expect(iframe.getAttribute('src')).toBe('https://app.example.com/embed')
    expect(iframe.getAttribute('sandbox')).toBe(
      'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox',
    )
    expect(screen.getByText('Demo App · Waiting for app')).toBeTruthy()

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://app.example.com',
        data: { type: 'shadow.card.ready' },
      }),
    )

    await waitFor(() => expect(screen.getByText('Demo App · Connected')).toBeTruthy())

    const externalLink = screen.getByRole('link', { name: /Open externally/i })
    expect(externalLink.getAttribute('href')).toBe('https://app.example.com')
    expect(externalLink.getAttribute('target')).toBe('_blank')
  })
})
