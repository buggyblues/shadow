import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { OsChannelTab } from '../../types'
import { OsTopBarChannelTab } from './top-bar-channel-tab'

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../../channel-ui', () => ({
  ChannelTypeIcon: ({ type }: { type?: string }) => <span data-channel-type={type} />,
  OsChannelTabHoverCard: () => null,
}))

const voiceTab: OsChannelTab = {
  id: 'voice-tab',
  channelId: 'voice-channel',
  title: 'Voice',
  type: 'voice',
  active: false,
}

function renderVoiceTab(voiceActivity: 'active' | 'joined') {
  const onOpen = vi.fn()
  render(
    <OsTopBarChannelTab
      tab={voiceTab}
      unread={0}
      voiceActivity={voiceActivity}
      draggingTabId={null}
      floatingPreviewLayerZIndex={900}
      tabRefs={{ current: new Map<string, HTMLDivElement>() }}
      isPreviewSuppressed={() => false}
      onDraggingTabChange={vi.fn()}
      onClose={vi.fn()}
      onContextMenu={vi.fn()}
      onOpen={onOpen}
      onReorder={vi.fn()}
    />,
  )
  return onOpen
}

describe('OsTopBarChannelTab voice activity', () => {
  it('marks an active call the user has not joined', () => {
    renderVoiceTab('active')

    expect(screen.getByRole('tab').getAttribute('data-voice-activity')).toBe('active')
  })

  it('uses a distinct joined state and remains actionable', () => {
    const onOpen = renderVoiceTab('joined')
    const tab = screen.getByRole('tab')

    expect(tab.getAttribute('data-voice-activity')).toBe('joined')
    fireEvent.click(tab)
    expect(onOpen).toHaveBeenCalledOnce()
  })
})
