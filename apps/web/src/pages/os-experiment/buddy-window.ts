export function myBuddyMessageWindowInput(
  channelId: string,
  labels: { title: string; subtitle: string },
) {
  return {
    kind: 'builtin' as const,
    targetId: 'my-buddies',
    builtinKey: 'my-buddies' as const,
    buddySection: 'messages' as const,
    buddyDirectChannelId: channelId,
    title: labels.title,
    subtitle: labels.subtitle,
  }
}

export function myBuddySettingsWindowInput(
  agentId: string,
  labels: { title: string; subtitle: string },
) {
  return {
    kind: 'builtin' as const,
    targetId: 'my-buddies',
    builtinKey: 'my-buddies' as const,
    buddySection: 'buddies' as const,
    buddyAgentId: agentId,
    title: labels.title,
    subtitle: labels.subtitle,
  }
}
