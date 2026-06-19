import { describe, expect, it } from 'vitest'
import {
  flattenMobileActionGroups,
  MOBILE_CHANNEL_LONG_PRESS_MAX_ACTIONS,
  MOBILE_SERVER_LONG_PRESS_MAX_ACTIONS,
  mobileChannelActionGroups,
  mobileServerActionGroups,
} from './action-menu-policy'

describe('mobile home long-press action policy', () => {
  it('does not show a long-press sheet for public servers without management actions', () => {
    expect(mobileServerActionGroups('_public')).toEqual([])
  })

  it('keeps owner server actions compact and destructive action isolated', () => {
    const groups = mobileServerActionGroups('owner')
    const actions = flattenMobileActionGroups(groups)

    expect(groups).toEqual([['inviteMembers', 'serverSettings'], ['deleteServer']])
    expect(actions).toHaveLength(MOBILE_SERVER_LONG_PRESS_MAX_ACTIONS)
    expect(actions).not.toContain('open')
    expect(actions).not.toContain('createTextChannel')
    expect(actions).not.toContain('createVoiceChannel')
    expect(actions).not.toContain('muteNotifications')
    expect(actions).not.toContain('copyServerId')
  })

  it('uses leave instead of delete for non-owner joined servers', () => {
    expect(flattenMobileActionGroups(mobileServerActionGroups('admin'))).toEqual([
      'inviteMembers',
      'serverSettings',
      'leaveServer',
    ])
    expect(flattenMobileActionGroups(mobileServerActionGroups('member'))).toEqual([
      'inviteMembers',
      'leaveServer',
    ])
  })

  it('keeps non-manager channel actions to navigation and invitation only', () => {
    const actions = flattenMobileActionGroups(mobileChannelActionGroups(false))

    expect(actions).toEqual(['members', 'inviteMembers'])
    expect(actions.length).toBeLessThanOrEqual(MOBILE_CHANNEL_LONG_PRESS_MAX_ACTIONS)
    expect(actions).not.toContain('open')
  })

  it('keeps manager channel actions compact and avoids web-only utilities', () => {
    const groups = mobileChannelActionGroups(true)
    const actions = flattenMobileActionGroups(groups)

    expect(groups).toEqual([['members', 'inviteMembers'], ['editChannel'], ['deleteChannel']])
    expect(actions).toHaveLength(MOBILE_CHANNEL_LONG_PRESS_MAX_ACTIONS)
    expect(actions).not.toContain('open')
    expect(actions).not.toContain('addAgent')
    expect(actions).not.toContain('markRead')
    expect(actions).not.toContain('muteChannel')
    expect(actions).not.toContain('copyChannelLink')
    expect(actions).not.toContain('archiveChannel')
    expect(actions).not.toContain('setPrivate')
  })
})
