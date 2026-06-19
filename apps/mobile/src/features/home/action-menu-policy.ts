export type MobileServerRole = 'owner' | 'admin' | 'member' | '_public' | string

export type MobileServerActionKey =
  | 'inviteMembers'
  | 'serverSettings'
  | 'leaveServer'
  | 'deleteServer'

export type MobileChannelActionKey = 'members' | 'inviteMembers' | 'editChannel' | 'deleteChannel'

export const MOBILE_SERVER_LONG_PRESS_MAX_ACTIONS = 3
export const MOBILE_CHANNEL_LONG_PRESS_MAX_ACTIONS = 4

type ActionGroup<ActionKey extends string> = ActionKey[]

export function flattenMobileActionGroups<ActionKey extends string>(
  groups: readonly ActionGroup<ActionKey>[],
) {
  return groups.flat()
}

// Mobile long-press menus intentionally expose a smaller set than the web
// right-click menus. Open, creation, search, mute, copy, archive, and Buddy
// flows have dedicated mobile entry points; duplicating them here makes the
// sheet tall, hard to test, and easy to break when keyboard-backed sheets are
// involved.
export function mobileServerActionGroups(
  role: MobileServerRole,
): ActionGroup<MobileServerActionKey>[] {
  if (role === '_public') return []

  const canAdmin = role === 'owner' || role === 'admin'
  const primaryActions: MobileServerActionKey[] = ['inviteMembers']
  if (canAdmin) primaryActions.push('serverSettings')

  return [primaryActions, [role === 'owner' ? 'deleteServer' : 'leaveServer']]
}

export function mobileChannelActionGroups(
  canManage = false,
): ActionGroup<MobileChannelActionKey>[] {
  const groups: ActionGroup<MobileChannelActionKey>[] = [['members', 'inviteMembers']]

  if (canManage) {
    groups.push(['editChannel'], ['deleteChannel'])
  }

  return groups
}
