import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FloatingVoiceCall } from './floating-voice-call'
import { useVoiceSession } from './voice-session-context'

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }))

vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ pathname: '/app/cloud' }),
  useNavigate: () => navigate,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('./voice-session-context', () => ({
  useVoiceSession: vi.fn(),
}))

describe('FloatingVoiceCall', () => {
  beforeEach(() => {
    navigate.mockReset()
    vi.mocked(useVoiceSession).mockReturnValue({
      connectedVoiceChannel: {
        id: 'voice-channel',
        name: 'Team Voice',
        serverSlug: 'team-space',
      },
      leaveVoiceChannel: vi.fn(),
      voice: {
        status: 'connected',
        inputVolume: 24,
        isMuted: false,
        toggleMute: vi.fn(),
      },
    } as never)
  })

  it('opens the connected channel in OS mode', () => {
    render(<FloatingVoiceCall />)

    fireEvent.click(screen.getByRole('button', { name: /Team Voice/u }))

    expect(navigate).toHaveBeenCalledWith({
      to: '/spaces/$serverIdOrSlug',
      params: { serverIdOrSlug: 'team-space' },
      search: { channel: 'voice-channel' },
    })
  })
})
