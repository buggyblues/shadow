export function userFacingChannelTopic(topic: string | null | undefined) {
  if (!topic?.startsWith('space-app:')) return topic ?? null
  const separator = topic.indexOf(' · ')
  return separator >= 0 ? topic.slice(separator + 3).trim() || null : null
}
