export function isMeaningfulTravelImage(source?: string | null): source is string {
  const normalizedSource = source?.trim()
  if (!normalizedSource) return false
  return !/\/travel-icon\.svg(?:[?#]|$)/.test(normalizedSource)
}
