export type OsSpaceContextMenuAction =
  | 'create-channel'
  | 'add-buddy'
  | 'settings'
  | 'copy-id'
  | 'leave'

export function getOsSpaceContextMenuActions({
  canManage,
  isGuest,
  isOwner,
}: {
  canManage: boolean
  isGuest: boolean
  isOwner: boolean
}): OsSpaceContextMenuAction[] {
  return [
    ...(!isGuest ? (['create-channel', 'add-buddy'] as const) : []),
    ...(canManage ? (['settings'] as const) : []),
    'copy-id',
    ...(!isGuest && !isOwner ? (['leave'] as const) : []),
  ]
}
