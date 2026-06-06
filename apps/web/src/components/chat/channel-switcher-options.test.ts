import { describe, expect, it } from 'vitest'
import {
  type ChannelSwitcherOption,
  getChannelSwitcherSection,
  groupChannelSwitcherOptions,
} from './channel-switcher-options'

describe('channel switcher options', () => {
  it('groups regular channels and Buddy inbox channels separately', () => {
    const options: ChannelSwitcherOption[] = [
      { id: 'chan-1', name: 'General', type: 'text' },
      {
        id: 'inbox-1',
        name: 'ScriptSmith',
        type: 'inbox',
        avatarUrl: null,
        status: 'busy',
        userId: 'user-script',
      },
      { id: 'chan-2', name: 'Updates', section: 'channel', type: 'announcement' },
      { id: 'inbox-2', name: 'FrameQA', section: 'inbox', type: 'text' },
    ]

    expect(getChannelSwitcherSection(options[1]!)).toBe('inbox')

    const groups = groupChannelSwitcherOptions(options)
    expect(groups.channels.map((option) => option.id)).toEqual(['chan-1', 'chan-2'])
    expect(groups.inboxes.map((option) => option.id)).toEqual(['inbox-1', 'inbox-2'])
  })
})
