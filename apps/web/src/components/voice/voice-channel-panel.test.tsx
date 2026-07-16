import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScreenShareStage, type ScreenStageItem, VoiceChannelPanel } from './voice-channel-panel'
import { useVoiceSession } from './voice-session-context'

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({}),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('./voice-session-context', () => ({
  useVoiceSession: vi.fn(),
}))

describe('ScreenShareStage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses the browser fullscreen API for system-level fullscreen', async () => {
    let fullscreenElement: Element | null = null
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElement,
    })
    const exitFullscreen = vi.fn(async () => {
      fullscreenElement = null
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: exitFullscreen,
    })
    const item = {
      id: 'screen-1',
      label: 'Shared screen',
      track: {
        play: vi.fn(),
        stop: vi.fn(),
      },
    } as unknown as ScreenStageItem
    const { container } = render(<ScreenShareStage items={[item]} fill />)
    const stage = container.firstElementChild as HTMLDivElement
    const requestFullscreen = vi.fn(async () => {
      fullscreenElement = stage
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    stage.requestFullscreen = requestFullscreen

    fireEvent.click(screen.getByRole('button', { name: 'voice.fullscreen' }))
    await waitFor(() => expect(requestFullscreen).toHaveBeenCalledOnce())
    expect(screen.getByRole('button', { name: 'voice.exitFullscreen' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'voice.exitFullscreen' }))
    await waitFor(() => expect(exitFullscreen).toHaveBeenCalledOnce())
    expect(screen.getByRole('button', { name: 'voice.fullscreen' })).toBeTruthy()
  })

  it('can move an inline screen share into a separate window', () => {
    const onOpenWindow = vi.fn()
    const item = {
      id: 'screen-1',
      label: 'Shared screen',
      track: {
        play: vi.fn(),
        stop: vi.fn(),
      },
    } as unknown as ScreenStageItem

    render(<ScreenShareStage items={[item]} onOpenWindow={onOpenWindow} />)
    fireEvent.click(screen.getByRole('button', { name: 'voice.openScreenWindow' }))

    expect(onOpenWindow).toHaveBeenCalledOnce()
  })
})

describe('VoiceChannelPanel detached screen share', () => {
  it('offers to reactivate the share window while keeping participants inline', () => {
    const onActivateScreenShareWindow = vi.fn()
    vi.mocked(useVoiceSession).mockReturnValue({
      connectedVoiceChannel: { id: 'voice-1', name: 'Voice', serverSlug: 'space' },
      showVoiceSettings: false,
      setShowVoiceSettings: vi.fn(),
      joinVoiceChannel: vi.fn(),
      leaveVoiceChannel: vi.fn(),
      voice: {
        status: 'connected',
        errorKey: null,
        error: null,
        networkQuality: 'excellent',
        participants: [],
        remoteScreens: [
          {
            uid: 'screen-1',
            userId: 'user-1',
            displayName: 'Shared screen',
            track: { play: vi.fn(), stop: vi.fn() },
          },
        ],
        localScreenTrack: null,
        inputVolume: 0,
        isMuted: false,
        isDeafened: false,
        isScreenSharing: false,
        microphones: [],
        speakers: [],
        selectedMicrophoneId: 'default',
        selectedSpeakerId: 'default',
        outputVolume: 100,
        toggleMute: vi.fn(),
        toggleDeafen: vi.fn(),
        startScreenShare: vi.fn(),
        stopScreenShare: vi.fn(),
        refreshDevices: vi.fn(),
        setMicrophoneDevice: vi.fn(),
        setSpeakerDevice: vi.fn(),
        setOutputVolume: vi.fn(),
      },
    } as never)

    render(
      <VoiceChannelPanel
        channelId="voice-1"
        channelName="Voice"
        serverSlug="space"
        screenSharePresentation="detached"
        onActivateScreenShareWindow={onActivateScreenShareWindow}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'voice.openScreenWindow' }))

    expect(onActivateScreenShareWindow).toHaveBeenCalledOnce()
    expect(screen.getByText('voice.noParticipants')).toBeTruthy()
  })
})
