import { describe, expect, it } from 'vitest'
import { myBuddyMessageWindowInput, myBuddySettingsWindowInput } from './buddy-window'

describe('myBuddyMessageWindowInput', () => {
  it('reuses the My Buddy built-in window for every direct conversation', () => {
    expect(
      myBuddyMessageWindowInput('dm-1', {
        title: 'My Buddy',
        subtitle: 'Application',
      }),
    ).toEqual({
      kind: 'builtin',
      targetId: 'my-buddies',
      builtinKey: 'my-buddies',
      buddySection: 'messages',
      buddyDirectChannelId: 'dm-1',
      title: 'My Buddy',
      subtitle: 'Application',
    })
  })

  it('reuses the My Buddy built-in window for Buddy configuration', () => {
    expect(
      myBuddySettingsWindowInput('agent-1', {
        title: 'My Buddy',
        subtitle: 'Application',
      }),
    ).toEqual({
      kind: 'builtin',
      targetId: 'my-buddies',
      builtinKey: 'my-buddies',
      buddySection: 'buddies',
      buddyAgentId: 'agent-1',
      title: 'My Buddy',
      subtitle: 'Application',
    })
  })
})
