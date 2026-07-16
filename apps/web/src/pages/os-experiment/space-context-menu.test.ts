import { describe, expect, it } from 'vitest'
import { getOsSpaceContextMenuActions } from './space-context-menu'

describe('getOsSpaceContextMenuActions', () => {
  it('keeps useful Space actions for a regular member', () => {
    expect(
      getOsSpaceContextMenuActions({ canManage: false, isGuest: false, isOwner: false }),
    ).toEqual(['create-channel', 'add-buddy', 'copy-id', 'leave'])
  })

  it('does not expose management actions to a regular member', () => {
    expect(
      getOsSpaceContextMenuActions({ canManage: false, isGuest: false, isOwner: false }),
    ).not.toContain('settings')
  })

  it('keeps owner management actions without an invalid leave action', () => {
    expect(
      getOsSpaceContextMenuActions({ canManage: true, isGuest: false, isOwner: true }),
    ).toEqual(['create-channel', 'add-buddy', 'settings', 'copy-id'])
  })

  it('gives guests a safe non-empty menu', () => {
    expect(
      getOsSpaceContextMenuActions({ canManage: false, isGuest: true, isOwner: false }),
    ).toEqual(['copy-id'])
  })
})
