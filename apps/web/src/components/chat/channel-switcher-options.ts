export type ChannelSwitcherSection = 'channel' | 'inbox'

export interface ChannelSwitcherOption {
  id: string
  name: string
  type?: string
  isArchived?: boolean
  section?: ChannelSwitcherSection
  userId?: string | null
  avatarUrl?: string | null
  status?: string | null
}

export interface ChannelSwitcherGroups {
  channels: ChannelSwitcherOption[]
  inboxes: ChannelSwitcherOption[]
}

export function getChannelSwitcherSection(option: ChannelSwitcherOption): ChannelSwitcherSection {
  if (option.section === 'inbox' || option.type === 'inbox') return 'inbox'
  return 'channel'
}

export function groupChannelSwitcherOptions(
  options: ChannelSwitcherOption[],
): ChannelSwitcherGroups {
  return options.reduce<ChannelSwitcherGroups>(
    (groups, option) => {
      groups[getChannelSwitcherSection(option) === 'inbox' ? 'inboxes' : 'channels'].push(option)
      return groups
    },
    { channels: [], inboxes: [] },
  )
}
