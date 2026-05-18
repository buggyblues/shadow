import type { InteractiveResponseMetadata } from './types'

function interactiveValuesEqual(
  prev?: Record<string, string>,
  next?: Record<string, string>,
): boolean {
  const prevKeys = Object.keys(prev ?? {})
  const nextKeys = Object.keys(next ?? {})
  if (prevKeys.length !== nextKeys.length) return false
  for (const key of prevKeys) {
    if (prev?.[key] !== next?.[key]) return false
  }
  return true
}

export function interactiveResponseEqual(
  prev?: InteractiveResponseMetadata | null,
  next?: InteractiveResponseMetadata | null,
): boolean {
  if (!prev && !next) return true
  if (!prev || !next) return false
  return (
    prev.blockId === next.blockId &&
    prev.sourceMessageId === next.sourceMessageId &&
    prev.actionId === next.actionId &&
    prev.value === next.value &&
    prev.submissionId === next.submissionId &&
    prev.responseMessageId === next.responseMessageId &&
    interactiveValuesEqual(prev.values, next.values)
  )
}
